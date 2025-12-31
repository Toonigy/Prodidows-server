const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

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

app.get(['/game-api/v1/worlds', '/v1/worlds'], (req, res) => {
    res.json(worlds);
});

io.on('connection', (socket) => {
    // Initializing player state
    players[socket.id] = { 
        id: socket.id, 
        world: null, 
        x: 0, 
        y: 0, 
        appearance: {} 
    };

    socket.on('joinWorld', (rawData) => {
        try {
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            const worldId = parseInt(data.worldId);
            const name = data.username || "Wizard";

            players[socket.id].world = worldId;
            players[socket.id].name = name;
            socket.join(`world_${worldId}`);

            const currentWorld = worlds.find(w => w.id === worldId);
            if (currentWorld) {
                currentWorld.full++;
            }

            // Tell the new player who is already there
            const worldPlayers = Object.values(players)
                .filter(p => p.world === worldId && p.id !== socket.id);
            
            socket.emit('playerList', worldPlayers);

            // Notify others in the room
            socket.to(`world_${worldId}`).emit('playerJoined', players[socket.id]);
            
            socket.emit('join:success', worldId);
            io.emit('world:update', worlds);
            
            console.log(`[JOIN] Player ${name} joined World ${worldId}`);
        } catch (e) { console.error("Join Error:", e); }
    });

    // CRITICAL: Movement Relay
    // The game client sends 'move' or 'updatePlayer' packets
    socket.on('move', (data) => {
        const p = players[socket.id];
        if (p && p.world) {
            p.x = data.x;
            p.y = data.y;
            // Broadcast to everyone else in the same world room
            socket.to(`world_${p.world}`).emit('playerMoved', {
                id: socket.id,
                x: data.x,
                y: data.y
            });
        }
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p && p.world) {
            const world = worlds.find(w => w.id === p.world);
            if (world && world.full > 0) world.full--;
            
            socket.to(`world_${p.world}`).emit('playerLeft', socket.id);
            io.emit('world:update', worlds);
        }
        delete players[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
