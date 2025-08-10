// World.js

class World {
    // Constructor initializes all necessary internal properties
    constructor(id, name, ownerId, maxPlayers, tag, icon, path) {
        this.id = id;
        this.name = name;
        this.ownerId = ownerId;
        this.maxPlayers = maxPlayers;
        this.icon = icon;
        this.path = path;
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
     * This object contains only the 'id', 'full', 'name', and 'meta' properties
     * in the specified order.
     *
     * @returns {object} A simplified representation of the world.
     */
    toSimplifiedObject() {
        return {
            id: this.id,
            full: this.full, // 'full' is accessed here, so it gets the current calculated value
            name: this.name,
            meta: {
                tag: this.meta.tag // Access the tag from the meta object
            }
        };
    }

    _getMockWizardData(userId, zoneId) {
        // This function provides the exact detailed wizard structure as per your request
        return {
            "wizard": {
                "_id": userId,
                "userID": userId,
                "appearance": {
                    "name": "Bobby Glasslegs",
                    "gender": "male",
                    "hairStyle": 4, "hairColor": 2, "skinColor": 1, "eyeColor": 6, "nick": "Bobby of the Forest"
                },
                "equipment": {
                    "weapon": 77, "boots": 26, "outfit": 52, "hat": 61
                },
                "stats": { "level": 10, "xp": 12345, "hp": 100, "maxHP": 100, "gold": 500, "energy": 50, "maxEnergy": 50 },
                "location": { "world": this.id, "zone": zoneId, "x": 0, "y": 0 },
                "spellbook": ["fireball", "iceShard", "heal"],
                "achievements": ["firstStep", "explorer"],
                "inventory": [{ "id": 1, "qty": 5 }, { "id": 2, "qty": 10 }]
            },
            "pet": {
                "name": "Sparky", "type": "dragon", "level": 5, "xp": 120, "hp": 50, "maxHP": 50
            }
        };
    }

    /**
     * Handles a new Socket.IO connection to this world.
     * @param {SocketIO.Socket} socket - The Socket.IO socket instance for the client.
     */
    handleConnection(socket) {
        // Log initial connection attempt
        console.log(`\n-- ${this.name} Connection Attempt --`);
        console.log(`Socket.ID: ${socket.id} attempting to connect.`);

        let userId = socket.handshake.query.userID || 'UNKNOWN_USER';
        let authKey = socket.handshake.query.authKey || 'UNKNOWN_AUTH';
        let clientZone = socket.handshake.query.zone || 'UNKNOWN_ZONE';
        let worldIdFromQuery = socket.handshake.query.worldId || 'UNKNOWN_WORLD_ID';

        console.log(`Query Params: UserID=${userId}, AuthKey=${authKey ? 'PRESENT' : 'MISSING'}, WorldID=${worldIdFromQuery}, Zone=${clientZone}`);

        // Set the userId on the socket for easy access in other events
        socket.userId = userId;

        // Event listener for when a client tries to join a specific game world
        socket.on('joinGameWorld', (data) => {
            const requestedWorldId = data.worldId;
            const requestedZone = data.zone;
            const uniqueKey = data.uniqueKey; // Client-sent authKey
            const clientSentUserId = data.userID; // Client-sent userID

            // Log the 'joinGameWorld' request from the client
            console.log(`[${this.name}] Received 'joinGameWorld' from Socket.ID: ${socket.id}`);
            console.log(`  Client Data: World=${requestedWorldId}, Zone=${requestedZone}, UserID=${clientSentUserId}, UniqueKey=${uniqueKey ? 'PRESENT' : 'MISSING'}`);

            // Basic validation for the requested world and authentication
            if (requestedWorldId !== this.id) {
                console.warn(`[${this.name}] Mismatch: Client requested world "${requestedWorldId}", but this is world "${this.id}". Rejecting.`);
                socket.emit('joinFailed', { reason: 'World ID mismatch' });
                socket.disconnect(true); // Disconnect the socket
                return;
            }

            if (!clientSentUserId || !uniqueKey) {
                console.warn(`[${this.name}] Missing UserID or UniqueKey for Socket.ID: ${socket.id}. Rejecting.`);
                socket.emit('joinFailed', { reason: 'Authentication missing' });
                socket.disconnect(true);
                return;
            }

            // Log successful player join
            console.log(`✅ [${this.name}] User ${clientSentUserId} (Socket.ID: ${socket.id}) successfully joined world ${this.id} in zone ${requestedZone}.`);

            // Add player to the world's player list
            if (!this.players[clientSentUserId]) {
                this.playerCount++;
            }
            this.players[clientSentUserId] = {
                socketId: socket.id,
                data: data,
                wizardData: this._getMockWizardData(clientSentUserId, requestedZone), // Generate mock data
                x: 0, // Mock initial position
                y: 0
            };

            // Join the Socket.IO room for this world
            socket.join(this.id);

            // Send initial player list to the newly connected client
            const currentPlayerList = Object.values(this.players).map(p => ({
                userID: p.wizardData.wizard.userID,
                appearance: p.wizardData.wizard.appearance,
                equipment: p.wizardData.wizard.equipment,
                location: p.wizardData.wizard.location
            }));
            socket.emit('playerList', { players: currentPlayerList });

            // Notify other players in the world that a new player has joined
            socket.broadcast.to(this.id).emit('playerJoined', {
                userID: clientSentUserId,
                appearance: this.players[clientSentUserId].wizardData.wizard.appearance,
                equipment: this.players[clientSentUserId].wizardData.wizard.equipment,
                location: this.players[clientSentUserId].wizardData.wizard.location
            });

            console.log(`Current players in ${this.name}: ${this.playerCount}`);
        });

        // Other basic event listeners
        socket.on('message', (message) => {
            console.log(`[${this.name}] Message from ${userId} (Socket.ID: ${socket.id}):`, message);
            // Echo message back to sender (for testing) or broadcast
            socket.emit('message', `Echo from server: ${message}`);
        });

        socket.on('disconnect', (reason) => {
            // Log when a player disconnects
            console.log(`\n-- Disconnect from ${this.name} --`);
            console.log(`User ${userId} (Socket.ID: ${socket.id}) disconnected. Reason: ${reason}`);
            if (this.players[userId]) {
                delete this.players[userId];
                this.playerCount--;
                socket.broadcast.to(this.id).emit("playerLeft", { userID: userId, reason: reason });
                console.log(`Remaining players in ${this.name}: ${this.playerCount}`);
            }
            console.log(`----------------------------------\n`);
        });

        socket.on("error", (error) => {
            // Log any socket errors
            console.error(`\n-- Socket.IO Error in ${this.name} for ${userId} --`);
            console.error(`Error:`, error);
            console.log(`----------------------------------\n`);
        });
        console.log(`----------------------------------\n`); // End of initial connection log block
    }

    // This static property will still contain full World instances
    static allWorlds = [
        // id, name, ownerId, maxPlayers, tag, icon, path
        new World(1, "Fireplane", "admin", 50, "fire", "fire", "/worlds/fireplane")
    ];
}

module.exports = World;
