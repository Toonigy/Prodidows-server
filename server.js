const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow connections from any origin (Prodigy client)
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

/**
 * SERVE STATIC FILES
 * This serves the 'public' folder where your index.html and game.min.js are located.
 */
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state for active players
const players = new Map();

// Fallback route for the root (if index.html isn't automatically picked up)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Standard Handshake: When a player joins the world
    socket.on('join_world', (data) => {
        // Create player object with data from client
        const playerInfo = {
            id: socket.id,
            userId: data.userId,
            x: data.x || 0,
            y: data.y || 0,
            appearance: data.appearance || {},
            worldId: data.worldId
        };
        
        players.set(socket.id, playerInfo);

        // Tell the new player about everyone else currently online
        socket.emit('current_players', Array.from(players.values()));

        // Tell everyone else about the new player
        socket.broadcast.emit('new_player', playerInfo);
    });

    // Movement: Syncing player positions across all clients
    socket.on('move', (moveData) => {
        const player = players.get(socket.id);
        if (player) {
            player.x = moveData.x;
            player.y = moveData.y;
            
            // Broadcast the new coordinates to other players
            socket.broadcast.emit('player_moved', {
                id: socket.id,
                x: moveData.x,
                y: moveData.y
            });
        }
    });

    // Custom Patch Logs (Monitoring client-side events from game.min.js)
    socket.on('patch_log', (data) => {
        console.log(`[Client Log][Ver: ${data.version}] ${data.message}`);
    });

    // Battle Initialization: Handling challenges between players
    socket.on('start_battle', (battleData) => {
        const targetId = battleData.targetId;
        if (players.has(targetId)) {
            io.to(targetId).emit('battle_challenge', {
                from: socket.id,
                type: battleData.type
            });
        }
    });

    // Cleanup: Remove player from map when they disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        players.delete(socket.id);
        io.emit('player_disconnected', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Serving index.html from: ${path.join(__dirname, 'public')}`);
});
