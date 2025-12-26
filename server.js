const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Use CORS for both Express routes and Socket.io
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const io = new Server(server, { 
    cors: { origin: "*" },
    allowEIO3: true,
    transports: ['websocket', 'polling'] 
});

const players = {};
const worlds = [
    { id: 1, name: "Farflight", full: 0, maxPopulation: 100, status: "online" },
    { id: 2, name: "Pirate Bay", full: 0, maxPopulation: 100, status: "online" }
];

// World List API for the game menu
app.get(['/game-api/v1/worlds', '/v1/worlds'], (req, res) => {
    res.json(worlds);
});

io.on('connection', (socket) => {
    const uid = socket.handshake.query.userId || "Guest_" + socket.id;
    const name = socket.handshake.query.username || "Wizard";

    players[socket.id] = { id: socket.id, userID: uid, name: name, world: null };
    console.log(`[CONN] Player connected: ${uid}`);

    socket.on('join:world', (rawData) => {
        try {
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            const worldId = parseInt(data.worldId);

            players[socket.id].world = worldId;
            socket.join(`world_${worldId}`);

            const currentWorld = worlds.find(w => w.id === worldId);
            if (currentWorld) {
                currentWorld.full++;
                currentWorld.statusColor = currentWorld.full <= 80 ? 8111468 : 15194464;
            }

            const worldPlayers = Object.values(players)
                .filter(p => p.world === worldId)
                .map(p => ({ id: p.id, name: p.name, userID: p.userID }));

            socket.emit('playerList', worldPlayers);
            socket.to(`world_${worldId}`).emit('playerJoined', { id: socket.id, name: name });
            socket.emit('join:success', worldId);
            io.emit('world:update', worlds);
            
            console.log(`[JOIN] ${uid} joined World ${worldId}`);
        } catch (e) { console.error(e); }
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p && p.world) {
            const world = worlds.find(w => w.id === p.world);
            if (world && world.full > 0) world.full--;
            io.emit('world:update', worlds);
        }
        delete players[socket.id];
    });
});

// IMPORTANT: Use process.env.PORT for Render
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server live on port ${PORT}`);
});
