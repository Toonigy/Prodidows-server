/**
 * PRODUCTION CHECKLIST FOR RENDER:
 * * 1. FIX THE WORLD LIST FETCH:
 * In your client code (likely in public.min.js or your bridge), find the World List URL.
 * WRONG: fetch("ws://prodidows-server.onrender.com/game-api/v1/worlds")
 * RIGHT: fetch("https://prodidows-server.onrender.com/game-api/v1/worlds")
 * * * 2. FIX THE SOCKET CONNECTION:
 * Change: const socket = io("http://localhost:8080");
 * To:     const socket = io("https://prodidows-server.onrender.com");
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

// --- IMPROVED CORS FOR PRODUCTION ---
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    // Handle OPTIONS preflight requests
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

// --- WORLD LIST API ---
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

// --- CHARACTER API ---
app.get('/game-api/v1/characters/:id', async (req, res) => {
    let targetId = req.params.id;
    // Basic validation to prevent saving [object Object] as a key
    if (targetId === "[object Object]" || !targetId) return res.status(400).json({ error: "Malformed ID" });
    if (!db) return res.status(503).json({ error: "Database offline" });

    try {
        const snapshot = await db.ref(`users/${targetId}`).get();
        if (snapshot.exists()) {
            res.json(snapshot.val());
        } else {
            // Default character for new or anonymous users
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
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"] 
    },
    allowEIO3: true,
    transports: ['websocket', 'polling'] 
});

const players = {}; 

io.on('connection', (socket) => {
    const query = socket.handshake.query;
    const rawUid = query.userID || query.uid;
    
    // logic: If we have a real-looking UID (not an object and not empty), use it.
    // Otherwise, use the socket.id as a temporary guest ID.
    const uid = (rawUid && rawUid !== "[object Object]") ? rawUid : socket.id;
    const worldId = (query.worldId || '101').toString();

    console.log(`[CONN] User ${uid} joined world ${worldId}`);

    players[uid] = {
        id: uid,
        userID: uid, 
        world: worldId,
        x: 400, y: 400,
        name: "New Wizard"
    };

    socket.join(worldId);
    
    // Send list of other players in the same world
    const neighbors = Object.values(players).filter(p => p.world === worldId && p.id !== uid);
    socket.emit('playerList', neighbors);
    
    // Notify others
    socket.to(worldId).emit('playerJoined', players[uid]);

    socket.on('player:move', (data) => {
        if (players[uid]) {
            players[uid].x = data.x;
            players[uid].y = data.y;
            socket.to(players[uid].world).emit('player:moved', { 
                id: uid, x: data.x, y: data.y, face: data.face || 1 
            });
        }
    });

    // Optional: Save character data to Realtime Database if UID is not just the socket ID
    socket.on('saveCharacter', async (characterData) => {
        if (db && uid !== socket.id) {
            try {
                await db.ref(`users/${uid}`).update(characterData);
                console.log(`[DB] Character saved for ${uid}`);
            } catch (err) {
                console.error("[DB ERROR]", err.message);
            }
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            console.log(`[DISCONN] User ${uid} left`);
            socket.to(players[uid].world).emit('playerLeft', uid);
            delete players[uid];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
