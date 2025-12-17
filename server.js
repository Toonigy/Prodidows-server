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
const serviceAccount = require('./service-account.json'); 

const FIREBASE_CONFIG = {
    databaseURL: "https://pde13532-default-rtdb.firebaseio.com"
};

const firebaseAdminApp = initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: FIREBASE_CONFIG.databaseURL 
});

const db = getDatabase(firebaseAdminApp);

// --- SERVER SETUP ---
const PORT = 8080;
const MOCK_UID = 'firebase-mock-user-123456789'; 
const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- GLOBAL GAME STATE ---
// We now map Firebase UIDs to player data
const players = {}; 
const worldUsers = new Map(); 

// --- MOCK AUTH SYSTEM ---
const MOCK_AUTH_SYSTEM = {
    verifyIdToken: async (token) => {
        if (token && typeof token === 'string' && token.length > 0) {
            // In a real app, this would verify the JWT. 
            // For now, it returns the token itself as the UID.
            return { uid: token };
        }
        throw new Error("Invalid or missing token.");
    }
};

async function authenticateRequest(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const userToken = authHeader.split(' ')[1];
    try {
        const decodedToken = await MOCK_AUTH_SYSTEM.verifyIdToken(userToken);
        return decodedToken.uid;
    } catch (e) {
        return null;
    }
}

// --- API ENDPOINTS ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/game-api/v1/auth/login', (req, res) => {
    res.json({
        success: true,
        data: { auth: MOCK_UID, userId: MOCK_UID }
    });
});

app.get('/game-api/v1/worlds', (req, res) => {
    const worldList = [1, 2, 3].map(id => ({
        id: id,
        name: `World ${id}`,
        icon: "fire",
        path: "/worlds/fireplane",
        full: 10,
        players: 10,
        maxPlayers: 100
    }));
    res.status(200).send(worldList);
});

app.get('/game-api/v1/user/:userID/data', async (req, res) => {
    const userID = req.params.userID;
    res.status(200).send({
        success: true,
        data: {
            appearancedata: { hat: 10, hair: 3, eyes: 4, head: 1, body: 2 },
            equipmentdata: { weapon: 50, armor: 60 },
            data: { name: `Wizard_${userID.substring(0,4)}`, level: 50 }
        }
    });
});

app.post('/game-api/v1/cloud/save', async (req, res) => {
    const userID = await authenticateRequest(req);
    if (!userID) return res.status(401).send({ success: false });

    const savePath = `users/${userID}`;
    const characterData = req.body;

    if (Object.keys(characterData).length > 0) {
        await set(ref(db, savePath), characterData);
        return res.status(200).send({ success: true, data: characterData });
    } else {
        const snapshot = await get(ref(db, savePath));
        return res.status(200).send({ 
            success: true, 
            data: snapshot.exists() ? snapshot.val() : { name: "New Wizard" } 
        });
    }
});

// --- SOCKET.IO ---

io.on('connection', async (socket) => {
    let { worldId = '1', userToken } = socket.handshake.query;

    if (!userToken) {
        console.error("[SOCKET.IO ERROR] Connection attempt without userToken");
        socket.emit('error', { message: 'Auth required' });
        return socket.disconnect(true);
    }

    // Attempt to "verify" the token to get the UID
    let playerFirebaseId;
    try {
        const decoded = await MOCK_AUTH_SYSTEM.verifyIdToken(userToken);
        playerFirebaseId = decoded.uid;
    } catch (err) {
        console.error("[SOCKET.IO ERROR] Token verification failed");
        return socket.disconnect(true);
    }

    const socketId = socket.id;

    // Store player by Firebase ID
    players[playerFirebaseId] = { 
        id: playerFirebaseId, // The Firebase UID
        socketId: socketId,
        world: worldId, 
        x: 500, 
        y: 500 
    };
    
    socket.join(worldId);

    console.log(`[PLAYER JOINED] Firebase ID: ${playerFirebaseId} joined World: ${worldId}`);

    // Filter other players in the same world using their Firebase UIDs
    const otherUIDs = Object.keys(players)
        .filter(uid => players[uid].world === worldId && uid !== playerFirebaseId);

    // Tell the current user about everyone else
    socket.emit('playerList', otherUIDs);
    
    // Tell everyone else that this Firebase User has joined
    // We send an object with the 'id' property to match client-side expectations
    socket.to(worldId).emit('playerJoined', playerFirebaseId);

    socket.on('player:move', (data) => {
        if (players[playerFirebaseId]) {
            players[playerFirebaseId].x = data.x;
            players[playerFirebaseId].y = data.y;
            
            // Broadcast movement using the Firebase ID as the identifier
            socket.to(worldId).emit('player:moved', { 
                id: playerFirebaseId, 
                x: data.x, 
                y: data.y 
            });
        }
    });

    socket.on('disconnect', () => {
        if (players[playerFirebaseId]) {
            console.log(`[PLAYER LEFT] Firebase ID: ${playerFirebaseId}`);
            // Notify others that the Firebase User has left
            socket.to(worldId).emit('playerLeft', playerFirebaseId);
            delete players[playerFirebaseId];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
