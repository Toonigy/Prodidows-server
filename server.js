// server.js - A Node.js and Express server with two WebSocket servers:
// one for the global world list and one for a specific game world.

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

// --- Game World Configuration ---
// This is a simple, hardcoded list of game worlds.
// In a real application, this would likely be managed in a database.
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

// A Map to store WebSocket server instances for each individual world.
// The key is the world's path (e.g., "/worlds/fireplane")
const worldWebSocketServers = new Map();

// A separate WebSocket server for the world list.
// This is used to broadcast the list of available worlds to all clients.
const worldListWss = new WebSocket.Server({ noServer: true });

// --- WebSocket Logic for the World List ---
worldListWss.on("connection", (ws, req) => {
  console.log(`🌐 Client connected to world list: ${req.socket.remoteAddress}`);

  // Send the full world list on a new connection.
  ws.send(JSON.stringify({ type: "worlds", servers: worlds }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "filter" && data.region) {
        // Handle filter requests for the world list
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

// --- WebSocket Logic for Individual Game Worlds ---
// Create a WebSocket server instance for each world.
worlds.forEach((world) => {
  const wss = new WebSocket.Server({ noServer: true });

  wss.on("connection", (ws, req) => {
    console.log(`🎮 Client connected to world ${world.name}: ${req.socket.remoteAddress}`);

    // Increment player count
    world.connectionCount++;
    // Broadcast the updated world list to all clients on the world list server.
    broadcastWorldListUpdate();

    // Handle messages within the specific game world
    ws.on("message", (message) => {
      console.log(`📩 Received message in ${world.name}:`, message.toString());
      // Here you would implement game-specific logic,
      // such as broadcasting player movements to other clients in this world.
    });

    ws.on("close", () => {
      console.log(`❌ Client disconnected from world ${world.name}.`);
      // Decrement player count
      world.connectionCount--;
      // Broadcast the updated world list again.
      broadcastWorldListUpdate();
    });
  });

  // Map the world's path to its WebSocket server instance.
  worldWebSocketServers.set(world.path, wss);
});


// Helper function to broadcast the world list to all clients connected to the
// world list WebSocket server.
function broadcastWorldListUpdate() {
  // We send the entire, updated `worlds` array.
  const updatedWorlds = worlds.map(w => ({
    ...w,
    path: w.path // Ensure the path is included
  }));

  worldListWss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "worlds", servers: updatedWorlds }));
    }
  });
}

// --- Express.js HTTP Server Setup ---
// Serve static files from the 'public' folder.
app.use(express.static(path.join(__dirname, "public")));

// Serve `index.html` on the root URL.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- HTTP Server Upgrade Logic for WebSockets ---
server.on("upgrade", (req, socket, head) => {
  // Check if the upgrade request is for the world list.
  if (req.url === "/game-api/worlds") {
    worldListWss.handleUpgrade(req, socket, head, (ws) => {
      worldListWss.emit("connection", ws, req);
    });
  } else {
    // Otherwise, check if it's for a specific game world.
    const wssInstance = worldWebSocketServers.get(req.url);
    if (wssInstance) {
      wssInstance.handleUpgrade(req, socket, head, (ws) => {
        wssInstance.emit("connection", ws, req);
      });
    } else {
      // Refuse upgrade for other paths.
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
    }
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
