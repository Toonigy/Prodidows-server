const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configure CORS and Socket.IO
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public/root folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// Socket.IO Server Setup for Multiplayer Sync
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// In-Memory Storage for Connected Players & Game Data
const players = new Map();
const playerProfiles = new Map();

// Default Player Template
function createDefaultPlayer(userId, username = "Wizard") {
    return {
        userID: userId,
        name: username,
        level: 100,
        gold: 999999,
        stars: 500,
        appearance: {
            gender: "male",
            hairColor: 1,
            hairStyle: 1,
            skinColor: 1,
            eyeColor: 1,
            faceStyle: 1
        },
        equipment: {
            hat: 1,
            outfit: 1,
            weapon: 1,
            boots: 1,
            relic: 1,
            mount: 1
        },
        pets: [
            { id: 1, name: "Niff", level: 50, hp: 500 }
        ],
        x: 400,
        y: 300,
        zone: "lamplight_town",
        worldId: "world_1"
    };
}

/**
 * Returns active server worlds as a plain Array.
 * Fixes: "Uncaught TypeError: e.sort is not a function" in Prodigy client
 */
function getWorldsList() {
    return [
        { id: "world_1", name: "Magical World 1", population: players.size, max: 100 },
        { id: "world_2", name: "Magical World 2", population: 0, max: 100 }
    ];
}

// ==========================================
// MOCK PRODIGY GAME API ENDPOINTS
// ==========================================

// World List Middleware: Catches ANY request targeting 'worlds' (e.g. /v2/worlds, /game-api/v2/worlds)
// to ensure a plain Array is returned so client-side e.sort() works without errors.
app.use((req, res, next) => {
    if (req.path && req.path.toLowerCase().includes('worlds')) {
        return res.json(getWorldsList());
    }
    next();
});

// Server Health & Status Check
app.get('/status', (req, res) => {
    res.json({ status: "OK", serverTime: Date.now(), activePlayers: players.size });
});

app.get('/game-api/status', (req, res) => {
    res.json({ status: "online", message: "Prodigy Server Online" });
});

// Analytics & Event Tracking Endpoint (Express 5/path-to-regexp compatible)
app.use('/events-api', (req, res) => {
    res.json({ success: true, status: 200, message: "Event tracked successfully" });
});

// Friend API Middleware: Intercepts friend requests and provides required pendingRequests, meta (friendsCap, totalFriends), friends & users data structures
// Handles: getFriendList (v1/friend/:userID), countFriendRequest, getTotalFriendRequestsSuccess
app.use((req, res, next) => {
    if (req.path && req.path.toLowerCase().includes('friend')) {
        return res.json({
            success: true,
            status: 200,
            pendingRequests: 0,
            count: 0,
            requests: [],
            friends: [],
            users: [],
            meta: {
                friendsCap: 100,
                totalFriends: 0
            },
            data: {
                pendingRequests: 0,
                count: 0,
                requests: [],
                friends: [],
                users: []
            }
        });
    }
    next();
});

// Matchmaking API Middleware: Intercepts startMatchmaking (/begin) and quitMatchmaking (/end) requests
app.use((req, res, next) => {
    if (req.path && req.path.toLowerCase().includes('matchmaking')) {
        return res.json({
            success: true,
            status: 200,
            message: "Matchmaking operation successful"
        });
    }
    next();
});

// Account & Login Mocking
app.get('/game-api/account', (req, res) => {
    const userId = req.query.userID || req.headers['user-id'] || 'guest_1001';
    if (!playerProfiles.has(userId)) {
        playerProfiles.set(userId, createDefaultPlayer(userId, "Archmage"));
    }
    res.json({ success: true, data: playerProfiles.get(userId) });
});

