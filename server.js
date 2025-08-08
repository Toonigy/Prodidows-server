// server.js - Node.js + Express server for multiplayer game worlds and WebSocket API

// Core Node.js and Express imports
const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const WebSocket = require("ws"); // WebSocket library for raw WS connections

// Custom server-side modules
// IMPORTANT: Ensure these files exist and contain valid Node.js (server-side) code.
const World = require("./World");
const WorldSystem = require("./WorldSystem");

// Initialize Express app
const app = express();
// Use the PORT environment variable provided by platforms like Render, or default to 10000.
const PORT = process.env.PORT || 10000;
// Create an HTTP server that will handle both standard HTTP requests and WebSocket upgrades.
const server = http.createServer(app);

// Enable CORS for all HTTP requests. This is crucial for local development and cross-origin deployments.
app.use(cors());

// Serve static files (HTML, JS, CSS) from the 'public' directory.
// This makes your client-side files accessible via the web server.
app.use(express.static(path.join(__dirname, "public")));

// Route for the root path, serving the main HTML file.
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- World List WebSocket Server Setup ---
// This WebSocket server handles connections specifically for the list of available game worlds.
// Clients (like multiplayer.js) can connect here for real-time world list updates.
const worldListWss = new WebSocket.Server({ noServer: true });

worldListWss.on("connection", (ws) => {
    console.log("🌐 Client connected to world list WebSocket.");

    // When a client connects, send them the initial list of all available worlds.
    // The data format here should match what game.min.js/multiplayer.js expects.
    ws.send(JSON.stringify({
        type: "worlds",
        servers: World.allWorlds.map(w => ({
            id: w.id,
            name: w.name,
            path: w.path,
            playerCount: w.playerCount,
            maxPlayers: w.maxPlayers,
            tag: w.tag,
            icon: w.icon,
            full: w.full
        }))
    }));

    // Log any messages received from the world list client (for debugging).
    ws.on("message", (msg) => {
        console.log("World list WS message:", msg.toString());
    });

    // Log when a world list client disconnects.
    ws.on("close", () => {
        console.log("🌐 World list WebSocket closed.");
    });
});

// --- Individual World WebSocket Servers Setup ---
// A Map to store WebSocketServer instances for each individual game world.
const worldWebSocketMap = new Map();

// Initialize a WorldSystem for each defined world from World.allWorlds.
World.allWorlds.forEach(world => {
    // Each WorldSystem instance manages a specific World and its connections.
    const system = new WorldSystem(world);
    worldWebSocketMap.set(world.path, system); // Map the world's path to its WorldSystem instance
    console.log(`🌍 Initialized WorldSystem for "${world.name}" at ws://localhost:${PORT}${world.path}`);
});

// --- WebSocket Upgrade Handler ---
// This is the core handler that intercepts HTTP requests and upgrades them to WebSockets.
// It determines which specific WebSocket server (world list or a game world) should handle the connection.
server.on("upgrade", (req, socket, head) => {
    // Parse the URL to determine the target WebSocket path.
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

    console.log(`🔁 WebSocket upgrade request received for path: ${pathname}`);

    // If the request is for the central world list WebSocket (using the v2 endpoint)
    if (pathname === "/game-api/v2/worlds") {
        worldListWss.handleUpgrade(req, socket, head, (ws) => {
            worldListWss.emit("connection", ws, req); // Hand over to the world list WSS
        });
    }
    // If the request is for an individual game world WebSocket
    else if (worldWebSocketMap.has(pathname)) {
        const wss = worldWebSocketMap.get(pathname);
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req); // Hand over to the specific WorldSystem's WSS
        });
    }
    // If no matching WebSocket path is found, return a 404 Not Found HTTP response.
    else {
        console.warn(`❌ WebSocket upgrade: 404 Not Found for path: ${pathname}`);
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy(); // Close the socket
    }
});

// --- HTTP GET Endpoints for Compatibility (XHR) ---
// These routes handle standard HTTP GET requests, important for clients
// that might still use XMLHttpRequest (XHR) to fetch data (like game.min.js).

// Legacy endpoint for compatibility
app.get("/world-list", (req, res) => {
    console.log("Received HTTP GET request for /world-list (legacy endpoint)");
    // Respond with the list of worlds as a direct JSON array
    res.json(World.allWorlds.map(w => ({
        id: w.id, name: w.name, path: w.path, playerCount: w.playerCount,
        maxPlayers: w.maxPlayers, tag: w.tag, icon: w.icon, full: w.full
    })));
});

// Preferred HTTP endpoint for the world list (matches WS endpoint)
app.get("/game-api/v2/worlds", (req, res) => {
    console.log("Received HTTP GET request for /game-api/v2/worlds");
    // Respond with the list of worlds as a direct JSON array
    res.json(World.allWorlds.map(w => ({
        id: w.id, name: w.name, path: w.path, playerCount: w.playerCount,
        maxPlayers: w.maxPlayers, tag: w.tag, icon: w.icon, full: w.full
    })));
});

// Status endpoint for API client health checks
app.get("/game-api/status", (req, res) => {
    console.log("Received HTTP GET request for /game-api/status");
    res.json({ status: "ok", message: "Server is running" });
});

// --- Start the HTTP Server ---
// The server will listen on the specified port, keeping the Node.js process alive.
server.listen(PORT, () => {
    console.log(`✅ Server is listening on port ${PORT}...`);
    console.log(`🌐 World list WebSocket ready at ws://localhost:${PORT}/game-api/v2/worlds`);
    // Log paths for individual world WebSockets.
    World.allWorlds.forEach(world => {
        console.log(`🌍 World "${world.name}" WebSocket ready at ws://localhost:${PORT}${world.path}`);
    });
    console.log("🚀 Server startup complete. Waiting for connections...");
});
