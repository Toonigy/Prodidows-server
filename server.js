// server.js - A Node.js and Express server configured to work with cloud hosting services like Render.
// The service handles the SSL/TLS certificate, so we use a standard HTTP server.

const express = require("express");
const http = require("http"); // Reverted to the standard 'http' module.
const WebSocket = require("ws");
const path = require("path");

const app = express();
// Use the PORT environment variable provided by platforms like Render, or default to 10000.
const PORT = process.env.PORT || 10000;

// Create a standard HTTP server to handle both standard HTTP requests and WebSocket upgrades.
const server = http.createServer(app);

// --- Game World Configuration ---
const worlds = [
  {
    id: "fireplane",
    name: "Fireplane",
    path: "/worlds/fireplane",
    region: "us",
    connectionCount: 0,
    maxConnections: 100,
  },
  {
    id: "waterscape",
    name: "Waterscape",
    path: "/worlds/waterscape",
    region: "eu",
    connectionCount: 0,
    maxConnections: 100,
  },
];

const worldWebSocketServers = new Map();
const worldListWss = new WebSocket.Server({ noServer: true });

// --- WebSocket Logic ---
worldListWss.on("connection", (ws, req) => {
  console.log(`🌐 Client connected to world list: ${req.socket.remoteAddress}`);
  ws.send(JSON.stringify({ type: "worlds", servers: worlds }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "filter" && data.region) {
        const filtered = worlds.filter((s) => s.region === data.region);
        ws.send(JSON.stringify({ type: "filteredList", servers: filtered }));
      }
    } catch (e) {
      console.error("🚨 Invalid JSON received on world list WebSocket:", e);
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected from world list.");
  });
});

worlds.forEach((world) => {
  const wss = new WebSocket.Server({ noServer: true });

  wss.on("connection", (ws, req) => {
    console.log(`🎮 Client connected to world ${world.name}: ${req.socket.remoteAddress}`);
    world.connectionCount++;
    broadcastWorldListUpdate();

    ws.on("message", (message) => {
      console.log(`📩 Received message in ${world.name}:`, message.toString());
    });

    ws.on("close", () => {
      console.log(`❌ Client disconnected from world ${world.name}.`);
      world.connectionCount--;
      broadcastWorldListUpdate();
    });
  });

  worldWebSocketServers.set(world.path, wss);
});

function broadcastWorldListUpdate() {
  const updatedWorlds = worlds.map(w => ({
    ...w,
    path: w.path
  }));
  worldListWss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "worlds", servers: updatedWorlds }));
    }
  });
}

// --- Express.js HTTP Server Setup ---
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- HTTP Server Upgrade Logic for WebSockets ---
// This logic is unchanged. The hosting service will forward a secure WSS connection
// as a standard WebSocket upgrade request to our HTTP server.
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/game-api/worlds") {
    worldListWss.handleUpgrade(req, socket, head, (ws) => {
      worldListWss.emit("connection", ws, req);
    });
  } else {
    const wssInstance = worldWebSocketServers.get(req.url);
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

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
