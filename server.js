// server.js - Node.js + Express server for multiplayer game worlds and WebSocket API

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const WebSocket = require("ws");

const World = require("./World");
const WorldSystem = require("./WorldSystem");

const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

app.use(cors());

// Serve static files (HTML, JS, CSS) from the public directory
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ Setup World List WebSocket server
const worldListWss = new WebSocket.Server({ noServer: true });

worldListWss.on("connection", (ws) => {
    console.log("🌐 Client connected to world list WebSocket.");
    // Send the initial list of worlds to the newly connected client
    ws.send(JSON.stringify({
        type: "worlds",
        servers: World.allWorlds.map(w => ({
            id: w.id,
            name: w.name,
            path: w.path,
            playerCount: w.playerCount, // Include current player count
            maxPlayers: w.maxPlayers,   // Include max players
            tag: w.tag,                 // Include tags
            icon: w.icon,               // Include icon
            full: w.full                // Include full status
        }))
    }));

    ws.on("message", (msg) => {
        console.log("World list WS message:", msg.toString());
        // Handle any messages from the world list client if needed
    });

    ws.on("close", () => {
        console.log("🌐 World list WebSocket closed.");
    });
});

// ✅ Setup individual world WebSocket servers
const worldWebSocketMap = new Map();

World.allWorlds.forEach(world => {
    const system = new WorldSystem(world);
    worldWebSocketMap.set(world.path, system);
    console.log(`🌍 Initialized world: ${world.name} at ws://localhost:${PORT}${world.path}`);
});

// ✅ WebSocket upgrade handler
server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

    console.log(`🔁 WebSocket upgrade request for ${pathname}`);

    // Check if the request is for the central world list WebSocket
    if (pathname === "/game-api/world-list") { // Corrected path to include leading slash
        worldListWss.handleUpgrade(req, socket, head, (ws) => {
            worldListWss.emit("connection", ws, req);
        });
    } else if (worldWebSocketMap.has(pathname)) {
        // Check if the request is for an individual game world WebSocket
        const wss = worldWebSocketMap.get(pathname);
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    } else {
        // If no matching WebSocket path, return 404
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
    }
});

// ⭐ IMPORTANT: Re-added HTTP fallback for /world-list ⭐
// This ensures older client code or direct HTTP requests to /world-list still work.
app.get("/world-list", (req, res) => {
    console.log("Received HTTP GET request for /world-list (legacy endpoint)");
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
    res.json({ worlds: worldsInfo });
});

// ✅ HTTP fallback for AJAX requests to /game-api/world-list
// This is the preferred HTTP endpoint for the world list.
app.get("/game-api/world-list", (req, res) => {
    console.log("Received HTTP GET request for /game-api/world-list");
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
    res.json({ worlds: worldsInfo });
});

// Start the HTTP server
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}...`);
    console.log(`🌐 World list WebSocket is online and ready at ws://localhost:${PORT}/game-api/world-list`);
    // Log individual world WebSocket paths
    World.allWorlds.forEach(world => {
        console.log(`🌍 World "${world.name}" WebSocket ready at ws://localhost:${PORT}${world.path}`);
    });
});
