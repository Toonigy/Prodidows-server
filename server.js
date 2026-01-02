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

// Firebase-style UID for the primary player
const MOCK_USER_ID = "firebase_user_12345"; 
const MOCK_TOKEN = "google-auth-token-placeholder";

// Global state for worlds and players
const activePlayers = new Map();

/**
 * OPPONENT DATA TEMPLATE
 * Updated with more detailed pet data for the battle engine
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
            order: 0
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

app.get('/game-api/v2/session', (req, res) => {
  res.json({ 
    success: true, 
    userID: MOCK_USER_ID, 
    token: MOCK_TOKEN, 
    name: "Google User",
    firebaseConfig: firebaseConfig
  });
});

const characterResponse = (req, res) => {
  const uid = String(req.params.userId || MOCK_USER_ID);
  res.json({
    success: true,
    data: {
        userID: uid,
        name: "Prodigy Player",
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
 * ZONE SWITCHING HANDLER
 */
app.post(['/game-api/v1/switchZones', '/game-api/v2/switchZones'], (req, res) => {
    const { zoneName } = req.body;
    console.log(`[API] Player switching zone to: ${zoneName}`);
    res.json({ success: true });
});

app.get(['/game-api/v1/friend/:userId/countFriendRequest', '/friend-api/v1/friend/:userId/countFriendRequest'], (req, res) => {
  res.json({ success: true, count: 0, pendingRequests: [], invites: [] });
});

/**
 * MATCHMAKING / CHALLENGER HANDLER
 */
app.get(['/game-api/v1/matchmake', '/game-api/v2/matchmake'], (req, res) => {
    console.log(`[Matchmaker] Finding challenger for user...`);
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
 * WILDCARD HANDLER / ERROR CATCHER
 */
app.use((req, res, next) => {
    if (req.url.includes('[object') || req.url.includes('undefined')) {
        console.warn(`[Server] Intercepted malformed request: ${req.url}`);
        return res.json({ success: true, data: {} });
    }
    next();
});

app.all(/^\/undefinedv\d\/.*/, (req, res) => {
    res.json({ success: true });
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
        name: data?.name || "Other Player",
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

    socket.emit('ready', { success: true });
    
    io.emit('playerList', getFormattedPlayerList());
    socket.broadcast.emit('playerJoined', uid);
  });

  /**
   * PVP LOADING & BATTLE SYNC
   * Handlers for message format required by PVPLoading class
   */
  socket.on('message', (payload) => {
      if (String(payload.target) === MOCK_OPPONENT_ID) {
          console.log(`[PVP] Handling ${payload.action} for bot battle`);
          
          switch (payload.action) {
              case "request_data":
                  // Engine needs 'from' and 'action' inside the response
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
                  socket.emit('message', {
                      action: "init",
                      from: MOCK_OPPONENT_ID,
                      data: {}
                  });
                  break;
                  
              case "switch_zone":
                  socket.emit('message', {
                      action: "zone_switched",
                      from: MOCK_OPPONENT_ID,
                      data: { zone: payload.data.zoneName }
                  });
                  break;
          }
      } else {
          console.log(`[Message] From ${uid} to ${payload.target}:`, payload.text || payload.action);
          io.emit('message', { from: uid, ...payload });
      }
  });

  socket.on('battleLog', (log) => {
      console.log(`[Battle] Log from ${uid}:`, log);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] User ${uid} disconnected`);
    activePlayers.delete(socket.id);
    io.emit('playerLeft', uid);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
