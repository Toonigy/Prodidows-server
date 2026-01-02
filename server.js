const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

/**
 * FIREBASE CONFIGURATION
 */
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

/**
 * LEGACY SOCKET.IO SUPPORT
 */
const io = new Server(server, {
  cors: { 
    origin: "*", 
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true, 
  path: '/socket.io/',
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling']
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Global state for worlds and players
const activePlayers = new Map();

/**
 * OPPONENT DATA TEMPLATE
 */
const MOCK_OPPONENT_ID = "bot_challenger_99999";
const MOCK_OPPONENT = {
    userID: MOCK_OPPONENT_ID,
    name: "Training Bot",
    level: 50,
    stars: 100,
    winStreak: 5,
    isMember: true,
    appearance: { hair: { color: 2, style: 2 }, gender: "female" },
    equipment: { hat: 2, weapon: 2, boots: 2, outfit: 2 },
    data: { 
        mouth: 1, eyes: 1, skin: 1, 
        tutorial: { battle: true, complete: true } 
    },
    pets: [
        { 
            ID: 12, 
            nickname: "Bot Pet", 
            level: 50, 
            hp: 500, 
            maxHP: 500, 
            stars: 10,
            catchDate: Date.now(),
            assignable: true,
            order: 0,
            starsToLevel: 100,
            power: 50,
            vitality: 50
        }
    ],
    team: []
};

// --- API ROUTES ---

const worldsResponse = (req, res) => {
  const count = activePlayers.size;
  res.json([{
    id: "local-1",
    worldId: "local-1", 
    name: "Localhost Forest",
    host: "localhost",
    port: 3000,
    population: count, 
    full: count + 10,
    max: 200,
    status: "online",
    recommended: true
  }]);
};

app.get(['/game-api/v1/worlds', '/game-api/v2/worlds'], worldsResponse);

/**
 * FIXED SESSION HANDLING
 * game.min.js expects session info to contain the real Firebase UID.
 */
app.get('/game-api/v2/session', (req, res) => {
  // We use a mock session for the browser, but real clients will have their own UIDs
  res.json({ 
    success: true, 
    userID: req.query.uid || "firebase_user_12345", 
    token: "placeholder-token", 
    name: "User Session",
    firebaseConfig: firebaseConfig
  });
});

const characterResponse = (req, res) => {
  const uid = String(req.params.userId);
  res.json({
    success: true,
    data: {
        userID: uid,
        name: `Player ${uid.substring(0,6)}`,
        stars: 999,
        level: 100,
        appearance: { hair: { color: 1, style: 1 }, gender: "male" },
        equipment: { hat: 1, weapon: 1, boots: 1, outfit: 1 },
        inventory: [],
        isGoogleAccount: true
    }
  });
};

app.get(['/game-api/v1/character/:userId', '/game-api/v2/character/:userId'], characterResponse);

/**
 * ZONE SWITCHING HANDLER (REST API)
 */
app.post(['/game-api/v1/switchZones', '/game-api/v2/switchZones'], (req, res) => {
    const { zoneName, userID } = req.body;
    console.log(`[API] User ${userID} switching zone to: ${zoneName}`);
    
    activePlayers.forEach((player, socketId) => {
        if (player.userID === userID) {
            player.zone = zoneName;
            io.to(socketId).emit('playerList', getFormattedPlayerList());
        }
    });

    res.json({ success: true });
});

/**
 * FRIEND API HANDLERS
 */
app.get(['/game-api/v1/friend/:userId/countFriendRequest', '/friend-api/v1/friend/:userId/countFriendRequest'], (req, res) => {
  res.json({ success: true, count: 0, pendingRequests: [], invites: [] });
});

/**
 * ARENA / PVP API HANDLERS
 */
app.get(['/game-api/v1/leaderboard', '/game-api/v2/leaderboard'], (req, res) => {
    res.json({
        success: true,
        data: [
            { userID: "lead_1", name: "Champion", stars: 9999, rank: 1 }
        ]
    });
});

app.get(['/game-api/v1/user-ranking/:userId', '/game-api/v2/user-ranking/:userId'], (req, res) => {
    res.json({
        success: true,
        data: {
            userID: req.params.userId,
            rank: 5,
            stars: 100,
            winStreak: 0
        }
    });
});

app.get(['/game-api/v1/matchmake', '/game-api/v2/matchmake'], (req, res) => {
    res.json({
        success: true,
        data: {
            opponentID: MOCK_OPPONENT_ID,
            ...MOCK_OPPONENT
        }
    });
});

app.post('/game-event', (req, res) => {
    const { name, category } = req.body;
    if (name) console.log(`[Analytics] ${name} (${category})`);
    res.json({ success: true });
});

/**
 * WILDCARD HANDLER
 */
app.use((req, res, next) => {
    if (req.url.includes('[object') || req.url.includes('undefined')) {
        return res.json({ success: true, data: {} });
    }
    next();
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// --- MULTIPLAYER LOGIC ---

function getFormattedPlayerList() {
    const players = {};
    activePlayers.forEach((data) => {
        players[String(data.userID)] = data;
    });
    return players;
}

io.on('connection', (socket) => {
  const { userId } = socket.handshake.query;
  
  let uid = userId;
  if (!uid || uid === 'undefined') {
      uid = `anon_${Math.random().toString(36).substr(2, 9)}`;
  } else {
      uid = String(uid);
  }
  
  console.log(`[Socket] Client connected: ${socket.id} (User: ${uid})`);

  socket.emit('playerList', getFormattedPlayerList());

  socket.on('join', (data) => {
    console.log(`[Socket] Player ${uid} joined.`);
    
    const playerData = {
        userID: uid,
        name: data?.name || `Player ${uid.substring(0,5)}`,
        x: data?.x || 500,
        y: data?.y || 500,
        isMember: true,
        level: data?.level || 100,
        appearance: data?.appearance || { hair: { color: 1, style: 1 }, gender: "male" },
        equipment: data?.equipment || { hat: 1, weapon: 1, boots: 1, outfit: 1 },
        zone: data?.zone || "forest",
        team: data?.team || []
    };

    activePlayers.set(socket.id, playerData);

    // Sync state
    socket.emit('playerList', getFormattedPlayerList());
    socket.emit('ready', { success: true });
    
    // Broadcast join
    io.emit('playerJoined', uid);
    io.emit('playerAdded', uid); 
    io.emit('playerList', getFormattedPlayerList());
  });

  socket.on('message', (payload) => {
      // Ensure we have a valid UID for the sender
      const sender = activePlayers.get(socket.id);
      const senderUid = sender ? sender.userID : uid;

      if (payload.action === 'switch_zone') {
          if (sender) {
              sender.zone = payload.data.zoneName;
              io.emit('playerList', getFormattedPlayerList());
              socket.emit('playerList', getFormattedPlayerList());
          }
      }

      if (String(payload.target) === MOCK_OPPONENT_ID) {
          switch (payload.action) {
              case "request_data":
                  socket.emit('message', {
                      action: "data",
                      from: MOCK_OPPONENT_ID,
                      data: {
                          userID: MOCK_OPPONENT_ID,
                          equipment: MOCK_OPPONENT.equipment,
                          appearance: MOCK_OPPONENT.appearance,
                          data: MOCK_OPPONENT.data,
                          pets: MOCK_OPPONENT.pets
                      }
                  });
                  break;
              case "request_init":
                  socket.emit('message', { action: "init", from: MOCK_OPPONENT_ID, data: {} });
                  break;
          }
      } else {
          io.emit('message', { from: senderUid, ...payload });
      }
  });

  socket.on('disconnect', () => {
    const player = activePlayers.get(socket.id);
    if (player) {
        const puid = player.userID;
        activePlayers.delete(socket.id);
        io.emit('playerLeft', puid);
        io.emit('playerRemoved', puid);
        io.emit('playerList', getFormattedPlayerList());
        console.log(`[Socket] Player Disconnected: ${puid}`);
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
