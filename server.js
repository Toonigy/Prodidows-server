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

// Dummy route for telemetry to prevent the 404 block
app.post(['/game-event', '/v1/game-event'], (req, res) => res.sendStatus(200));

io.on('connection', (socket) => {
    // We capture the real userID from the query or a default
    const userID = socket.handshake.query.userId || "0"; 
    const name = socket.handshake.query.username || "Wizard";

    players[socket.id] = { 
        id: socket.id, 
        userID: userID, 
        name: name,
        world: null,
        mapId: null, // The specific room/area
        x: 0, 
        y: 0,
        appearance: {}
    };

    socket.on('joinWorld', (rawData) => {
        try {
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            const worldId = parseInt(data.worldId);

            players[socket.id].world = worldId;
            socket.join(`world_${worldId}`);

            const currentWorld = worlds.find(w => w.id === worldId);
            if (currentWorld) currentWorld.full++;

            // Send full player data including userID to the client
            const worldPlayers = Object.values(players)
                .filter(p => p.world === worldId && p.id !== socket.id)
                .map(p => ({ 
                    id: p.id, 
                    userID: p.userID, 
                    name: p.name, 
                    x: p.x, 
                    y: p.y,
                    mapId: p.mapId 
                }));

            socket.emit('playerList', worldPlayers);
            
            // CRITICAL: Must send userID here for the 'Green Bar' to work
            socket.to(`world_${worldId}`).emit('playerJoined', { 
                id: socket.id, 
                userID: userID, 
                name: name 
            });

            socket.emit('join:success', worldId);
            console.log(`[NETWORK] ${name} (${userID}) joined world ${worldId}`);
        } catch (e) { console.error("Join Error:", e); }
    });

    // Handle map changes and movement
    socket.on('updatePlayer', (data) => {
        const p = players[socket.id];
        if (p && p.world) {
            p.x = data.x || p.x;
            p.y = data.y || p.y;
            p.mapId = data.mapId || p.mapId;
            p.appearance = data.appearance || p.appearance;

            // Only broadcast to people in the SAME WORLD
            socket.to(`world_${p.world}`).emit('playerUpdate', {
                id: socket.id,
                userID: p.userID,
                x: p.x,
                y: p.y,
                mapId: p.mapId,
                appearance: p.appearance
            });
        }
    });

    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p && p.world) {
            const world = worlds.find(w => w.id === p.world);
            if (world && world.full > 0) world.full--;
            socket.to(`world_${p.world}`).emit('playerLeft', socket.id);
        }
        delete players[socket.id];
    });
});

server.listen(3000, () => console.log('Server running on :3000'));
