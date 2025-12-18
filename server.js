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
const REAL_ID_1 = 'aTcB1gt3Auay8nqx28YErrbk0lz2'; 

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.use(express.json({ limit: '50mb' }));

// --- SERVING STATIC FILES ---
// This serves all files in the 'public' directory (e.g., index.html, dev.html)
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---

// Generic world list endpoint
const getWorlds = (req, res) => {
    const worldList = [
        { id: "101", name: "Crystal", population: "Low" },
        { id: "102", name: "Nova", population: "Low" }
    ];
    res.json(worldList);
    console.log(`[API] Served world list to client via ${req.path}`);
};

// Original simple endpoint
app.get('/getWorldList', getWorlds);

// Fixes: http://localhost:8080/game-api/v1/worlds is 404
app.get('/game-api/v1/worlds', getWorlds);

// Explicitly handle the root route to serve index.html if it exists in 'public'
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

// This schema matches what 'addPlayer(e)' expects to receive in 'e'
const getFullPlayerDataSchema = (uid) => ({
    userID: uid, // Matches e.userID check in addPlayer
    appearancedata: { hat: 1, hair: 1, eyes: 1, head: 1, body: 1, skinColor: 1, hairColor: 1 },
    equipmentdata: { weapon: 1, armor: 1, boots: 1, spellRelic: 1, follow: null },
    data: { 
        name: `Wizard_${uid.substring(0, 4)}`, 
        level: 100, 
        gold: 500, 
        stars: 10, 
        arenaScore: 1000,
        zone: "lamplight-town"
    },
    metadata: { isMember: true }
});

// --- SOCKET.IO HANDLING ---

io.on('connection', async (socket) => {
    const query = socket.handshake.query;
    const uid = query.userID || query.userToken || query.userId || query.uid || socket.id;
    const worldId = (query.worldId || '101').toString();

    // 1. Prepare the player object for the server's tracking
    players[uid] = {
        id: uid,
        userID: uid, // Required for addPlayer minified check
        socketId: socket.id,
        world: worldId,
        x: 400,
        y: 400,
        name: "Wizard",
        // Flattened data for the minified 'e' parameter
        appearancedata: { hat: 1, hair: 1, eyes: 1 },
        equipmentdata: { weapon: 1, follow: null },
        data: { name: "Wizard", level: 100 }
    };

    // 2. If valid UID, fetch full profile from RTDB to populate 'e'
    if (db && uid !== socket.id && uid !== "undefined") {
        try {
            const userSnapshot = await db.ref(`users/${uid}`).get();
            if (userSnapshot.exists()) {
                const userData = userSnapshot.val();
                players[uid] = { ...players[uid], ...userData, userID: uid };
            }
        } catch (err) {
            console.error("[DB FETCH ERROR]", err.message);
        }
    }

    console.log(`[NETWORK] addPlayer sequence initiated for ${uid} in world ${worldId}`);

    // 3. Join world room
    socket.join(worldId);

    // 4. Send existing player list to the new player
    // Each object in this list acts as the 'e' in 'addPlayer(e)'
    const neighbors = Object.values(players).filter(p => p.world === worldId && p.id !== uid);
    socket.emit('playerList', neighbors);

    // 5. Broadcast the new player to everyone else in the room
    // This triggers 'addPlayer' on all other clients
    socket.to(worldId).emit('playerJoined', players[uid]);

    // --- PACKET HANDLING ---

    socket.on('player:move', (data) => {
        if (players[uid]) {
            players[uid].x = data.x;
            players[uid].y = data.y;
            // Broadcast movement so other clients can update their 'playerList[uid]'
            socket.to(players[uid].world).emit('player:moved', { 
                id: uid, 
                userID: uid,
                x: data.x, 
                y: data.y 
            });
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            console.log(`[NETWORK] removePlayer sequence initiated for ${uid}`);
            // This triggers 'removePlayer(uid)' on clients
            socket.to(players[uid].world).emit('playerLeft', uid);
            delete players[uid];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Prodigy Backend (pde13532) active on port ${PORT}`);
});
