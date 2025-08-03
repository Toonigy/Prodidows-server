// server.js - Conceptual example for a server with WSS (Secure WebSockets).
// NOTE: This code is for demonstration and will not run without valid SSL/TLS certificates.

const express = require("express");
const https = require("https"); // We use the secure 'https' module instead of 'http'
const fs = require("fs"); // 'fs' is used to read the certificate files.
const WebSocket = require("ws");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

// --- Load SSL/TLS certificate files ---
// In a real application, you would replace these paths with your actual certificate files.
const options = {
  key: fs.readFileSync("/path/to/your/private.key"),
  cert: fs.readFileSync("/path/to/your/certificate.crt")
};

// Create a secure HTTPS server using the certificate options.
const server = https.createServer(options, app);

// --- Game World Configuration (same as before) ---
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

// --- WebSocket Logic (same as before, but the server is now HTTPS) ---
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
// The logic here remains the same, but it's now attached to the secure server.
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
  console.log(`Server listening securely on https://localhost:${PORT}`);
});
