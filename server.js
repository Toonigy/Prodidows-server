const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { 
    cors: { origin: "*" },
    allowEIO3: true 
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. DATA ---
const players = {};
const worlds = [
    { id: 1, name: "Farflight", full: 0, maxPopulation: 100, status: "online" },
    { id: 2, name: "Pirate Bay", full: 0, maxPopulation: 100, status: "online" }
];
let maintenanceActive = false;

// Admin Route to toggle Maintenance
app.post('/admin/maintenance/:status', (req, res) => {
    maintenanceActive = (req.params.status === 'on');
    console.log(`[ADMIN] Maintenance Mode: ${maintenanceActive ? 'ENABLED' : 'DISABLED'}`);
    
    if (maintenanceActive) {
        // Immediately tell all CONNECTED players to start the 70s countdown
        io.emit('message', { action: 'initBoot' });
    }
    res.sendStatus(200);
});

// Update the connection logic to check the state
io.on('connection', (socket) => {
    // Manually capture the User ID from the tester's query
    const manualUserId = socket.handshake.query.userId;
    console.log(`[AUTH] Testing with Manual Account ID: ${manualUserId}`);
    
    players[socket.id] = { 
        id: socket.id, 
        userId: manualUserId, // Store the manual ID here
        world: null 
    };
    // ... rest of your code
});
// --- 2. HTTP ROUTES ---
app.get(['/game-api/v1/worlds', '/v1/worlds'], (req, res) => {
    res.json(worlds);
});

app.post(['/game-api/v1/matchmaking', '/v1/matchmaking'], (req, res) => {
    res.json({ success: true, challenger: null, message: "Searching..." });
});

app.post(['/game-event', '/game-api/v1/game-event'], (req, res) => res.sendStatus(200));

app.all(['/game-api/v1[object%20Object]', '/v1[object%20Object]'], (req, res) => {
    res.json({ success: true, challenger: null });
});

// --- 3. SOCKET LOGIC ---
io.on('connection', (socket) => {
    // Capture details from the handshake query
    const uid = socket.handshake.query.userId || socket.id; // Use socket.id as fallback
    const name = socket.handshake.query.username || "Wizard";

    players[socket.id] = { 
        id: socket.id,     // The unique socket session
        userID: uid,       // The actual account ID (e.g., kYfJ...)
        name: name,
        world: null 
    };

    // World Joining Logic
// ... inside the socket.on('join:world'...) block in server.js
socket.on('join:world', (rawData) => {
        try {
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            const worldId = parseInt(data.worldId);

            // 1. Assign player to the world and capture their ID
            players[socket.id].world = worldId;
            players[socket.id].userID = socket.handshake.query.userId || "Guest_" + socket.id;
            players[socket.id].name = socket.handshake.query.username || "Wizard";
            
            socket.join(`world_${worldId}`);

            // 2. FIX: currentWorld is now declared ONLY ONCE
            const currentWorld = worlds.find(w => w.id === worldId);
            if (currentWorld) {
                currentWorld.full++;
                currentWorld.statusColor = currentWorld.full <= 80 ? 8111468 : 15194464;
            }

            // 3. Prepare the Player List for game.min.js
            const worldPlayers = Object.values(players)
                .filter(p => p.world === worldId)
                .map(p => ({
                    id: p.id,      // game.min.js uses this to track the avatar
                    name: p.name,
                    userID: p.userID
                }));

            // 4. Send the "Online" signals to the game client
            socket.emit('playerList', worldPlayers); // Tells game to draw everyone
            socket.to(`world_${worldId}`).emit('playerJoined', { // Tells others you arrived
                id: socket.id,
                name: players[socket.id].name
            });

            // 5. Final world menu updates
            io.emit('world:update', worlds); 
            socket.emit('join:success', worldId); 

        } catch (e) { 
            console.error("Join Error:", e); 
        }
    });

    // Multiplayer Movement Sync
socket.on('message', (rawData) => {
        try {
            const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            const player = players[socket.id];
            if (player && player.world) {
                // Send movement to everyone else in the world room
                socket.to(`world_${player.world}`).emit('player:path', data); 
            }
        } catch (e) { console.error(e); }
    });

socket.on('disconnect', () => {
        if (players[socket.id] && players[socket.id].world) {
            const worldId = players[socket.id].world;
            const currentWorld = worlds.find(w => w.id === worldId);
            if (currentWorld && currentWorld.full > 0) {
                currentWorld.full--;
                io.emit('world:update', worlds);
            }
        }
        delete players[socket.id];
    });
}); // <--- ENSURE THIS BRACE IS HERE

server.listen(8080, () => console.log("Server live on :8080"));
