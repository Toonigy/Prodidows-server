// World.js

class World {
    // Constructor initializes all necessary internal properties
    constructor(id, name, ownerId, maxPlayers, tag, icon, path) {
        this.id = id;
        this.name = name;
        this.ownerId = ownerId;
        this.maxPlayers = maxPlayers;
        this.icon = icon;
        this.path = path; // ⭐ Ensure path is stored in the World instance ⭐
        this.players = {}; // Map of userId to {socketId, data, wizardData, x, y}
        this.playerCount = 0;

        // Ensure the meta object is created with the tag as requested
        this.meta = {
            tag: tag
        };
    }

    // This getter calculates the 'full' percentage dynamically.
    // It updates as players connect/disconnect.
    get full() {
        if (this.maxPlayers === 0) {
            return 0; // Avoid division by zero, return 0% if no max players
        }
        return Math.min(100, Math.floor((this.playerCount / this.maxPlayers) * 100));
    }

    /**
     * ⭐ NEW METHOD: Returns a simplified object of the world for client-side display. ⭐
     * This object contains only the 'id', 'full', 'name', 'meta', and now 'path' properties
     * in the specified order.
     *
     * @returns {object} A simplified representation of the world.
     */
    toSimplifiedObject() {
        return {
            id: this.id,
            full: this.full,
            name: this.name,
            meta: this.meta,
            path: this.path // ⭐ CRITICAL FIX: Include the path here ⭐
        };
    }

    /**
     * Handles a new Socket.IO client connection for this world.
     * Assigns a unique userID to the socket and adds the player to the world.
     *
     * @param {SocketIO.Socket} socket - The Socket.IO socket instance for the client.
     */
    handleConnection(socket) {
        console.log(`\n--- Socket.IO Connection to World: ${this.name} ---`);

        // Assign a unique user ID to the socket if not already present from auth
        // Use query.userID if available, otherwise generate one.
        socket.userId = socket.handshake.query.userID || `guest_${Math.random().toString(36).substring(2, 9)}`;
        console.log(`User ${socket.userId} connecting to world ${this.name}.`);

        if (this.playerCount >= this.maxPlayers) {
            console.log(`World ${this.name} is full. Disconnecting ${socket.userId}.`);
            socket.emit("error", { message: "World is full." });
            socket.disconnect(true);
            return;
        }

        const worldId = socket.handshake.query.worldId;
        const authKey = socket.handshake.query.token;
        const zone = socket.handshake.query.zone;
        let wizardData = {};
        try {
            wizardData = JSON.parse(socket.handshake.query.wizardData || '{}');
        } catch (e) {
            console.error("Failed to parse wizardData:", e);
        }

        // Store player data in this world's players map
        this.players[socket.userId] = {
            socketId: socket.id,
            data: {
                userID: socket.userId,
                worldId: worldId,
                zone: zone,
                authKey: authKey,
                wizardData: wizardData // Store parsed wizard data
            },
            // Initial position (can be updated later by client messages)
            x: Math.floor(Math.random() * 100),
            y: Math.floor(Math.random() * 100)
        };
        this.playerCount++;

        console.log(`Player ${socket.userId} joined ${this.name}. Total players: ${this.playerCount}`);

        // Join the Socket.IO room specific to this world
        socket.join(this.id);

        // Emit 'playerList' to the newly connected client with all current players in this world
        socket.emit("playerList", {
            players: Object.values(this.players).map(p => ({
                userID: p.data.userID,
                x: p.x,
                y: p.y,
                wizardData: p.data.wizardData
            }))
        });

        // Broadcast 'playerJoined' to all other clients in this world
        socket.broadcast.to(this.id).emit("playerJoined", {
            userID: socket.userId,
            x: this.players[socket.userId].x,
            y: this.players[socket.userId].y,
            wizardData: this.players[socket.userId].data.wizardData
        });

        // Handle 'joinGameWorld' acknowledgment from client
        socket.on('joinGameWorld', (clientData, callback) => {
            console.log(`Server received 'joinGameWorld' acknowledgment from ${socket.userId}:`, clientData);
            // Send back a success response to the client
            if (typeof callback === 'function') {
                callback({
                    success: true,
                    message: `Successfully joined world ${this.name}`,
                    worldId: this.id,
                    zoneId: zone, // Confirm the zone back to the client
                    userID: socket.userId
                });
            }
        });

        // Handle incoming messages from this client
        socket.on("message", (data) => {
            const currentUserId = socket.userId;
            console.log(`Message from ${currentUserId} in ${this.name}:`, data);
            // Broadcast message to all other clients in this world
            socket.broadcast.to(this.id).emit("message", { userID: currentUserId, message: data.message });
        });

        // Handle player movement updates
        socket.on("playerMove", (data) => {
            const currentUserId = socket.userId;
            if (this.players[currentUserId]) {
                this.players[currentUserId].x = data.x;
                this.players[currentUserId].y = data.y;
                // Broadcast new position to other players in the same world
                socket.broadcast.to(this.id).emit("playerMoved", {
                    userID: currentUserId,
                    x: data.x,
                    y: data.y
                });
            }
        });

        // Handle disconnection
        socket.on("disconnect", (reason) => {
            const currentUserId = socket.userId;
            console.log(`\n-- Socket.IO Disconnection from World: ${this.name} --`);
            console.log(`User ${currentUserId} disconnected. Reason: ${reason}`);

            if (this.players[currentUserId]) {
                delete this.players[currentUserId];
                this.playerCount--;
                socket.broadcast.to(this.id).emit("playerLeft", { userID: currentUserId, reason: reason });
                console.log(`Remaining players in ${this.name}: ${this.playerCount}`);
            }
            console.log(`----------------------------------\n`);
        });

        socket.on("error", (error) => {
            const currentUserId = socket.userId || 'unknown';
            console.error(`\n-- Socket.IO Error in ${this.name} for ${currentUserId} --`);
            console.error(`Error:`, error);
            console.log(`----------------------------------\n`);
        });

        // Initial connection log completion
        console.log(`----------------------------------\n`);
    }

    // This static property will still contain full World instances
    static allWorlds = [
        // id, name, ownerId, maxPlayers, tag, icon, path
        new World(1, "Fireplane", "admin", 50, "fire", "fire", "/worlds/fireplane"),
        new World(2, "Ice Caverns", "admin", 30, "ice", "ice", "/worlds/icecaverns"),
        new World(3, "Skywatch Citadel", "admin", 40, "magic", "storm", "/worlds/skywatch"),
        new World(4, "Lamplight Town", "admin", 100, "town", "magic", "/worlds/lamplight"),
        new World(5, "Shadowfen", "admin", 60, "dark", "skull", "/worlds/shadowfen"),
        new World(6, "Sunstone Oasis", "admin", 70, "desert", "sun", "/worlds/sunstone"),
        new World(7, "Whispering Woods", "admin", 45, "forest", "tree", "/worlds/whispering"),
        new World(8, "Molten Core", "admin", 55, "lava", "fire", "/worlds/moltencore"),
        new World(9, "Crystal Caves", "admin", 35, "gem", "gem", "/worlds/crystal"),
        new World(10, "Stormy Peaks", "admin", 25, "wind", "storm", "/worlds/stormy")
    ];
}

module.exports = World;
