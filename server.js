// server.js - Node.js + Express server for multiplayer game worlds and WebSocket API

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const WebSocket = require("ws");

// Import the World and WorldSystem classes
const World = require("./World");
const WorldSystem = require("./WorldSystem");

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

// ⭐ World List WebSocket Server Setup ⭐
// This WebSocket server handles connections specifically for the list of available game worlds.
const worldListWss = new WebSocket.Server({ noServer: true });

worldListWss.on("connection", (ws) => {
    console.log("🌐 Client connected to world list WebSocket.");

    // When a client connects, send them the initial list of all available worlds.
    ws.send(JSON.stringify({
        type: "worlds",
        servers: World.allWorlds.map(w => ({
            id: w.id,
            name: w.name,
            path: w.path,
            playerCount: w.playerCount, // Include current player count for display
            maxPlayers: w.maxPlayers,   // Include max players for display
            tag: w.tag,                 // Include tags for filtering/display
            icon: w.icon,               // Include icon for visual representation
            full: w.full                // Include full status (0: available, 1: almost full, 2: full)
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

// ⭐ Individual World WebSocket Servers Setup ⭐
// A Map to store WebSocketServer instances for each individual game world.
const worldWebSocketMap = new Map();

// Initialize a WorldSystem for each defined world.
World.allWorlds.forEach(world => {
    const system = new WorldSystem(world);
    worldWebSocketMap.set(world.path, system); // Map the world's path to its WorldSystem instance
    console.log(`🌍 Initialized world: ${world.name} at ws://localhost:${PORT}${world.path}`);
});

// ⭐ WebSocket Upgrade Handler ⭐
// This handles requests to upgrade a standard HTTP connection to a WebSocket connection.
server.on("upgrade", (req, socket, head) => {
    // Parse the URL to determine which WebSocket server (world list or individual world) should handle the request.
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

    console.log(`🔁 WebSocket upgrade request for ${pathname}`);

    // If the request is for the central world list WebSocket
    if (pathname === "/game-api/v2/worlds") {
        worldListWss.handleUpgrade(req, socket, head, (ws) => {
            worldListWss.emit("connection", ws, req); // Emit 'connection' event for the new WebSocket
        });
    }
    // If the request is for an individual game world WebSocket
    else if (worldWebSocketMap.has(pathname)) {
        const wss = worldWebSocketMap.get(pathname);
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req); // Emit 'connection' event for the new WebSocket
        });
    }
    // If no matching WebSocket path is found, return a 404 Not Found response.
    else {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
    }
});

// ⭐ HTTP GET for /game-api/v2/worlds (New Preferred Client Request) ⭐
// This route handles HTTP GET requests to the '/game-api/v2/worlds' path,
// which is now the preferred endpoint for the world list.
app.get("/game-api/v2/worlds", (req, res) => {
    console.log("Received HTTP GET request for /game-api/v2/worlds (preferred client endpoint)");
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
    // ⭐ IMPORTANT CHANGE: Send the array directly, not wrapped in an object. ⭐
    res.json(worldsInfo); // Respond with the list of worlds as a direct JSON array
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
    console.log(`🌐 World list WebSocket is online and ready at ws://localhost:${PORT}/game-api/v2/worlds`);
    // Log the WebSocket paths for individual worlds for easy debugging.
    World.allWorlds.forEach(world => {
        console.log(`🌍 World "${world.name}" WebSocket ready at ws://localhost:${PORT}${world.path}`);
    });
});
