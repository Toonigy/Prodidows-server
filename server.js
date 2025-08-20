const express = require("express");
const http = require("http");
// Removed: const https = require("https"); // Render handles HTTPS termination at load balancer
// Removed: const fs = require("fs");     // Not needed for local HTTPS setup on Render
const cors = require("cors");
const path = require("path");
const World = require("./World");
const WorldSystem = require("./WorldSystem");

const app = express();
// ⭐ IMPORTANT: Listen on process.env.PORT for Render deployments ⭐
const PORT = process.env.PORT || 10000;

// ⭐ Create an HTTP server (Render will handle HTTPS/WSS forwarding) ⭐
let server = http.createServer(app);
console.log("Server is running in HTTP-only mode (optimized for Render deployment).");


app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/", (req, res) => {
    // This route is typically not hit on Render if serving static assets separately
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ⭐ Socket.IO Server Setup ⭐
// The Socket.IO server is now attached to the HTTP server.
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development. Restrict in production.
        methods: ["GET", "POST"]
    }
});
console.log("Socket.IO server setup complete.");


// --- HTTP Endpoints for API Calls ---

// HTTP GET endpoint for World List at /game-api/v2/worlds
app.get("/game-api/v2/worlds", (req, res) => {
    console.log(`\n--- World List GET Request (via /game-api/v2/worlds) ---`);
    console.log(`Received GET request for /game-api/v2/worlds from IP: ${req.ip}`);
    const simplifiedWorlds = World.allWorlds.map(world => ({
        name: world.name || 'Unnamed World', path: world.path || '/unknown',
        icon: (world.meta && world.meta.tag) ? world.meta.tag : 'default',
        full: typeof world.currentPlayers === 'number' ? world.currentPlayers : 0,
        currentPlayers: typeof world.currentPlayers === 'number' ? world.currentPlayers : 0,
        maxPlayers: typeof world.maxPlayers === 'number' ? world.maxPlayers : 100
    }));
    res.status(200).json(simplifiedWorlds);
    console.log(`Responded to /game-api/v2/worlds GET with ${simplifiedWorlds.length} worlds.`);
});

// HTTP GET endpoint for World List (kept for backward compatibility if needed)
app.get("/game-api/v1/world-list", (req, res) => {
    console.log(`\n--- World List GET Request (via /game-api/v1/world-list) ---`);
    console.log(`Received GET request for /game-api/v1/world-list from IP: ${req.ip}`);
    const simplifiedWorlds = World.allWorlds.map(world => ({
        name: world.name || 'Unnamed World', path: world.path || '/unknown',
        icon: (world.meta && world.meta.tag) ? world.meta.tag : 'default',
        full: typeof world.currentPlayers === 'number' ? world.currentPlayers : 0,
        currentPlayers: typeof world.currentPlayers === 'number' ? world.currentPlayers : 0,
        maxPlayers: typeof world.maxPlayers === 'number' ? world.maxPlayers : 100
    }));
    res.status(200).json(simplifiedWorlds);
    console.log(`Responded to world list GET with ${simplifiedWorlds.length} worlds.`);
});

app.post("/game-api/v1/log-event", (req, res) => {
    console.log(`\n--- Game Event POST Request ---`);
    console.log(`Received POST request for /game-api/v1/log-event from IP: ${req.ip}`);
    console.log(`Request Body (Game Event Data):`, JSON.stringify(req.body, null, 2));
    res.status(200).json({ status: "received", message: "Game event logged." });
    console.log(`Responded to game event POST.`);
});

app.post("/game-api/v1/matchmaking-api/begin", (req, res) => {
    console.log(`\n--- Matchmaking POST Request ---`);
    console.log(`Received POST request for /game-api/v1/matchmaking-api/begin from IP: ${req.ip}`);
    console.log(`Matchmaking Data:`, JSON.stringify(req.body, null, 2));
    res.status(200).json({ status: "success", message: "Matchmaking request received." });
    console.log(`Responded to matchmaking POST.`);
});


// --- Socket.IO Connection Handling ---
const worldSystems = {};
World.allWorlds.forEach(world => {
    const system = new WorldSystem(world);
    worldSystems[world.path] = system;
});

// ⭐ IMPORTANT: io.on("connection") handles all incoming Socket.IO connections ⭐
io.on("connection", (socket) => {
    const requestPath = socket.handshake.url; // Get the path the client connected to

    // Delegate to the appropriate WorldSystem for game world connections
    const worldSystem = worldSystems[requestPath];

    if (worldSystem) {
        worldSystem.handleConnection(socket); // This is where the Socket.IO socket is passed to WorldSystem
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
