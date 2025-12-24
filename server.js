/**
 * server.js - Final Fix for Population and Player Synchronization
 */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// Firebase Admin setup
let admin;
let db;
const RTDB_URL = "https://pde13532-default-rtdb.firebaseio.com";

try {
    admin = require('firebase-admin');
    const serviceAccount = require('./service-account.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: RTDB_URL
    });
    db = admin.database();
    console.log("[FIREBASE] Admin SDK Initialized.");
} catch (e) {
    console.warn("[FIREBASE] No Service Account Key found. Running in limited mode.");
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * WORLD LIST DATA
 */
const worlds = [
    { id: 1, name: "Farflight", full: 0, maxPopulation: 100, status: "online", classIDs: [1, 2, 3] },
    { id: 2, name: "Pirate Bay", full: 0, maxPopulation: 100, status: "online", classIDs: [1, 2, 3] }
];

app.get('/game-api/v1/worlds', (req, res) => {
    res.json(worlds);
});

app.get('/game-api/v1/player/:uid', async (req, res) => {
    const uid = req.params.uid;
    if (db) {
        try {
            const snapshot = await db.ref(`users/${uid}`).once('value');
            if (snapshot.exists()) return res.json(snapshot.val());
        } catch (e) {}
    }
    res.json({ userID: uid, name: "Guest Wizard", appearance: {} });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const players = {};

/**
 * Recalculates 'full' for all worlds and notifies all connected sockets
 */
function refreshWorldStats() {
    // Reset population counts
    worlds.forEach(w => w.full = 0);
    
    // Total count from the players object
    Object.values(players).forEach(p => {
        if (p.world) {
            const world = worlds.find(w => w.id === parseInt(p.world));
            if (world) world.full++;
        }
    });

    // Send the updated world list to everyone (including those on world select)
    io.emit('world:update', worlds);
}

function parseProdigyData(input) {
    try {
        return typeof input === 'string' ? JSON.parse(input) : input;
    } catch (e) {
        return input;
    }
}

io.on('connection', (socket) => {
    const uid = socket.handshake.query.uid || `guest_${socket.id.substring(0, 5)}`;
    
    players[socket.id] = {
        id: uid,
        socketId: socket.id,
        world: null,
        name: "Wizard",
        appearance: {}
    };

    socket.emit('ready', { sessionId: socket.id, userId: uid });

    socket.on('join:world', (rawData) => {
        const data = parseProdigyData(rawData);
        const worldId = parseInt(data.worldId);
        
        if (!players[socket.id]) return;

        // Clean up old world data if switching
        if (players[socket.id].world) {
            socket.leave(`world_${players[socket.id].world}`);
        }

        // Update player record
        players[socket.id].world = worldId;
        players[socket.id].appearance = data.appearance || {};
        players[socket.id].name = data.name || "Wizard";
        
        socket.join(`world_${worldId}`);
        
        // 1. Send the list of EXISTING players in this world to the NEW player
        const worldPlayers = Object.values(players).filter(p => p.world === worldId && p.socketId !== socket.id);
        socket.emit('playerList', worldPlayers);
        
        // 2. Tell others in the world that a new player joined
        socket.to(`world_${worldId}`).emit('playerJoined', players[socket.id]);

        // 3. Update global population stats
        refreshWorldStats();
    });

    socket.on('player:path', (rawData) => {
        if (!players[socket.id] || !players[socket.id].world) return;
        const pathData = parseProdigyData(rawData);
        Object.assign(players[socket.id], pathData);
        // Broadcast movement to others in the same world
        socket.to(`world_${players[socket.id].world}`).emit('player:path', players[socket.id]);
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            const p = players[socket.id];
            if (p.world) {
                socket.to(`world_${p.world}`).emit('playerLeft', p.id);
            }
            delete players[socket.id];
            refreshWorldStats();
        }
    });
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`[SERVER] Running on http://localhost:${PORT}`);
});
