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


// Status check endpoint expected by ApiClient
app.get('/status', (req, res) => {
    res.status(200).send({ status: "OK", timestamp: Date.now() });
});
app.get('/v1/status', (req, res) => {
    res.status(200).send({ status: "OK", timestamp: Date.now() });
});

// Worlds list API
app.get('/v2/worlds', (req, res) => {
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
});

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

io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    const worldId = socket.handshake.query.worldId;
    console.log(`[SOCKET] User connected: ${userId} in world ${worldId}`);

    // Notify client of successful connection
    socket.emit('connect');
    
    // Send mock player list
    socket.emit('playerList', [
        { userID: userId, x: 400, y: 300, zone: "lamplight" }
    ]);

    socket.on('message', (data) => {
        // Broadcast message to other players or echo back
        socket.broadcast.emit('message', data);
    });

    socket.on('switchZone', (zoneData) => {
        console.log(`[SOCKET] User switched zone:`, zoneData);
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] User disconnected: ${userId}`);
    });
});

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(` Prodigy 1-50-0 Server running successfully`);
    console.log(` Open http://localhost:${PORT} in your browser`);
    console.log(`=========================================`);
});