app.post('/game-api/login', (req, res) => {
    const { username } = req.body;
    const userId = username ? `usr_${username.toLowerCase()}` : `guest_${Math.floor(Math.random() * 8999 + 1000)}`;
    
    if (!playerProfiles.has(userId)) {
        playerProfiles.set(userId, createDefaultPlayer(userId, username || "Wizard"));
    }

    res.json({
        status: "success",
        userID: userId,
        token: "prodigy-local-auth-token",
        user: playerProfiles.get(userId)
    });
});

// Character Data Save/Fetch
app.get('/game-api/character/:id', (req, res) => {
    const userId = req.params.id;
    const profile = playerProfiles.get(userId) || createDefaultPlayer(userId);
    res.json({ status: "success", characterData: profile });
});

app.post('/game-api/character/:id/save', (req, res) => {
    const userId = req.params.id;
    if (req.body) {
        playerProfiles.set(userId, { ...playerProfiles.get(userId), ...req.body });
    }
    res.json({ status: "success", savedAt: new Date().toISOString() });
});

// World & Game Tools Endpoints
app.get('/game-api/gameTools', (req, res) => {
    res.json({ success: true, features: { multiplayer: true, pvp: true, chat: true } });
});

// Catch-all for any additional API queries requested by game.min.js
app.use('/game-api', (req, res) => {
    console.log(`[API Request] ${req.method} ${req.url}`);
    res.json({ success: true, message: "Mock API Endpoint OK" });
});

// Default fallback to serve index.html from public folder
app.use((req, res, next) => {
    if (req.accepts('html') && !req.url.startsWith('/game-api') && !req.url.startsWith('/v2') && !req.url.startsWith('/events-api') && !req.url.toLowerCase().includes('friend') && !req.url.toLowerCase().includes('matchmaking')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        next();
    }
});


// ==========================================
// REAL-TIME MULTIPLAYER SOCKET HANDLERS
// ==========================================

