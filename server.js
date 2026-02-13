const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const axios = require('axios');
const cors = require('cors');

// --- MODULE IMPORTS ---
const worldListRouter = require('./worldlist');
const matchmakingRouter = require('./matchmaking');
const leaderboardRouter = require('./leaderboard');
const playerBroadcastFactory = require('./playerbroadcast');
const playerListFactory = require('./playerlist');
const debuggerFactory = require('./debugger');
const friendApiRouter = require('./friendapi');

const app = express();
const server = http.createServer(app);

// --- 1. UTILS & DEBUGGING CONFIG ---
const Util = {
    log: (msg, type = "INFO", context = "General") => {
        const timestamp = new Date().toLocaleTimeString();
        const colors = { 
            INFO: "\x1b[36m", 
            ERROR: "\x1b[31m", 
            DEBUG: "\x1b[33m", 
            SUCCESS: "\x1b[32m", 
            SOCKET: "\x1b[35m" 
        };
        const reset = "\x1b[0m";
        const color = colors[type] || "";
        const prefix = `[${timestamp}] ${color}[${type}] [${context}]${reset}`;
        
        if (typeof msg === 'object' && msg !== null) {
            console.log(prefix + " (Object Payload):");
            console.dir(msg, { depth: 2, colors: true });
        } else {
            console.log(`${prefix} ${msg}`);
        }
    },
    ERROR: "ERROR", INFO: "INFO", DEBUG: "DEBUG", SUCCESS: "SUCCESS", SOCKET: "SOCKET"
};

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAkqq1G5oxjdN5z-rYApExpJvlEiXG04os",
    authDomain: "prodigyplus1500.firebaseapp.com",
    databaseURL: "https://prodigyplus1500-default-rtdb.firebaseio.com",
    projectId: "prodigyplus1500",
    storageBucket: "prodigyplus1500.firebasestorage.app",
    messagingSenderId: "457513275768",
    appId: "1:457513275768:web:4527fe6ad1892798e5f88d",
    measurementId: "G-4L0QLCF2HD"
};

const RTDB_URL = firebaseConfig.databaseURL;
const FB_SECRET = "LXcv3gZauf3URT0sVCdLGLZhMGX36svcNfHIAPVY";
const PORT = 3000;
const MOCK_OPPONENT_ID = "SERVER_BOT"; 

// --- 2. EXPRESS MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 3. SHARED STATE ---
const activePlayers = new Map();
const uidToSocket = new Map();

// --- 4. SOCKET.IO ENGINE ---
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] }, 
    transports: ['websocket', 'polling'], 
    path: '/socket.io/',
    allowEIO3: true 
});

// --- 5. MODULE INITIALIZATION ---
const PlayerListManager = playerListFactory(activePlayers);
const Debugger = debuggerFactory(activePlayers, uidToSocket);
const Broadcaster = playerBroadcastFactory(io, activePlayers);

// --- 6. ROUTES ---
app.get('/patch-config', (req, res) => {
    res.json({ success: true, version: "1.0.1-custom", features: ["multiplayer", "zones"] });
});

const handleGameEvent = (req, res) => {
    res.json({ success: true, status: "captured" });
};

const handleSocialFallback = (req, res) => {
    Util.log(`Handling Social Fallback for: ${req.originalUrl}`, Util.DEBUG);
    res.json({
        success: true,
        friends: [],
        pendingRequests: [], 
        requests: [],
        count: 0
    });
};

// --- 6. ROUTES ---
app.all(['/game-event', '/game-api/v2/game-event', '/events'], handleGameEvent);
app.get(['/friend/get-all', '/friend/requests', '/friend/invites'], handleSocialFallback);

// Add the matchmaking route here:
app.use(['/matchmaking-api', '/game-api/v2/matchmaking'], matchmakingRouter); 

app.use(['/worlds', '/game-api/v2/worlds'], worldListRouter(activePlayers, PlayerListManager));
app.use('/leaderboard', leaderboardRouter(activePlayers, (d) => d));
app.use(['/friends', '/friend-api', '/friend'], friendApiRouter(activePlayers, RTDB_URL, FB_SECRET, Debugger, io));

// --- 7. SOCKET LOGIC ---

