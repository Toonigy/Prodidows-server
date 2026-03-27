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

/**
 * GAME API ENDPOINTS
 * Fixed the /worlds endpoint to return an array directly to prevent the .sort() TypeError.
 */

// Route for fetching available worlds
app.get('/game-api/v2/worlds', (req, res) => {
    // The game client calls .sort() on the response 'e'. 
    // If we return { worlds: [] }, 'e' is an object and lacks .sort().
    // We return the array directly to satisfy Prodigy.Menu.Server.getSuggested.
    const worldsList = [
        {
            id: "prodidows-1",
            name: "Prodidows Main",
            host: "prodidows-server.onrender.com",
            port: 443,
            population: players.size,
            maxPopulation: 200,
            full: Math.floor((players.size / 200) * 100), // Added 'full' property for the sorting logic
            status: "online"
        }
    ];
    
    res.json(worldsList);
});

// Fallback route for the root (if index.html isn't automatically picked up)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Standard Handshake: When a player joins the world
    socket.on('join_world', (data) => {
        const playerInfo = {
            id: socket.id,
            userId: data.userId,
            x: data.x || 0,
            y: data.y || 0,
            appearance: data.appearance || {},
            worldId: data.worldId
        };
        
        players.set(socket.id, playerInfo);

        socket.emit('current_players', Array.from(players.values()));
        socket.broadcast.emit('new_player', playerInfo);
    });

    // Movement: Syncing player positions across all clients
    socket.on('move', (moveData) => {
        const player = players.get(socket.id);
        if (player) {
            player.x = moveData.x;
            player.y = moveData.y;
            
            socket.broadcast.emit('player_moved', {
                id: socket.id,
                x: moveData.x,
                y: moveData.y
            });
        }
    });

    // Custom Patch Logs
    socket.on('patch_log', (data) => {
        console.log(`[Client Log][Ver: ${data.version}] ${data.message}`);
    });

    // Battle Initialization
    socket.on('start_battle', (battleData) => {
        const targetId = battleData.targetId;
        if (players.has(targetId)) {
            io.to(targetId).emit('battle_challenge', {
                from: socket.id,
                type: battleData.type
            });
        }
    });

    // Cleanup
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
