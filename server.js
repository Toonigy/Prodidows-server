/**
 * ============================================================================
 * Old Prodigy Game (v1.50.0) Multiplayer & REST API Server
 * ============================================================================
 *
 * Requirements:
 *   npm install express socket.io cors body-parser
 *
 * Usage:
 *   node server.js
 *
 * Description:
 *   This server handles both Socket.IO connections for old Prodigy clients
 *   and basic REST endpoints for login, player profiles, dynamic world lists,
 *   and matchmaking status check.
 */

const express = require("express");
const http = require("http");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { Server } = require("socket.io");

// ----------------------------------------------------------------------------
// Express & Server Configuration
// ----------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from both the root directory and the /public directory
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

// Fallback GET route to serve index.html if request is made to the root "/" route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"), (err) => {
    if (err) {
      // Fallback if index.html is located in the root directory instead of /public
      res.sendFile(path.join(__dirname, "index.html"));
    }
  });
});

const server = http.createServer(app);

// Initialize Socket.IO with standard compatibility configurations
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  allowEIO3: true // Backwards compatibility for legacy Socket.IO client versions
});

// ----------------------------------------------------------------------------
// In-Memory Data Store (State Management)
// ----------------------------------------------------------------------------
const state = {
  // Active players organized by world and zone: state.players[socket.id]
  players: new Map(),

  // World list configuration
  worlds: [
    { id: 1, name: "Harmony", status: "online", population: 0, maxPopulation: 100 },
    { id: 2, name: "Lamplight", status: "online", population: 0, maxPopulation: 100 },
    { id: 3, name: "Shiverchill", status: "online", population: 0, maxPopulation: 100 }
  ]
};

// ----------------------------------------------------------------------------
// Helper Utility Functions
// ----------------------------------------------------------------------------

/**
 * Returns room key derived from user world and zone parameters.
 */
function getRoomKey(worldId, zone) {
  return `world_${worldId || 1}_zone_${zone || "lamplight-b2"}`;
}

/**
 * Sanitizes player payload data for client broadcasting.
 */
function formatPlayerData(playerData) {
  return {
    userId: playerData.userId,
    userToken: playerData.userToken,
    zone: playerData.zone,
    worldId: playerData.worldId,
    x: playerData.x || 0,
    y: playerData.y || 0,
    character: playerData.character || {}
  };
}

// ----------------------------------------------------------------------------
// Socket.IO Connection & Real-Time Event Handlers
// ----------------------------------------------------------------------------

io.use((socket, next) => {
  // Parse legacy query string properties from connection handshake
  const query = socket.handshake.query;
  socket.userId = query.userId || `guest_${Math.random().toString(36).substring(2, 9)}`;
  socket.worldId = query.worldId || 1;
  socket.userToken = query.userToken || "";
  socket.zone = query.zone || "lamplight-b2";

  next();
});

