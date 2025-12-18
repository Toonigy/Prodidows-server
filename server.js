// --- REQUIRED SETUP ---
// 1. Place your Firebase Service Account JSON file in this same folder.
// 2. Ensure it is named 'service-account.json'.
// 3. Install dependencies: `npm install express socket.io firebase-admin`
// 4. Run the server: `node server.js`
// ------------------------

const express = require('express');
const http = require('http');
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
const server = http.createServer(app);
const PORT = 8080;

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.use(express.json({ limit: '50mb' }));

// --- SERVING STATIC FILES ---
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---

const getWorlds = (req, res) => {
    const worldList = [
        { id: "101", name: "Crystal", population: "Low" },
        { id: "102", name: "Nova", population: "Low" }
    ];
    res.json(worldList);
};

app.get('/getWorldList', getWorlds);
app.get('/game-api/v1/worlds', getWorlds);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// --- GLOBAL GAME STATE ---
const players = {}; 

io.on('connection', async (socket) => {
    const query = socket.handshake.query;
    
    // CRITICAL FIX: Ensure we have a userID string. 
    // Your minified code depends on e.userID being defined.
    const uid = query.userID || query.userToken || query.userId || query.uid || socket.id;
    const worldId = (query.worldId || '101').toString();

    // Initialize the 'e' object that addPlayer(e) expects
    players[uid] = {
        id: uid,
        userID: uid, // Essential for: if (!Util.isDefined(this.playerList[e.userID]))
        socketId: socket.id,
        world: worldId,
        x: 400,
        y: 400,
        appearancedata: { hat: 1, hair: 1, eyes: 1, skinColor: 1 },
        equipmentdata: { weapon: 1, follow: null, data: { follow: null } },
        data: { name: "New Wizard", level: 100 }
    };

    // Attempt to hydrate from Firebase if possible
    if (db && uid !== socket.id) {
        try {
            const userSnapshot = await db.ref(`users/${uid}`).get();
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                // Merge Firebase data but keep userID consistent
                players[uid] = { ...players[uid], ...userData, userID: uid, id: uid };
            }
        } catch (err) {
            console.error("[DB FETCH ERROR]", err.message);
        }
    }

    console.log(`[JOIN] ${uid} joined World ${worldId}`);

    // Join the world room AND a global room for the dashboard
    socket.join(worldId);
    socket.join("GLOBAL_MONITOR");

    // Send the current world's player list to the new user
    const neighbors = Object.values(players).filter(p => p.world === worldId && p.id !== uid);
    socket.emit('playerList', neighbors);

    // Broadcast to the world room (for the game)
    socket.to(worldId).emit('playerJoined', players[uid]);
    
    // Broadcast to the monitor room (for the dev dashboard)
    io.to("GLOBAL_MONITOR").emit('playerJoined', players[uid]);

    // --- EVENT HANDLERS ---

    // Movement updates based on game.min.js pattern
    socket.on('player:move', (data) => {
        if (players[uid]) {
            players[uid].x = data.x;
            players[uid].y = data.y;
            
            // The client expects 'player:moved' to update other wizards
            // We include both 'id' and 'userID' to ensure compatibility with 
            // any internal Util.isDefined checks in game.min.js
            const moveData = { 
                id: uid, 
                userID: uid,
                x: data.x, 
                y: data.y,
                // Some versions of the engine expect a 'face' or 'direction'
                face: data.face || 1 
            };

            socket.to(players[uid].world).emit('player:moved', moveData);
            
            // Update dashboard
            io.to("GLOBAL_MONITOR").emit('player:moved', moveData);
        }
    });

    socket.on('player:update', (data) => {
        if (players[uid]) {
            players[uid] = { ...players[uid], ...data, id: uid, userID: uid };
            socket.to(players[uid].world).emit('player:updated', players[uid]);
            io.to("GLOBAL_MONITOR").emit('player:updated', players[uid]);
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            console.log(`[LEAVE] ${uid} disconnected`);
            socket.to(players[uid].world).emit('playerLeft', uid);
            io.to("GLOBAL_MONITOR").emit('playerLeft', uid);
            delete players[uid];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Prodigy Server active on http://localhost:${PORT}`);
});
