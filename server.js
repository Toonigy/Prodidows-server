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
// Updated to match your specific Firebase Project: pde13532
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
    console.error("[FIREBASE ERROR] Could not initialize Admin SDK. Check service-account.json:", e.message);
}

// --- SERVER SETUP ---
const PORT = 8080;
// Default ID fallback (can be one of your Firebase UIDs)
const REAL_ID_1 = 'aTcB1gt3Auay8nqx28YErrbk0lz2'; 

const app = express();
const server = http.createServer(app);

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000
});

// --- GLOBAL GAME STATE ---
const players = {}; 

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
    // Logic to determine UID: Use token if provided, otherwise fallback to known ID
    const uid = (token && token.length > 10) ? token : REAL_ID_1;
    
    console.log(`[API AUTH] Login request for UID: ${uid}`);
    
    res.json({
        success: true,
        data: { auth: uid, userId: uid, userID: uid, token: token || "mock_access_token" }
    });
});

app.get('/game-api/v1/worlds', (req, res) => {
    // If you are seeing Waterscape/Fireplane, it's because the client 
    // is defaulting to its internal list. Let's provide a more robust response.
    const currentPop = Object.keys(players).length;
    res.status(200).send([
        { 
            id: 101, 
            name: "Crystal", 
            population: currentPop, 
            maxPopulation: 200, 
            status: "online",
            host: "localhost", // Change to your actual server IP/Domain if hosting
            port: PORT
        },
        { 
            id: 102, 
            name: "Nova", 
            population: 0, 
            maxPopulation: 200, 
            status: "online",
            host: "localhost",
            port: PORT
        }
    ]);
});

app.get('/game-api/v1/user/:userID/data', async (req, res) => {
    const userID = req.params.userID;
    if (db && userID && userID !== "undefined") {
        try {
            const snapshot = await db.ref(`users/${userID}`).get();
            if (snapshot.exists()) {
                console.log(`[DB] Found data for ${userID}`);
                return res.status(200).send({ success: true, data: snapshot.val() });
            }
        } catch (e) { console.error("[DB ERROR]", e.message); }
    }
    console.log(`[DB] No data for ${userID}, returning default schema.`);
    res.status(200).send({ success: true, data: getFullPlayerDataSchema(userID) });
});

app.post('/game-api/v1/cloud/save', async (req, res) => {
    const characterData = req.body;
    const userID = characterData.userID || req.headers['x-user-id'] || REAL_ID_1;
    if (db && characterData && userID !== "undefined") {
        try {
            await db.ref(`users/${userID}`).set(characterData);
            return res.status(200).send(true); 
        } catch (e) { return res.status(500).send(false); }
    }
    res.status(200).send(true);
});

// --- SOCKET.IO HANDLING ---

io.on('connection', async (socket) => {
    const query = socket.handshake.query;
    
    // Exhaustive check for the UID from the pde13532 auth session
    const uid = query.userToken || query.userId || query.userID || query.uid || socket.id;

    console.log(`[AUTH CHECK] Connection from project pde13532. UID: ${uid}`);

    // Initialize local player state
    players[uid] = {
        id: uid,
        socketId: socket.id,
        world: query.worldId ? query.worldId.toString() : '101',
        x: 400,
        y: 400,
        appearance: { hat: 1, hair: 1, eyes: 1 },
        equipment: { weapon: 1 },
        name: "Wizard"
    };

    // Use Admin privileges to fetch the specific user record from pde13532 RTDB
    if (db && uid !== socket.id && uid !== "undefined") {
        const fetchData = async () => {
            try {
                const userSnapshot = await db.ref(`users/${uid}`).get();
                if (userSnapshot.exists()) {
                    const userData = userSnapshot.val();
                    if (players[uid]) {
                        players[uid].appearance = userData.appearancedata || players[uid].appearance;
                        players[uid].equipment = userData.equipmentdata || players[uid].equipment;
                        players[uid].name = userData.data?.name || players[uid].name;
                        socket.to(players[uid].world).emit('player:updated', players[uid]);
                        console.log(`[NETWORK] Successfully synced pde13532 DB for: ${uid}`);
                    }
                }
            } catch (err) {
                console.error("[SOCKET DB ERROR]", err.message);
            }
        };
        fetchData();
    }

    socket.join(players[uid].world);
    
    const neighbors = Object.values(players).filter(p => p.world === players[uid].world && p.id !== uid);
    socket.emit('playerList', neighbors);
    socket.to(players[uid].world).emit('playerJoined', players[uid]);

    socket.on('network:message', (packet) => {
        const targetId = packet.target;
        if (targetId && players[targetId]) {
            io.to(players[targetId].socketId).emit('network:message', {
                sender: uid,
                data: packet
            });
        } else {
            socket.to(players[uid].world).emit('network:message', {
                sender: uid,
                data: packet
            });
        }
    });

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
            socket.to(players[uid].world).emit('player:moved', { 
                id: uid, 
                x: data.x, 
                y: data.y 
            });
        }
    });

    socket.on('switchZone', (newWorldId) => {
        if (players[uid]) {
            const oldWorld = players[uid].world;
            socket.leave(oldWorld);
            socket.to(oldWorld).emit('playerLeft', uid);

            players[uid].world = newWorldId.toString();
            socket.join(players[uid].world);

            const newNeighbors = Object.values(players).filter(p => p.world === players[uid].world && p.id !== uid);
            socket.emit('playerList', newNeighbors);
            socket.to(players[uid].world).emit('playerJoined', players[uid]);
        }
    });

    socket.on('disconnect', () => {
        if (players[uid]) {
            socket.to(players[uid].world).emit('playerLeft', uid);
            delete players[uid];
            console.log(`[NETWORK] Disconnected from pde13532: ${uid}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Socket Server (pde13532) active on port ${PORT}`);
});
