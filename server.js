const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from root folder (index.html, game.min.js, assets, etc.)
app.use(express.static(path.join(__dirname)));

// Status check endpoints
app.get('/status', (req, res) => {
    res.status(200).send({ status: "OK", timestamp: Date.now() });
});
app.get('/v1/status', (req, res) => {
    res.status(200).send({ status: "OK", timestamp: Date.now() });
});
app.get('/game-api/v1/status', (req, res) => {
    res.status(200).send({ status: "OK", timestamp: Date.now() });
});

// Worlds list API for /v2/worlds and /game-api/v2/worlds
const worldsHandler = (req, res) => {
    res.status(200).json([
        {
            id: 1,
            name: "Alpha World",
            ip: "localhost",
            port: PORT,
            online: true,
            population: 1
        }
    ]);
};

app.get('/v2/worlds', worldsHandler);
app.get('/game-api/v2/worlds', worldsHandler);

// Matchmaking API endpoints (Supporting both GET and POST for maximum client compatibility)
const matchmakingBeginHandler = (req, res) => {
    console.log('[MATCHMAKING] Begin request received:', req.method, req.body || req.query);
    res.status(200).json({
        success: true,
        matchID: "match-12345",
        opponent: {
            userID: "opponent-9876",
            name: "Practice Wizard",
            level: (req.body && req.body.level) || (req.query && req.query.level) || 10,
            score: (req.body && req.body.score) || (req.query && req.query.score) || 1000
        }
    });
};

const matchmakingEndHandler = (req, res) => {
    console.log('[MATCHMAKING] End/Quit request received:', req.method, req.body || req.query);
    res.status(200).json({ success: true });
};

app.post('/matchmaking-api/begin', matchmakingBeginHandler);
app.get('/matchmaking-api/begin', matchmakingBeginHandler);

app.post('/matchmaking-api/end', matchmakingEndHandler);
app.get('/matchmaking-api/end', matchmakingEndHandler);

// Login endpoint
app.post('/v1/login/:worldId', (req, res) => {
    const { username } = req.body;
    console.log(`[LOGIN] User logging into world ${req.params.worldId}`);
    res.status(200).json({
        userID: "12345678",
        authToken: "mock-auth-token-1-50-0",
        username: username || "WizardPlayer",
        success: true
    });
});

// User Character info / data endpoints
app.get('/v1/characters/:userId', (req, res) => {
    res.status(200).json({
        userID: req.params.userId,
        data: {
            name: "Prodigy Wizard",
            hair: { style: 1, color: 1 },
            outfit: { style: 1, color: 1 },
            level: 10,
            gold: 5000,
            tutorial: { complete: true }
        }
    });
});

app.post('/v1/characters/:userId', (req, res) => {
    res.status(200).json({ success: true });
});

app.post('/v1/users/:userId', (req, res) => {
    res.status(200).json({ success: true });
});

// Education & Skills endpoints
app.get('/v1/users/:userId/education', (req, res) => {
    res.status(200).json([{
        grade: 3,
        skills: []
    }]);
});

// Logging and tracking endpoints
app.post('/v1/log/:level', (req, res) => {
    res.status(200).json({ success: true });
});

app.post('/v1/game-event', (req, res) => {
    res.status(200).json({ success: true });
});
app.get('/v1/game-event', (req, res) => {
    res.status(200).json({ success: true });
});

app.post('/events-api/v1/game-event', (req, res) => {
    console.log('[EVENTS] Received game event (POST):', req.body || req.query);
    res.status(200).json({ success: true });
});
app.get('/events-api/v1/game-event', (req, res) => {
    console.log('[EVENTS] Received game event (GET):', req.query);
    res.status(200).json({ success: true });
});

io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId || "12345678";
    const worldId = socket.handshake.query.worldId || "1";
    const zone = socket.handshake.query.zone || "lamplight";
    console.log(`[SOCKET] User connected: ${userId} in world ${worldId}, zone ${zone}`);

    // Send initial mock player list matching client expectations
    socket.emit('playerList', [
        { userID: userId, x: 400, y: 300, zone: zone }
    ]);

    // Broadcast when a new player joins or performs actions
    socket.broadcast.emit('playerJoined', userId);

    socket.on('message', (data) => {
        console.log(`[SOCKET] Message received from ${userId}:`, data);
        socket.broadcast.emit('message', data);
    });

    socket.on('switchZone', (zoneData) => {
        console.log(`[SOCKET] User switched zone:`, zoneData);
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] User disconnected: ${userId}`);
        socket.broadcast.emit('playerLeft', userId);
    });
});

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(` Prodigy 1-50-0 Server running successfully`);
    console.log(` Open http://localhost:${PORT} in your browser`);
    console.log(`=========================================`);
});
