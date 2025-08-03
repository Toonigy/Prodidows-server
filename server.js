// server.js - A Node.js and Express server for a multiplayer game world list and WebSocket connections.

const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const World = require("./World"); // Import the World class.

const app = express();
// Use the PORT environment variable provided by platforms like Render, or default to 10000.
const PORT = process.env.PORT || 10000;

// Create an HTTP server to handle both standard HTTP requests and WebSocket upgrades.
const server = http.createServer(app);

// --- WebSocket Server Instances ---
// A Map to store the WebSocket server instance for each world path.
const worldWebSocketServers = new Map();

// A single WebSocket server instance for the world list broadcast.
const worldListWss = new WebSocket.Server({ noServer: true });

// Helper function to broadcast the current world list to all clients of the world list WebSocket.
function broadcastWorldList() {
    // Get the simplified data from each World instance for broadcasting.
    const updatedWorlds = worlds.map(world => world.getBroadcastData());

    // Send the updated list to every client connected to the world list WebSocket.
    worldListWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "worlds", servers: updatedWorlds }));
        }
    });
}

// --- Dynamic WebSocket Server Creation for Each World ---
// Create instances of the World class. Each instance manages its own WebSocket server.
const worlds = [
    new World("Fireplane", "/worlds/fireplane", "fire", 100, broadcastWorldList),
    new World("Waterscape", "/worlds/waterscape", "water", 100, broadcastWorldList),
];

// Populate the map with the WebSocket servers from each World instance.
worlds.forEach(world => {
    worldWebSocketServers.set(world.path, world.wss);
});

// --- HTTP Server Upgrade Logic for WebSockets ---
// This listens for HTTP "upgrade" requests to establish a WebSocket connection.
server.on("upgrade", (req, socket, head) => {
    // Check if the request is for the world list WebSocket path.
    if (req.url === "/world-list") {
        worldListWss.handleUpgrade(req, socket, head, (ws) => {
            console.log("🌐 Client connected to /world-list.");
            worldListWss.emit("connection", ws, req);
            // Immediately send the current world list to the new client.
            broadcastWorldList();
            
            // Add a close listener for the world list client.
            ws.on("close", () => {
                console.log("❌ Client disconnected from world list.");
            });
        });
    } else {
        // Check if the request is for a specific game world.
        const wssInstance = worldWebSocketServers.get(req.url);

        if (wssInstance) {
            wssInstance.handleUpgrade(req, socket, head, (ws) => {
                wssInstance.emit("connection", ws, req);
            });
        } else {
            // If the path doesn't match, reject the upgrade.
            socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
            socket.destroy();
        }
    }
});


// --- Express.js HTTP Server Setup ---
// Serve static files from the 'public' folder.
app.use(express.static(path.join(__dirname, "public")));

// Serve `index.html` at the root path.
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the HTTP server.
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
