// server.js - A Node.js and Express server for a multiplayer game world list and WebSocket connections.
// This version removes the Firebase dependency to resolve the "Cannot find module" error.

const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const app = express();
// Use the PORT environment variable provided by platforms like Render, or default to 10000.
const PORT = process.env.PORT || 10000;

// Create an HTTP server to handle both standard HTTP requests and WebSocket upgrades.
const server = http.createServer(app);

// --- Game World Configuration ---
// This is a simple, hardcoded list of game worlds.
const worlds = [
  {
    name: "Fireplane",
    path: "/worlds/fireplane",
    icon: "fire",
    full: 0, // Placeholder for player count.
  }
];

// A Map to store all active WebSocket clients connected to the world list.
const worldListWssClients = new Map();

// Helper function to broadcast the hardcoded world list to all connected clients.
function broadcastWorldList() {
  const worldList = worlds;
  // Iterate through all connected clients and send the updated list.
  worldListWssClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "worlds", servers: worldList }));
    }
  });
}

// --- WebSocket Upgrade Handler ---
// This listens for HTTP "upgrade" requests to establish a WebSocket connection.
server.on("upgrade", (req, socket, head) => {
  // Check if the request is for the world list WebSocket path.
  if (req.url === "/game-api/v2/worlds") {
    const wss = new WebSocket.Server({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log("🌐 Client connected to /game-api/v2/worlds");

      // Add the new client to our map of active clients.
      worldListWssClients.set(ws, ws);

      ws.on("close", () => {
        console.log("❌ Client disconnected from world list.");
        worldListWssClients.delete(ws);
      });

      // Immediately send the current world list to the new client.
      // A more dynamic application would update this list from a database,
      // but this version sends a static list to fix the import error.
      if (ws.readyState === WebSocket.OPEN) {
        broadcastWorldList();
      }
    });
  } else {
    // If the path doesn't match, reject the upgrade.
    socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
    socket.destroy();
  }
});


// Serve static files from the 'public' folder.
app.use(express.static(path.join(__dirname, "public")));

// Serve `index.html` for the root URL.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the server.
server.listen(PORT, () => {
  console.log(`✅ Server is listening on port ${PORT}`);
});
