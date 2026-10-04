/**
 * STREAMING_CHUNK:Initializing Prodigy Node Server with fixed Socket.IO connection handlers and test payloads...
 */
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

// Serve static files from root folder
app.use(express.static(path.join(__dirname)));

/**
 * STREAMING_CHUNK:Configuring system status and world endpoints...
 */
app.get('/status', (req, res) => res.status(200).send({ status: "OK", timestamp: Date.now() }));
app.get('/v1/status', (req, res) => res.status(200).send({ status: "OK", timestamp: Date.now() }));
app.get('/game-api/v1/status', (req, res) => res.status(200).send({ status: "OK", timestamp: Date.now() }));

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

/**
 * STREAMING_CHUNK:Configuring matchmaking endpoints...
 */
const matchmakingBeginHandler = (req, res) => {
    res.status(200).json({
        success: true,
        matchID: "match-12345",
        opponent: {
            userID: "opponent-9876",
            name: "Gina",
            level: 5,
            score: 1000
        }
    });
};

const matchmakingEndHandler = (req, res) => {
    res.status(200).json({ success: true });
};

app.post('/matchmaking-api/begin', matchmakingBeginHandler);
app.get('/matchmaking-api/begin', matchmakingBeginHandler);
app.post('/matchmaking-api/end', matchmakingEndHandler);
app.get('/matchmaking-api/end', matchmakingEndHandler);

/**
 * STREAMING_CHUNK:Configuring PvP and Class leaderboard endpoints with exact test payload...
 */
const pvpLeaderboardApiHandler = (req, res) => {
    const mockEntries = [
        {
            rank: 1,
            userID: "12345678",
            name: "Gina",
            isMember: true,
            data: '{"level":5}',
            appearance: '{"name":"Gina", "gender":"female", "hairStyle":5, "hairColor":3, "skinColor":3, "eyeColor":5}',
            equipment: '{"weapon":1}',
            hair: '{"style":5,"color":3}'
        }
    ];

    for (let i = 2; i <= 20; i++) {
        mockEntries.push({
            rank: i,
            userID: "user-rank-" + i,
            name: "WizardHero" + i,
            isMember: i % 2 === 0,
            data: '{"level":5}',
            appearance: '{"name":"WizardHero' + i + '", "gender":"male", "hairStyle":1, "hairColor":1, "skinColor":1, "eyeColor":1}',
            equipment: '{"hat":1, "outfit":1}',
            hair: '{"style":1,"color":1}'
        });
    }

    res.status(200).json({
        success: true,
        player_list: mockEntries
    });
};

app.get('/leaderboard-api/pvp/:worldId/:userId', pvpLeaderboardApiHandler);
app.post('/leaderboard-api/pvp/:worldId/:userId', pvpLeaderboardApiHandler);
app.get('/leaderboard-api/pvp/:min/:max', pvpLeaderboardApiHandler);
app.post('/leaderboard-api/pvp/:min/:max', pvpLeaderboardApiHandler);
app.get('/leaderboard/pvp/:min/:max', pvpLeaderboardApiHandler);
app.post('/leaderboard/pvp/:min/:max', pvpLeaderboardApiHandler);

const classLeaderboardApiHandler = (req, res) => {
    res.status(200).json({
        success: true,
        player_list: [
            {
                rank: 1,
                userID: "12345678",
                name: "Gina",
                isMember: true,
                data: '{"level":5}',
                appearance: '{"name":"Gina", "gender":"female", "hairStyle":5, "hairColor":3, "skinColor":3, "eyeColor":5}',
                equipment: '{"weapon":1}',
                hair: '{"style":5,"color":3}'
            }
        ]
    });
};

app.get('/leaderboard-api/class/:classId', classLeaderboardApiHandler);
app.post('/leaderboard-api/class/:classId', classLeaderboardApiHandler);
app.get('/leaderboard/class/:classId', classLeaderboardApiHandler);
app.post('/leaderboard/class/:classId', classLeaderboardApiHandler);

/**
 * STREAMING_CHUNK:Configuring character fetch endpoints with exact test payload...
 */
app.post('/v1/login/:worldId', (req, res) => {
    res.status(200).json({
        userID: "12345678",
        authToken: "mock-auth-token-1-50-0",
        username: "Gina",
        success: true
    });
});

const characterFetchHandler = (req, res) => {
    const rawIds = req.params.userId || "12345678";
    const userIds = rawIds.split(',').map(id => id.trim()).filter(Boolean);
    const responseMap = {};
    
    userIds.forEach((id, index) => {
        responseMap[id] = {
            userID: id,
            name: index === 0 ? "Gina" : "WizardHero" + (index + 1),
            isMember: true,
            data: '{"level":5}',
            appearance: '{"name":"Gina", "gender":"female", "hairStyle":5, "hairColor":3, "skinColor":3, "eyeColor":5}',
            equipment: '{"weapon":1}',
            hair: '{"style":5,"color":3}',
            level: 5
        };
    });

    res.status(200).json(responseMap);
};

