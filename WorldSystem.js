// WorldSystem.js

// ⭐ REMOVED: const WebSocket = require("ws"); ⭐
// This file now works with Socket.IO sockets passed from server.js

const World = require("./World"); // Ensure World class is imported

class WorldSystem { // WorldSystem no longer extends WebSocket.Server, it's a manager
    constructor(world) {
        this.world = world; // Store the World instance this system manages

        console.log(`🌍 WorldSystem: Initializing for world "${this.world.name}" (Path: ${this.world.path})`);
    }

    /**
     * Handles a new Socket.IO connection for a client joining this world.
     * @param {SocketIO.Socket} socket - The Socket.IO socket instance for the client.
     */
    handleConnection(socket) {
        const userId = socket.handshake.query.userId;
        const worldId = socket.handshake.query.worldId;
        const zone = socket.handshake.query.zone || "unknown";
        const userToken = socket.handshake.query.userToken;

        if (!userId || !worldId) {
            console.error(`World.handleConnection: Missing userId or worldId in handshake. Disconnecting socket.`);
            socket.emit("connect_error", "Missing userId or worldId.");
            socket.disconnect(true);
            return;
        }

        if (this.world.playerCount >= this.world.maxPlayers) {
            console.warn(`World ${this.world.id} is full. User ${userId} denied connection.`);
            socket.emit("connect_error", "World is full. Please select another world.");
            socket.disconnect(true);
            return;
        }

        // Join a Socket.IO room specific to this world
        socket.join(this.world.id);
        
        // Store player info (using Socket.IO's socket.id for this connection)
        this.world.players[userId] = { socketId: socket.id, zone, token: userToken };
        this.world.playerCount++;
        console.log(`User ${userId} (Socket.ID: ${socket.id}, Zone: ${zone}) joined world ${this.world.name}. Current players: ${this.world.playerCount}`);

        // ⭐ Send initial wizard-update and zone-update messages to the new player ⭐
        // Mock data for wizard (replace with actual database lookup later)
        const mockWizardData = {
            _id: userId,
            name: `Player_${userId.substring(0, 5)}`,
            appearance: {
                gender: "male", skinColor: 1, hairStyle: 4, hairColor: 1, eyeColor: 1, outfit: 1, hat: 1, weapon: 1
            },
            data: {
                level: 1, gold: 1000, stars: 0, hp: 100, maxHp: 100
            }
        };

        // Send wizard-update
        socket.emit("message", { // Client listens for "message" event for generic updates
            event: "wizard-update",
            wizard: mockWizardData,
            userID: userId
        });

        // Send zone-update (critical for player position and world loading)
        socket.emit("message", { // Client listens for "message" event
            zone: zone,
            position: { x: 640, y: 360 }, // Default spawn point, adjust as needed
            inworld: true,
            event: "zone-update",
            userID: userId
        });

        // Send playerList to the new player
        const currentPlayerList = Object.keys(this.world.players).map(id => ({
            userID: id,
            // You might need to fetch and include more data for other players here
        }));
        socket.emit("playerList", { players: currentPlayerList });

        // Notify other players in this world that a new player joined
        // Use io.to(room).emit for broadcasting, this method needs access to the main io instance
        // For simplicity, within World.js's broadcast method, we will use socket.broadcast.to(room).emit
        // when broadcasting to others, which is accessible from the current socket object.
        socket.broadcast.to(this.world.id).emit("playerJoined", { userID: userId, wizard: mockWizardData, zone: zone });
        
        // Handle messages from this client
        socket.on("message", (data) => {
            try {
                console.log(`Received message from ${userId} in world ${this.world.id}:`, data);
                // Example: Handle player movement or other game actions
                if (data.type === "playerMove" && data.payload) {
                    socket.broadcast.to(this.world.id).emit("playerMove", { userID: userId, ...data.payload });
                } else if (data.type === "chatMessage" && data.payload) {
                    // For chat, send to all in the room, including sender if desired, so use io.to(room).emit
                    // This specific broadcast within WorldSystem.js will need access to `io`
                    // For now, let's assume `io` is passed to the WorldSystem constructor or accessible
                    // For a robust solution, you'd pass `io` to WorldSystem and then to World's broadcast method.
                    // Simplified for direct use:
                    // If you want sender to receive it: io.to(this.world.id).emit("chatMessage", { userID: userId, message: data.payload.message });
                    // If you want others to receive it: socket.broadcast.to(this.world.id).emit("chatMessage", { userID: userId, message: data.payload.message });
                    socket.broadcast.to(this.world.id).emit("chatMessage", { userID: userId, message: data.payload.message });
                }
                // Add more message handling logic as needed for game events
            } catch (e) {
                console.error(`Error parsing message from ${userId} in world ${this.world.id}:`, e);
            }
        });

        // Handle client disconnection
        socket.on("disconnect", () => {
            console.log(`User ${userId} (Socket.ID: ${socket.id}) disconnected from world ${this.world.name}.`);
            delete this.world.players[userId];
            this.world.playerCount--;
            socket.broadcast.to(this.world.id).emit("playerLeft", { userID: userId });
            console.log(`Current players in ${this.world.name}: ${this.world.playerCount}`);
        });

        socket.on("error", (error) => {
            console.error(`Socket.IO error for user ${userId} in world ${this.world.id}:`, error);
        });
    }
}

module.exports = WorldSystem;
