const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
// Render automatically provides a PORT environment variable.
const PORT = process.env.PORT || 10000;

// Create an HTTP server
const server = http.createServer(app);

// We will create a map to hold different WebSocket server instances,
// one for each world.
const worldWebSocketServers = new Map();

// --- The `servers` array now uses the requested structure. ---
// The `full` property will be dynamically updated based on connections.
const servers = [
  {
    "name": "Fireplane",
    "path": "/worlds/fireplane",
    "icon": "fire",
    "full": 0
  }
];

// Create a WebSocket server for the "Fireplane" world
const fireplaneWss = new WebSocket.Server({ noServer: true });
worldWebSocketServers.set("/worlds/fireplane", fireplaneWss);

// Handle connections for the "Fireplane" world
fireplaneWss.on("connection", (ws) => {
  // --- Increment `full` on new connection ---
  servers[0].full++;
  console.log(`🌐 Player connected to Fireplane world. Current players: ${servers[0].full}`);

  // Send the updated world list to all clients of this world
  // so they can see the change in player count.
  fireplaneWss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "worlds", servers }));
    }
  });

  // Handle messages from the client
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "login" && data.userId) {
        console.log(`✅ User logged in: ${data.userId}`);
      }
    } catch (e) {
      console.error("Invalid message", e);
    }
  });

  // --- Decrement `full` on disconnection ---
  ws.on("close", () => {
    servers[0].full--;
    console.log(`❌ Player disconnected from Fireplane world. Current players: ${servers[0].full}`);
    
    // Send the updated world list to all clients of this world
    fireplaneWss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "worlds", servers }));
      }
    });
  });
});


// Serve static files from a 'public' folder.
app.use(express.static(path.join(__dirname, "public")));

// Serve `index.html`
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Upgrade WebSocket
server.on("upgrade", (req, socket, head) => {
  // Check if the requested URL matches a known world path
  const worldPath = servers.find(s => req.url.startsWith(s.path));
  
  if (worldPath) {
    const wssInstance = worldWebSocketServers.get(worldPath.path);
    if (wssInstance) {
      wssInstance.handleUpgrade(req, socket, head, (ws) => {
        wssInstance.emit("connection", ws, req);
      });
    }
  } else {
    // If the path doesn't match any world, reject the upgrade
    socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`✅ Server is listening on port ${PORT}`);
});
