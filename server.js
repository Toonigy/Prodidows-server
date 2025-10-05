// server.js - Node.js + Express server for multiplayer game worlds and Socket.IO

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io"); // Using socket.io

// Custom server-side modules
const World = require("./World"); 
const WorldSystem = require("./WorldSystem"); 

// --- Server Setup ---
const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

// Global variable to hold the WorldSystem instance so HTTP routes can access connected players.
let worldSystem;

// Middleware setup
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); // CRITICAL: Middleware to parse JSON request bodies

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ⭐ Socket.IO Server Setup ⭐
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development.
        methods: ["GET", "POST"]
    }
});

// --- API Endpoints ---

// ⭐ NEW: HTTP GET for World List ⭐
// The client expects this list to populate the world selection screen.
app.get("/game-api/v2/worlds", (req, res) => {
    console.log(`\n--- World List GET Request ---`);
    console.log(`Fetching available worlds.`);

    // Return the static list of worlds defined in World.js
    // We map it to include the current player count and fullness status from the World object.
    const worldsData = World.allWorlds.map(w => ({
        id: w.id,
        name: w.name,
        path: w.path,
        icon: w.icon,
        tag: w.tag,
        maxPlayers: w.maxPlayers,
        // If the worldSystem is managing this world, use its player count, otherwise default to 0
        playerCount: worldSystem && worldSystem.world.id === w.id ? worldSystem.world.playerCount : 0,
        full: w.full // The calculated fullness percentage
    }));

    res.status(200).json(worldsData);
    console.log(`Responded with ${worldsData.length} worlds.`);
});

// ⭐ HTTP GET for PvP and Class Leaderboards (Updated to match client's direct call) ⭐
// The client appears to be calling: /leaderboard/pvp/min/max
// We will also keep the /game-api/v1/ route for consistency, though the client is hitting the shorter one.
app.get(["/leaderboard/:type/:id?", "/game-api/v1/leaderboard/:type/:id?"], (req, res) => {
    // Note: The client's getPvpLeaderboard uses '/leaderboard/pvp/min/max'
    // This server mock handles both 'pvp' and 'class' type requests.
    const { type, id } = req.params;
    const { page = 0, limit = 30 } = req.query;

    console.log(`\n--- Leaderboard GET Request ---`);
    console.log(`Fetching ${type} leaderboard (ID: ${id || 'N/A'}) Page: ${page}, Limit: ${limit}`);

    // Generate static mock data (as done previously)
    const mockWizards = Array.from({ length: 30 }, (_, i) => ({
        // ... (Mock Wizard Data) ...
        _id: `bot_wizard_${1000 + i}`,
        userID: `bot_user_${1000 + i}`,
        // Add random score/stars for sorting
        pvpScore: 500 + Math.floor(Math.random() * 500),
        pvpStars: Math.floor(Math.random() * 5),
        name: `BotWizard ${i + 1}`,
        // ... (Other properties) ...
    }));

    let allPlayers = [...mockWizards];
    let connectedPlayersList = [];

    // Add currently connected players (if worldSystem is initialized)
    if (worldSystem) {
        connectedPlayersList = Array.from(worldSystem.connectedPlayers.values()).map(p => ({
            _id: p.wizardData.wizard._id,
            userID: p.wizardData.wizard.userID,
            pvpScore: p.wizardData.wizard.pvpScore || 1500, // Use mock score if missing
            pvpStars: p.wizardData.wizard.pvpStars || 3,    // Use mock stars if missing
            name: p.wizardData.wizard.name,
            // Add other necessary properties for the client
        }));
        allPlayers = [...connectedPlayersList, ...mockWizards];
    }

    // Simple sorting (higher score first)
    allPlayers.sort((a, b) => b.pvpScore - a.pvpScore);

    // Mock player's rank object
    // Note: req.query.userID is not always passed by the client for the leaderboard call, but we keep the logic just in case.
    const playerRank = {
        rank: allPlayers.findIndex(p => p.userID === req.query.userID) + 1 || 0,
        score: parseInt(req.query.player_score) || 0,
        stars: parseInt(req.query.player_stars) || 0
    };

    // Slice the list for the requested page/limit
    const start = parseInt(page) * parseInt(limit);
    const end = start + parseInt(limit);
    const leaderboardList = allPlayers.slice(start, end);

    // Respond with the specific nested structure the client expects
    res.status(200).json({
        leaderboard: {
            leaderboard: leaderboardList,
            playerRank: playerRank
        }
    });
});

