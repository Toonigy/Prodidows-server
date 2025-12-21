/**
 * server.js - Hybrid Firebase Integration
 * Supports both Service Account Keys and REST Fallback
 */
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

// Firebase Admin for when you have the Key
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
    console.warn("[FIREBASE] No Service Account Key found. Falling back to REST mode.");
}

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * World Data Repository
 */
const getWorldData = () => {
    const totalPlayers = Object.keys(players).length;
    return [
        { 
            id: 1, 
            name: "Fireplane", 
            population: totalPlayers, 
            status: "online",
            maxPopulation: 200,
            host: "prodidows-server.onrender.com",
            port: 8080,
            type: "public",
            data: { name: "Fireplane", tag: "fire", isRecommended: true }
        },
        { 
            id: 13, 
            name: "Prodigy", 
            population: 0, 
            status: "online",
            maxPopulation: 500,
            host: "prodidows-server.onrender.com",
            port: 8080,
            type: "public",
            data: { name: "Prodigy", tag: "trophyGold" }
        }
    ];
};

app.get('/multiplayer/worlds/get', (req, res) => res.json(getWorldData()));
app.get('/game-api/v1/worlds', (req, res) => res.json(getWorldData()));

/**
 * FIXED: LEADERBOARD API
 * The loadWizardsComplete function crashes if player_list is empty 
 * because it tries to access this.leaders[0].isMember.
 * We now provide a default 'Top Player' to satisfy the engine.
 */
app.get('/leaderboard-api/pvp/:season/:limit', (req, res) => {
    console.log(`[Leaderboard] Request for Season ${req.params.season}, Limit ${req.params.limit}`);
    
    // Default dummy wizard to prevent 'undefined' property access
    const dummyLeader = {
        id: "TOP_WIZARD",
        name: "Grandmaster",
        username: "Arena King",
        isMember: 1, // Using 1/0 as the minified code checks '== 1'
        rank: 1,
        score: 9999,
        stars: 9999,
        appearance: {} 
    };

    res.json({
        status: "success",
        season: parseInt(req.params.season),
        player_list: [dummyLeader], // MUST have at least one entry
        player_position: 1,
        entries: [dummyLeader],
        player: {
            rank: 1,
            score: 0,
            stars: 0,
            isMember: 0,
            name: "You",
            appearance: {}
        }
    });
});

/**
 * Handle "zone-login" and multiplayer join requests
 */
app.get('/multiplayer/join/:worldID/:mode', (req, res) => {
    const { worldID, mode } = req.params;
    res.json({
        success: true,
        status: 200,
        message: "Connected to world",
        data: {
            roomID: `WORLD_${worldID}`,
            serverTime: Date.now()
        }
    });
});

app.get('/game-api/v1/character/:userID', async (req, res) => {
    const targetUID = req.params.userID;
    let playerData = players[targetUID];

    if (!playerData) {
        try {
            if (db) {
                const snapshot = await db.ref(`users/${targetUID}`).once('value');
                playerData = snapshot.val();
            } else {
                const response = await fetch(`${RTDB_URL}/users/${targetUID}.json`);
                playerData = await response.json();
            }
        } catch (e) { console.error(e); }
    }

    if (playerData) {
        const responseWrapper = {};
        responseWrapper[targetUID] = { ...playerData };
        res.json(responseWrapper);
    } else {
        res.status(404).json({ success: false });
    }
});

/**
 * FIXED: MATCHMAKING API
 * Handles the begin, end, and quit requests for PvP/Arena matchmaking
 */
app.post(['/matchmaking-api/begin', '/matchmaking/begin'], (req, res) => {
    console.log("[Matchmaking] Begin search request received.");
    res.json({ 
        success: true, 
        status: "searching",
        estimated_wait: 5 
    });
});

app.post(['/matchmaking-api/end', '/matchmaking/end'], (req, res) => {
    console.log("[Matchmaking] End request received.");
    res.json({ success: true });
});

app.post(['/matchmaking-api/quit', '/matchmaking/quit'], (req, res) => {
    console.log("[Matchmaking] Quit request received.");
    res.json({ success: true });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const players = {}; 

io.on('connection', (socket) => {
    let uid = socket.handshake.query.userID;
    const worldId = socket.handshake.query.worldId || "Default";
    let currentRoom = null;
    
    socket.on('join:world', async (data) => {
        if (!uid || uid === "null" || uid === "undefined") {
            uid = data.id || `Guest_${socket.id.substring(0,5)}`;
        }

        const zone = data.worldId || "Intro";
        const room = `${worldId}:${zone}`;
        
        // Clean up old room if re-joining or switching via join event
        if (currentRoom && currentRoom !== room) {
            socket.leave(currentRoom);
            socket.to(currentRoom).emit('playerLeft', uid);
        }

        socket.join(room);
        currentRoom = room;

        players[uid] = {
            id: uid,
            userID: uid,
            name: data.name || "Wizard",
            x: data.x || 500,
            y: data.y || 500,
            appearance: data.appearance || {},
            equipment: data.equipment || {},
            isMember: !!data.isMember,
            world: worldId,
            zone: zone
        };

        console.log(`[World] ${players[uid].name} joined ${room}`);
        const neighbors = Object.values(players).filter(p => p.zone === zone && p.id !== uid);
        socket.emit('playerList', neighbors);
        socket.to(room).emit('playerJoined', players[uid]); 
    });

    /**
     * Logic for switching zones/maps
     */
    socket.on('switchZone', (newZone) => {
        if (!uid || !players[uid]) return;

        const oldRoom = currentRoom;
        const newRoom = `${worldId}:${newZone}`;

        if (oldRoom) {
            socket.leave(oldRoom);
            socket.to(oldRoom).emit('playerLeft', uid);
        }

        players[uid].zone = newZone;
        socket.join(newRoom);
        currentRoom = newRoom;

        console.log(`[World] ${players[uid].name} moved to ${newRoom}`);
        
        // Tell the player about new neighbors in this room
        const neighbors = Object.values(players).filter(p => p.zone === newZone && p.id !== uid);
        socket.emit('playerList', neighbors);
        
        // Tell others in the new room that a player arrived
        socket.to(newRoom).emit('playerJoined', players[uid]);
    });

    socket.on('player:path', (data) => {
        const activeUid = data.id || uid;
        if (players[activeUid]) {
            players[activeUid] = { ...players[activeUid], ...data };
            socket.to(`${worldId}:${players[activeUid].zone}`).emit('player:path', data);
        }
    });

    socket.on('disconnect', () => {
        if (uid && players[uid]) {
            if (currentRoom) {
                socket.to(currentRoom).emit('playerLeft', uid);
            }
            delete players[uid];
        }
    });
});

const PORT = 8080;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
