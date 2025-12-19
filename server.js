/**
 * CLIENT-SIDE REMINDER:
 * In your game bridge/client code, you MUST update the socket initialization:
 * FROM: const socket = io("http://localhost:8080", { ... });
 * TO:   const socket = io("https://prodidows-server.onrender.com", { ... });
 */

const express = require('express');
const http = require('http'); // Render handles HTTPS for us; we use HTTP internally
const path = require('path');
const { Server } = require('socket.io');
const admin = require('firebase-admin'); 
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

// --- FIREBASE ADMIN SDK INITIALIZATION ---
let db;
try {
    // On Render, ensure this file is uploaded or use Environment Variables
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
const server = http.createServer(app);
// Use Render's PORT environment variable or default to 8080
const PORT = process.env.PORT || 8080;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---

/**
 * UPDATED: World List for Render Production
 * - fullness: 0.1 (Enables Green Bar)
 * - host: The Render URL (Points the client to the right secure websocket)
 */
const getWorlds = (req, res) => {
    const worldList = [
        { 
            id: "101", 
            name: "Crystal", 
            population: "Low", 
            status: "online", 
            fullness: 0.1,    
            host: "prodidows-server.onrender.com" 
        },
        { 
            id: "102", 
            name: "Nova", 
            population: "Low", 
            status: "online",
            fullness: 0.2,    
            host: "prodidows-server.onrender.com" 
        }
    ];
    res.json(worldList);
};

app.get('/getWorldList', getWorlds);
app.get('/game-api/v1/worlds', getWorlds);

app.get('/game-api/v1/characters/:id', async (req, res) => {
    let targetId = req.params.id;
    if (targetId === "[object Object]") return res.status(400).json({ error: "Invalid ID" });
    if (!db) return res.status(503).json({ error: "DB Offline" });

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
        res.status(500).json({ error: "Internal Error" });
    }
});

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'] // Allow both for better compatibility on Render
});

const players = {}; 

io.on('connection', async (socket) => {
    const query = socket.handshake.query;
    const uid = query.userID || query.uid || socket.id;
    const worldId = (query.worldId || '101').toString();

    players[uid] = {
        id: uid,
        userID: uid, 
        world: worldId,
        x: 400,
        y: 400,
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
            socket.to(players[uid].world).emit('player:moved', { id: uid, x: data.x, y: data.y, face: data.face || 1 });
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            socket.to(players[uid].world).emit('playerLeft', uid);
            delete players[uid];
        }
    });
});

// Render provides the PORT env variable automatically
server.listen(PORT, () => {
    console.log(`Prodigy Production Server active on Port: ${PORT}`);
    console.log(`Endpoint: https://prodidows-server.onrender.com/game-api/v1/worlds`);
});
