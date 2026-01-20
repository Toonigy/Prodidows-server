const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

// --- MODULE IMPORTS ---
const worldListRouter = require('./worldlist');
const matchmakingRouter = require('./matchmaking');
const leaderboardRouter = require('./leaderboard');
const playerBroadcastFactory = require('./playerbroadcast');
const playerListFactory = require('./playerlist');
const debuggerFactory = require('./debugger');
const friendApiRouter = require('./friendapi');
const registerFactory = require('./register');

const app = express();
const server = http.createServer(app);

// --- 1. ENHANCED UTILS & TRACING ---
const Util = {
    log: (msg, type = "INFO") => {
        const timestamp = new Date().toLocaleTimeString();
        const colors = { INFO: "\x1b[36m", ERROR: "\x1b[31m", DEBUG: "\x1b[33m", SUCCESS: "\x1b[32m", SOCKET: "\x1b[35m" };
        const reset = "\x1b[0m";
        const prefix = `[${timestamp}] ${colors[type] || ""}[${type}]\x1b[0m`;
        console.log(`${prefix} ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`);
    },
    ERROR: "ERROR", INFO: "INFO", DEBUG: "DEBUG", SUCCESS: "SUCCESS", SOCKET: "SOCKET"
};

const RTDB_URL = "https://prodigyplus1500-default-rtdb.firebaseio.com";
const FB_SECRET = "LXcv3gZauf3URT0sVCdLGLZhMGX36svcNfHIAPVY";
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. SHARED STATE ---
const activePlayers = new Map();
const uidToSocket = new Map();
const matchmakingQueue = []; 

const io = new Server(server, { 
    cors: { origin: "*" }, 
    transports: ['websocket', 'polling']
});

// --- 5. INITIALIZE MODULES ---
const PlayerListManager = playerListFactory(activePlayers);
const Debugger = debuggerFactory(activePlayers, uidToSocket);
const Broadcaster = playerBroadcastFactory(io, activePlayers);
const RegisterManager = registerFactory(RTDB_URL, FB_SECRET, Util);

// --- 6. SOCKET.IO LOGIC ---
io.on('connection', (socket) => {
    Util.log(`New Connection: ${socket.id}`, Util.SOCKET);
    
    // Initially mark as connecting
    activePlayers.set(socket.id, { userID: "Connecting...", socketId: socket.id });
    
    // Send current player list immediately upon connection (your request)
    socket.emit('playerList', PlayerListManager.getFormattedPlayerList());
    
    // Tell client we need their ID
    socket.emit('need_registration');

    socket.on('register', async (uid) => {
        if (!uid) return;
        Util.log(`Registering UID: ${uid}`, Util.INFO);
        
        const playerData = await RegisterManager.getCharacterData(uid);
        if (playerData) {
            uidToSocket.set(uid, socket.id);
            
            // Join the socket room for the UID
            socket.join(uid);
            socket.emit('registered', { success: true, userID: uid });

            /**
             * Handle 'join' event. 
             * This is the definitive point where a player enters the "Active" state.
             * The engine sends this when the map is loaded.
             */
            socket.on('join', (data) => {
                Util.log(`Player ${uid} broadcasting join to world.`, Util.INFO);
                
                // 1. Set the player as active FIRST so that Broadcaster/Manager can find them
                activePlayers.set(socket.id, { ...playerData, socketId: socket.id });

                // 2. Tell the sender they are successfully joined/ready
                socket.emit('ready', { success: true });

                // 3. Broadcast to all clients the refreshed player list
                const currentList = PlayerListManager.getFormattedPlayerList();
                Util.log(`Broadcasting updated playerList (${currentList.length} players)`, Util.DEBUG);
                
                // Send specifically to the joining player
                socket.emit('playerList', currentList);
                // Send to everyone else
                io.emit('playerList', currentList);

                // 4. Global broadcast that this UID is now available
                io.emit('playerJoined', uid);
                io.emit('playerAdded', uid);

                // 5. Standard engine join broadcast (appearance/position)
                socket.broadcast.emit('join', {
                    userID: uid,
                    appearance: playerData.appearance,
                    x: data?.x || 0,
                    y: data?.y || 0
                });

                // 6. Broadcaster module updates (full info syncing)
                Broadcaster.announceJoin(socket, playerData);
            });

            /**
             * The game engine specifically listens for "message" events.
             */
            socket.on('message', (payload) => {
                Util.log(`Message from ${uid}: ${typeof payload === 'string' ? payload : 'Object'}`, Util.DEBUG);
                socket.broadcast.emit('message', payload);
            });
            
            Util.log(`Player ${playerData.name} registered and waiting for join signal.`, Util.SUCCESS);
        } else {
            Util.log(`Registration Failed for UID: ${uid}`, Util.ERROR);
        }
    });

    socket.on('move', (data) => {
        const p = activePlayers.get(socket.id);
        if (p && p.userID && p.userID !== "Connecting...") {
            p.x = data.x;
            p.y = data.y;
            Broadcaster.broadcastMove(socket, p);
        }
    });

    socket.on('disconnect', () => {
        const p = activePlayers.get(socket.id);
        if (p?.userID && p.userID !== "Connecting...") {
            Util.log(`Player Left: ${p.name} (${p.userID})`, Util.INFO);
            uidToSocket.delete(p.userID);
            Broadcaster.announceLeave(p.userID);
            
            // Re-broadcast list after disconnect so others see the update
            const currentList = PlayerListManager.getFormattedPlayerList();
            io.emit('playerList', currentList);
            Util.log(`Updated playerList after disconnect (${currentList.length} remaining)`, Util.DEBUG);
        }
        activePlayers.delete(socket.id);
    });
});

/**
 * REST ROUTES
 */
const worldsRouter = worldListRouter(activePlayers, PlayerListManager);
app.use('/worlds', worldsRouter);
app.use('/game-api/v2/worlds', worldsRouter); // Alias for engine-specific world list requests

app.use('/matchmaking-api', matchmakingRouter(activePlayers, matchmakingQueue, io));

// Engine uses both /friends and /friend-api/v1/...
const friendsRouter = friendApiRouter(activePlayers, RTDB_URL, FB_SECRET, Debugger);
app.use('/friends', friendsRouter);
app.use('/friend-api', friendsRouter);

/**
 * GAME EVENT TELEMETRY
 * Handles the engine's requests to /game-event.
 * Supports both POST (event submission) and GET (engine health checks).
 */
app.route('/game-event')
    .get((req, res) => {
        // Handle engine health checks or ping tests
        res.status(200).json({ success: true, status: "ready" });
    })
    .post((req, res) => {
        const eventData = req.body;
        // Log telemetry via Debugger if available
        if (Debugger) Debugger.trackEvent('game_telemetry', eventData);
        res.status(200).json({ success: true });
    });

server.listen(PORT, () => Util.log(`Server live on port ${PORT}`, Util.SUCCESS));
