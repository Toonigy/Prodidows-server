// server.js - A Node.js and Express server for a multiplayer game world list and WebSocket connections.

const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const app = express();
// Use the PORT environment variable provided by platforms like Render, or default to 10000.
const PORT = process.env.PORT || 10000;

// Create an HTTP server to handle both standard HTTP requests and WebSocket upgrades.
const server = http.createServer(app);

// --- Game World Configuration (in-memory state) ---
// This is a simple, hardcoded list of game worlds.
// The 'full' property will be dynamically updated based on live connections.
const worlds = [
    {
        name: "Fireplane",
        path: "/worlds/fireplane",
        icon: "fire",
        full: 0,
        maxPlayers: 100,
    },
    {
        name: "Waterscape",
        path: "/worlds/waterscape",
        icon: "water",
        full: 0,
        maxPlayers: 100,
    },
];

// --- WebSocket Server Instances ---
// A Map to store the WebSocket server instance for each world path.
const worldWebSocketServers = new Map();

// A single WebSocket server instance for the world list broadcast.
// The client for this would be pde1500_status.html, which listens for server updates.
const worldListWss = new WebSocket.Server({ noServer: true });

// Helper function to broadcast the current world list to all clients of the world list WebSocket.
function broadcastWorldList() {
    // Create a new array with a copy of the current state of each world
    const updatedWorlds = worlds.map(w => ({ ...w }));

    // Send the updated list to every client connected to the world list WebSocket.
    worldListWss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "worlds", servers: updatedWorlds }));
        }
    });
}

// --- Dynamic WebSocket Server Creation for Each World ---
// We create a separate WebSocket server for each world defined in our array.
worlds.forEach(world => {
    const wss = new WebSocket.Server({ noServer: true });

    // Handle new connections to this specific world.
    wss.on("connection", (ws) => {
        // Increment player count and broadcast the change.
        world.full++;
        console.log(`🌐 Player connected to ${world.name}. Current players: ${world.full}`);
        broadcastWorldList();

        // Handle messages from this player (not fully implemented in this example).
        ws.on("message", (message) => {
            console.log(`📩 Received message from ${world.name} client:`, message.toString());
        });

        // Handle player disconnections from this specific world.
        ws.on("close", () => {
            // Decrement player count and broadcast the change.
            world.full--;
            console.log(`❌ Player disconnected from ${world.name}. Current players: ${world.full}`);
            broadcastWorldList();
        });
    });

    // Store the WebSocket server instance in our map, indexed by its path.
    worldWebSocketServers.set(world.path, wss);
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
