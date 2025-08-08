// server.js
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
app.use(express.static(path.join(__dirname, "public")));

// -------------------- WebSocket: World List --------------------
const worldListWss = new WebSocket.Server({ noServer: true });

worldListWss.on("connection", (ws) => {
    console.log("🌐 Client connected to world list WebSocket.");
    ws.send(JSON.stringify({
        type: "worldList",
        worlds: World.allWorlds.map(w => w.getBroadcastData())
    }));
    ws.on("close", () => {
        console.log("🌐 Client disconnected from world list WebSocket.");
    });
});

// -------------------- WebSocket: Worlds --------------------
const worldWebSocketMap = new Map();

World.allWorlds.forEach(world => {
    const worldSystem = new WorldSystem(world);
    worldWebSocketMap.set(world.path, worldSystem);
    console.log(`🌍 World initialized: ${world.name} at path ${world.path}`);
});

// -------------------- HTTP Endpoints --------------------

// Serve home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ HTTP fallback for game.min.js: GET /game-api/v2/worlds
app.get("/game-api/v2/worlds", (req, res) => {
    const worlds = World.allWorlds.map(w => w.getBroadcastData());
    res.json(worlds);
});

// -------------------- WebSocket Upgrade Handling --------------------
server.on("upgrade", (req, socket, head) => {
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

    if (pathname === "/world-list") {
        worldListWss.handleUpgrade(req, socket, head, (ws) => {
            worldListWss.emit("connection", ws, req);
        });
    } else if (worldWebSocketMap.has(pathname)) {
        const wss = worldWebSocketMap.get(pathname);
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit("connection", ws, req);
        });
    } else {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
    }
});

// -------------------- Start Server --------------------
server.listen(PORT, () => {
    console.log(`✅ Server listening on port ${PORT}`);
    console.log(`🌐 WS world list: ws://localhost:${PORT}/world-list`);
    console.log(`🌐 HTTP world list: http://localhost:${PORT}/game-api/v2/worlds`);
});
