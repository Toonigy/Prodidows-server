const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Sample JSON data
const servers = [
  { id: 0, full: 0, name: "Multiplayer Test server", meta: { tag: "fire" } },
  { id: 1, full: 0, name: "Fireplane", meta: { tag: "fire" } },
  { id: 2, full: 0, name: "Waterscape", meta: { tag: "water" } }
];

// WebSocket connection handling
wss.on("connection", (ws) => {
  console.log("Client connected");

  // Send initial data
  ws.send(JSON.stringify(servers));

  ws.on("message", (message) => {
    console.log("Received:", message);
    
    // Example: Respond with filtered data based on a tag
    try {
      const data = JSON.parse(message);
      if (data.tag) {
        const filtered = servers.filter(s => s.meta.tag === data.tag);
        ws.send(JSON.stringify(filtered));
      }
    } catch (error) {
      console.error("Invalid JSON received");
    }
  });

  ws.on("close", () => console.log("Client disconnected"));
});

// Start server on Render
const PORT = process.env.PORT || 10000; // Render will assign a port
server.listen(PORT, () => console.log(`WebSocket Server running on port ${PORT}`));
