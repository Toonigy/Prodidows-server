// server.js - A Node.js and Express server for a multiplayer game world list and WebSocket connections.

// Import necessary modules
const express = require("express"); // Web framework for handling HTTP requests
const http = require("http");       // Node.js HTTP module for creating the server
const cors = require("cors");       // Middleware for enabling Cross-Origin Resource Sharing
const path = require("path");       // Utility for working with file and directory paths
const WebSocket = require("ws");    // WebSocket library for real-time communication

// Import custom game classes
const World = require("./World");           // Represents a single game world
const WorldSystem = require("./WorldSystem"); // Manages WebSocket connections and game logic for a world

// Initialize the Express application
const app = express();

// Define the port for the server to listen on.
// It uses the PORT environment variable (common in deployment platforms like Render)
// or defaults to 10000 for local development.
const PORT = process.env.PORT || 10000;

// --- SSL Certificate Setup (for HTTPS/WSS - uncomment and configure if needed) ---
// For secure WebSocket connections (WSS) in production, you typically need to serve
// your application over HTTPS. This section provides a placeholder for that setup.
// const https = require("https");
// const fs = require("fs"); // For reading certificate files
// const privateKey = fs.readFileSync('path/to/your/private.key', 'utf8');
// const certificate = fs.readFileSync('path/to/your/certificate.crt', 'utf8');
// const credentials = { key: privateKey, cert: certificate };

// Create an HTTP server. This server will handle both standard HTTP requests
// and WebSocket upgrade requests.
const server = http.createServer(app);
// If using HTTPS for WSS, you would use:
// const server = https.createServer(credentials, app);

// --- CORS Configuration ---
// Enable CORS for all HTTP requests. This is crucial for development when your
// client-side application might be served from a different origin (e.g., a different port)
// than your server. For production, you should restrict this to your specific client origins
// for security reasons.
app.use(cors());

// --- Central WebSocket server for the world list. ---
// This WebSocket server is responsible for broadcasting the list of all game worlds
// and their current player counts to clients. It's initialized with `noServer: true`
// because it will be manually attached to the main HTTP server's 'upgrade' event.
const worldListWss = new WebSocket.Server({ noServer: true });

// A Map to store the WebSocket server instance for each individual game world.
// The key will be the world's path (e.g., "/worlds/fireplane").
const worldWebSocketServers = new Map();

// A Map to store the WorldSystem instance for each individual game world.
// The key will be the world's path.
const worldSystems = new Map();

// --- World data configuration ---
// This array defines the initial set of game worlds available.
// Each object contains properties like name, path, icon, and a 'full' status.
const worldNames = [{
    "name": "Fireplane",
    "path": "/worlds/fireplane",
    "icon": "fire",
    "full": 0 // Placeholder for player count, will be updated dynamically
}, {
    "name": "Waterscape",
    "path": "/worlds/waterscape",
    "icon": "water",
    "full": 0
}, {
    "name": "Earthshire",
    "path": "/worlds/earthshire",
    "icon": "earth",
    "full": 0
}, {
    "name": "Icefields",
    "path": "/worlds/icefields",
    "icon": "ice",
    "full": 0
}, {
    "name": "Windpeak",
    "path": "/worlds/windpeak",
    "icon": "wind",
    "full": 0
}];

// Initialize game worlds and their dedicated WebSocket servers and WorldSystems.
// This loop creates a `World` object, a `WorldSystem` to manage it, and a
// `WebSocket.Server` instance for each defined world.
worldNames.forEach(worldInfo => {
    // Create a new World instance. OwnerId is 'server', max 10 players for now.
    const world = new World(worldInfo.name, "server", 10, worldInfo.icon);
    // Define the unique path for this world's WebSocket connection.
    const worldPath = `/worlds/${world.id}`;

    // Create a WebSocket server specifically for this world.
    const wss = new WebSocket.Server({ noServer: true });
    // Create a WorldSystem instance, passing the world object and its WSS instance.
    const worldSystem = new WorldSystem(world, wss);

    // Store the WSS instance and WorldSystem instance in their respective Maps,
    // keyed by the world's path for easy lookup during WebSocket upgrades.
    worldWebSocketServers.set(worldPath, wss);
    worldSystems.set(worldPath, worldSystem);

    console.log(`🌍 Initialized world: "${world.name}" at path: "${worldPath}"`);
});

