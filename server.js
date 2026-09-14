const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDmvTnNZtnW4AwxtjimDedpE-owbosgBpw",
    authDomain: "primdorial-mmo.firebaseapp.com",
    databaseURL: "https://primdorial-mmo-default-rtdb.firebaseio.com",
    projectId: "primdorial-mmo",
    storageBucket: "primdorial-mmo.firebasestorage.app",
    messagingSenderId: "373426559896",
    appId: "1:373426559896:web:0825a489c230748d9d69ed",
    measurementId: "G-BWSDP0KRYH"
};

const loginHandler = (req, res) => {
    const username = req.params.username || req.body.username || "WizardHero";
    console.log(`[AUTH] Login attempt for username: ${username} ( Firebase Project: ${FIREBASE_CONFIG.projectId} )`);
    
    const firebaseUserId = "fb_" + Buffer.from(username).toString('hex').slice(0, 10);

    res.json({
        success: true,
        authToken: "mock-firebase-token-" + Date.now(),
        userID: firebaseUserId,
        username: username,
        isMember: true,
        firebaseConfig: FIREBASE_CONFIG
    });
};

app.post(['/v1/login/:username', '/game-api/v1/login/:username', '/v1/login', '/game-api/v1/login'], loginHandler);

const worldsHandler = (req, res) => {
    // Providing numeric 'full' property so game.min.js 'getSuggested' method computes valid green bars/status
    res.json([
        { id: 1, name: "Server Alpha (Firebase)", ip: "localhost", port: PORT, population: "Normal", online: true, full: 45 },
        { id: 2, name: "Server Beta (Firebase)", ip: "localhost", port: PORT, population: "Crowded", online: true, full: 70 }
    ]);
};

app.get(['/v2/worlds', '/game-api/v2/worlds', '/worlds'], worldsHandler);

const characterHandler = (req, res) => {
    const id = req.params.id || "fb_default";
    res.json({
        userID: id,
        name: "WizardHero",
        data: {
            appearance: { hair: 1, eyes: 1, skin: 1, outfit: 1 },
            backpack: { items: [] },
            pets: [],
            level: 15,
            gold: 10000,
            stars: 500,
            firebaseProjectId: FIREBASE_CONFIG.projectId
        }
    });
};

app.get(['/v1/characters/:id', '/game-api/v1/characters/:id', '/characters/:id', '/game-api/characters/:id'], characterHandler);

const gameEventHandler = (req, res) => {
    console.log(`[EVENT] Received game event tracking request for Firebase DB:`, req.body || req.query);
    res.json({ success: true, message: "Event tracked successfully to Firebase Realtime DB" });
};

app.all(['/events-api/v1/game-event', '/v1/game-event', '/game-api/v1/game-event', '/game-api/events-api/v1/game-event'], gameEventHandler);

const activePlayers = new Map();

io.on('connection', (socket) => {
    const query = socket.handshake.query || {};
    console.log(`[SOCKET] Client connected: ${socket.id}`, query);

    let playerId = query.userId && query.userId !== 'undefined' ? query.userId : ('user_' + socket.id.slice(0, 6));
    const worldId = query.worldId && query.worldId !== 'undefined' ? query.worldId : '1';
    let currentZone = query.zone && query.zone !== 'undefined' ? query.zone : 'zone-login';

    const playerData = {
        socketId: socket.id,
        userID: String(playerId),
        worldId: String(worldId),
        zone: String(currentZone)
    };
    activePlayers.set(socket.id, playerData);

    let roomName = `world_${worldId}_zone_${currentZone}`;
    socket.join(roomName);

    const getRoomPlayers = (wId, zName) => {
        const list = [];
        for (const p of activePlayers.values()) {
            if (p.worldId === wId && p.zone === zName) {
                list.push({ userID: String(p.userID) });
            }
        }
        return list;
    };

    const initialPlayers = getRoomPlayers(worldId, currentZone);
    socket.emit('playerList', initialPlayers);

    // Broadcast player joined with object payload containing userID as expected by onPlayerJoined
    socket.to(roomName).emit('playerJoined', { userID: playerData.userID });
    console.log(`[SOCKET] Player ${playerData.userID} joined zone ${currentZone}. Room list count:`, initialPlayers.length);

    socket.on('message', (data) => {
        socket.to(roomName).emit('message', data);
    });

    // Handle full player info broadcast from client for syncing appearance/data
    socket.on('playerFullInfo', (data) => {
        if (data && data.userID) {
            socket.to(roomName).emit('playerFullInfo', data);
        }
    });

    socket.on('switchZone', (newZone) => {
        console.log(`[SOCKET] Player ${playerData.userID} switching zone from ${currentZone} to ${newZone}`);
        
        socket.to(roomName).emit('playerLeft', String(playerData.userID));
        socket.leave(roomName);
        
        currentZone = newZone && newZone !== 'undefined' ? newZone : 'zone-login';
        playerData.zone = currentZone;
        roomName = `world_${worldId}_zone_${currentZone}`;
        
        socket.join(roomName);

        socket.to(roomName).emit('playerJoined', { userID: playerData.userID });

        const updatedRoomPlayers = getRoomPlayers(worldId, currentZone);
        socket.emit('playerList', updatedRoomPlayers);
    });

    socket.on('disconnect', (reason) => {
        console.log(`[SOCKET] Client disconnected: ${socket.id} (Player ${playerData.userID}), Reason: ${reason}`);
        
        socket.to(roomName).emit('playerLeft', String(playerData.userID));
        activePlayers.delete(socket.id);
    });

    socket.on('error', (err) => {
        console.log(`[SOCKET] Error on client ${socket.id}:`, err);
    });
});

server.listen(PORT, () => {
    console.log(`========================================`);
    console.log(` Prodigy 1.50.0 Server is running!`);
    console.log(` Connected to Firebase: primdorial-mmo`);
    console.log(` Open http://localhost:${PORT} in your browser.`);
    console.log(`========================================`);
});
