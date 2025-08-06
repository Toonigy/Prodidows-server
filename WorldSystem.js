// WorldSystem.js

// ⭐⭐⭐ IMPORTANT: Ensure this line is at the very top of your file ⭐⭐⭐
const WebSocket = require("ws");

class WorldSystem {
    constructor(world) {
        this.world = world;

        // Create a new WebSocket.Server instance for this specific world.
        // It's crucial that this server is created with `noServer: true`
        // and then hooked up to the main HTTP server's 'upgrade' event.
        this.wss = new WebSocket.Server({ noServer: true });

        // Add a console log to confirm that this.wss is initialized
        if (this.wss) {
            console.log(`✅ WebSocket Server initialized for world: ${world.name}`);
        } else {
            // This error should ideally not happen if 'require("ws")' is correct.
            console.error(`❌ Failed to initialize WebSocket Server for world: ${world.name}. Is 'ws' package installed and required?`);
        }

        // Set up the connection listener for this world's WebSocket server
        this.wss.on('connection', (ws, req) => {
            console.log(`🎮 Player connected to world: ${this.world.name}`);

            // Add a message listener for this specific client WebSocket
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);

                    // Check if the message is a 'googleSignIn' event
                    if (data.type === 'googleSignIn' && data.userID) {
                        console.log(`✅ User ${data.userID} signed in with Google in world: ${this.world.name}`);
                        // Optionally, you can store the userID directly on the WebSocket object
                        // for easier access in other parts of your WorldSystem logic.
                        ws.userID = data.userID;
                    }
                    // You would add other message handling logic here for other game events
                    // else if (data.type === 'playerMove') { ... }
                    // else if (data.type === 'chatMessage') { ... }

                } catch (error) {
                    console.error(`Error parsing message in world ${this.world.name}:`, error);
                }
            });

            // Add a close listener for the client WebSocket
            ws.on('close', () => {
                const userId = ws.userID || 'unknown user';
                console.log(`❌ Player ${userId} disconnected from world: ${this.world.name}`);
            });
        });

        // This method is called by server.js during the 'upgrade' event
        // to delegate the WebSocket connection to this specific WorldSystem.
        this.handleUpgrade = (req, socket, head, callback) => {
            this.wss.handleUpgrade(req, socket, head, callback);
        };

        // ... rest of your WorldSystem constructor/initialization ...
    }

    // ... other methods of your WorldSystem class ...
}

module.exports = WorldSystem; // Ensure WorldSystem is exported