io.on('connection', async (socket) => {
    // 1. EXTRACT FROM HANDSHAKE QUERY
    // This allows the server to identify the player immediately upon connection.
    const { userId, worldId, userToken, zone } = socket.handshake.query;
    
    let uid = userId || null;

    console.log(`[Socket] New connection ${socket.id}. Handshake UID: ${uid}, Zone: ${zone}`);

    const handleRegister = async (data) => {
        // Use either the handshake UID or the one sent in the register event
        const finalUid = uid || data?.userID || data?.userId;
        if (!finalUid) return;

        uid = String(finalUid);

        // 2. IDENTITY MAPPING (uidToSocket)
        // Bind the permanent UserID to the temporary SocketID for cross-referencing.
        uidToSocket.set(uid, socket.id);

        try {
            // 3. DATA RETRIEVAL (Firebase Sync)
            // Fetch appearance and metadata to construct the full player state.
            const authParam = FB_SECRET ? `?auth=${FB_SECRET}` : "";
            const response = await axios.get(`${RTDB_URL}/users/${uid}.json${authParam}`);
            const wizard = response.data;

            const playerData = {
                userID: uid,
                name: wizard?.appearancedata?.name || "Wizard",
                appearance: wizard?.appearancedata || {},
                zone: zone || data?.zone || "lamplight",
                x: data?.x || 500, 
                y: data?.y || 500,
                isMember: wizard?.metadata?.isMember ?? true
            };

            // Add to active world state
            activePlayers.set(socket.id, playerData);
            socket.join(playerData.zone);

            // Confirm registration back to client
            socket.emit('registered', { success: true, userID: uid });
            
            // Sync with other players in the same zone
            Broadcaster.announceJoin(socket, playerData);
            
            // --- PLAYER LIST BROADCAST ---
            // Trigger the internal zone list update so the new player 
            // and existing players see the updated UID array.
            const zoneUsers = Array.from(activePlayers.values())
                .filter(p => p.zone === playerData.zone && p.userID)
                .map(p => p.userID);
            
            io.to(playerData.zone).emit('player_list', zoneUsers);
            io.to(playerData.zone).emit('playerList', zoneUsers);

            console.log(`[Auth] Player ${playerData.name} (${uid}) fully synced and broadcast.`);
        } catch (e) {
            console.error(`[Auth Error] Failed to fetch wizard ${uid}:`, e.message);
        }
    };

    // Auto-register if UID was provided in the connection query
    if (uid) {
        handleRegister({ zone: zone });
    }

    socket.on('register', handleRegister);
    socket.on('login', handleRegister);

    /**
     * PLAYER JOINED HANDLER
     * Manually triggers a join announcement if the client requests it.
     */
    socket.on('playerJoined', (data) => {
        const player = activePlayers.get(socket.id);
        if (player) {
            Util.log(`Manual playerJoined requested by ${player.userID}`, Util.DEBUG, "Sync");
            Broadcaster.announceJoin(socket, player);
        }
    });

    socket.on('monster_alert', (data) => {
        const player = activePlayers.get(socket.id);
        if (!player) return;

        player.evtProc = true;
        player.x = Math.floor(player.x);
        player.y = Math.floor(player.y);

        io.to(player.zone).emit('message', {
            action: "move",
            from: player.userID,
            data: {
                userID: player.userID,
                path: [{ x: player.x, y: player.y }]
            }
        });
    });

    socket.on('join', (data) => {
        let player = activePlayers.get(socket.id);
        const newZone = typeof data === 'string' ? data : data.zone;

        if (!player && data.userID) {
            handleRegister(data);
            return;
        }

        if (player && newZone) {
            const oldZone = player.zone;
            if (oldZone) {
                socket.leave(oldZone);
                Broadcaster.announceLeave(player.userID, oldZone);
            }
            
            player.zone = newZone;
            player.x = 0; 
            player.y = 0;
            socket.join(newZone);
            
            Broadcaster.announceJoin(socket, player);
            socket.emit('ready', { success: true });
        }
    });

    socket.on('message', (data) => {
        const sender = activePlayers.get(socket.id);
        const senderUid = sender ? sender.userID : uid;
        
        if (!senderUid) return;

        const payload = { 
            ...data, 
            userID: senderUid, 
            name: sender ? sender.name : "Wizard",
            from: senderUid 
        };
        
        if (payload.action === 'fullInfo') {
            if (payload.target) {
                const targetSocketId = uidToSocket.get(String(payload.target));
                if (targetSocketId) io.to(targetSocketId).emit('message', payload);
            } else {
                io.to(sender?.zone || "lamplight_town").emit('message', payload);
            }
            return;
        }

        if (payload.target && String(payload.target) === MOCK_OPPONENT_ID) {
            Util.log(`Bot interaction: ${payload.action}`, Util.DEBUG);
        } else if (sender?.zone) {
            io.to(sender.zone).emit('message', payload);
        }
    });

    socket.on('move', (data) => {
        const player = activePlayers.get(socket.id);
        if (player) {
            player.x = data.x;
            player.y = data.y;
            
            Broadcaster.broadcastMove(socket, player);

            if (player.zone) {
                io.to(player.zone).emit('message', {
                    action: "move",
                    from: player.userID,
                    data: {
                        userID: player.userID,
                        x: player.x,
                        y: player.y,
                        path: data.path || [{ x: player.x, y: player.y }]
                    }
                });
            }
        }
    });

    socket.on('disconnect', () => {
        const player = activePlayers.get(socket.id);
        if (uid) {
            uidToSocket.delete(uid);
            activePlayers.delete(socket.id);
            if (player) Broadcaster.announceLeave(uid, player.zone);
            Util.log(`User Disconnected: ${uid} (Socket: ${socket.id})`, Util.SOCKET);
        } else {
            Util.log(`Anonymous Socket Disconnected: ${socket.id}`, Util.SOCKET);
        }
    });
});

server.listen(PORT, () => {
    Util.log(`Multiplayer Server active on port ${PORT}`, Util.SUCCESS, "Init");
});

