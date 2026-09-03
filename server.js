const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (like index.html, JS bundles, assets) from the current folder
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"]
    }
});

app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url}`);
    next();
});

// Track active players by world and zone
// Structure: { worldId: { zoneName: { socketId: { userId, zone, playerState } } } }
const worlds = {};

// Status check endpoints
app.get('/status', (req, res) => {
    res.status(200).send({ status: 'OK', version: '1-50-0' });
});

app.get('/v1/status', (req, res) => {
    res.status(200).send({ status: 'OK', version: '1-50-0' });
});

app.get('/game-api/v1/status', (req, res) => {
    res.status(200).send({ status: 'OK', version: '1-50-0' });
});

// Worlds endpoints
app.get('/game-api/v2/worlds', (req, res) => {
    res.status(200).json([
        { id: 1, name: 'Server 1', ip: 'localhost', port: 3000, full: false },
        { id: 2, name: 'Server 2', ip: 'localhost', port: 3000, full: false }
    ]);
});

app.get('/v2/worlds', (req, res) => {
    res.status(200).json([
        { id: 1, name: 'Server 1', ip: 'localhost', port: 3000, full: false },
        { id: 2, name: 'Server 2', ip: 'localhost', port: 3000, full: false }
    ]);
});

// Mock login endpoint to provide valid auth tokens and user IDs
app.post('/v1/login/:username', (req, res) => {
    const username = req.params.username;
    res.status(200).json({
        userID: username || 'mock-user-id',
        authToken: 'mock-auth-token-1500',
        success: true
    });
});

app.get('/v1/login/:username', (req, res) => {
    const username = req.params.username;
    res.status(200).json({
        userID: username || 'mock-user-id',
        authToken: 'mock-auth-token-1500',
        success: true
    });
});

// Telemetry and game-event tracking endpoints requested by client
app.post('/events-api/v1/game-event', (req, res) => {
    console.log('[Event API] Game event tracked:', req.body);
    res.status(200).json({ success: true, status: '200' });
});

app.options('/events-api/v1/game-event', (req, res) => {
    res.status(200).send();
});

// Generic catch-all log endpoint to prevent client error logs from crashing
app.post('/v1/log/:level', (req, res) => {
    res.status(200).send({ success: true });
});

// Middleware for catch-all handling instead of app.all('*') to prevent path-to-regexp errors
app.use((req, res, next) => {
    if (req.url.startsWith('/events-api/') || req.url.startsWith('/game-api/')) {
        return res.status(200).json({ success: true });
    }
    next();
});

io.on('connection', (socket) => {
    // Extract query parameters sent by ApiClient.joinMultiplayerServer
    const query = socket.handshake.query || {};
    const userId = query.userId || 'anonymous';
    const worldId = query.worldId || '1';
    const userToken = query.userToken || '';
    let currentZone = query.zone || 'lamplight';

    console.log(`[Multiplayer] Player connected: userId=${userId}, worldId=${worldId}, zone=${currentZone}, socketId=${socket.id}`);

    // Initialize world and zone if not present
    if (!worlds[worldId]) {
        worlds[worldId] = {};
    }
    if (!worlds[worldId][currentZone]) {
        worlds[worldId][currentZone] = {};
    }

    // Register player in the current zone
    worlds[worldId][currentZone][socket.id] = {
        userId: userId,
        socketId: socket.id,
        zone: currentZone,
        data: {}
    };

    // Join socket.io room for this specific world and zone
    const roomName = `world_${worldId}_zone_${currentZone}`;
    socket.join(roomName);

    // Send player list to the newly connected client
    const activePlayersInZone = Object.values(worlds[worldId][currentZone]).map(p => p.userId);
    socket.emit('playerList', activePlayersInZone);

    // Broadcast to other players in the zone that a new player joined
    socket.to(roomName).emit('playerJoined', userId);

    // Handle incoming custom game/chat messages
    socket.on('message', (msgData) => {
        // Broadcast message to everyone else in the same room
        socket.to(roomName).emit('message', msgData);
    });

    // Handle zone switching
    socket.on('switchZone', (newZone) => {
        console.log(`[Multiplayer] Player ${userId} switching zone from ${currentZone} to ${newZone}`);
        
        // Leave old room and notify others immediately
        socket.leave(roomName);
        if (worlds[worldId][currentZone]) {
            delete worlds[worldId][currentZone][socket.id];
        }
        socket.to(roomName).emit('playerLeft', userId);

        // Enter new room
        currentZone = newZone || 'lamplight';
        const newRoomName = `world_${worldId}_zone_${currentZone}`;
        socket.join(newRoomName);

        if (!worlds[worldId][currentZone]) {
            worlds[worldId][currentZone] = {};
        }
        worlds[worldId][currentZone][socket.id] = {
            userId: userId,
            socketId: socket.id,
            zone: currentZone,
            data: {}
        };

        // Send updated player list for the new zone
        const newZonePlayers = Object.values(worlds[worldId][currentZone]).map(p => p.userId);
        socket.emit('playerList', newZonePlayers);
        socket.to(newRoomName).emit('playerJoined', userId);
    });

    // Handle disconnection & cleanup across all potential zones/rooms
    socket.on('disconnect', () => {
        console.log(`[Multiplayer] Player disconnected: userId=${userId}, socketId=${socket.id}`);
        
        // Search across worlds/zones to ensure the disconnected socket is fully purged and playerLeft is emitted
        if (worlds[worldId]) {
            Object.keys(worlds[worldId]).forEach((zName) => {
                if (worlds[worldId][zName] && worlds[worldId][zName][socket.id]) {
                    delete worlds[worldId][zName][socket.id];
                    const targetRoom = `world_${worldId}_zone_${zName}`;
                    // Broadcast playerLeft to all clients in that room so removePlayer is triggered
                    io.to(targetRoom).emit('playerLeft', userId);
                }
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Prodigy 1-50-0 Multiplayer Server running on port ${PORT}`);
});