// ⭐ NEW: HTTP POST for game events (for tracking/telemetry) ⭐
app.post("/game-event", (req, res) => {
    console.log(`\n--- Game Event POST Request ---`);
    
    // Check common keys for the user ID, prioritizing 'userID' (correct casing)
    // Client-side 'ApiClient' often includes uniqueKey/token and userID in the POST data.
    const userId = req.body.userID || req.body.userId || req.body.id || req.body.authKey || "N/A";
    const eventType = req.body.event || "Unknown";


    console.log(`[GAME EVENT] Type: ${eventType}, User: ${userId}. Event from IP: ${req.ip}`);
    console.log(`Request Body (Game Event Data):`, JSON.stringify(req.body, null, 2));
    
    // Process the event (e.g., save to DB, update user state)
    
    res.status(200).json({ status: "received", message: "Game event logged." });
    console.log(`Responded to game event POST.`);
});


// ⭐ NEW: HTTP POST for matchmaking (e.g., startMatchmaking) ⭐
app.post("/game-api/v1/matchmaking-api/begin", (req, res) => {
    console.log(`\n--- Matchmaking POST Request ---`);
    console.log(`Received POST request for /game-api/v1/matchmaking-api/begin from IP: ${req.ip}`);
    console.log(`Matchmaking Data:`, JSON.stringify(req.body, null, 2));

    // Simulate matchmaking logic here (e.g., find a match, or put player in a queue)
    // For now, just send a success response.
    res.status(200).json({ status: "success", message: "Matchmaking request received." });
    console.log(`Responded to matchmaking POST.`);
});

// ⭐ HTTP POST for Login/Authentication (Mock) ⭐
app.post("/api/user/authenticate", (req, res) => {
    // Mock user authentication
    const { username, password, authMethod } = req.body;
    
    // Simulate successful login
    // Using a random UUID ensures a unique ID on every login, simulating a real system.
    const mockUserId = `user_${authMethod || 'mock'}-${crypto.randomUUID()}`;
    const mockToken = `auth_token_${crypto.randomUUID()}`;

    console.log(`\n--- Auth POST Request ---`);
    console.log(`Attempting login for user: ${username || 'N/A'} via method: ${authMethod || 'Basic'}`);
    
    if (authMethod === 'Google') {
        console.log(`[SERVER][LOG] ⭐ User successfully logged in via Google. Generated UserID: ${mockUserId}`);
    } else {
        console.log(`[SERVER][LOG] User successfully logged in. Generated UserID: ${mockUserId}`);
    }

    res.status(200).json({ 
        status: "success", 
        userID: mockUserId, 
        uniqueKey: mockToken, 
        message: "Authentication successful." 
    });
});

// --- Server Startup ---
server.listen(PORT, () => {
    console.log(`\n--- Server Startup ---`);
    console.log(`✅ Server is listening on port ${PORT}...`);
    console.log(`🌐 HTTP endpoints for leaderboard, game events, and matchmaking are online.`);

    // Initialize the World and WorldSystem
    const fireplaneWorld = World.allWorlds.find(w => w.id === "fireplane");
    if (!fireplaneWorld) {
        throw new Error("Fireplane world definition not found!");
    }
    worldSystem = new WorldSystem(fireplaneWorld); // Assign to global variable

    console.log(`🚀 Socket.IO server is online and ready for game world: ${fireplaneWorld.name}`);
    console.log(`Current Player Count: ${worldSystem.world.playerCount}`);

    // --- Start Socket.IO handling for the world ---
    // FIX: Change call to directly attach listener to the namespace using the path
    const worldNamespace = io.of(fireplaneWorld.path);
    worldNamespace.on('connection', (socket) => {
        worldSystem.handleConnection(socket);
    });
});
