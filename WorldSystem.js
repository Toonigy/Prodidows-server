// WorldSystem.js
const WebSocket = require("ws");
const World = require("./World"); // Ensure World class is imported

class WorldSystem extends WebSocket.Server {
    constructor(world) {
        super({ noServer: true }); // Initialize WebSocket.Server without attaching to HTTP server yet
        this.world = world; // Store the World instance this system manages

        console.log(`🌍 WorldSystem: Initializing for world "${this.world.name}" (Path: ${this.world.path})`);

        // --- WebSocket Connection Handling for this specific world ---
        this.on("connection", (ws, req) => {
            const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
            const query = parsedUrl.searchParams;
            const userId = query.get('userId');
            const zone = query.get('zone');

            if (!userId) {
                console.warn(`❌ WorldSystem: Connection attempt to "${this.world.name}" rejected. Missing userId in query.`)
                ws.close(1008, "Missing userId"); // 1008: Policy Violation
                return;
            }

            console.log(`✅ WorldSystem: Player ${userId} connecting to "${this.world.name}" (Zone: ${zone || 'N/A'})...`);

            // Delegate connection handling to the World instance
            // World.handleConnection will add the player and send initial data
            this.world.handleConnection(ws, query);

            // --- Message Listener for this Client WebSocket ---
            ws.on('message', (message) => {
                try {
                    const parsedMessage = JSON.parse(message.toString());
                    console.log(`➡️ WorldSystem Message: [${this.world.name} - ${userId}] Received type: "${parsedMessage.type}", Payload:`, parsedMessage.payload);

                    // Handle different message types from the client
                    switch (parsedMessage.type) {
                        case "move":
                            const { x, y } = parsedMessage.payload;
                            if (typeof x === 'number' && typeof y === 'number') {
                                this.world.updatePlayerPosition(userId, x, y);
                                console.log(`🔄 WorldSystem: Player ${userId} moved to (${x}, ${y}) in ${this.world.name}.`);
                            } else {
                                console.warn(`⚠️ WorldSystem: Invalid move payload from ${userId}. Expected {x, y} numbers.`, parsedMessage.payload);
                            }
                            break;
                        case "chat":
                            if (typeof parsedMessage.payload === 'string' && parsedMessage.payload.trim() !== '') {
                                this.world.broadcast("chat", { sender: userId, message: parsedMessage.payload });
                                console.log(`💬 WorldSystem: [${this.world.name} - ${userId}] Chat: "${parsedMessage.payload}"`);
                            } else {
                                console.warn(`⚠️ WorldSystem: Invalid chat payload from ${userId}. Expected non-empty string.`, parsedMessage.payload);
                            }
                            break;
                        // Add more cases for other client messages (e.g., actions, interactions)
                        case "ping":
                            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
                            console.log(`⚡ WorldSystem: [${this.world.name} - ${userId}] Ping/Pong.`);
                            break;
                        default:
                            console.warn(`❓ WorldSystem: [${this.world.name} - ${userId}] Unhandled message type: "${parsedMessage.type}"`);
                            break;
                    }
                } catch (error) {
                    console.error(`💔 WorldSystem Error: [${this.world.name} - ${userId}] Failed to parse or handle message:`, message.toString(), "Error:", error);
                    // Optionally send an error back to the client
                    ws.send(JSON.stringify({ type: "error", payload: "Failed to process message." }));
                }
            });

            // --- Close Listener for this Client WebSocket ---
            ws.on('close', (code, reason) => {
                console.log(`🔌 WorldSystem Disconnect: [${this.world.name} - ${userId}] Closed. Code: ${code}, Reason: ${reason ? reason.toString() : 'N/A'}`);
                this.world.removePlayer(userId); // Remove player from the World instance
                console.log(`🗑️ WorldSystem: Player ${userId} removed from "${this.world.name}". Current players: ${this.world.playerCount}`);
            });

            // --- Error Listener for this Client WebSocket ---
            ws.on('error', (error) => {
                console.error(`💥 WorldSystem Connection Error: [${this.world.name} - ${userId}] WebSocket error:`, error);
                // The 'close' event will usually follow an 'error' event
            });
        });
    }
}

module.exports = WorldSystem;
