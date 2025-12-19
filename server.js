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

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory player storage
const players = {}; 

// Helper function to generate dynamic world data
const generateWorldData = () => {
    const MAX_CAPACITY = 100;
    const playerArray = Object.values(players);
    const counts = {
        "101": playerArray.filter(p => p.world === "101").length,
        "102": playerArray.filter(p => p.world === "102").length
    };

    return [
        { 
            id: "101", 
            name: "Local Crystal", 
            population: counts["101"] > 0 ? (counts["101"] > 50 ? "High" : "Low") : "Empty", 
            status: "online", 
            fullness: counts["101"] / MAX_CAPACITY, 
            host: "prodidows-server.onrender.com" 
        },
        { 
            id: "102", 
            name: "Local Nova", 
            population: counts["102"] > 0 ? (counts["102"] > 50 ? "High" : "Low") : "Empty", 
            status: "online", 
            fullness: counts["102"] / MAX_CAPACITY, 
            host: "prodidows-server.onrender.com" 
        }
    ];
};

// --- WORLD LIST API (STILL AVAILABLE FOR INITIAL FETCH) ---
const getWorlds = (req, res) => {
    res.json(generateWorldData());
};

app.get('/getWorldList', getWorlds);
app.get('/game-api/v1/worlds', getWorlds);

// --- CHARACTER API ---
app.get('/game-api/v1/characters/:id', async (req, res) => {
    let targetId = req.params.id;
    if (targetId === "[object Object]" || !targetId) targetId = req.query.userID || req.query.uid;
    if (!targetId || targetId === "[object Object]") return res.status(400).json({ error: "Invalid User ID" });
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

io.on('connection', (socket) => {
    const query = socket.handshake.query;
    let rawUid = query.userID || query.uid;
    const uid = (rawUid && rawUid !== "[object Object]") ? rawUid : socket.id;
    const worldId = (query.worldId || '101').toString();

    let currentZone = 'none';

    // Create the player record with full metadata slots
    players[uid] = {
        id: uid,
        userID: uid, 
        world: worldId,
        zone: currentZone,
        x: 400, y: 400,
        face: 1,
        name: query.name || "New Wizard",
        isMember: query.isMember === 'true',
        appearance: {}, 
        equipment: {}
    };

    console.log(`[CONN] ${players[uid].name} (${uid}) connected to world ${worldId}`);

    // WEBSOCKET WORLD LIST HANDLER
    socket.on('getWorldList', () => {
        socket.emit('worldList', generateWorldData());
    });

    const joinZone = (zoneId) => {
        if (currentZone !== 'none') {
            socket.leave(`${worldId}:${currentZone}`);
            socket.to(`${worldId}:${currentZone}`).emit('playerLeft', uid);
        }

        currentZone = zoneId;
        players[uid].zone = zoneId;
        
        const roomName = `${worldId}:${currentZone}`;
        socket.join(roomName);

        // Send existing neighbors in this zone to the new player
        const neighbors = Object.values(players).filter(p => 
            p.world === worldId && p.zone === currentZone && p.id !== uid
        );
        
        socket.emit('playerList', neighbors);
        // Broadcast arrival to neighbors
        socket.to(roomName).emit('playerJoined', players[uid]);
    };

    socket.on('joinZone', (data) => joinZone(data.zoneId || data));
    socket.on('switchZone', (data) => joinZone(data.zoneId || data));

    // MOVEMENT: Now includes equipment/appearance updates to ensure consistency
    socket.on('player:move', (data) => {
        if (players[uid]) {
            players[uid].x = data.x;
            players[uid].y = data.y;
            players[uid].face = data.face || 1;
            
            // Sync metadata if provided in movement packet
            if (data.appearance) players[uid].appearance = data.appearance;
            if (data.equipment) players[uid].equipment = data.equipment;
            if (data.name) players[uid].name = data.name;

            socket.to(`${worldId}:${currentZone}`).emit('player:moved', { 
                id: uid, 
                x: data.x, 
                y: data.y, 
                face: data.face || 1,
                appearance: players[uid].appearance,
                equipment: players[uid].equipment,
                name: players[uid].name,
                isMember: players[uid].isMember
            });
        }
    });

    // FULL UPDATE: For when items are changed in inventory
    socket.on('player:update', (data) => {
        if (players[uid]) {
            // Merge new data (equipment, appearance, etc.)
            players[uid] = { ...players[uid], ...data, id: uid, userID: uid };
            socket.to(`${worldId}:${currentZone}`).emit('player:updated', players[uid]);
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            socket.to(`${worldId}:${currentZone}`).emit('playerLeft', uid);
            console.log(`[DISCONN] ${players[uid].name} (${uid}) disconnected`);
            delete players[uid];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

