// World.js

class World {
    constructor(id, name, ownerId, maxPlayers, tag, icon, path) {
        this.id = id;
        this.name = name;
        this.ownerId = ownerId;
        this.maxPlayers = maxPlayers;
        this.tag = tag;
        this.icon = icon;
        this.path = path;
        this.players = {}; // Map of userId to {socketId, data, wizardData, x, y}
        this.playerCount = 0;
    }

    get full() {
        if (this.maxPlayers === 0) {
            return 0;
        }
        return Math.min(100, Math.floor((this.playerCount / this.maxPlayers) * 100));
    }

    /**
     * Generates specific mock wizard data for a player, using the exact JSON provided.
     * The userId and zoneId are dynamically inserted into the predefined structure.
     * @param {string} userId - The unique ID of the player.
     * @param {string} zoneId - The ID of the zone the player is in.
     * @returns {object} Mock wizard data as per the provided JSON structure.
     */
    _getMockWizardData(userId, zoneId) {
        // ⭐ Replacing randomized data with the exact JSON structure provided ⭐
        return {
            "event": "wizard-update", // This outer 'event' key is typically added by socket.emit, not within the wizard object itself
            "wizard": {
                "_id": userId, // Dynamically insert the current userId
                "userID": userId, // Dynamically insert the current userId
                "appearance": {
                    "name": "Bobby Glasslegs",
                    "gender": "male",
                    "hairStyle": 4,
                    "hairColor": 2,
                    "skinColor": 1,
                    "eyeColor": 6,
                    "nick": "Bobby of the Forest"
                },
                "equipment": {
                    "weapon": 77,
                    "boots": 26,
                    "outfit": 52,
                    "hat": 61
                },
                "data": {
                    "settings": {
                        "bgmVolume": 0.3,
                        "sfxVolume": 0.9,
                        "voiceVolume": 1
                    },
                    "zone": zoneId, // Dynamically insert the current zoneId
                    "allowsHouseVisitors": false,
                    "hp": 709,
                    "team": 0,
                    "spellbook": [
                        22, 36, 5, 11, 17, 29
                    ],
                    "stars": 92447,
                    "level": 83,
                    "gold": 117766,
                    "useOldTutorialPath": false,
                    "dailyLoginBonus": {
                        "session": 0,
                        "day": 2,
                        "date": {
                            "d": 7,
                            "m": 7,
                            "y": 2025
                        }
                    },
                    "reward": 1,
                    "rewardData": null,
                    "rate": 5,
                    "spells": [
                        13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 1, 25, 7, 8, 2, 9, 10, 26, 27, 11, 3, 28, 29, 4, 5
                    ],
                    "arenaScore": 3823,
                    "win": 70,
                    "giveaways": {
                        "seen": [],
                        "applied": [],
                        "recieved": []
                    },
                    "loss": 7,
                    "arena": 16,
                    "tower": 55,
                    "spinDate": {
                        "d": 8,
                        "m": 7,
                        "y": 2025,
                        "twilightDates": [
                            1754618597269,
                            1754618599302
                        ]
                    },
                    "numSpins": 2,
                    "bountyScore": 1,
                    "arenaRank": 4
                },
                "isMember": true
            },
            // The top-level "userID" should also be dynamically set by the context of the call
            // as it's separate from wizard.userID but often matches.
            "userID": userId // Dynamically insert the current userId
        };
    }

