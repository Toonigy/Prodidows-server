const express = require('express');
const https = require('https'); // Changed from http to support WSS/HTTPS
const fs = require('fs'); // Required to load your SSL certificates
const path = require('path');
const { Server } = require('socket.io');
const admin = require('firebase-admin'); 
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

// --- FIREBASE ADMIN SDK INITIALIZATION ---
let db;
try {
    const serviceAccount = require('./service-account.json'); 
    const firebaseAdminApp = initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://pde13532-default-rtdb.firebaseio.com"
    });
    db = getDatabase(firebaseAdminApp);
    console.log("[FIREBASE] Admin SDK initialized for project: pde13532");
} catch (e) {
    console.error("[FIREBASE ERROR] Could not initialize Admin SDK:", e.message);
}

const app = express();

// --- SSL CONFIGURATION FOR WSS ---
/**
 * To run a WSS server, you MUST have SSL certificates.
 * If you are running locally, you can use 'mkcert' or 'openssl' to generate these.
 * For production, use Let's Encrypt.
 */
let server;
try {
    const options = {
        key: fs.readFileSync(path.join(__dirname, 'certs', 'private.key')),
        cert: fs.readFileSync(path.join(__dirname, 'certs', 'certificate.crt'))
    };
    server = https.createServer(options, app);
    console.log("[SERVER] Starting in HTTPS/WSS mode.");
} catch (err) {
    console.warn("[WARN] SSL Certificates not found. Falling back to HTTP/WS.");
    const http = require('http');
    server = http.createServer(app);
}

const PORT = 8080;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---

/**
 * UPDATED: World List with Fullness
 * 'fullness' is the key the engine usually checks for the green bar (0.0 to 1.0).
 * 'host' should be your domain name or IP that supports HTTPS.
 */
const getWorlds = (req, res) => {
    const worldList = [
        { 
            id: "101", 
            name: "Crystal", 
            population: "Low", 
            status: "online", 
            fullness: 0.1,    // 0.1 = 10% full (Green Bar)
            host: "localhost" // Change this to your domain for WSS
        },
        { 
            id: "102", 
            name: "Nova", 
            population: "Low", 
            status: "online",
            fullness: 0.2,    
            host: "localhost" 
        }
    ];
    res.json(worldList);
};

app.get('/getWorldList', getWorlds);
app.get('/game-api/v1/worlds', getWorlds);

app.get('/game-api/v1/characters/:id', async (req, res) => {
    let targetId = req.params.id;
    if (targetId === "[object Object]") {
        return res.status(400).json({ error: "Invalid User ID format" });
    }
    if (!db) return res.status(503).json({ error: "Database not initialized" });

    try {
        const userRef = db.ref(`users/${targetId}`);
        const snapshot = await userRef.get();
        if (snapshot.exists()) {
            res.json(snapshot.val());
        } else {
            res.json({
                userID: targetId,
                appearancedata: { hat: 1, hair: 1, eyes: 1, skinColor: 1, face: 1 },
                equipmentdata: { weapon: 1, armor: 1, boots: 1, follow: null },
                data: { name: "New Wizard", level: 1, gold: 100, isMember: true }
            });
        }
    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get('/users/:id', async (req, res) => {
    if (!db) return res.status(503).end();
    try {
        const snapshot = await db.ref(`users/${req.params.id}`).get();
        res.json(snapshot.exists() ? snapshot.val() : {});
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

const players = {}; 

io.on('connection', async (socket) => {
    const query = socket.handshake.query;
    const uid = query.userID || query.uid || socket.id;
    const worldId = (query.worldId || '101').toString();

    players[uid] = {
        id: uid,
        userID: uid, 
        socketId: socket.id,
        world: worldId,
        x: 400,
        y: 400,
        appearancedata: { hat: 1, hair: 1, eyes: 1, skinColor: 1, face: 1 },
        equipmentdata: { weapon: 1, armor: 1, boots: 1, follow: null },
        data: { name: "New Wizard", level: 100, zone: worldId, isMember: true }
    };

    socket.join(worldId);
    
    const neighbors = Object.values(players).filter(p => p.world === worldId && p.id !== uid);
    socket.emit('playerList', neighbors);
    socket.to(worldId).emit('playerJoined', players[uid]);

    socket.on('player:move', (data) => {
        if (players[uid]) {
            players[uid].x = data.x;
            players[uid].y = data.y;
            socket.to(players[uid].world).emit('player:moved', { id: uid, userID: uid, x: data.x, y: data.y, face: data.face || 1 });
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            socket.to(players[uid].world).emit('playerLeft', uid);
            delete players[uid];
        }
    });
});

server.listen(PORT, () => {
    const protocol = server instanceof https.Server ? 'https' : 'http';
    console.log(`Prodigy Server active on ${protocol}://localhost:${PORT}`);
});
