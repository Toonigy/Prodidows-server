const express = require("express");
const http = require("http");
const cors = require("cors"); // Re-add cors for Socket.IO setup
const path = require("path");
const World = require("./World"); // Import the World class.
const WorldSystem = require("./WorldSystem"); // Import WorldSystem

const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

app.use(cors()); // Use cors middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); // Middleware to parse JSON request bodies

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ⭐ Socket.IO Server Setup ⭐
// Re-adding Socket.IO setup as your WorldSystem and client expect it.
const { Server } = require("socket.io"); 
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development. Restrict in production.
        methods: ["GET", "POST"]
    }
});
console.warn("Socket.IO server setup complete. Using HTTP for now.");


// --- HTTP Endpoints for API Calls ---

// ⭐ FIX: Re-adding HTTP GET endpoint for World List at /v2/worlds ⭐
// This endpoint directly serves the world list, addressing the client's hardcoded request.
app.get("/v2/worlds", (req, res) => {
    console.log(`\n--- World List GET Request (via /v2/worlds) ---`);
    console.log(`Received GET request for /v2/worlds from IP: ${req.ip}`);

    // ⭐ FIX: Filter out non-World instances before calling toSimplifiedObject() ⭐
    const simplifiedWorlds = World.allWorlds
        .filter(world => world instanceof World && typeof world.toSimplifiedObject === 'function')
        .map(world => world.toSimplifiedObject());

    // Send the simplified world list as a JSON response
    res.status(200).json(simplifiedWorlds);
    console.log(`Responded to /v2/worlds GET with ${simplifiedWorlds.length} worlds.`);
});


// ⭐ Re-added: HTTP GET endpoint for World List (kept for backward compatibility if needed) ⭐
app.get("/game-api/v1/world-list", (req, res) => {
    console.log(`\n--- World List GET Request (via /game-api/v1/world-list) ---`);
    console.log(`Received GET request for /game-api/v1/world-list from IP: ${req.ip}`);

    // Get the simplified list of all worlds
    const simplifiedWorlds = World.allWorlds.map(world => world.toSimplifiedObject());

    // Send the simplified world list as a JSON response
    res.status(200).json(simplifiedWorlds);
    console.log(`Responded to world list GET with ${simplifiedWorlds.length} worlds.`);
});

// ⭐ Re-added: HTTP POST for game events (e.g., /game-api/v1/log-event) ⭐
app.post("/game-api/v1/log-event", (req, res) => {
    console.log(`\n--- Game Event POST Request ---`);
    console.log(`Received POST request for /game-api/v1/log-event from IP: ${req.ip}`);
    console.log(`Request Body (Game Event Data):`, JSON.stringify(req.body, null, 2));
    res.status(200).json({ status: "received", message: "Game event logged." });
    console.log(`Responded to game event POST.`);
});

// ⭐ Re-added: HTTP POST for matchmaking (e.g., startMatchmaking) ⭐
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