// Function to broadcast the current world list to all connected clients on the worldListWss.
// This function gathers data from all active WorldSystem instances and sends it
// as a JSON message to every client connected to the world list WebSocket.
function broadcastWorldList() {
    // Map over all WorldSystem instances to get their broadcastable data (e.g., name, player count).
    const worldsData = Array.from(worldSystems.values()).map(ws => ws.world.getBroadcastData());
    // Construct the message object.
    const message = JSON.stringify({
        type: "worldList", // Indicates the type of message
        worlds: worldsData // The actual world data array
    });

    // Iterate over all clients connected to the world list WebSocket.
    worldListWss.clients.forEach(client => {
        // Only send the message if the client's WebSocket connection is open.
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Set up an interval to broadcast the world list every 3 seconds.
// This ensures clients receive periodic updates on world status.
setInterval(broadcastWorldList, 3000);

// --- WebSocket Upgrade Handling ---
// This is the core mechanism for handling WebSocket connection requests.
// When a client tries to establish a WebSocket connection, the HTTP server
// emits an 'upgrade' event. This listener determines which WebSocket server
// (world list or a specific game world) should handle the request.
server.on("upgrade", (req, socket, head) => {
    // Check if the request URL is for the central world list WebSocket.
    if (req.url === "/world-list") {
        // If it's the world list, delegate the upgrade handling to `worldListWss`.
        worldListWss.handleUpgrade(req, socket, head, (ws) => {
            // Emit a 'connection' event on `worldListWss` to trigger its connection listeners.
            worldListWss.emit("connection", ws, req);
            console.log("✅ Client connected to world list at /world-list.");

            // Immediately send the current world list to the newly connected client.
            broadcastWorldList();

            // Add a 'close' listener for this specific world list client.
            ws.on("close", () => {
                console.log("❌ Client disconnected from world list.");
            });
        });
    } else {
        // If it's not the world list, check if the request is for a specific game world.
        // Parse the URL to extract the pathname (e.g., "/worlds/fireplane").
        // The URL constructor needs a base URL for relative paths, but we only care about the path.
        const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
        const worldPath = parsedUrl.pathname;

        // Look up the dedicated WebSocket server instance for this world path.
        const wssInstance = worldWebSocketServers.get(worldPath);

        if (wssInstance) {
            // If a WSS instance is found for the path, delegate the upgrade handling to it.
            // The `WorldSystem` class associated with this `wssInstance` will then
            // handle the player connection.
            wssInstance.handleUpgrade(req, socket, head, (ws) => {
                wssInstance.emit("connection", ws, req);
            });
        } else {
            // If the path doesn't match any known WebSocket service, reject the upgrade
            // with an HTTP 404 Not Found response and destroy the socket.
            socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
            socket.destroy();
        }
    }
});


// --- Express.js HTTP Server Setup ---
// Serve static files from the 'public' folder.
// This middleware makes files in the 'public' directory accessible directly via HTTP.
app.use(express.static(path.join(__dirname, "public")));

// Serve `index.html` at the root path ("/").
// When a browser requests the root URL, it will receive the main HTML file.
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// HTTP fallback for world list.
// This endpoint allows clients to fetch the world list using a standard HTTP GET request
// (e.g., via AJAX/XHR) if WebSocket connections are not feasible or desired for this specific data.
app.get("/world-list", (req, res) => {
    // Gather broadcast data from all WorldSystem instances.
    const worldsArray = Array.from(worldSystems.values()).map(ws => ws.world.getBroadcastData());
    // Send the array of world data as a JSON response.
    res.json(worldsArray);
});

// Start the HTTP server.
// The server begins listening for incoming requests on the specified PORT.
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}...`);
    // Provide a clear notification that the world list WebSocket is active.
    console.log(`🌐 World list WebSocket is online and ready at ws://localhost:${PORT}/world-list`);
});