app.get('/game-api/v1/characters/:userId', characterFetchHandler);
app.get('/v1/characters/:userId', characterFetchHandler);

app.post('/v1/users/:userId', (req, res) => res.status(200).json({ success: true }));
app.get('/v1/users/:userId/education', (req, res) => res.status(200).json([{ grade: 3, skills: [] }]));
app.post('/v1/log/:level', (req, res) => res.status(200).json({ success: true }));
app.post('/events-api/v1/game-event', (req, res) => res.status(200).json({ success: true }));
app.get('/events-api/v1/game-event', (req, res) => res.status(200).json({ success: true }));

const friendCountHandler = (req, res) => {
    res.status(200).json({
        success: true,
        data: { pendingRequests: 0 },
        meta: { friendsCap: 50, totalFriends: 0 }
    });
};

app.get('/friend-api/v1/friend/:userId/countFriendRequest', friendCountHandler);
app.post('/friend-api/v1/friend/:userId/countFriendRequest', friendCountHandler);
app.get('/v1/friend/:userId/countFriendRequest', friendCountHandler);
app.get('/game-api/v1/friend/:userId/countFriendRequest', friendCountHandler);

const friendListHandler = (req, res) => {
    res.status(200).json({
        success: true,
        data: [],
        meta: { total: 0, offset: 0, limit: 0 }
    });
};

app.get('/friend-api/v1/friend/:userId', friendListHandler);
app.post('/friend-api/v1/friend/:userId', friendListHandler);
app.get('/v1/friend/:userId', friendListHandler);
app.get('/game-api/v1/friend/:userId', friendListHandler);

/**
 * STREAMING_CHUNK:Configuring Socket.IO connection handling without reserved event errors...
 */
io.on('connection', (socket) => {
    const query = socket.handshake.query || {};
    const userId = (query.userId && query.userId !== "undefined" && query.userId !== "null") ? query.userId : (socket.handshake.headers && socket.handshake.headers['x-user-id']) || "12345678";
    console.log(`[Socket.IO] Client connected: userId=${userId}, worldId=${query.worldId}, zone=${query.zone}`);
    
    let currentZone = query.zone || "Town";

    const initialPlayers = [
        { userID: userId, name: query.name || "Wizard", zone: currentZone, x: 100, y: 100 }
    ];
    
    console.log('[Socket.IO] playerList:', JSON.stringify(initialPlayers));
    socket.emit('playerList', initialPlayers);

    socket.on('switchZone', (newZone) => {
        console.log(`[Socket.IO] User ${userId} switching zone to: ${newZone}`);
        currentZone = newZone;
        socket.broadcast.emit('playerZoneChanged', { userId: userId, zone: newZone });
    });

    socket.on('message', (msg) => {
        console.log('[Socket.IO] Received message:', typeof msg === 'object' ? JSON.stringify(msg) : msg);
        socket.broadcast.emit('message', msg);
    });

    socket.on('playerJoin', (data) => {
        console.log('[Socket.IO] playerJoin:', typeof data === 'object' ? JSON.stringify(data) : data);
        socket.broadcast.emit('playerJoin', data);
    });

    socket.on('disconnect', () => {
        console.log(`[Socket.IO] Client disconnected: userId=${userId}`);
        socket.broadcast.emit('playerLeft', userId);
    });
});

/**
 * STREAMING_CHUNK:Configuring fallback asset JSON and texture middleware...
 */
app.use((req, res, next) => {
    if (req.path.endsWith('.json')) {
        return res.status(200).json({
            frames: [
                { filename: "default", frame: { x: 0, y: 0, w: 32, h: 32 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 } },
                { filename: "normal/face/1", frame: { x: 0, y: 0, w: 32, h: 32 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 } },
                { filename: "normal/face/5", frame: { x: 0, y: 0, w: 32, h: 32 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 } },
                { filename: "normal/eyes/1", frame: { x: 0, y: 0, w: 32, h: 32 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 } },
                { filename: "normal/eyes/5", frame: { x: 0, y: 0, w: 32, h: 32 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 } },
                { filename: "normal/hair/1", frame: { x: 0, y: 0, w: 32, h: 32 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 } },
                { filename: "normal/hair/5", frame: { x: 0, y: 0, w: 32, h: 32 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 }, sourceSize: { w: 32, h: 32 } }
            ],
            meta: {
                app: "Prodigy Mock Server",
                version: "1.0",
                image: "texture.png",
                format: "RGBA8888",
                size: { w: 256, h: 256 },
                scale: "1"
            },
            animations: {
                idle: [0],
                walk: [0]
            }
        });
    }
    next();
});

server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(` Prodigy Server running on port ${PORT}`);
    console.log(` Multiplayer Socket.IO active`);
    console.log(` Leaderboard test payload: Gina (Level 5)`);
    console.log(`=========================================`);
});
