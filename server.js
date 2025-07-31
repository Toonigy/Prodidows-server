const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
// Render automatically provides a PORT environment variable.
const PORT = process.env.PORT || 10000;

// Create an HTTP server
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

// Serve static files from a 'public' folder.
// This is where your index.html, game.min.js, etc. should be.
app.use(express.static(path.join(__dirname, "public")));

// --- IMPORTANT: Update the `socketServer` URL for your live deployment ---
// You will need to replace 'your-game-subdomain' with your actual subdomain on Render.
const servers = [
  {
    "id": "fireplane",
    "name": "Fireplane",
    "socketServer": "wss://your-game-subdomain.onrender.com/game-api/v2/worlds",
    "region": "us",
    "connectionCount": 0,
    "maxConnections": 100
  }
];

// Serve `index.html`
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Upgrade WebSocket
server.on("upgrade", (req, socket, head) => {
  // Only handle WebSocket upgrade for the /game-api/v2/worlds path
  if (req.url === "/worlds") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    // Refuse upgrade for other paths
    socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
    socket.destroy();
  }
});

// Handle world list WebSocket connection
wss.on("connection", (ws) => {
  console.log("🌐 Client connected to /worlds");

  // Send full world list on connect
  ws.send(JSON.stringify({
    type: "worlds",
    servers
  }));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      // Example of handling a login event
      if (data.type === "login" && data.userId) {
        console.log(`✅ User logged in: ${data.userId}`);
      }
    } catch (e) {
      console.error("Invalid message", e);
    }
  });

  ws.on("close", () => {
    console.log("❌ Disconnected from /worlds");
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server is listening on port ${PORT}`);
});
