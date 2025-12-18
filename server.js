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
// Provided Real IDs
const REAL_ID_1 = 'aTcB1gt3Auay8nqx28YErrbk0lz2'; 
const REAL_ID_2 = 'Ha8JLkWqKyWtA9SC9LbFnILJqHl2';

const app = express();
const server = http.createServer(app);

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// --- GLOBAL GAME STATE ---
const players = {}; 

// --- PLAYER DATA HANDLER ---
// This matches the schema requested by the client
const getMockPlayerData = (uid) => ({
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

// --- BACKEND AUTHORITY ---
const BACKEND = {
    verifyUser: async (token) => {
        if (!token || token === 'undefined' || token === 'null') {
            return { uid: `guest_${Math.random().toString(36).substr(2, 9)}` };
        }
        return { uid: token };
    }
};

// --- API ENDPOINTS ---

app.post('/game-api/v1/auth/login', (req, res) => {
    res.json({
        success: true,
        data: { auth: REAL_ID_1, userId: REAL_ID_1, userID: REAL_ID_1 }
    });
});

app.get('/game-api/v1/worlds', (req, res) => {
    res.status(200).send([
        { id: "1", name: "Crystal", population: Object.keys(players).length, status: "online" },
        { id: "2", name: "Nova", population: 0, status: "online" }
    ]);
});

app.post('/matchmaking-api/begin', (req, res) => {
    const playerInfo = req.body;
    console.log(`[MATCHMAKER] Request from ${playerInfo.userID}`);

    res.status(200).send({
        success: true,
        data: {
            matchId: `m_${Date.now()}`,
            opponent: {
                userID: REAL_ID_2,
                name: "Rival Wizard",
                level: (playerInfo.data?.level || 100),
                appearance: playerInfo.appearancedata || { hat: 20, hair: 5, eyes: 2 },
                equipment: playerInfo.equipmentdata || { weapon: 150 },
                isMember: true
            },
            server: "localhost:8080",
            encryptionKey: "backend_handshake_secure"
        }
    });
});

// LOAD PLAYER DATA
app.get('/game-api/v1/user/:userID/data', async (req, res) => {
    const userID = req.params.userID;
    
    if (db) {
        try {
            const snapshot = await get(ref(db, `users/${userID}`));
            if (snapshot.exists()) {
                console.log(`[DB] Loaded data for ${userID}`);
                return res.status(200).send({ success: true, data: snapshot.val() });
            }
        } catch (e) {
            console.error("[DB ERROR] Load failed:", e.message);
        }
    }
    
    // Fallback to mock data if not in DB
    console.log(`[API] Providing mock data for ${userID}`);
    res.status(200).send({
        success: true,
        data: getMockPlayerData(userID)
    });
});

// SAVE PLAYER DATA (CLOUD SAVE)
app.post('/game-api/v1/cloud/save', async (req, res) => {
    const characterData = req.body;
    const userID = characterData.userID || REAL_ID_1;

    if (db && characterData) {
        try {
            await set(ref(db, `users/${userID}`), characterData);
            console.log(`[DB] Saved data for ${userID}`);
            return res.status(200).send({ success: true });
        } catch (e) {
            console.error("[DB ERROR] Save failed:", e.message);
            return res.status(500).send({ success: false, error: e.message });
        }
    }
    res.status(200).send({ success: true, message: "Save simulated (no DB)" });
});

// --- SOCKET.IO HANDLING ---

io.on('connection', async (socket) => {
    let { worldId = '1', userToken, userId } = socket.handshake.query;
    const identifier = userToken || userId;

    const auth = await BACKEND.verifyUser(identifier);
    const uid = auth.uid;

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
    console.log(`[NETWORK] User ${uid} connected to world ${players[uid].world}`);

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

    socket.on('player:move', (data) => {
        if (players[uid] && data) {
            players[uid].x = data.x;
            players[uid].y = data.y;
            socket.to(players[uid].world).emit('player:moved', { id: uid, x: data.x, y: data.y });
        }
    });

    socket.on('switchZone', (newZone) => {
        if (players[uid]) {
            const oldWorld = players[uid].world;
            socket.leave(oldWorld);
            socket.to(oldWorld).emit('playerLeft', uid);

            players[uid].world = newZone.toString();
            socket.join(players[uid].world);
            
            const newNeighbors = Object.values(players).filter(p => p.world === newZone.toString() && p.id !== uid);
            socket.emit('playerList', newNeighbors);
            socket.to(newZone.toString()).emit('playerJoined', players[uid]);
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            socket.to(players[uid].world).emit('playerLeft', uid);
            delete players[uid];
            console.log(`[NETWORK] User ${uid} disconnected`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server optimized for backend.min.js running on port ${PORT}`);
});
