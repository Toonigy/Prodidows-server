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
app.use(express.json()); // ⭐ NEW: Middleware to parse JSON request bodies ⭐

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ⭐ Socket.IO Server Setup ⭐
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    const userId = socket.handshake.query.userId;
    const worldId = socket.handshake.query.worldId;
    const zone = socket.handshake.query.zone;

    console.log(`\n--- Socket.IO Connection Attempt ---`);
    console.log(`Socket ID: ${socket.id}`);
    console.log(`Query Params: User ID = ${userId}, World ID = ${worldId}, Zone = ${zone}`);

    if (worldId) {
        const targetWorld = World.allWorlds.find(w => w.id === worldId);
        if (targetWorld) {
            console.log(`Attempting to handle connection for world: ${targetWorld.name} (${worldId})`);
            targetWorld.handleConnection(socket);
        } else {
            console.warn(`Socket.IO: Unknown worldId '${worldId}'. Disconnecting client ${socket.id}.`);
            socket.emit("connect_error", "Invalid world selected.");
            socket.disconnect(true);
        }
    } else {
        console.log("Client connected without specific worldId. Assuming world list request via Socket.IO.");
        const worldsInfo = World.allWorlds.map(w => ({
            id: w.id, name: w.name, path: w.path, playerCount: w.playerCount,
            maxPlayers: w.maxPlayers, tag: w.tag, icon: w.icon, full: w.full
        }));
        socket.emit("worldList", { worlds: worldsInfo }); // Note: Still wrapped for this specific Socket.IO event
        socket.on('disconnect', () => {
            console.log(`General Socket.IO client disconnected: ${socket.id}`);
        });
    }

    socket.on('disconnect', (reason) => {
        console.log(`Socket.IO client disconnected (Socket ID: ${socket.id}): ${reason}`);
    });

    socket.on('connect_error', (error) => {
        console.error(`Socket.IO connection error (Socket ID: ${socket.id}):`, error.message);
    });
});

// --- HTTP GET Endpoints ---

// ⭐ HTTP GET for /game-api/v2/worlds (World List - primary) ⭐
app.get("/game-api/v2/worlds", (req, res) => {
    console.log(`\n--- HTTP Request ---`);
    console.log(`Received HTTP GET request for /game-api/v2/worlds from IP: ${req.ip}`);
    const worldsInfo = World.allWorlds.map(w => ({
        name: w.name,
        path: w.path,
        icon: w.icon,
        full: w.full
    }));
    res.json(worldsInfo);
    console.log(`Responded with ${worldsInfo.length} worlds.`);
});

// ⭐ HTTP GET for /game-api/world-list (World List - legacy/compatibility) ⭐
app.get("/game-api/world-list", (req, res) => {
    console.log(`\n--- HTTP Request ---`);
    console.log(`Received HTTP GET request for /game-api/world-list from IP: ${req.ip}`);
    const worldsInfo = World.allWorlds.map(w => ({
        id: w.id, name: w.name, path: w.path, playerCount: w.playerCount,
        maxPlayers: w.maxPlayers, tag: w.tag, icon: w.icon, full: w.full
    }));
    res.json(worldsInfo);
    console.log(`Responded with ${worldsInfo.length} worlds.`);
});

// ⭐ HTTP GET for /game-api/status ⭐
app.get("/game-api/status", (req, res) => {
    console.log(`\n--- HTTP Request ---`);
    console.log(`Received HTTP GET request for /game-api/status from IP: ${req.ip}`);
    res.json({ status: "ok", message: "Server is running" });
    console.log(`Responded with server status: OK.`);
});

// ⭐ NEW: HTTP POST for /game-api/v1/game-event ⭐
// This endpoint receives tracking events from the client.
app.post("/game-api/v1/game-event", (req, res) => {
    console.log(`\n--- Game Event POST Request ---`);
    console.log(`Received POST request for /game-api/v1/game-event from IP: ${req.ip}`);
    console.log(`Request Body (Game Event Data):`, JSON.stringify(req.body, null, 2)); // Log formatted JSON
    
    // You can process this data here (e.g., save to a database, log for analytics)
    // For now, we'll just acknowledge it.
    res.status(200).json({ status: "received", message: "Game event logged." });
    console.log(`Responded to game event POST.`);
});


// --- Server Startup ---
server.listen(PORT, () => {
    console.log(`\n--- Server Startup ---`);
    console.log(`✅ Server is listening on port ${PORT}...`);
    console.log(`🌐 HTTP endpoints for world list, status, and game events are online.`);
    console.log(`🚀 Socket.IO server is online and ready for game world connections.`);
    console.log(`💡 Local Socket.IO client connection URL: 'ws://localhost:${PORT}'`);
    console.log(`💡 Render Socket.IO client connection URL: 'wss://YOUR_RENDER_APP_URL.onrender.com'`);
    console.log(`------------------------\n`);
});
