const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, { cors: { origin: "*" }, allowEIO3: true });

const players = {};

// Handle Game Event 404s
app.post(['/game-event', '/v1/game-event'], (req, res) => res.sendStatus(200));

io.on('connection', (socket) => {
    // Definitive Edition usually passes these in the handshake
    const userID = socket.handshake.query.userId || "0";
    const name = socket.handshake.query.username || "Wizard";

    players[socket.id] = { 
        id: socket.id, 
        userID: userID, 
        name: name,
        worldId: null,
        mapId: 81, // Default map (e.g. Lamplight)
        x: 500,
        y: 500,
        appearance: {} 
    };

    socket.on('joinWorld', (data) => {
        const worldId = data.worldId;
        players[socket.id].worldId = worldId;
        socket.join(`world_${worldId}`);

        // 1. Get everyone else in this world
        const currentPlayersInWorld = Object.values(players)
            .filter(p => p.worldId === worldId && p.id !== socket.id);

        // 2. CRITICAL: Send playerList so the newcomer sees existing players
        socket.emit('playerList', currentPlayersInWorld);

        // 3. CRITICAL: Notify existing players so they see the newcomer (The Green Bar trigger)
        socket.to(`world_${worldId}`).emit('playerJoined', players[socket.id]);

        socket.emit('join:success', worldId);
        console.log(`[SYNC] ${name} (${userID}) is now visible in World ${worldId}`);
    });

    // This is what keeps the "Green Bar" alive and moves the character
    socket.on('updatePlayer', (data) => {
        const p = players[socket.id];
        if (p && p.worldId) {
            Object.assign(p, data); // Sync x, y, mapId, appearance
            
            // Broadcast the update to everyone else in the world
            socket.to(`world_${p.worldId}`).emit('playerUpdate', p);
        }
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p && p.worldId) {
            socket.to(`world_${p.worldId}`).emit('playerLeft', socket.id);
        }
        delete players[socket.id];
    });
});

server.listen(3000, () => console.log('Socket Server running on :3000'));
