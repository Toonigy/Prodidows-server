// server.js - Node.js + Express server for multiplayer game worlds and WebSocket API

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io"); // ⭐ Changed from 'ws' to 'socket.io' ⭐

// Import the World and WorldSystem classes
const World = require("./World");
const WorldSystem = require("./WorldSystem"); // Assuming WorldSystem exists, but main logic is in World now

const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

// Enable CORS for all HTTP requests and Socket.IO
app.use(cors());

// Serve static files from the 'public' directory.
app.use(express.static(path.join(__dirname, "public")));

// Route for the root path, serving the main HTML file.
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ⭐ Socket.IO Server Setup ⭐
// Initialize Socket.IO and attach it to the HTTP server.
// Configure CORS for Socket.IO connections.
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development. Restrict in production.
        methods: ["GET", "POST"]
    }
});

// ⭐ Handle Socket.IO connections ⭐
io.on("connection", (socket) => {
    // Extract query parameters sent by the client (from io.connect in game.min.js)
    const userId = socket.handshake.query.userId;
    const worldId = socket.handshake.query.worldId;
    const zone = socket.handshake.query.zone;
    const userToken = socket.handshake.query.userToken;

    console.log(`Socket.IO Client Connected: Socket ID - ${socket.id}, User ID - ${userId}, World ID - ${worldId}`);

    if (worldId) {
        // This is a request to join a specific game world
        const targetWorld = World.allWorlds.find(w => w.id === worldId);

        if (targetWorld) {
            // Pass the Socket.IO socket directly to the World instance's connection handler
            // The World instance will manage rooms and events for its players
            targetWorld.handleConnection(socket);

            // Important: Make the io instance available for broadcasting from World class if needed
            // For simplicity, direct broadcasting within World.js using socket.broadcast.to(this.id).emit(...)
            // is handled without passing io explicitly.
            socket.on('disconnect', () => {
                // Already handled within World.js handleConnection's socket.on("disconnect")
            });

        } else {
            console.warn(`Socket.IO: Unknown worldId '${worldId}'. Disconnecting client ${socket.id}.`);
            socket.emit("connect_error", "Invalid world selected.");
            socket.disconnect(true);
        }
    } else {
        // This could be a general connection not meant for a specific world,
        // or a fallback for the world list if not using HTTP GET for it.
        // For now, we'll send the world list on 'worldList' event to this general connection.
        console.log("Client connected without specific worldId. Sending world list.");
        const worldsInfo = World.allWorlds.map(w => ({
            id: w.id,
            name: w.name,
            path: w.path,
            playerCount: w.playerCount,
            maxPlayers: w.maxPlayers,
            tag: w.tag,
            icon: w.icon,
            full: w.full
        }));
        socket.emit("worldList", { worlds: worldsInfo });

        socket.on('disconnect', () => {
            console.log(`General Socket.IO client disconnected: ${socket.id}`);
        });
    }
});


// ⭐ HTTP GET for /game-api/world-list (Preferred Client Request) ⭐
// This route handles HTTP GET requests to the '/game-api/world-list' path,
// which is the preferred endpoint if game.min.js uses the ApiClient's base URL.
app.get("/game-api/world-list", (req, res) => {
    console.log("Received HTTP GET request for /game-api/world-list (preferred client endpoint)");
    const worldsInfo = World.allWorlds.map(w => ({
        id: w.id,
        name: w.name,
        path: w.path,
        playerCount: w.playerCount,
        maxPlayers: w.maxPlayers,
        tag: w.tag,
        icon: w.icon,
        full: w.full
    }));
    res.json({ worlds: worldsInfo }); // Respond with the list of worlds in JSON format
});

// ⭐ HTTP GET for /game-api/status ⭐
// Handles the /status endpoint as expected by ApiClient.
app.get("/game-api/status", (req, res) => {
    console.log("Received HTTP GET request for /game-api/status");
    res.json({ status: "ok", message: "Server is running" });
});


// Start the HTTP server and listen on the specified port.
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}...`);
    console.log(`🌐 HTTP endpoints for world list and status are online.`);
    console.log(`🚀 Socket.IO server is online and ready for game world connections.`);
});
