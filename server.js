/**
 * DEVELOPMENT CHECKLIST FOR LOCALHOST:
 * * 1. WORLD LIST FETCH:
 * In your client code, ensure you are fetching from localhost.
 * RIGHT: fetch("http://localhost:8080/game-api/v1/worlds")
 * * 2. SOCKET CONNECTION:
 * RIGHT: const socket = io("http://localhost:8080");
 */

const express = require('express');
const http = require('http'); 
const path = require('path');
const { Server } = require('socket.io');
const admin = require('firebase-admin'); 
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

// --- FIREBASE ADMIN SDK ---
let db;
try {
    const serviceAccount = require('./service-account.json'); 
    const firebaseAdminApp = initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://pde13532-default-rtdb.firebaseio.com"
    });
    db = getDatabase(firebaseAdminApp);
    console.log("[FIREBASE] Admin SDK connected to pde13532");
} catch (e) {
    console.error("[FIREBASE ERROR]:", e.message);
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

// --- CORS HANDLING ---
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json({ limit: '50mb' }));

// --- STATIC FILES ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- WORLD LIST API (POINTING TO LOCALHOST) ---
const getWorlds = (req, res) => {
    const worldList = [
        { 
            id: "101", 
            name: "Local Crystal", 
            population: "Low", 
            status: "online", 
            fullness: 0.1,    
            host: "localhost:8080" 
        },
        { 
            id: "102", 
            name: "Local Nova", 
            population: "Low", 
            status: "online",
            fullness: 0.2,    
            host: "localhost:8080" 
        }
    ];
    res.json(worldList);
};

app.get('/getWorldList', getWorlds);
app.get('/game-api/v1/worlds', getWorlds);

// --- CHARACTER API ---
app.get('/game-api/v1/characters/:id', async (req, res) => {
    let targetId = req.params.id;

    if (targetId === "[object Object]" || !targetId) {
        targetId = req.query.userID || req.query.uid;
    }

    if (!targetId || targetId === "[object Object]") {
        return res.status(400).json({ error: "Invalid User ID provided" });
    }

    if (!db) return res.status(503).json({ error: "Database offline" });

    try {
        const snapshot = await db.ref(`users/${targetId}`).get();
        if (snapshot.exists()) {
            res.json(snapshot.val());
        } else {
            res.json({
                userID: targetId,
                appearancedata: { hat: 1, hair: 1, eyes: 1, skinColor: 1, face: 1 },
                equipmentdata: { weapon: 1, armor: 1, boots: 1, follow: null },
                data: { name: "Explorer", level: 1, gold: 100, isMember: true }
            });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SOCKET.IO ---
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    transports: ['websocket', 'polling'] 
});

const players = {}; 

io.on('connection', (socket) => {
    const query = socket.handshake.query;
    let rawUid = query.userID || query.uid;
    const uid = (rawUid && rawUid !== "[object Object]") ? rawUid : socket.id;
    const worldId = (query.worldId || '101').toString();

    // The current zone/map the player is in. Default to 'none' until joinZone is called.
    let currentZone = 'none';

    players[uid] = {
        id: uid,
        userID: uid, 
        world: worldId,
        zone: currentZone,
        x: 400, y: 400,
        name: "New Wizard",
        appearancedata: { hat: 1, hair: 1, eyes: 1, skinColor: 1, face: 1 }
    };

    console.log(`[CONN] User ${uid} connected to world ${worldId}`);

    // Logic for joining a specific zone/map
    const joinZone = (zoneId) => {
        // Leave previous zone room
        if (currentZone !== 'none') {
            socket.leave(`${worldId}:${currentZone}`);
            socket.to(`${worldId}:${currentZone}`).emit('playerLeft', uid);
        }

        currentZone = zoneId;
        players[uid].zone = zoneId;
        
        // Join the combined World+Zone room
        const roomName = `${worldId}:${currentZone}`;
        socket.join(roomName);

        console.log(`[ZONE] User ${uid} joined zone: ${zoneId} in world ${worldId}`);

        // Fetch neighbors ONLY in this specific zone
        const neighbors = Object.values(players).filter(p => 
            p.world === worldId && 
            p.zone === currentZone && 
            p.id !== uid
        );
        
        socket.emit('playerList', neighbors);
        socket.to(roomName).emit('playerJoined', players[uid]);
    };

    // Support both 'joinZone' and 'switchZone' event names common in minified builds
    socket.on('joinZone', (data) => joinZone(data.zoneId || data));
    socket.on('switchZone', (data) => joinZone(data.zoneId || data));

    socket.on('player:move', (data) => {
        if (players[uid]) {
            players[uid].x = data.x;
            players[uid].y = data.y;
            // Only broadcast to players in the same World + Zone
            socket.to(`${worldId}:${currentZone}`).emit('player:moved', { 
                id: uid, x: data.x, y: data.y, face: data.face || 1 
            });
        }
    });

    socket.on('player:update', (data) => {
        if (players[uid]) {
            players[uid] = { ...players[uid], ...data, id: uid };
            socket.to(`${worldId}:${currentZone}`).emit('player:updated', players[uid]);
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            console.log(`[DISCONN] User ${uid} left`);
            socket.to(`${worldId}:${currentZone}`).emit('playerLeft', uid);
            delete players[uid];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
