// server.js - A Node.js and Express server for a multiplayer game world list and WebSocket connections.

const express = require("express");
const http = require("http");
const path = require("path");
const World = require("./World"); // Import the custom World class.
const WebSocket = require("ws"); // Import WebSocket for broadcasting.

const app = express();
// Use the PORT environment variable provided by platforms like Render, or default to 10000.
const PORT = process.env.PORT || 10000;

// Create an HTTP server to handle both standard HTTP requests and WebSocket upgrades.
const server = http.createServer(app);

// --- Game World Configuration ---
// This array holds all the instances of our game worlds.
const worlds = [
  // The World constructor now receives a callback function. This function will
  // be executed whenever a player count changes, triggering a broadcast of the
  // updated world list to all clients.
  new World("Fireplane", "/worlds/fireplane", "fire", 100, () => broadcastWorldList())
];

// Map the world paths to their corresponding WebSocket server instances for easy lookup.
const worldWebSocketServers = new Map();
worlds.forEach(world => {
  worldWebSocketServers.set(world.path, world.wss);
});

// Helper function to create a standardized list of worlds with current player counts.
function getWorldList() {
  return worlds.map(world => ({
    name: world.name,
    path: world.path,
    icon: world.icon,
    // The `world.players` property is assumed to be a live player count from the World instance.
    full: world.players
  }));
}

// Function to broadcast the updated world list to all connected clients.
function broadcastWorldList() {
  const worldList = getWorldList();
  // We need to iterate through all worlds and their clients to send the update.
  worlds.forEach(world => {
    world.wss.clients.forEach(client => {
      // Only send the message to clients with an open WebSocket connection.
      if (client.readyState === WebSocket.OPEN) {
        // Send a message containing the full, updated world list.
        client.send(JSON.stringify({ type: "worlds", servers: worldList }));
      }
    });
  });
}

// --- API Endpoints ---
// This section has been updated. The HTTP GET endpoint for `/game-api/v2/worlds`
// has been removed entirely, as it should be a WebSocket-only path.
// This ensures that the server does not respond to standard HTTP requests on this route.

// Serve static files from a 'public' folder. This line ensures that files like
// 'public/js/game.min.js' are available to the browser.
app.use(express.static(path.join(__dirname, "public")));

// Serve `index.html` for the root URL.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- WebSocket Upgrade Handler ---
// This listens for HTTP "upgrade" requests to establish a WebSocket connection.
server.on("upgrade", (req, socket, head) => {
  // Find the correct World instance's WebSocket server based on the URL path.
  // The client is expected to connect to a path like `/worlds/fireplane`.
  const wssInstance = worldWebSocketServers.get(req.url);
  // An additional check for the `/game-api/v2/worlds` path to handle the world list websocket.
  const isWorldListPath = req.url === "/game-api/v2/worlds";

  if (wssInstance || isWorldListPath) {
    let targetWss = wssInstance;
    if (isWorldListPath) {
      // Create a temporary WebSocket server instance for the world list.
      // In a more complex app, this would be a persistent WSS instance.
      targetWss = new WebSocket.Server({ noServer: true });
      targetWss.on("connection", ws => {
        console.log("🌐 Client connected to /game-api/v2/worlds");
        // Send the initial world list immediately upon connection.
        ws.send(JSON.stringify(getWorldList()));
      });
      // Handle the upgrade for this specific path.
      targetWss.handleUpgrade(req, socket, head, (ws) => {
        targetWss.emit("connection", ws, req);
      });
    } else {
      // Handle the upgrade for the specific world path.
      wssInstance.handleUpgrade(req, socket, head, (ws) => {
        wssInstance.emit("connection", ws, req);
      });
    }
  } else {
    // If the path doesn't match any world, reject the upgrade with a 404 error.
    socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
    socket.destroy();
  }
});

// Start the server and listen for connections on the specified PORT.
server.listen(PORT, () => {
  console.log(`✅ Server is listening on port ${PORT}`);
});
