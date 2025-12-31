const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

// 1. SERVE STATIC FILES
// This ensures 'index.html', 'game.min.js', etc. are accessible
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// 2. WORLD DATA DEFINITION
const worlds = [
    { id: 1, name: "Farflight", maxPopulation: 100, status: "online" },
    { id: 2, name: "Pirate Bay", maxPopulation: 100, status: "online" },
    { id: 3, name: "Crystal Caverns", maxPopulation: 100, status: "online" },
    { id: 4, name: "Shiverchill", maxPopulation: 100, status: "online" }
];

const players = {}; 

// Helper to calculate populations for the world list
function getWorldsWithPopulation() {
    return worlds.map(w => {
        const count = Object.values(players).filter(p => p.world === w.id).length;
        return { 
            ...w, 
            population: count,
            full: count / w.maxPopulation 
        };
    });
}

// 3. SOCKET.IO LOGIC
io.on('connection', (socket) => {
    console.log(`Connection established: ${socket.id}`);

    // WORLD LIST VIA WEBSOCKET
    // Triggered by the patched ApiClient.getWorldList on the client
    socket.on('getWorldList', () => {
        socket.emit('worldListResponse', { worlds: getWorldsWithPopulation() });
    });

    // JOIN WORLD
    socket.on('joinWorld', (data) => {
        try {
            const { worldId, userID, appearance, x, y } = data;

            // Stop undefined users (usually occurs if Firebase isn't ready)
            if (!userID) {
                console.warn(`Join rejected for ${socket.id}: userID is undefined`);
                return;
            }

            socket.join(`world_${worldId}`);

            // Store full player data (Appearance is CRITICAL for rendering)
            players[socket.id] = {
                socketId: socket.id,
                userID: userID,
                world: worldId,
                x: x || 0,
                y: y || 0,
                appearance: appearance || {} 
            };

            // Get everyone else currently in this world
            const othersInWorld = Object.values(players).filter(
                p => p.world === worldId && p.socketId !== socket.id
            );

            // Send list of existing players to the person who just joined
            socket.emit('playerList', othersInWorld);

            // Broadcast the NEW player to everyone else in that world
            // We send the whole object so they have the Appearance data to render the sprite
            socket.to(`world_${worldId}`).emit('playerJoined', players[socket.id]);

            // Update world list populations for everyone in the lobby
            io.emit('worldListUpdate', { worlds: getWorldsWithPopulation() });

            console.log(`User ${userID} joined World ${worldId}`);
        } catch (e) {
            console.error("Join Error:", e);
        }
    });

    // MOVEMENT & UPDATE
    socket.on('updatePlayer', (data) => {
        const p = players[socket.id];
        if (p) {
            Object.assign(p, data); // Update server's memory of position/appearance
            socket.to(`world_${p.world}`).emit('playerUpdate', p);
        }
    });

    // DISCONNECT
    socket.on('disconnect', () => {
        const p = players[socket.id];
        if (p) {
            socket.to(`world_${p.world}`).emit('playerLeft', { userID: p.userID, socketId: socket.id });
            delete players[socket.id];
            io.emit('worldListUpdate', { worlds: getWorldsWithPopulation() });
        }
    });
});

// 4. ROUTING FIX
// This handles the "Cannot GET /" issue on Render
app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

// 5. START SERVER
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Prodigy Multiplayer Server running on port ${PORT}`);
});
