/**
 * DEVELOPMENT CHECKLIST FOR LOCALHOST:
 * 1. WORLD LIST FETCH:
 * Ensure the client is fetching from localhost:8080.
 * 2. SOCKET CONNECTION:
 * Ensure the socket connects to http://localhost:8080.
 * 3. CHARACTER DATA:
 * Character data is fetched via REST, while world stats are now dynamic via Socket/REST.
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
    console.log("[FIREBASE] Admin SDK connected");
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

// In-memory player storage
const players = {}; 

/**
 * GENERATE WORLD DATA
 * Dynamically calculates population based on real-time connected players.
 */
const generateWorldData = () => {
    const MAX_CAPACITY = 100; // Threshold for 100% fullness
    const playerArray = Object.values(players);
    
    // Count players per world ID
    const counts = {
        "101": playerArray.filter(p => p.world === "101").length,
        "102": playerArray.filter(p => p.world === "102").length
    };

    const getPopLabel = (count) => {
        if (count === 0) return "Empty";
        if (count < 10) return "Low";
        if (count < 50) return "Medium";
        return "High";
    };

    return [
        { 
            id: "101", 
            name: "Local Crystal", 
            population: getPopLabel(counts["101"]), 
            status: "online", 
            full: Math.min(counts["101"] / MAX_CAPACITY, 1.0), 
            host: "prodidows-server.onrender.com/" 
        },
        { 
            id: "102", 
            name: "Local Nova", 
            population: getPopLabel(counts["102"]), 
            status: "online", 
            full: Math.min(counts["102"] / MAX_CAPACITY, 1.0), 
            host: "prodidows-server.onrender.com/" 
        }
    ];
};

// --- HTTP ENDPOINTS ---
app.get('/game-api/v1/worlds', (req, res) => res.json(generateWorldData()));

app.get('/game-api/v1/characters/:id', async (req, res) => {
    let targetId = req.params.id;
    if (targetId === "[object Object]" || !targetId) targetId = req.query.userID || req.query.uid;
    if (!targetId || targetId === "[object Object]") return res.status(400).json({ error: "Invalid User ID" });
    
    try {
        if (!db) throw new Error("Database offline");
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

    // Store player immediately so population updates
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

    console.log(`[CONN] ${players[uid].name} entered World ${worldId}. Current Population: ${Object.values(players).length}`);

    // WEBSOCKET WORLD LIST HANDLER
    socket.on('getWorldList', () => {
        socket.emit('worldList', generateWorldData());
    });

    socket.on('joinZone', (data) => {
        const zoneId = data.zoneId || data;
        if (currentZone !== 'none') {
            socket.leave(`${worldId}:${currentZone}`);
            socket.to(`${worldId}:${currentZone}`).emit('playerLeft', uid);
        }
        currentZone = zoneId;
        players[uid].zone = zoneId;
        const roomName = `${worldId}:${currentZone}`;
        socket.join(roomName);

        const neighbors = Object.values(players).filter(p => 
            p.world === worldId && p.zone === currentZone && p.id !== uid
        );
        socket.emit('playerList', neighbors);
        socket.to(roomName).emit('playerJoined', players[uid]);
    });

    socket.on('player:move', (data) => {
        if (players[uid]) {
            players[uid].x = data.x;
            players[uid].y = data.y;
            players[uid].face = data.face || 1;
            
            // Sync visuals to neighbors
            socket.to(`${worldId}:${currentZone}`).emit('player:moved', { 
                id: uid, x: data.x, y: data.y, face: data.face,
                appearance: data.appearance || players[uid].appearance,
                equipment: data.equipment || players[uid].equipment,
                name: players[uid].name
            });
        }
    });

    socket.on('player:update', (data) => {
        if (players[uid]) {
            players[uid] = { ...players[uid], ...data };
            socket.to(`${worldId}:${currentZone}`).emit('player:updated', players[uid]);
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            console.log(`[DISCONN] ${players[uid].name} left. Population: ${Object.values(players).length - 1}`);
            socket.to(`${worldId}:${currentZone}`).emit('playerLeft', uid);
            delete players[uid];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server live on http://localhost:${PORT}`);
});