io.on('connection', (socket) => {
    // Parse query parameters sent during joinMultiplayerServer connection
    const query = socket.handshake.query || {};
    const userId = query.userId || `usr_${socket.id.substring(0, 5)}`;
    const worldId = query.worldId || "world_1";
    const zone = query.zone || "lamplight_town";

    console.log(`[+] Client connected: ${socket.id} (userID: ${userId}, world: ${worldId}, zone: ${zone})`);

    let profile = playerProfiles.get(userId) || createDefaultPlayer(userId, "Wizard");

    const playerData = {
        socketId: socket.id,
        userID: userId,
        name: profile.name,
        x: profile.x || 400,
        y: profile.y || 300,
        zone: zone,
        worldId: worldId,
        appearance: profile.appearance,
        equipment: profile.equipment,
        level: profile.level
    };

    players.set(socket.id, playerData);
    socket.join(zone);

    // 1. Notify current client of existing players in the zone (triggers 's' / playerList callback)
    const existingPlayersInZone = Array.from(players.values())
        .filter(p => p.zone === zone && p.socketId !== socket.id)
        .map(p => p.userID);
    socket.emit('playerList', existingPlayersInZone);

    // Send room player data details
    const roomPlayerObjects = Array.from(players.values()).filter(p => p.zone === zone && p.socketId !== socket.id);
    socket.emit('room:players', roomPlayerObjects);

    // 2. Notify other players in the zone that this player joined (triggers 'o' / playerJoined callback)
    socket.to(zone).emit('playerJoined', userId);
    socket.to(zone).emit('player:spawned', playerData);

    // Handle generic 'message' events from client (emitted by emitMessage)
    socket.on('message', (msg) => {
        console.log(`[Message] ${userId}:`, msg);
        socket.to(zone).emit('message', msg);
    });

    // Handle explicit player join event if sent manually after socket connects
    socket.on('player:join', (data) => {
        if (data && data.zone && data.zone !== playerData.zone) {
            socket.leave(playerData.zone);
            socket.to(playerData.zone).emit('playerLeft', playerData.userID);

            playerData.zone = data.zone;
            if (data.x) playerData.x = data.x;
            if (data.y) playerData.y = data.y;

            socket.join(data.zone);
            socket.to(data.zone).emit('playerJoined', playerData.userID);
            socket.to(data.zone).emit('player:spawned', playerData);

            const newZonePlayers = Array.from(players.values())
                .filter(p => p.zone === data.zone && p.socketId !== socket.id)
                .map(p => p.userID);
            socket.emit('playerList', newZonePlayers);
        }
    });

    // Handle Movement Synchronization
    socket.on('player:move', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.x = data.x;
            player.y = data.y;
            if (data.action) player.action = data.action;

            socket.to(player.zone).emit('player:moved', {
                socketId: socket.id,
                userID: player.userID,
                x: data.x,
                y: data.y,
                action: data.action || 'walk'
            });
        }
    });

    // Handle Zone/Area Transitions
    socket.on('player:change_zone', (data) => {
        const player = players.get(socket.id);
        if (player) {
            const oldZone = player.zone;
            const newZone = data.newZone;

            socket.leave(oldZone);
            socket.to(oldZone).emit('playerLeft', player.userID);
            socket.to(oldZone).emit('player:left', { socketId: socket.id, userID: player.userID });

            player.zone = newZone;
            player.x = data.x || 400;
            player.y = data.y || 300;

            socket.join(newZone);
            socket.to(newZone).emit('playerJoined', player.userID);
            socket.to(newZone).emit('player:spawned', player);

            const newRoomPlayers = Array.from(players.values())
                .filter(p => p.zone === newZone && p.socketId !== socket.id)
                .map(p => p.userID);
            socket.emit('playerList', newRoomPlayers);
        }
    });

    // Handle 'switchZone' event (emitted by client switchZones method)
    socket.on('switchZone', (data) => {
        const player = players.get(socket.id);
        if (player) {
            const newZone = (typeof data === 'string') ? data : (data && data.zone ? data.zone : data);
            const oldZone = player.zone;

            if (newZone && newZone !== oldZone) {
                socket.leave(oldZone);
                socket.to(oldZone).emit('playerLeft', player.userID);
                socket.to(oldZone).emit('player:left', { socketId: socket.id, userID: player.userID });

                player.zone = newZone;
                if (typeof data === 'object' && data.x) player.x = data.x;
                if (typeof data === 'object' && data.y) player.y = data.y;

                socket.join(newZone);
                socket.to(newZone).emit('playerJoined', player.userID);
                socket.to(newZone).emit('player:spawned', player);

                const newRoomPlayers = Array.from(players.values())
                    .filter(p => p.zone === newZone && p.socketId !== socket.id)
                    .map(p => p.userID);
                socket.emit('playerList', newRoomPlayers);
            }
        }
    });

    // Handle Chat & Emotes
    socket.on('player:chat', (data) => {
        const player = players.get(socket.id);
        if (player) {
            io.to(player.zone).emit('chat:message', {
                userID: player.userID,
                name: player.name,
                message: data.message,
                type: data.type || "speech"
            });
        }
    });

    // Handle Equipment / Appearance Updates
    socket.on('player:update_appearance', (data) => {
        const player = players.get(socket.id);
        if (player) {
            player.appearance = { ...player.appearance, ...data.appearance };
            player.equipment = { ...player.equipment, ...data.equipment };

            socket.to(player.zone).emit('player:updated', {
                socketId: socket.id,
                userID: player.userID,
                appearance: player.appearance,
                equipment: player.equipment
            });
        }
    });

    // Player Disconnect
    socket.on('disconnect', () => {
        const player = players.get(socket.id);
        if (player) {
            console.log(`[-] Client disconnected: ${player.name} (${socket.id})`);
            socket.to(player.zone).emit('playerLeft', player.userID);
            socket.to(player.zone).emit('player:left', { socketId: socket.id, userID: player.userID });
            players.delete(socket.id);
        }
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
==================================================
  🔮 Old Prodigy Multiplayer Server Active!
  🌐 Local URL: http://localhost:${PORT}
  📡 Socket.IO Listening on Port: ${PORT}
==================================================
    `);
});
