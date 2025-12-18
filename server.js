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
const { getDatabase, ref, get, set } = require('firebase-admin/database');

// --- FIREBASE ADMIN SDK INITIALIZATION ---
let db;
try {
    const serviceAccount = require('./service-account.json'); 
    const firebaseAdminApp = initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://pde13532-default-rtdb.firebaseio.com"
    });
    db = getDatabase(firebaseAdminApp);
    console.log("[FIREBASE] Admin SDK initialized successfully.");
} catch (e) {
    console.error("[FIREBASE ERROR] Could not initialize Admin SDK. Check service-account.json:", e.message);
}

// --- SERVER SETUP ---
const PORT = 8080;
// Provided Real IDs for session persistence
const REAL_ID_1 = 'aTcB1gt3Auay8nqx28YErrbk0lz2'; 
const REAL_ID_2 = 'Ha8JLkWqKyWtA9SC9LbFnILJqHl2';

const app = express();
const server = http.createServer(app);

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.use(express.json({ limit: '50mb' })); // Increased limit for full backpack/house data
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// --- GLOBAL GAME STATE ---
const players = {}; 

// --- COMPREHENSIVE PLAYER DATA GENERATOR ---
// Matches the exact structure expected by the Prodigy Game Engine
const getFullPlayerDataSchema = (uid) => ({
    appearancedata: { hat: 1, hair: 1, eyes: 1, head: 1, body: 1, skinColor: 1, hairColor: 1 },
    equipmentdata: { weapon: 1, armor: 1, boots: 1, spellRelic: 1 },
    kenneldata: [],
    data: { name: `Wizard_${uid.substring(0, 4)}`, level: 100, gold: 500, stars: 10 },
    questdata: {},
    statedata: {},
    tutorialdata: { "complete": true },
    backpackdata: [],
    housedata: {},
    achievementsdata: {},
    metadata: { isMember: true },
    gameVersion: "1.0.0"
});

// --- API ENDPOINTS ---

app.post('/game-api/v1/auth/login', async (req, res) => {
    const { token } = req.body;
    // Map token to REAL_ID_1 if it looks like our test user
    const uid = (token && token.length > 20) ? token : REAL_ID_1;
    
    res.json({
        success: true,
        data: { 
            auth: uid, 
            userId: uid, 
            userID: uid,
            token: token || "mock_access_token"
        }
    });
});

app.get('/game-api/v1/worlds', (req, res) => {
    res.status(200).send([
        { id: "1", name: "Crystal", population: Object.keys(players).length, status: "online" },
        { id: "2", name: "Nova", population: 0, status: "online" }
    ]);
});

// LOAD PLAYER DATA
app.get('/game-api/v1/user/:userID/data', async (req, res) => {
    const userID = req.params.userID;
    
    if (db) {
        try {
            const snapshot = await get(ref(db, `users/${userID}`));
            if (snapshot.exists()) {
                return res.status(200).send({ success: true, data: snapshot.val() });
            }
        } catch (e) {
            console.error("[DB ERROR]", e.message);
        }
    }
    
    res.status(200).send({
        success: true,
        data: getFullPlayerDataSchema(userID)
    });
});

// CLOUD SAVE ENDPOINT (Critical for processUpdate logic)
app.post('/game-api/v1/cloud/save', async (req, res) => {
    const characterData = req.body;
    // The engine usually passes userID in the data object or headers
    const userID = characterData.userID || req.headers['x-user-id'] || REAL_ID_1;

    if (db && characterData) {
        try {
            // Persist the full object including backpack, house, kennel, etc.
            await set(ref(db, `users/${userID}`), characterData);
            console.log(`[CLOUD SAVE] Success for ${userID}`);
            
            // Returning 'true' here satisfies the 'e' parameter in your processUpdate function
            return res.status(200).send(true); 
        } catch (e) {
            console.error("[CLOUD SAVE ERROR]", e.message);
            return res.status(500).send(false);
        }
    }
    // Fallback success for local testing without Firebase
    res.status(200).send(true);
});

// --- SOCKET.IO HANDLING ---

io.on('connection', async (socket) => {
    let { worldId = '1', userToken, userId } = socket.handshake.query;
    const uid = userToken || userId || REAL_ID_1;

    players[uid] = {
        id: uid,
        socketId: socket.id,
        world: worldId.toString(),
        x: 400,
        y: 400,
        appearance: {},
        equipment: {},
        name: "Wizard"
    };

    socket.join(players[uid].world);
    console.log(`[NETWORK] ${uid} joined ${players[uid].world}`);

    const neighbors = Object.values(players).filter(p => p.world === players[uid].world && p.id !== uid);
    socket.emit('playerList', neighbors);
    socket.to(players[uid].world).emit('playerJoined', players[uid]);

    socket.on('player:sync', (data) => {
        if (players[uid]) {
            players[uid].appearance = data.appearance || players[uid].appearance;
            players[uid].equipment = data.equipment || players[uid].equipment;
            players[uid].name = data.name || players[uid].name;
            socket.to(players[uid].world).emit('player:updated', players[uid]);
        }
    });

    // Handle wizard movement updates
    socket.on('player:move', (data) => {
        if (players[uid] && data) {
            // Update internal server state for this player
            players[uid].x = data.x;
            players[uid].y = data.y;
            
            // Broadcast the new coordinates to all other wizards in the same world
            // Including the ID so the client knows which wizard to move
            socket.to(players[uid].world).emit('player:moved', { 
                id: uid, 
                x: data.x, 
                y: data.y 
            });
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
    console.log(`Multiplayer server operational on port ${PORT}`);
});