io.on("connection", (socket) => {
  console.log(`[Socket] Player connected: ${socket.userId} (Socket ID: ${socket.id})`);
  console.log(`[Socket] Initial context -> World: ${socket.worldId}, Zone: ${socket.zone}`);

  const roomKey = getRoomKey(socket.worldId, socket.zone);

  // Store player in-memory
  const playerObj = {
    socketId: socket.id,
    userId: socket.userId,
    userToken: socket.userToken,
    worldId: socket.worldId,
    zone: socket.zone,
    x: 400,
    y: 300,
    character: {}
  };
  state.players.set(socket.id, playerObj);

  // Join designated Socket.IO room for localized zone broadcasting
  socket.join(roomKey);

  // 1. Notify current socket that connection succeeded
  // FIX: Socket.IO reserves "connect" for internal framework events. Emitting "connected" instead prevents the crash.
  socket.emit("connected", { socketId: socket.id, status: "success" });

  // 2. Notify other players in the same zone that a player joined
  socket.to(roomKey).emit("playerJoined", socket.userId);

  // 3. Send existing list of players in this zone to the newly connected player
  const playersInRoom = [];
  for (const [id, p] of state.players.entries()) {
    if (p.worldId === socket.worldId && p.zone === socket.zone && id !== socket.id) {
      playersInRoom.push(formatPlayerData(p));
    }
  }
  socket.emit("playerList", playersInRoom);

  // --------------------------------------------------------------------------
  // Message / Position / State Synchronization Event Handlers
  // --------------------------------------------------------------------------

  /**
   * Generic relay for player movement, chat messages, or game actions.
   */
  socket.on("message", (data) => {
    // Ensure data is defined before broadcasting to the zone
    const payload = data || {};
    socket.to(roomKey).emit("message", payload);
  });

  /**
   * Handles player zone switching (e.g., walking through a portal or doorway).
   */
  socket.on("switchZone", (newZone) => {
    try {
      const p = state.players.get(socket.id);
      if (!p) return;

      const oldRoomKey = getRoomKey(p.worldId, p.zone);

      // Notify occupants of previous room of exit
      socket.to(oldRoomKey).emit("playerLeft", socket.userId);
      socket.leave(oldRoomKey);

      // Update zone details
      p.zone = newZone;
      socket.zone = newZone;

      const newRoomKey = getRoomKey(p.worldId, p.zone);
      socket.join(newRoomKey);

      // Notify occupants of new room of entry
      socket.to(newRoomKey).emit("playerJoined", socket.userId);

      // Send updated room player list to switching socket
      const roomPlayers = [];
      for (const [id, player] of state.players.entries()) {
        if (player.worldId === p.worldId && player.zone === newZone && id !== socket.id) {
          roomPlayers.push(formatPlayerData(player));
        }
      }
      socket.emit("playerList", roomPlayers);

      console.log(`[Socket] Player ${socket.userId} switched zone to: ${newZone}`);
    } catch (err) {
      console.error("[Socket] Error handling switchZone event:", err);
    }
  });

  // --------------------------------------------------------------------------
  // Disconnect Handler
  // --------------------------------------------------------------------------

  socket.on("disconnect", () => {
    const p = state.players.get(socket.id);
    if (p) {
      const currentRoom = getRoomKey(p.worldId, p.zone);
      socket.to(currentRoom).emit("playerLeft", socket.userId);
      state.players.delete(socket.id);
    }
    console.log(`[Socket] Player disconnected: ${socket.userId}`);
  });
});

// ----------------------------------------------------------------------------
// REST API Endpoints (Compatible with legacy ApiClient requests)
// ----------------------------------------------------------------------------

/**
 * Health / Server status check endpoint
 */
app.get("/status", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: Date.now() });
});

/**
 * World List endpoint (v2/worlds)
 */
app.get(["/v2/worlds", "/game-api/v2/worlds"], (req, res) => {
  // Dynamically count active players per world
  const updatedWorlds = state.worlds.map((w) => {
    let count = 0;
    for (const [, player] of state.players) {
      if (player.worldId === w.id) count++;
    }
    return { ...w, population: count };
  });

  res.status(200).json(updatedWorlds);
});

const matchmakingQueue = [];
const activeMatches = new Map();

