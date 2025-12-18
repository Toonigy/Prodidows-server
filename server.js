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
    
    // CRITICAL: Aligned with game.min.js 'onAuthStateChanged' logic
    const uid = query.userID || query.userToken || query.userId || query.uid || socket.id;
    
    // Some clients send zone name directly in worldId if they are in a specific area like Felspore
    const worldId = (query.worldId || '101').toString();

    // Default 'e' object initialization based on PIXI.game.prodigy.player structure
    players[uid] = {
        id: uid,
        userID: uid, 
        socketId: socket.id,
        world: worldId,
        x: 400,
        y: 400,
        appearancedata: { hat: 1, hair: 1, eyes: 1, skinColor: 1, face: 1 },
        equipmentdata: { weapon: 1, armor: 1, boots: 1, follow: null },
        data: { 
            name: "New Wizard", 
            level: 100, 
            zone: worldId,
            stars: 0,
            gold: 0,
            isMember: true 
        }
    };

    // Hydration: Sync with 'users/' + userID path found in game.min.js
    if (db && uid !== socket.id) {
        try {
            const userRef = db.ref(`users/${uid}`);
            const userSnapshot = await userRef.get();
            if (userSnapshot.exists()) {
                let wizardData = userSnapshot.val();
                
                // FIXED: Handle stringified JSON data found in getCloudSave snippet
                if (typeof wizardData === "string") {
                    try {
                        wizardData = JSON.parse(wizardData);
                    } catch (pErr) {
                        console.error("[JSON PARSE ERROR]", pErr.message);
                    }
                }

                // If the stored data has a nested 'wizard' key, extract it
                if (wizardData.wizard) {
                    wizardData = wizardData.wizard;
                }

                // Merge database results into current session. 
                // We ensure 'data' exists to prevent undefined username/name.
                players[uid] = { 
                    ...players[uid], 
                    ...wizardData,
                    data: {
                        ...(players[uid].data || {}),
                        ...(wizardData.data || {}),
                        name: wizardData.data?.name || wizardData.name || wizardData.nickname || "New Wizard"
                    },
                    userID: uid, 
                    id: uid 
                };
                
                console.log(`[DB] Restored session for ${uid}. Name: ${players[uid].data.name}`);
            }
        } catch (err) {
            console.error("[DB FETCH ERROR]", err.message);
        }
    }

    console.log(`[JOIN] ${uid} joined room: ${worldId}`);

    // Join the specific world/zone room
    socket.join(worldId);
    socket.join("GLOBAL_MONITOR");

    // Send the player list for THIS world/zone
    const neighbors = Object.values(players).filter(p => p.world === worldId && p.id !== uid);
    socket.emit('playerList', neighbors);

    // Broadcast join to others in the same world/zone
    socket.to(worldId).emit('playerJoined', players[uid]);
    io.to("GLOBAL_MONITOR").emit('playerJoined', players[uid]);

    // --- EVENT HANDLERS ---

    socket.on('player:move', (data) => {
        if (players[uid]) {
            players[uid].x = data.x;
            players[uid].y = data.y;
            
            const moveData = { 
                id: uid, 
                userID: uid,
                x: data.x, 
                y: data.y,
                face: data.face || 1 
            };

            socket.to(players[uid].world).emit('player:moved', moveData);
            io.to("GLOBAL_MONITOR").emit('player:moved', moveData);
        }
    });

    socket.on('player:zone', (newZone) => {
        if (players[uid]) {
            const oldZone = players[uid].world;
            if (oldZone !== newZone) {
                console.log(`[ZONE] ${uid} moving from ${oldZone} to ${newZone}`);
                
                socket.to(oldZone).emit('playerLeft', uid);
                socket.leave(oldZone);
                
                players[uid].world = newZone;
                if (players[uid].data) players[uid].data.zone = newZone;
                
                socket.join(newZone);
                const neighbors = Object.values(players).filter(p => p.world === newZone && p.id !== uid);
                socket.emit('playerList', neighbors);
                socket.to(newZone).emit('playerJoined', players[uid]);
            }
        }
    });

    socket.on('player:update', (data) => {
        if (players[uid]) {
            players[uid] = { ...players[uid], ...data, id: uid, userID: uid };
            socket.to(players[uid].world).emit('player:updated', players[uid]);
            io.to("GLOBAL_MONITOR").emit('player:updated', players[uid]);
        }
    });

    socket.on('player:saveCharacter', async (characterData) => {
        if (db && players[uid] && uid !== socket.id) {
            try {
                // Ensure we save it in a structure compatible with the client's getCloudSave
                await db.ref(`users/${uid}`).update(characterData);
                console.log(`[DB] Saved character for ${uid}`);
            } catch (err) {
                console.error("[DB SAVE ERROR]", err.message);
            }
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
