// World.js
// This class encapsulates the logic for a single game world.
// It manages its own WebSocket server and client connections.

const WebSocket = require("ws");

class World {
    constructor(name, path, icon, maxConnections, broadcastUpdateCallback) {
        // --- World Properties ---
        this.name = name;
        this.path = path;
        this.icon = icon;
        this.maxConnections = maxConnections;
        this.players = 0;
        this.broadcastUpdateCallback = broadcastUpdateCallback;

        // --- WebSocket Server for this specific World ---
        // We create a WebSocket server instance for this world but don't
        // attach it to a running HTTP server yet. The main server.js file
        // will handle the "upgrade" event and pass it to this instance.
        this.wss = new WebSocket.Server({ noServer: true });

        // A Map to store the clients connected to this specific world
        this.clients = new Map();

        // --- WebSocket Event Handlers ---
        this.wss.on("connection", (ws) => {
            console.log(`✅ Player connected to world: ${this.name}`);
            this.players++;
            this.clients.set(ws, ws);
            this.broadcastUpdateCallback(); // Notify the main server to update the world list for all clients

            // When a client sends a message to this world
            ws.on("message", (message) => {
                console.log(`📩 Message from ${this.name} client: ${message}`);
                // Example: Broadcast the message to all other clients in this world
                this.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            });

            // When a client disconnects from this world
            ws.on("close", () => {
                console.log(`❌ Player disconnected from world: ${this.name}`);
                this.players--;
                this.clients.delete(ws);
                this.broadcastUpdateCallback(); // Notify the main server to update the world list
            });
        });
    }

    // A method to handle the WebSocket upgrade request from the main server.
    handleUpgrade(req, socket, head) {
        this.wss.handleUpgrade(req, socket, head, (ws) => {
            this.wss.emit("connection", ws, req);
        });
    }
}

module.exports = World;
