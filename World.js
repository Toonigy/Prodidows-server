// World.js

class World {
    constructor(id, name, ownerId, maxPlayers, tag, icon, path) {
        this.id = id; // Unique ID for the world (e.g., "fireplane")
        this.name = name;
        this.ownerId = ownerId;
        this.maxPlayers = maxPlayers;
        this.tag = tag;
        this.icon = icon;
        this.path = path;
        this.players = {}; // Map of userId to {socketId, data}
        this.playerCount = 0;
    }

    get full() {
        if (this.maxPlayers === 0) {
            return 0;
        }
        return Math.min(100, Math.floor((this.playerCount / this.maxPlayers) * 100));
    }

    /**
     * Handles a new Socket.IO connection for a client joining this world.
     * @param {SocketIO.Socket} socket - The Socket.IO socket instance for the client.
     * @param {object} query - The query parameters from the client's connection URL.
     */
    handleConnection(socket) { // Renamed from handleConnection, now accepts Socket.IO socket directly
        const userId = socket.handshake.query.userId;
        const worldId = socket.handshake.query.worldId;
        const zone = socket.handshake.query.zone || "unknown";
        const userToken = socket.handshake.query.userToken;

        if (!userId || !worldId) {
            console.error(`World.handleConnection: Missing userId or worldId in handshake. Closing socket.`);
            socket.disconnect(true);
            return;
        }

        if (this.playerCount >= this.maxPlayers) {
            console.warn(`World ${this.id} is full. User ${userId} denied connection.`);
            socket.emit("connect_error", "World is full. Please select another world."); // Emit error back to client
            socket.disconnect(true);
            return;
        }

        // Join a Socket.IO room specific to this world
        socket.join(this.id);
        
        // Store player info (using Socket.IO's socket.id for this connection)
        this.players[userId] = { socketId: socket.id, zone, token: userToken };
        this.playerCount++;
        console.log(`User ${userId} (Socket.ID: ${socket.id}, Zone: ${zone}) joined world ${this.name}. Current players: ${this.playerCount}`);

        // ⭐ Send initial wizard-update and zone-update messages to the new player ⭐
        // These are critical for the client to render the player and load the zone.
        // Mock data for wizard (replace with actual database lookup later)
        const mockWizardData = {
            _id: userId,
            name: `Player_${userId.substring(0, 5)}`, // Simple name generation
            appearance: {
                gender: "male",
                skinColor: 1,
                hairStyle: 4,
                hairColor: 1,
                eyeColor: 1,
                outfit: 1,
                hat: 1,
                weapon: 1
            },
            data: {
                level: 1,
                gold: 1000,
                stars: 0,
                hp: 100,
                maxHp: 100
            }
            // Add other wizard properties as needed by game.min.js
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
        const currentPlayerList = Object.keys(this.players).map(id => ({
            userID: id,
            // Include other player data (like appearance, position) if available
        }));
        socket.emit("playerList", { players: currentPlayerList });

        // Notify other players in this world that a new player joined
        this.broadcast(socket.id, "playerJoined", { userID: userId, wizard: mockWizardData, zone: zone });
        
        // Handle messages from this client
        socket.on("message", (data) => {
            try {
                console.log(`Received message from ${userId} in world ${this.id}:`, data);
                // Example: Handle player movement or other game actions
                if (data.type === "playerMove" && data.payload) {
                    this.broadcast(socket.id, "playerMove", { userID: userId, ...data.payload });
                } else if (data.type === "chatMessage" && data.payload) {
                    this.broadcast(null, "chatMessage", { userID: userId, message: data.payload.message });
                }
                // Add more message handling logic as needed for game events
            } catch (e) {
                console.error(`Error parsing message from ${userId} in world ${this.id}:`, e);
            }
        });

        // Handle client disconnection
        socket.on("disconnect", () => {
            console.log(`User ${userId} (Socket.ID: ${socket.id}) disconnected from world ${this.name}.`);
            delete this.players[userId];
            this.playerCount--;
            this.broadcast(null, "playerLeft", { userID: userId });
            console.log(`Current players in ${this.name}: ${this.playerCount}`);
        });

        socket.on("error", (error) => {
            console.error(`Socket.IO error for user ${userId} in world ${this.id}:`, error);
        });
    }

    /**
     * Broadcasts a message to all players in this world's Socket.IO room, optionally excluding one.
     * @param {string|null} excludeSocketId - Socket.IO ID to exclude from broadcast, or null to send to all.
     * @param {string} eventName - The name of the Socket.IO event.
     * @param {object} payload - The message payload.
     */
    broadcast(excludeSocketId, eventName, payload) {
        // Use Socket.IO's `to(room).emit(event, data)`
        if (excludeSocketId) {
            // Broadcast to all clients in the world's room except the sender
            socket.broadcast.to(this.id).emit(eventName, payload);
        } else {
            // Broadcast to all clients in the world's room (including sender if desired by game logic)
            // For now, only send to others if excludeSocketId is provided, otherwise, logic needs to be careful
            // For general broadcasts, you'd usually want to use io.to(this.id).emit
            // Let's assume this.io is passed in or accessible (from server.js)
            // This method needs access to the global Socket.IO `io` instance from server.js
            // For simplicity, we'll rely on the `io` instance being available in the server.js scope
            // when calling broadcast from the WorldSystem.
        }
    }

    getPlayerList() {
        return Object.keys(this.players);
    }

    getBroadcastData() {
        return {
            id: this.id, // Include ID for client side
            name: this.name,
            path: this.path,
            icon: this.icon,
            full: this.full
        };
    }

    // Static property to hold all defined worlds.
    // Constructor arguments: id, name, ownerId, maxPlayers, tag, icon, path
    static allWorlds = [
        new World("fireplane", "Fireplane", "admin", 50, "adventure", "fire", "/worlds/fireplane"),
        new World("icecaverns", "Ice Caverns", "admin", 30, "adventure", "ice", "/worlds/icecaverns"),
        new World("skywatch", "Skywatch Citadel", "admin", 40, "magic", "storm", "/worlds/skywatch"),
        new World("lamplight", "Lamplight Town", "admin", 100, "town", "magic", "/worlds/lamplight"),
        new World("forest", "Whispering Woods", "admin", 75, "nature", "earth", "/worlds/forest"),
        new World("arena", "Coliseum Arena", "admin", 20, "pvp", "combat", "/worlds/arena"),
    ];
}

module.exports = World;
