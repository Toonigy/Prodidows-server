/**
 * Game Backend Server - Single File Implementation
 * ------------------------------------------------
 * Handles HTTP REST APIs (Matchmaking, Friends, Game Data) and
 * Socket.io Real-time Multiplayer (Zone switching, movement, legacy events).
 */

const express = require('express');
const http = require('http');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS enabled
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// -----------------------------------------------------------------------------
// 1. Firebase Admin SDK Initialization
// -----------------------------------------------------------------------------
try {
    let serviceAccount;
    
    // Attempt to load local serviceacc.json or environment variable
    try {
        serviceAccount = require('./serviceacc.json');
    } catch (e) {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        }
    }

    if (serviceAccount) {
        // Handle various versions and export styles of firebase-admin
        const credential = (admin.credential && typeof admin.credential.cert === 'function') 
            ? admin.credential.cert(serviceAccount) 
            : (typeof admin.cert === 'function' ? admin.cert(serviceAccount) : serviceAccount);

        admin.initializeApp({
            credential: credential,
            databaseURL: process.env.FIREBASE_DATABASE_URL || "https://default-db.firebaseio.com"
        });
        console.log('[Firebase] Successfully initialized Firebase Admin SDK.');
    } else {
        console.warn('[Firebase] Warning: serviceacc.json not found and no environment credentials provided. Running in standalone mode.');
    }
} catch (err) {
    console.error('[Firebase] Initialization error:', err.message);
}

// -----------------------------------------------------------------------------
// 2. Global Middleware Configuration
// -----------------------------------------------------------------------------
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Express Request Logger (Development Debugging)
app.use((req, res, next) => {
    if (!req.path.startsWith('/public') && !req.path.includes('.')) {
        console.log(`[HTTP] ${req.method} -> ${req.path}`);
    }
    next();
});

// -----------------------------------------------------------------------------
// 3. HTTP REST Routes & Game API Endpoints
// (MUST be defined BEFORE express.static and fallback handlers)
// -----------------------------------------------------------------------------

function processMatchmakingQueue() {
    if (matchmakingQueue.length >= 2) {
        const playerA = matchmakingQueue.shift();
        const playerB = matchmakingQueue.shift();

        console.log(`[Matchmaking] Match found between ${playerA.userID} and ${playerB.userID}`);

        // Construct the exact arena payload expected by Prodigy messageRecieved handler
        const matchPayload = {
            playerA: {
                id: playerA.userID,
                userID: playerA.userID,
                data: playerA.playerData || {}
            },
            playerB: {
                id: playerB.userID,
                userID: playerB.userID,
                data: playerB.playerData || {}
            }
        };

        // Find active socket IDs for both players
        const socketIdA = userToSocketMap.get(playerA.userID);
        const socketIdB = userToSocketMap.get(playerB.userID);

        const arenaMessage = {
            action: 'arena',
            type: 'arena',
            playerA: matchPayload.playerA,
            playerB: matchPayload.playerB,
            data: matchPayload
        };

        // Send match found signal to Player A
        if (socketIdA && io.sockets.sockets.get(socketIdA)) {
            io.to(socketIdA).emit('message', arenaMessage);
            io.to(socketIdA).emit('arena', arenaMessage);
        }

        // Send match found signal to Player B
        if (socketIdB && io.sockets.sockets.get(socketIdB)) {
            io.to(socketIdB).emit('message', arenaMessage);
            io.to(socketIdB).emit('arena', arenaMessage);
        }
    }
}
// Matchmaking Begin Endpoint
app.post(['/matchmaking-api/begin', '/v1/matchmaking/begin'], (req, res) => {
    const body = req.body || {};
    const query = req.query || {};

    // Extract userID from root body, playerData, data, or query string
    let userID = body.userID || 
                 (body.playerData && body.playerData.userID) || 
                 (body.data && body.data.userID) || 
                 query.userID;

    // Fallback: Assign auto-generated unique ID if still undefined to prevent pairing collision
    if (!userID || userID === 'undefined' || userID === 'null') {
        userID = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        console.warn(`[Matchmaking] Missing userID in request. Generated fallback: ${userID}`);
    } else {
        console.log(`[Matchmaking] Begin request for userID: ${userID}`);
    }

    const level = body.level || (body.playerData && body.playerData.level) || 1;
    const score = body.score || 0;
    const playerData = body.playerData || body.data || {};
    
    if (userID) {
        // Remove existing queue entries for this user if re-queueing
        const existingIdx = matchmakingQueue.findIndex(p => p.userID === userID);
        if (existingIdx !== -1) {
            matchmakingQueue.splice(existingIdx, 1);
        }

        // Add player to queue
        matchmakingQueue.push({
            userID,
            level,
            score,
            playerData,
            timestamp: Date.now()
        });

        // Trigger check to pair waiting players
        processMatchmakingQueue();
    }

    res.json({
        status: 'success',
        code: 200,
        data: {
            ticketId: `ticket_${Date.now()}_${userID}`,
            status: 'queued'
        }
    });
});

