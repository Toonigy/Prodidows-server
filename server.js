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

// --- PRODIGY ENGINE COMPATIBILITY ROUTES ---

// Fixes the 404 for /game-event
app.post(['/game-event', '/v1/game-event'], (req, res) => {
    // The game just wants a 200 OK or 204 No Content
    res.sendStatus(200);
});

// World List API
const worlds = [
    { id: 1, name: "Farflight", full: 0, maxPopulation: 100, status: "online" },
    { id: 2, name: "Pirate Bay", full: 0, maxPopulation: 100, status: "online" }
];

app.get(['/game-api/v1/worlds', '/v1/worlds'], (req, res) => {
    res.json(worlds);
});

// Optional: Mocking user session for the engine
app.get('/game-api/v1/user/:userId', (req, res) => {
    res.json({ success: true, data: { userID: req.params.userId, name: "Wizard" } });
});

// --- SOCKET.IO LOGIC ---

const io = new Server(server, { 
    cors: { origin: "*" },
    allowEIO3: true,
    transports: ['websocket', 'polling'] 
});

const players = {};

io.on('connection', (socket) => {
    const uid = socket.handshake.query.userId || "Guest_" + socket.id;
    const name = socket.handshake.query.username || "Wizard";

    players[socket.id] = { 
        id: socket.id, 
        uid: uid, 
        name: name,
        world: null,
        x: 0, 
        y: 0 
    };

    socket.on('joinWorld', (rawData) => {
        try {
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            const worldId = parseInt(data.worldId);

            players[socket.id].world = worldId;
            socket.join(`world_${worldId}`);

            const currentWorld = worlds.find(w => w.id === worldId);
            if (currentWorld) currentWorld.full++;

            // Send existing players to the new user
            const worldPlayers = Object.values(players)
                .filter(p => p.world === worldId && p.id !== socket.id);

            socket.emit('playerList', worldPlayers);
            
            // Broadcast new player to others
            socket.to(`world_${worldId}`).emit('playerJoined', players[socket.id]);
            socket.emit('join:success', worldId);
            
            console.log(`[NETWORK] ${name} (${uid}) synced to World ${worldId}`);
        } catch (e) { console.error("Join Error:", e); }
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

const PORT = 3000;
server.listen(PORT, () => console.log(`Definitive Server active on port ${PORT}`));
