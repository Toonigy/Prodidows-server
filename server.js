const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mock Data for Prodigy 1500 API Expectations
const worlds = [
    { id: "world-1", name: "Typhooncrag", population: 15, maxPopulation: 100, host: `localhost:${PORT}`, icon: "storm", path: "/world/typhooncrag" },
    { id: "world-2", name: "Waterscape", population: 8, maxPopulation: 100, host: `localhost:${PORT}`, icon: "water", path: "/world/waterscape" },
    { id: "world-3", name: "Cloudshore", population: 22, maxPopulation: 100, host: `localhost:${PORT}`, icon: "cloud", path: "/world/cloudshore" },
    { id: "world-4", name: "Threadfire", population: 5, maxPopulation: 100, host: `localhost:${PORT}`, icon: "outfit/12", path: "/world/threadfire" }
];

// 1. Matchmaking / World List Endpoints
app.get('/status', (req, res) => {
    res.json({ status: "online", version: "1.50.0", worlds });
});

const sendWorlds = (req, res) => res.json(worlds);
app.get('/multiplayer/worlds', sendWorlds);
app.get('/game-api/v2/worlds', sendWorlds);

// Added missing matchmaking-api endpoint to prevent 404
app.post('/matchmaking-api/:action', (req, res) => {
    const action = req.params.action;
    
    // Improved safety: Default to empty object if body is missing to prevent destructuring errors
    const body = req.body || {};
    const { userID, data } = body;
    
    console.log(`[Matchmaking] ${action} requested by ${userID || 'anonymous'}`);

    if (action === 'begin') {
        // If no userID is provided, we still return success to prevent 400 errors, 
        // but we don't add them to the queue.
        if (!userID) {
            return res.json({
                success: true,
                data: { matchID: null, status: 'searching' }
            });
        }

        // If someone is already waiting and it's not the same person
        if (waitingPlayer && waitingPlayer.userID !== userID) {
            const matchID = uuidv4();
            const opponent = waitingPlayer;
            waitingPlayer = null; // Clear the queue

            console.log(`[Matchmaking] Match Found! ${userID} vs ${opponent.userID}`);

            return res.json({
                success: true,
                data: {
                    matchID: matchID,
                    status: 'matched',
                    opponent: opponent.data
                }
            });
        } else {
            // No one waiting (or same user), put this player in the queue
            waitingPlayer = { userID, data };
            return res.json({
                success: true,
                data: {
                    matchID: null,
                    status: 'searching'
                }
            });
        }
    }

    if (action === 'end') {
        if (userID && waitingPlayer && waitingPlayer.userID === userID) {
            waitingPlayer = null;
            console.log(`[Matchmaking] Search cancelled by ${userID}`);
        }
        return res.json({ success: true, data: { status: 'finished' } });
    }

    // Default response for any other action (like 'cancel' or 'check')
    res.json({ success: true, data: { status: 'ok' } });
});

// 2. Social / Friend System Endpoints
const friendPrefixes = ['/v1/friend', '/friend-api/v1/friend'];

friendPrefixes.forEach(prefix => {
    app.get(`${prefix}/:userID`, (req, res) => {
        res.json({
            success: true,
            data: { friends: [] },
            meta: { friendsCap: 100, totalFriends: 0 }
        });
    });

    app.get(`${prefix}/:userID/countFriendRequest`, (req, res) => {
        res.json({
            success: true,
            data: { pendingRequests: 0 },
            meta: { friendsCap: 100, totalFriends: 0 }
        });
    });

    app.get(`${prefix}/:userID/request`, (req, res) => {
        res.json({
            success: true,
            data: { requests: [], pendingRequests: 0 },
            meta: { friendsCap: 100, totalFriends: 0 }
        });
    });

    const escapedPrefix = prefix.replace(/\//g, '\\/');
    app.all(new RegExp(`^${escapedPrefix}/.*`), (req, res) => {
        res.json({ 
            success: true, 
            data: { friends: [], requests: [], pendingRequests: 0 },
            meta: { friendsCap: 100, totalFriends: 0 }
        });
    });
});

// 3. Tracking / Game Events
app.all('/game-event', (req, res) => res.status(200).json({ success: true }));

/**
 * 4. User Data & Abilities
 * Fixes 404s for user-specific ability and data requests.
 */
app.post('/game-api/v1/users/:userId/ability', (req, res) => {
    res.json({ success: true, data: {} });
});

app.get(/^\/game-api\/v1\/users\/([^/]+)\/(.+)$/, (req, res) => {
    res.json({ success: true, data: {} });
});

app.get('/leaderboard-api/pvp/:min/:max', (req, res) => {
    const { min, max } = req.params;
    const { player_score, player_stars, userID, page, limit } = req.query;

    res.json({
        success: true,
        data: {
            leaderboard: [], 
            player: {
                rank: 99,
                score: parseInt(player_score) || 0,
                stars: parseInt(player_stars) || 0,
                userID: userID || "0"
            },
            meta: {
                page: parseInt(page) || 0,
                limit: parseInt(limit) || 30,
                total: 0 
            }
        }
    });
});

// 4. Multiplayer Logic (Socket.IO)
const players = {}; 

io.on('connection', (socket) => {
    // Client logs "client connected" on this event
    console.log(`User connected: ${socket.id}`);

    const query = socket.handshake.query;
    const userId = query.userId || uuidv4();
    const zone = query.zone || "lamplight_town"; // Default map if zone isn't provided

    // AUTOMATIC JOIN: 
    // In many 1.50.0 versions, the client doesn't emit 'join'.
    // We initialize the player state immediately using query data.
    players[socket.id] = {
        id: userId,
        name: "Wizard",
        x: 0,
        y: 0,
        map: zone, 
        zone: zone,
        appearance: {}
    };

    // Helper to send data to this specific user
    const sendInitialData = () => {
        const roomPlayers = Object.values(players).filter(p => p.map === players[socket.id].map);
        console.log(`Sending playerList to ${socket.id} (${roomPlayers.length} players)`);
        socket.emit('playerList', roomPlayers);
        socket.broadcast.emit('playerJoined', players[socket.id]);
    };

    // Send the list immediately so the client can render other players
    sendInitialData();

    // Still listen for 'join' in case the client does send it later with more data (appearance/coords)
    socket.on('join', (data) => {
        console.log(`Received explicit join from ${socket.id}`);
        if (players[socket.id]) {
            players[socket.id].name = data.name || players[socket.id].name;
            players[socket.id].x = data.x || players[socket.id].x;
            players[socket.id].y = data.y || players[socket.id].y;
            players[socket.id].map = data.map || players[socket.id].map;
            players[socket.id].appearance = data.appearance || players[socket.id].appearance;
        }
        sendInitialData();
    });

    socket.on('message', (messageData) => {
        socket.broadcast.emit('message', messageData);
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            socket.broadcast.emit('playerMoved', {
                id: players[socket.id].id,
                x: movementData.x,
                y: movementData.y
            });
        }
    });

    socket.on('changeMap', (newMap) => {
        if (players[socket.id]) {
            socket.broadcast.emit('playerLeft', players[socket.id].id);
            players[socket.id].map = newMap;
            const roomPlayers = Object.values(players).filter(p => p.map === newMap);
            socket.emit('playerList', roomPlayers);
            socket.broadcast.emit('playerJoined', players[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (players[socket.id]) {
            io.emit('playerLeft', players[socket.id].id);
            delete players[socket.id];
        }
    });
});

server.listen(PORT, () => {
    console.log(`Prodigy 1500 Server running on http://localhost:${PORT}`);
});