app.post([
  "/matchmaking-api/begin",
  "/matchmaking/begin",
  "/v1/matchmaking/begin"
], (req, res) => {
  const body = req.body || {};
  
  // Robust userID extraction handling various client payload formats
  let userID = body.userID || body.user_id || body.id || body.user;
  
  // If payload is nested within a data/player object
  if (!userID && body.playerData) {
    userID = body.playerData.userID || body.playerData.user_id || body.playerData.id;
  }
  if (!userID && body.data) {
    userID = body.data.userID || body.data.user_id || body.data.id;
  }

  // Fallback: extract from query string if missing from body
  if (!userID && req.query) {
    userID = req.query.userID || req.query.user_id || req.query.id;
  }

  // If still missing, return error
  if (!userID) {
    console.warn("[Matchmaking] Received request without valid userID:", req.body);
    return res.status(400).json({ status: "error", message: "Missing userID parameter" });
  }

  const level = body.level || 10;
  const score = body.score || body.arenaScore || 1000;
  const playerData = body.playerData || body.data || body;

  // Check if player is already matched in activeMatches
  const playerIDStr = String(userID);
  for (const [mId, match] of activeMatches.entries()) {
    if (String(match.player1.userID) === playerIDStr || String(match.player2.userID) === playerIDStr) {
      const opponent = String(match.player1.userID) === playerIDStr ? match.player2 : match.player1;
      return res.status(200).json({
        status: "success",
        matched: true,
        matchID: mId,
        opponent: opponent.playerData || opponent
      });
    }
  }

  // Remove existing queue entry if retrying
  const existingIdx = matchmakingQueue.findIndex(p => String(p.userID) === playerIDStr);
  if (existingIdx !== -1) {
    matchmakingQueue.splice(existingIdx, 1);
  }

  // Check if another wizard is waiting in queue
  if (matchmakingQueue.length > 0) {
    const opponent = matchmakingQueue.shift();
    const matchID = `match_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    const currentPlayerObj = {
      userID: playerIDStr,
      level,
      score,
      playerData: playerData || { userID: playerIDStr, name: `Wizard ${playerIDStr.substring(0, 4)}` }
    };

    const matchPayload = {
      matchID: matchID,
      playerA: {
        id: opponent.userID,
        data: opponent.playerData
      },
      playerB: {
        id: currentPlayerObj.userID,
        data: currentPlayerObj.playerData
      }
    };

    activeMatches.set(matchID, {
      player1: opponent,
      player2: currentPlayerObj,
      payload: matchPayload,
      createdAt: Date.now()
    });

    return res.status(200).json({
      status: "success",
      matched: true,
      matchID: matchID,
      arenaEvent: matchPayload,
      opponent: opponent.playerData || opponent
    });
  }

  // Enqueue current wizard
  matchmakingQueue.push({
    userID: playerIDStr,
    level,
    score,
    playerData: playerData || { userID: playerIDStr, name: `Wizard ${playerIDStr.substring(0, 4)}` },
    joinedAt: Date.now()
  });

  return res.status(200).json({
    status: "success",
    matched: false,
    message: "Searching for opponents..."
  });
});

/**
 * Helper function to normalize player profile data into standard format
 */
function normalizeUserData(userId, rawData) {
  let data = rawData || {};
  
  // If data is a double-encoded JSON string, parse it
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (e) {}
  }

  // 1. Extract Appearance Data
  let rawApp = data.appearancedata || data.appearance || {};
  if (typeof rawApp === "string") {
    try { rawApp = JSON.parse(rawApp); } catch (e) {}
  }
  // Double parse check in case appearancedata is wrapped twice in JSON strings
  if (typeof rawApp === "string") {
    try { rawApp = JSON.parse(rawApp); } catch (e) {}
  }

  // 2. Extract Player Stats & Data (Single declaration)
  let rawDataObj = data.data || {};
  if (typeof rawDataObj === "string") {
    try { rawDataObj = JSON.parse(rawDataObj); } catch (e) {}
  }

  // Extract character name directly from all possible sub-structures
  let realName = null;
  if (rawApp && typeof rawApp === "object" && rawApp.name) {
    realName = rawApp.name;
  } else if (rawDataObj && typeof rawDataObj === "object" && rawDataObj.name) {
    realName = rawDataObj.name;
  } else if (typeof data === "object" && data.name) {
    realName = data.name;
  } else if (rawApp && typeof rawApp === "object" && rawApp.nick) {
    realName = rawApp.nick;
  }

  const playerName = (realName && typeof realName === "string" && realName.trim().length > 0) 
    ? realName.trim() 
    : `Wizard ${userId.substring(0, 4)}`;

  const appearance = {
    name: playerName,
    hair: {
      color: (rawApp && rawApp.hairColor) || (rawApp && rawApp.hair ? rawApp.hair.color : 1) || 1,
      style: (rawApp && rawApp.hairStyle) || (rawApp && rawApp.hair ? rawApp.hair.style : 1) || 1
    },
    skinColor: (rawApp && rawApp.skinColor) || 1,
    eyeColor: (rawApp && rawApp.eyeColor) || 1,
    gender: (rawApp && rawApp.gender) || "male",
    face: (rawApp && rawApp.face) || 1,
    hairStyle: (rawApp && rawApp.hairStyle) || 1,
    hairColor: (rawApp && rawApp.hairColor) || 1
  };

  // 3. Extract Equipment Data
  let rawEq = data.equipmentdata || data.equipment || {};
  if (typeof rawEq === "string") {
    try { rawEq = JSON.parse(rawEq); } catch (e) {}
  }
  const equipment = {
    hat: rawEq.hat || 1,
    outfit: rawEq.outfit || 1,
    weapon: rawEq.weapon || 1,
    boots: rawEq.boots || 1,
    iconData: rawEq.iconData || [
      { type: "hat", ID: rawEq.hat || 1 },
      { type: "outfit", ID: rawEq.outfit || 1 },
      { type: "weapon", ID: rawEq.weapon || 1 },
      { type: "boots", ID: rawEq.boots || 1 }
    ]
  };

  const arenaScore = (rawDataObj && rawDataObj.arenaScore !== undefined) ? rawDataObj.arenaScore : 1000;
  const stars = (rawDataObj && rawDataObj.stars !== undefined) ? rawDataObj.stars : 50;
  const level = (rawDataObj && rawDataObj.level !== undefined) ? rawDataObj.level : 10;

  // Combine rawDataObj into playerData ensuring name is explicitly defined
  const playerData = Object.assign({}, rawDataObj, {
    level: level,
    stars: stars,
    arenaScore: arenaScore,
    name: playerName,
    iconData: [
      { type: "hat", ID: equipment.hat },
      { type: "outfit", ID: equipment.outfit },
      { type: "weapon", ID: equipment.weapon },
      { type: "boots", ID: equipment.boots }
    ]
  });

  const isMember = (data.metadata && data.metadata.isMember !== undefined)
    ? String(data.metadata.isMember)
    : (data.isMember !== undefined ? String(data.isMember) : "true");

  // Create a deterministic numeric ID from string UID so parseInt(h) matches in client
  let numericId = 0;
  for (let i = 0; i < userId.length; i++) {
    numericId = (numericId * 31 + userId.charCodeAt(i)) >>> 0;
  }
  numericId = (numericId % 9000000) + 100000;

  return {
    userID: numericId,
    originalID: userId,
    name: playerName,
    isMember: isMember,
    appearance: JSON.stringify(appearance),
    equipment: JSON.stringify(equipment),
    data: JSON.stringify(playerData),
    iconData: playerData.iconData
  };
}
/**
 * Matchmaking Find API Endpoint (/matchmaking-api/find or /v1/matchmaking/find)
 */
const pvpQueue = [];

app.get([
  "/pvp/:min/:max",
  "/leaderboard/pvp/:min/:max",
  "/leaderboard-api/pvp/:min/:max"
], async (req, res) => {
  const FIREBASE_URL = "https://pdesys-8e93d-default-rtdb.firebaseio.com";
  const FIREBASE_SECRET = process.env.FIREBASE_SECRET || ""; 
  const authQuery = FIREBASE_SECRET ? `?auth=${FIREBASE_SECRET}` : "";

  const pathsToCheck = ["characters", "users", "user_profiles"];

  try {
    let allUsers = null;

    for (const path of pathsToCheck) {
      const fbRes = await fetch(`${FIREBASE_URL}/${path}.json${authQuery}`);
      if (fbRes.ok) {
        const data = await fbRes.json();
        if (data && Object.keys(data).length > 0) {
          allUsers = data;
          break;
        }
      }
    }

    if (allUsers) {
      const playerList = Object.entries(allUsers).map(([id, userData], index) => {
        const normalized = normalizeUserData(id, userData);
        const parsedData = JSON.parse(normalized.data || "{}");
        
        return {
          userID: normalized.userID,
          originalID: id,
          place: index + 1,
          name: normalized.name,
          stars: parsedData.stars || 0,
          level: parsedData.level || 10,
          arenaScore: parsedData.arenaScore || 1000,
          data: normalized.data,
          appearance: normalized.appearance,
          equipment: normalized.equipment,
          isMember: normalized.isMember === "true" || normalized.isMember === true,
          iconData: normalized.iconData
        };
      });

      // Sort descending by arenaScore
      playerList.sort((a, b) => (b.arenaScore || 0) - (a.arenaScore || 0));

      // Re-assign 1-based ranks after sorting
      playerList.forEach((player, i) => {
        player.place = i + 1;
      });

      return res.status(200).json({
        status: "success",
        player_list: playerList,
        leaderboard: playerList,
        userRank: 1
      });
    }
  } catch (err) {
    console.error("[Firebase] Error fetching PvP leaderboard:", err.message);
  }

  return res.status(200).json({
    status: "success",
    player_list: [],
    leaderboard: [],
    userRank: 1
  });
});


app.post(["/matchmaking-api/find", "/v1/matchmaking/find"], (req, res) => {
  const { userID, level, arenaScore, data, appearance, equipment } = req.body || {};
  console.log(`[PVP Arena] Matchmaking request from User: ${userID || "unknown"}, Level: ${level}, Score: ${arenaScore}`);

  // Check if player is already in queue
  const existingIndex = pvpQueue.findIndex(p => p.userID === userID);
  if (existingIndex !== -1) {
    pvpQueue.splice(existingIndex, 1);
  }

  // If another real wizard is waiting in queue, pair them up!
  if (pvpQueue.length > 0) {
    const opponent = pvpQueue.shift();
    const matchID = "match_" + Date.now();

    console.log(`[PVP Arena] Match Created! ${userID} VS ${opponent.userID}`);

    // Fulfill opponent's pending HTTP response
    opponent.res.status(200).json({
      status: "success",
      matchID: matchID,
      opponent: {
        userID: userID,
        name: data?.name || "Wizard",
        level: level || 10,
        arenaScore: arenaScore || 1000,
        equipment: equipment || { hat: 1, outfit: 1, weapon: 1 },
        appearance: appearance || { hair: 1, hairColor: 1 },
        isBot: false
      }
    });

    // Fulfill current player's response
    return res.status(200).json({
      status: "success",
      matchID: matchID,
      opponent: {
        userID: opponent.userID,
        name: opponent.data?.name || "Wizard",
        level: opponent.level || 10,
        arenaScore: opponent.arenaScore || 1000,
        equipment: opponent.equipment || { hat: 1, outfit: 1, weapon: 1 },
        appearance: opponent.appearance || { hair: 1, hairColor: 1 },
        isBot: false
      }
    });
  }

  // No player waiting yet: add to queue and wait (or fallback to bot after timeout)
  const queueItem = {
    userID,
    level,
    arenaScore,
    data,
    appearance,
    equipment,
    res,
    timestamp: Date.now()
  };
  pvpQueue.push(queueItem);

  // If no 2nd player joins within 6 seconds, return bot opponent
  setTimeout(() => {
    const index = pvpQueue.indexOf(queueItem);
    if (index !== -1) {
      pvpQueue.splice(index, 1);
      console.log(`[PVP Arena] Matchmaking timeout for ${userID}, returning Bot opponent.`);
      if (!res.headersSent) {
        res.status(200).json({
          status: "success",
          opponent: {
            userID: "bot_opponent_101",
            name: "Arena Challenger",
            level: level || 10,
            arenaScore: arenaScore || 1000,
            equipment: { hat: 1, outfit: 1, weapon: 1 },
            appearance: { hair: 1, hairColor: 1 },
            isBot: true
          }
        });
      }
    }
  }, 6000);
});

/**
 * Matchmaking End API Endpoint (/matchmaking-api/end or /v1/matchmaking/end)
 */
app.post([
  "/matchmaking-api/end",
  "/matchmaking/end",
  "/v1/matchmaking/end"
], (req, res) => {
  const { userID, matchID } = req.body || {};
  if (userID) {
    const idx = matchmakingQueue.findIndex(p => String(p.userID) === String(userID));
    if (idx !== -1) matchmakingQueue.splice(idx, 1);
  }
  if (matchID && activeMatches.has(matchID)) {
    activeMatches.delete(matchID);
  }
  return res.status(200).json({ status: "success" });
});

/**
 * Game Telemetry & Event Tracking Endpoint (/v1/game-event)
 */
app.post(["/v1/game-event", "/game-api/v1/game-event", "/events-api/v1/game-event"], (req, res) => {
  const { userID, event } = req.body || {};
  console.log(`[Telemetry] User ${userID || "unknown"} tracked event: ${event || "unspecified"}`);
  res.status(200).json({ status: "success" });
});

/**
 * Legacy Login Endpoint (game-api/v1/login/:type or /login/:type)
 */
app.post(["/login/:type", "/game-api/v1/login/:type"], (req, res) => {
  const { username, password, googleId } = req.body;
  const loginType = req.params.type;

  console.log(`[API] Login request type: ${loginType}, User: ${username || googleId}`);

  // Mock authentication logic (Accepts standard or Google logins)
  const fakeUserId = googleId || username || "1001";
  const fakeAuthToken = "token_" + Math.random().toString(36).substring(2, 12);

  res.status(200).json({
    userID: fakeUserId,
    authToken: fakeAuthToken,
    name: username || "Google Wizard",
    status: "success"
  });
});

/**
 * Endpoint for Google Auth validation used by OldProdigy wrapper
 */
app.post(["/login/google", "/game-api/v1/login/google"], (req, res) => {
  const { uid, email, name } = req.body;
  console.log(`[API] Google authentication received for UID: ${uid}`);

  res.status(200).json({
    userID: uid || "google_user_" + Date.now(),
    authToken: "token_google_" + Math.random().toString(36).substring(2, 12),
    name: name || "Google Wizard",
    status: "success"
  });
});
app.get(["/v1/users/:id", "/game-api/v1/users/:id"], async (req, res) => {
  const rawIdParam = req.params.id;
  const requestedIDs = rawIdParam.split(",");

  const FIREBASE_URL = "https://pdesys-8e93d-default-rtdb.firebaseio.com";
  const FIREBASE_SECRET = process.env.FIREBASE_SECRET || "";
  const authQuery = FIREBASE_SECRET ? `?auth=${FIREBASE_SECRET}` : "";

  try {
    const pathsToCheck = ["characters", "users", "user_profiles"];
    let dbData = null;

    for (const path of pathsToCheck) {
      const fbRes = await fetch(`${FIREBASE_URL}/${path}.json${authQuery}`);
      if (fbRes.ok) {
        const data = await fbRes.json();
        if (data && Object.keys(data).length > 0) {
          dbData = data;
          break;
        }
      }
    }

    if (dbData) {
      const result = {};

      for (const reqId of requestedIDs) {
        // Find entry in database either by direct key or by numeric hashing match
        let foundEntry = dbData[reqId];
        let matchedKey = reqId;

        if (!foundEntry) {
          for (const [key, val] of Object.entries(dbData)) {
            const norm = normalizeUserData(key, val);
            if (String(norm.userID) === String(reqId) || key === reqId) {
              foundEntry = val;
              matchedKey = key;
              break;
            }
          }
        }

        if (foundEntry) {
          const normalized = normalizeUserData(matchedKey, foundEntry);
          result[reqId] = {
            appearance: normalized.appearance,
            equipment: normalized.equipment,
            data: normalized.data,
            isMember: normalized.isMember
          };
        }
      }

      return res.status(200).json(result);
    }
  } catch (err) {
    console.error("[Firebase] Error fetching user data:", err.message);
  }

  return res.status(200).json({});
});

/**
 * Game Client Data Endpoints & Static Fallbacks
 */
app.get(["/v1/users/:id", "/game-api/v1/users/:id"], async (req, res) => {
  const userIdParam = req.params.id;
  const FIREBASE_URL = "https://pdesys-8e93d-default-rtdb.firebaseio.com";

  // Handle comma-separated batch list (getCharData)
  if (userIdParam && userIdParam.includes(",")) {
    const userIds = userIdParam.split(",");
    const responseData = {};

    await Promise.all(
      userIds.map(async (id) => {
        const cleanId = id.trim();
        try {
          const fbRes = await fetch(`${FIREBASE_URL}/users/${cleanId}.json`);
          if (fbRes.ok) {
            const rawData = await fbRes.json();
            responseData[cleanId] = normalizeUserData(cleanId, rawData);
          } else {
            responseData[cleanId] = normalizeUserData(cleanId, null);
          }
        } catch (err) {
          console.error(`[Firebase] Error fetching user ${cleanId}:`, err.message);
          responseData[cleanId] = normalizeUserData(cleanId, null);
        }
      })
    );

    return res.status(200).json(responseData);
  }

  // Handle single user fetch
  try {
    const fbRes = await fetch(`${FIREBASE_URL}/users/${userIdParam}.json`);
    if (fbRes.ok) {
      const rawData = await fbRes.json();
      return res.status(200).json(normalizeUserData(userIdParam, rawData));
    }
  } catch (err) {
    console.error(`[Firebase] Error fetching single user ${userIdParam}:`, err.message);
  }

  // Fallback if user doesn't exist in Firebase or request failed
  return res.status(200).json(normalizeUserData(userIdParam, null));
});

// ----------------------------------------------------------------------------
// Start Server
// ----------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Prodigy Game Multiplayer Server running on port ${PORT}`);
  console.log(` Socket.IO & REST endpoints are active.`);
  console.log(`=======================================================`);
});
