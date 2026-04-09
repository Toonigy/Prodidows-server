const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws'); // Required for the raw world list endpoint
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO for gameplay
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Initialize a raw WebSocket Server for the '/list' endpoint
const wss = new WebSocket.Server({ noServer: true });

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

/**
 * Raw WebSocket Handler for 'getWorldList'
 */
wss.on('connection', (ws) => {
    console.log("[WS] World list requested.");
    // Send the current worlds array as the data payload
    ws.send(JSON.stringify(worlds));
    // The client logic usually closes after receiving, but we can close it from our end too
    ws.close();
});

/**
 * Handle HTTP Upgrade for raw WebSockets
 */
server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/list') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        // Let Socket.IO handle other upgrades (like its own connection)
    }
});

/**
 * Matchmaking & Player State
 */
const matchQuery = {}; 

// 1. Matchmaking / World List Endpoints
app.get('/status', (req, res) => res.json(worlds.map(w => ({ id: w.id, name: w.name, host: w.host, full: false }))));

const sendWorlds = (req, res) => res.json(worlds);
app.get('/multiplayer/worlds', sendWorlds);
app.get('/game-api/v2/worlds', sendWorlds);

// Added missing matchmaking-api endpoint to prevent 404
app.post('/matchmaking-api/:action', (req, res) => {
    const action = req.params.action;
    const { userID, level, score, playerData } = req.body || {};
    
    if (action === 'begin') {
        if (!userID) return res.json({ success: false, error: "Missing userID" });

        console.log(`[Arena] ${userID} is searching for an arena match...`);

        const LEVEL_TOLERANCE = 15;
        const SCORE_TOLERANCE = 1250;
        let matchFound = false;

        // Iterate through queue to find a suitable opponent
        for (let opponentID in matchQuery) {
            const opponent = matchQuery[opponentID];

            // Fairness Logic (Deobfuscated checks)
            const isLevelFair = !(opponent.level + LEVEL_TOLERANCE < level) && !(level + LEVEL_TOLERANCE < opponent.level);
            const isScoreFair = !(opponent.score + SCORE_TOLERANCE < score) && !(score + SCORE_TOLERANCE < opponent.score);
            const isNotSelf = opponentID !== userID;

            if (isLevelFair && isScoreFair && isNotSelf) {
                const matchID = uuidv4();
                
                // Construct match result
                const matchData = {
                    matchID: matchID,
                    status: 'matched',
                    playerA: { id: opponentID, data: opponent.playerData },
                    playerB: { id: userID, data: playerData }
                };

                console.log(`[Arena] Match Found: ${opponentID} vs ${userID}`);

                // In a Socket-based system, we'd emit to both. 
                // In this AJAX polling mock, we return the match to the current caller.
                // Note: The opponent needs to poll again to receive their match result.
                
                // Store the match result for the opponent to find on their next poll
                matchQuery[opponentID].matchResult = { ...matchData, opponent: playerData };
                
                delete matchQuery[opponentID];
                matchFound = true;

                return res.json({ 
                    success: true, 
                    data: { status: 'matched', matchID: matchID, opponent: opponent.playerData } 
                });
            }
        }

        // If no match found, or if opponent hasn't picked up their result yet
        if (!matchFound) {
            // Check if we were already in queue and matched by someone else
            if (matchQuery[userID] && matchQuery[userID].matchResult) {
                const result = matchQuery[userID].matchResult;
                delete matchQuery[userID];
                return res.json({ success: true, data: result });
            }

            // Otherwise, stay in queue (update details)
            matchQuery[userID] = {
                level: level || 1,
                score: score || 0,
                playerData: playerData,
                timestamp: Date.now()
            };

            return res.json({ success: true, data: { status: 'searching', matchID: null } });
        }
    }

    if (action === 'end') {
        if (userID && matchQuery[userID]) {
            console.log(`[Arena] ${userID} left matchmaking.`);
            delete matchQuery[userID];
        }
        return res.json({ success: true, data: { status: 'finished' } });
    }

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
app.post('/game-event', (req, res) => {
    const { userID, event } = req.body || {};
    // Log incoming telemetry for debugging/development visibility
    if (event) {
        console.log(`[Analytics] Event: "${event}" received from User: ${userID}`);
    }
    res.status(200).json({ success: true });
});

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
    const { player_score, player_stars, userID } = req.query;
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
            meta: { page: 0, limit: 30, total: 0 }
        }
    });
});

// 4. Multiplayer Logic (Socket.IO)
const players = {}; 

io.on('connection', (socket) => {
    // Client logs "client connected" on this event
    console.log(`User connected: ${socket.id}`);

    const query = socket.handshake.query;
    const userId = socket.handshake.query.userId || "anon-" + uuidv4().substring(0, 8);
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

    socket.on('request_init', (data) => {
        console.log(`[Socket] PVP_UPDATE: Initializing battle session for ${userId}`);
        // Synchronize initial battle state (Health, Team composition)
        socket.emit('PVP_UPDATE', {
            action: 'init_complete',
            data: { serverTime: Date.now() }
        });
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
        console.log(`[Socket] User ${userId} disconnected.`);
        if (players[socket.id]) {
            io.emit('playerLeft', userId);
            delete players[socket.id];
        }
        if (matchQuery[userId]) delete matchQuery[userId];
    });
});

server.listen(PORT, () => {
    console.log("\x1b[32mDEMS\x1b[0m \x1b[36mVersion 1.5.0\x1b[0m");
    console.log(`Prodigy Multiplayer Server running at http://localhost:${PORT}`);
});
