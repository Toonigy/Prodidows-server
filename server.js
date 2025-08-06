// server.js - A Node.js and Express server for a multiplayer game world list and WebSocket connections.

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const WebSocket = require("ws"); // This is used for the centralWss
const World = require("./World");
const WorldSystem = require("./WorldSystem");

const app = express();
const PORT = process.env.PORT || 10000;

const server = http.createServer(app);

app.use(cors());

const centralWss = new WebSocket.Server({ noServer: true });

centralWss.on("connection", (ws) => {
    console.log("🌐 Client connected to world list WebSocket.");
    ws.send(JSON.stringify({ type: "worldList", worlds: World.allWorlds.map(w => ({ id: w.id, name: w.name, path: w.path })) }));
    ws.on('message', (message) => {
        console.log(`Received message on world list WS: ${message}`);
    });
    ws.on('close', () => {
        console.log("🌐 Client disconnected from world list WebSocket.");
    });
});

const worldWebSocketServers = new Map();

World.allWorlds.forEach(world => {
    const worldSystem = new WorldSystem(world);
    worldWebSocketServers.set(world.path, worldSystem);
    console.log(`🌍 Initialized WorldSystem for world: ${world.name} at path: ${world.path}`);
});


server.on("upgrade", (req, socket, head) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const worldPath = parsedUrl.pathname;

    // This path is for the WebSocket UPGRADE request for the world list
    if (worldPath === "/game-api/world-list") {
        centralWss.handleUpgrade(req, socket, head, (ws) => {
            centralWss.emit("connection", ws, req);
        });
    } else {
        const wssInstance = worldWebSocketServers.get(worldPath);

        if (wssInstance) {
            wssInstance.handleUpgrade(req, socket, head, (ws) => {
                wssInstance.emit("connection", ws, req);
            });
        } else {
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
            socket.destroy();
        }
    }
});


app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ⭐⭐⭐ NEW: HTTP fallback for /game-api/world-list ⭐⭐⭐
// This route now handles standard HTTP GET requests to /game-api/world-list,
// providing a fallback if the client somehow makes an XHR request instead of a WebSocket.
app.get("/game-api/world-list", (req, res) => {
    const worldsInfo = World.allWorlds.map(w => ({ id: w.id, name: w.name, path: w.path }));
    res.json({ worlds: worldsInfo });
});

// Removed the old app.get("/world-list") to avoid duplication and encourage /game-api/world-list.
// If you still need a /world-list HTTP endpoint, you can add it back.

server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}...`);
    // Updated log to reflect the new WebSocket path.
    console.log(`🌐 World list WebSocket is online and ready at ws://localhost:${PORT}/game-api/world-list`);
});
