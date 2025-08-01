const express = require("express");
const http = require("http");
const path = require("path");
const World = require("./World"); // Import the World class.
const WebSocket = require("ws"); // Import WebSocket for broadcasting

const app = express();
// Render automatically provides a PORT environment variable.
const PORT = process.env.PORT || 10000;

// Create an HTTP server
const server = http.createServer(app);

// --- Create and manage your worlds here. ---
// This is now done by creating instances of the World class.
const worlds = [
  // The World constructor now receives a callback function to handle player count changes.
  new World("Fireplane", "/worlds/fireplane", "fire", 100, () => broadcastWorldList())
];

// Map world paths to their corresponding WebSocket server instances.
const worldWebSocketServers = new Map();
worlds.forEach(world => {
  worldWebSocketServers.set(world.path, world.wss);
});

// Helper function to get a standardized list of worlds with current player counts.
function getWorldList() {
  return worlds.map(world => ({
    name: world.name,
    path: world.path,
    icon: world.icon,
    full: world.players // Use the live player count from the World instance.
  }));
}

// Function to broadcast the updated world list to all connected clients.
function broadcastWorldList() {
  const worldList = getWorldList();
  // We need to iterate through all worlds and their clients.
  worlds.forEach(world => {
    world.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        // Send a message containing the full, updated world list.
        client.send(JSON.stringify({ type: "worlds", servers: worldList }));
      }
    });
  });
}

// --- NEW: API Endpoint for world list as JSON. ---
// This handles the GET request for the world list. The path is now /game-api/worlds
app.get("/game-api/worlds", (req, res) => {
  res.json({ worlds: getWorldList() });
});


// Serve static files from a 'public' folder.
app.use(express.static(path.join(__dirname, "public")));

// Serve `index.html`
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Upgrade WebSocket
server.on("upgrade", (req, socket, head) => {
  // Find the world instance based on the URL path for the WebSocket connection.
  // The client will try to connect to a specific world path, e.g., /worlds/fireplane
  const wssInstance = worldWebSocketServers.get(req.url);
  
  if (wssInstance) {
    wssInstance.handleUpgrade(req, socket, head, (ws) => {
      wssInstance.emit("connection", ws, req);
    });
  } else {
    // If the path doesn't match any world, reject the upgrade
    socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`✅ Server is listening on port ${PORT}`);
});
