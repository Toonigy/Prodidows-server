// server.js - Node.js + Express server for multiplayer game worlds and Socket.IO

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io"); // Using socket.io

// Custom server-side modules
const World = require("./World");
const WorldSystem = require("./WorldSystem");

const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); // Middleware to parse JSON request bodies

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ⭐ Socket.IO Server Setup ⭐
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development. Restrict in production.
        methods: ["GET", "POST"]
    }
});

// Helper function to generate mock leaderboard data (for illustration, not directly used by world list)
function generateMockPvpLeaderboard(minRank, maxRank, currentPlayerID, limit) {
    const leaderboard = [];
    const totalPlayers = 1000; // Simulate a larger pool of players

    // Add a mix of players
    for (let i = 0; i < limit; i++) {
        const playerID = `player_${10000 + i}`;
        const rank = minRank + i;
        const score = 10000 - i * 10;
        leaderboard.push({ rank, score, playerID });
    }

    // Ensure current player is included if not already (and if a real ID is provided)
    if (currentPlayerID && !leaderboard.some(p => p.playerID === currentPlayerID)) {
        // Add current player with a random rank/score within the range
        const playerRank = Math.floor(Math.random() * (maxRank - minRank + 1)) + minRank;
        const playerScore = Math.floor(Math.random() * 5000) + 5000;
        leaderboard.push({ rank: playerRank, score: playerScore, playerID: currentPlayerID });
    }

    // Sort by score (descending) then rank (ascending)
    leaderboard.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return a.rank - b.rank;
    });

    return leaderboard.slice(0, limit); // Ensure limit is respected after adding current player
}


// --- HTTP Endpoints for API Calls ---

// ⭐ NEW: HTTP GET endpoint for World List ⭐
// This endpoint responds to client requests for the list of available game worlds.
app.get("/v2/world-list", (req, res) => {
    console.log(`\n--- World List GET Request ---`);
    console.log(`Received GET request for /game-api/v1/world-list from IP: ${req.ip}`);

    // Get the simplified list of all worlds
    const simplifiedWorlds = World.allWorlds.map(world => world.toSimplifiedObject());

    // Send the simplified world list as a JSON response
    res.status(200).json(simplifiedWorlds);
    console.log(`Responded to world list GET with ${simplifiedWorlds.length} worlds.`);
});

// ⭐ NEW: HTTP POST for game events (e.g., /game-api/v1/log-event) ⭐
app.post("/game-api/v1/log-event", (req, res) => {
    console.log(`\n--- Game Event POST Request ---`);
    console.log(`Received POST request for /game-api/v1/log-event from IP: ${req.ip}`);
    console.log(`Request Body (Game Event Data):`, JSON.stringify(req.body, null, 2));
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

// --- Socket.IO Connection Handling ---
// A map to store WorldSystem instances, keyed by world path
const worldSystems = {};

// Initialize a WorldSystem for each world defined in World.allWorlds
World.allWorlds.forEach(world => {
    const system = new WorldSystem(world);
    worldSystems[world.path] = system; // Store by path for easy lookup
});

io.on("connection", (socket) => {
    const requestPath = socket.handshake.url; // Get the path the client connected to
    const worldSystem = worldSystems[requestPath];

    if (worldSystem) {
        // Delegate the connection handling to the appropriate WorldSystem
        worldSystem.handleConnection(socket);
    } else {
        console.warn(`\n--- Socket.IO Warning ---`);
        console.warn(`No WorldSystem found for path: ${requestPath}. Disconnecting socket.`);
        socket.disconnect(true); // Disconnect if no matching world system
        console.log(`-------------------------\n`);
    }
});


// --- Server Startup ---
server.listen(PORT, () => {
    console.log(`\n--- Server Startup ---`);
    console.log(`✅ Server is listening on port ${PORT}...`);
    console.log(`🌐 HTTP endpoints for world list, status, game events, and matchmaking are online.`);
    console.log(`🚀 Socket.IO server is online and ready for game world connections.`);
    console.log(`Defined worlds:`);
    World.allWorlds.forEach(world => {
        console.log(`  - ID: ${world.id}, Name: "${world.name}", Path: "${world.path}"`);
    });
    console.log(`-----------------------\n`);
});