    /**
     * Handles a new Socket.IO connection for a client joining this world.
     * @param {SocketIO.Socket} socket - The Socket.IO socket instance for the client.
     */
    handleConnection(socket) {
        const userId = socket.handshake.query.userId;
        const worldId = socket.handshake.query.worldId;
        const zone = socket.handshake.query.zone || "skywatch-C3"; // Default zone if not provided

        console.log(`World.handleConnection called for Socket ID: ${socket.id}, User ID: ${userId}, World ID: ${worldId}`);

        if (!userId || !worldId) {
            console.error(`World.handleConnection: Missing userId or worldId in handshake for socket ${socket.id}. Disconnecting.`);
            socket.emit("connect_error", "Missing player data. Please relog.");
            socket.disconnect(true);
            return;
        }

        if (this.playerCount >= this.maxPlayers) {
            console.warn(`World ${this.id} is full. User ${userId} denied connection.`);
            socket.emit("connect_error", "World is full. Please select another world.");
            socket.disconnect(true);
            return;
        }

        // ⭐ Crucial for multiplayer: Add player to Socket.IO room for this world ⭐
        socket.join(this.id); // Each world forms a Socket.IO room

        // Generate initial position and wizard data for the new player
        const initialX = Math.floor(Math.random() * 1000) + 100; // Example range
        const initialY = Math.floor(Math.random() * 500) + 100; // Example range
        
        // ⭐ Call _getMockWizardData to get the full wizard object ⭐
        const newPlayerWizardObject = this._getMockWizardData(userId, zone);

        // Store player info with their current position and wizard data
        this.players[userId] = {
            socketId: socket.id, zone: zone, wizardData: newPlayerWizardObject.wizard, x: initialX, y: initialY // Store the 'wizard' sub-object
        };
        this.playerCount++;
        console.log(`User ${userId} (Socket.ID: ${socket.id}, Zone: ${zone}) joined world ${this.name}. Current players: ${this.playerCount}`);


        // --- Send initial state to the NEWLY CONNECTED client ---

        // 1. Send 'wizard-update' for the new player (self)
        console.log(`Sending 'wizard-update' to ${userId} for self.`);
        socket.emit("message", {
            event: "wizard-update",
            wizard: newPlayerWizardObject.wizard, // Send the wizard object itself
            userID: newPlayerWizardObject.userID // Send the top-level userID
        });

        // 2. Send initial 'zone-update' for the new player (self)
        console.log(`Sending 'zone-update' to ${userId} for self (position: ${initialX}, ${initialY}).`);
        socket.emit("message", {
            zone: zone,
            position: { x: initialX, y: initialY },
            inworld: true, // Crucial flag indicating player is in a world instance
            event: "zone-update",
            userID: userId
        });

        // 3. Send initial 'playerList' containing *all* current players in this world
        const currentPlayersData = Object.entries(this.players).map(([id, playerInfo]) => ({
            userID: id,
            wizard: playerInfo.wizardData, // Use the stored wizardData
            zone: playerInfo.zone,
            position: { x: playerInfo.x, y: playerInfo.y }
        }));
        console.log(`Sending 'playerList' (${currentPlayersData.length} players) to ${userId}.`);
        socket.emit("playerList", { players: currentPlayersData });


        // --- Notify OTHER existing players about the new player ---
        console.log(`Broadcasting 'playerJoined', 'wizard-update', 'zone-update' for ${userId} to others.`);
        socket.broadcast.to(this.id).emit("playerJoined", {
            userID: userId,
            wizard: newPlayerWizardObject.wizard,
            zone: zone,
            position: { x: initialX, y: initialY } // Include position for new player
        });
        socket.broadcast.to(this.id).emit("message", { // Often wrapped in "message" event for client
            event: "wizard-update",
            wizard: newPlayerWizardObject.wizard,
            userID: newPlayerWizardObject.userID
        });
        socket.broadcast.to(this.id).emit("message", { // Often wrapped in "message" event for client
            event: "zone-update",
            zone: zone,
            position: { x: initialX, y: initialY },
            inworld: true,
            userID: userId
        });


        // --- Set up event listeners for this specific client socket ---
        socket.on("message", (data) => {
            try {
                const parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
                console.log(`Received message from ${userId} in world ${this.id}:`, parsedData);

                if (parsedData.type === "playerMove" && parsedData.payload) {
                    this.players[userId].x = parsedData.payload.x;
                    this.players[userId].y = parsedData.payload.y;
                    socket.broadcast.to(this.id).emit("playerMove", { userID: userId, x: parsedData.payload.x, y: parsedData.payload.y });
                    console.log(`Player ${userId} moved to (${parsedData.payload.x}, ${parsedData.payload.y}).`);
                } else if (parsedData.type === "chatMessage" && parsedData.payload && parsedData.payload.message) {
                    socket.to(this.id).emit("chatMessage", { userID: userId, message: parsedData.payload.message });
                    console.log(`Player ${userId} chatted: "${parsedData.payload.message}"`);
                }
            } catch (e) {
                console.error(`Error parsing or handling message from ${userId} in world ${this.id}:`, e, "Raw data:", data);
            }
        });

        socket.on("disconnect", (reason) => {
            console.log(`User ${userId} (Socket.ID: ${socket.id}) disconnected from world ${this.name}. Reason: ${reason}`);
            if (this.players[userId]) {
                delete this.players[userId];
                this.playerCount--;
                socket.broadcast.to(this.id).emit("playerLeft", { userID: userId, reason: reason });
                console.log(`Current players in ${this.name}: ${this.playerCount}`);
            }
        });

        socket.on("error", (error) => {
            console.error(`Socket.IO error for user ${userId} in world ${this.id}:`, error);
        });
    }

    // Static property to hold all defined worlds.
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