app.all(['/events-api/v1/game-event', '/events-api/*splat'], (req, res) => {
    console.log(`[Analytics] Event received (${req.method}):`, req.body ? req.body.type || req.body : 'empty');
    res.json({
        status: 'success',
        code: 200,
        data: {
            processed: true
        }
    });
});

// Matchmaking End / Quit Endpoint
app.post(['/matchmaking-api/end', '/v1/matchmaking/end'], (req, res) => {
    const { userID, token } = req.body || {};
    console.log(`[Matchmaking] End/Quit request for userID: ${userID}`);
    
    if (userID) {
        const existingIdx = matchmakingQueue.findIndex(p => p.userID === userID);
        if (existingIdx !== -1) {
            matchmakingQueue.splice(existingIdx, 1);
        }
    }

    res.json({
        status: 'success',
        code: 200,
        data: {
            status: 'cancelled'
        }
    });
});

// Fallback handlers for Matchmaking API namespace
app.use('/matchmaking-api', (req, res) => {
    res.json({
        status: 'success',
        code: 200,
        data: {}
    });
});

// Helper function to build friend request counter payload
const handleCountFriendRequest = (req, res) => {
    const userID = req.params.userID || req.query.userID || '0';
    console.log(`[Friend API] countFriendRequest requested for userID: ${userID}`);
    
    res.json({
        status: 'success',
        code: 200,
        data: {
            pendingRequests: 0,
            count: 0
        },
        meta: {
            friendsCap: 100,
            totalFriends: 0
        }
    });
};

// Friend API Count Request Routes
app.get('/friend-api/v1/friend/:userID/countFriendRequest', handleCountFriendRequest);
app.get('/v1/friend/:userID/countFriendRequest', handleCountFriendRequest);

// Friend API Get Friends List Routes
app.get(['/friend-api/v1/friend/:userID', '/v1/friend/:userID'], (req, res) => {
    res.json({
        status: 'success',
        code: 200,
        data: {
            friends: []
        },
        meta: {
            friendsCap: 100,
            totalFriends: 0
        }
    });
});

app.get('/game-api/v2/worlds', (req, res) => {
    // Prodigy client expects an Array directly or an object containing a array that can be sorted
    res.json([
        {
            id: 'world-1',
            name: 'Harmony Island',
            players: connectedPlayers.size,
            maxPlayers: 100,
            population: connectedPlayers.size,
            status: 'online'
        }
    ]);
});
// Fallback handler for Friend API namespace
app.use('/friend-api', (req, res) => {
    res.json({
        status: 'success',
        code: 200,
        data: {},
        meta: {
            friendsCap: 100,
            totalFriends: 0
        }
    });
});

// Generic API Healthcheck Endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', timestamp: Date.now() });
});

// -----------------------------------------------------------------------------
// 4. Static Files & SPA Routing
// -----------------------------------------------------------------------------

// Define static files public directory
const publicDir = path.join(__dirname)));

// Serve static client assets from public directory
app.use(express.static(publicDir));

// -----------------------------------------------------------------------------
// 5. Socket.io Multiplayer Game Server Logic
// -----------------------------------------------------------------------------

// Map to keep track of connected player states: socket.id -> Player Object
const connectedPlayers = new Map();

// Map to keep track of active room memberships: roomName -> Set of socket.ids
const rooms = new Map();

const userToSocketMap = new Map();

const matchmakingQueue = [];
/**
 * Helper to join a player to a room and update tracking structures
 */
function joinRoom(socket, roomName) {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const oldRoom = player.room;

    // Leave current room if present
    if (oldRoom && rooms.has(oldRoom)) {
        socket.leave(oldRoom);
        rooms.get(oldRoom).delete(socket.id);
        socket.to(oldRoom).emit('playerLeft', socket.id);
    }

    // Join new room
    player.room = roomName;
    socket.join(roomName);

    if (!rooms.has(roomName)) {
        rooms.set(roomName, new Set());
    }
    rooms.get(roomName).add(socket.id);

    console.log(`[Socket] Player ${socket.id} (${player.name || 'Player'}) joined room: ${roomName}`);

    // Notify other players in the room about the new player
    socket.to(roomName).emit('playerJoined', socket.id);
    socket.to(roomName).emit('playerUpdated', player);
}

// Socket.io Connection Logic
io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Parse legacy query parameters sent by joinMultiplayerServer:
    // query: "userId=" + p + "&worldId=" + e + "&userToken=" + g + "&zone=" + t
    const { userId, worldId, userToken, zone } = socket.handshake.query || {};

    // Register initial player state using query params if available
    const playerObj = {
        id: socket.id,
        userId: userId || socket.id,
        worldId: worldId || 'world-1',
        zone: zone || 'root',
        x: 0,
        y: 0,
        room: zone || 'root',
        name: 'Wizard',
        appearance: {}
    };

    connectedPlayers.set(socket.id, playerObj);

    // Join room based on zone/room parameter
    joinRoom(socket, playerObj.room);

    // Broadcast legacy player list to the newly connected client
    const playersInRoom = [];
    if (rooms.has(playerObj.room)) {
        rooms.get(playerObj.room).forEach((sId) => {
            if (sId !== socket.id && connectedPlayers.has(sId)) {
                playersInRoom.push(connectedPlayers.get(sId));
            }
        });
    }

    // Send player list to the joining player
    socket.emit('playerList', playersInRoom);

    // Handle initial player profile sync from client
socket.on('initPlayer', (data) => {
    const player = connectedPlayers.get(socket.id);
    if (player) {
        // Normalize both casing variations so client listeners never break
        player.userID = data.userID || data.userId || player.userID;
        player.userId = player.userID;
        
        if (player.userID) {
            userToSocketMap.set(player.userID, socket.id);
        }

        // Broadcast updated player data to everyone else in room
        socket.to(player.room).emit('playerJoined', player);
        socket.to(player.room).emit('playerUpdated', player);
    }
});

    // Handle incoming legacy generic message emit (emitMessage function)
    socket.on('message', (msgData) => {
        const player = connectedPlayers.get(socket.id);
        if (player && msgData) {
            // If message carries full player info, sync it to server state
            if (msgData.action === 'fullInfo' && msgData.data) {
                if (msgData.data.appearance) player.appearance = msgData.data.appearance;
                if (msgData.data.equipment) player.equipment = msgData.data.equipment;
                if (msgData.data.userID) player.userId = msgData.data.userID;
                if (msgData.data.isMember !== undefined) player.isMember = msgData.data.isMember;
                if (msgData.data.data) player.filterData = msgData.data.data;
            }

            // Broadcast message to all other room members
            socket.to(player.room).emit('message', msgData);
        }
    });

    // Handle player movement
    socket.on('playerMove', (data) => {
        const player = connectedPlayers.get(socket.id);
        if (player) {
            player.x = data.x;
            player.y = data.y;
            if (data.direction) player.direction = data.direction;

            // Broadcast movement to all players in the same room
            socket.to(player.room).emit('playerMoved', {
                id: socket.id,
                x: player.x,
                y: player.y,
                direction: player.direction
            });
        }
    });

    // Handle area / room changing
    socket.on('changeRoom', (targetRoom) => {
        if (typeof targetRoom === 'string' && targetRoom.trim() !== '') {
            joinRoom(socket, targetRoom);
        }
    });

    // Handle player chat messages
    socket.on('chatMessage', (msg) => {
        const player = connectedPlayers.get(socket.id);
        if (player && typeof msg === 'string') {
            const sanitizedMsg = msg.trim().substring(0, 120);
            io.to(player.room).emit('chatBroadcast', {
                id: socket.id,
                name: player.name,
                message: sanitizedMsg
            });
        }
    });

    // Handle zone switching requested by switchZones (l.socket.emit("switchZone", e))
    socket.on('switchZone', (targetZone) => {
        if (typeof targetZone === 'string' && targetZone.trim() !== '') {
            joinRoom(socket, targetZone);

            // Send updated player list for the new zone
            const playersInRoom = [];
            if (rooms.has(targetZone)) {
                rooms.get(targetZone).forEach((sId) => {
                    if (sId !== socket.id && connectedPlayers.has(sId)) {
                        playersInRoom.push(connectedPlayers.get(sId));
                    }
                });
            }
            socket.emit('playerList', playersInRoom);
        }
    });

    // Handle disconnect cleanup
    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
        const player = connectedPlayers.get(socket.id);

        if (player && player.room && rooms.has(player.room)) {
            rooms.get(player.room).delete(socket.id);
            // Notify using legacy event name 'playerLeft' passing socket.id / playerId
            socket.to(player.room).emit('playerLeft', socket.id);
        }

        connectedPlayers.delete(socket.id);
    });
});

// -----------------------------------------------------------------------------
// 6. Start Server
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(` Game Backend Server is listening on port: ${PORT}`);
    console.log(` Static file directory: ${publicDir}`);
    console.log(` WebSocket Realtime Protocol: Active`);
    console.log(`===================================================`);
});
