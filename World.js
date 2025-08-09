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
                "data": {
                    "settings": { "bgmVolume": 0.3, "sfxVolume": 0.9, "voiceVolume": 1 },
                    "zone": zoneId,
                    "allowsHouseVisitors": false, "hp": 709, "team": 0,
                    "spellbook": [ 22, 36, 5, 11, 17, 29 ],
                    "stars": 92447, "level": 83, "gold": 117766, "useOldTutorialPath": false,
                    "dailyLoginBonus": { "session": 0, "day": 2, "date": { "d": 7, "m": 7, "y": 2025 } },
                    "reward": 1, "rewardData": null, "rate": 5,
                    "spells": [ 13, 14, 15, 16, 17, 19, 20, 21, 22, 23, 1, 25, 7, 8, 2, 9, 10, 26, 27, 11, 3, 28, 29, 4, 5 ],
                    "arenaScore": 3823, "win": 70, "giveaways": { "seen": [], "applied": [], "recieved": [] },
                    "loss": 7, "arena": 16, "tower": 55,
                    "spinDate": { "d": 8, "m": 7, "y": 2025, "twilightDates": [ 1754618597269, 1754618599302 ] },
                    "numSpins": 2, "bountyScore": 1, "arenaRank": 4
                },
                "isMember": true
            },
            "userID": userId
        };
    }

    handleConnection(socket) {
        const userId = socket.handshake.query.userID;
        const worldId = socket.handshake.query.worldId;
        const zone = socket.handshake.query.zone || "skywatch-C3";
        const authKey = socket.handshake.query.authKey;

        console.log(`\n-- World Connection Handler (${this.name}) --`);
        console.log(`Processing connection for User ID: ${userId || 'N/A'}, World ID: ${worldId || 'N/A'}, Zone: ${zone}, AuthKey: ${authKey ? 'PRESENT' : 'MISSING'}`);

        if (!userId || !worldId || !authKey) {
            console.error(`ERROR in World.handleConnection: Missing critical data. Disconnecting socket ${socket.id}.`);
            socket.emit("serverConnectionError", "Server received incomplete player data.");
            socket.disconnect(true);
            return;
        }

        if (this.playerCount >= this.maxPlayers) {
            console.warn(`WARNING: World ${this.id} is full (${this.playerCount}/${this.maxPlayers}). User ${userId} denied.`);
            socket.emit("serverConnectionError", "World is full. Please select another world.");
            socket.disconnect(true);
            return;
        }

        socket.join(this.id);
        
        const initialX = Math.floor(Math.random() * 1000) + 100;
        const initialY = Math.floor(Math.random() * 500) + 100;
        const wizardDataContainer = this._getMockWizardData(userId, zone);
        const newPlayerWizard = wizardDataContainer.wizard;
        const newPlayerUserID = wizardDataContainer.userID;

        this.players[userId] = {
            socketId: socket.id, zone: zone, wizardData: newPlayerWizard, x: initialX, y: initialY
        };
        this.playerCount++;
        console.log(`SUCCESS: User ${userId} (Socket.ID: ${socket.id}) added to world. Players in ${this.name}: ${this.playerCount}`);


        // --- Send initial state to the NEWLY CONNECTED client (the user who just clicked) ---
        console.log(`Sending YOUR wizard-update to ${userId}.`);
        socket.emit("message", {
            event: "wizard-update",
            wizard: newPlayerWizard,
            userID: newPlayerUserID
        });

        console.log(`Sending YOUR zone-update to ${userId} (pos: ${initialX}, ${initialY}).`);
        socket.emit("message", {
            zone: zone,
            position: { x: initialX, y: initialY },
            inworld: true,
            event: "zone-update",
            userID: userId
        });

        const currentPlayersData = Object.entries(this.players).map(([id, playerInfo]) => ({
            userID: id, wizard: playerInfo.wizardData, zone: playerInfo.zone, position: { x: playerInfo.x, y: playerInfo.y }
        }));
        console.log(`Sending playerList (${currentPlayersData.length} total players) to ${userId}.`);
        socket.emit("playerList", { players: currentPlayersData });


        // --- Notify OTHER existing players about the new player ---
        if (this.playerCount > 1) {
            console.log(`Broadcasting new player (${userId}) info to other players in ${this.name}.`);
            socket.broadcast.to(this.id).emit("playerJoined", {
                userID: newPlayerUserID,
                wizard: newPlayerWizard,
                zone: zone,
                position: { x: initialX, y: initialY }
            });
            socket.broadcast.to(this.id).emit("message", {
                event: "wizard-update",
                wizard: newPlayerWizard,
                userID: newPlayerUserID
            });
            socket.broadcast.to(this.id).emit("message", {
                event: "zone-update",
                zone: zone,
                position: { x: initialX, y: initialY },
                inworld: true,
                userID: newPlayerUserID
            });
        } else {
            console.log(`No other players in ${this.name} to broadcast to.`);
        }


        // --- Set up event listeners for this specific client socket ---
        socket.on("message", (data) => {
            try {
                const parsedData = (typeof data === 'string') ? JSON.parse(data) : data;
                console.log(`\n-- Message from ${userId} in ${this.name} --`);
                console.log(`Type: ${parsedData.type}, Payload:`, parsedData.payload);

                if (parsedData.type === "playerMove" && parsedData.payload) {
                    this.players[userId].x = parsedData.payload.x;
                    this.players[userId].y = parsedData.payload.y;
                    socket.broadcast.to(this.id).emit("playerMove", { userID: userId, x: parsedData.payload.x, y: parsedData.payload.y });
                    console.log(`Player ${userId} moved to (${parsedData.payload.x}, ${parsedData.payload.y}). Broadcasting.`);
                } else if (parsedData.type === "chatMessage" && parsedData.payload && parsedData.payload.message) {
                    socket.to(this.id).emit("chatMessage", { userID: userId, message: parsedData.payload.message });
                    console.log(`Player ${userId} chatted: "${parsedData.payload.message}". Broadcasting.`);
                } else {
                    console.log(`UNHANDLED MESSAGE from ${userId}:`, parsedData);
                }
            } catch (e) {
                console.error(`ERROR parsing or handling message from ${userId}:`, e, "Raw data:", data);
            }
        });

        socket.on("disconnect", (reason) => {
            console.log(`\n-- Disconnect from ${this.name} --`);
            console.log(`User ${userId} (Socket.ID: ${socket.id}) disconnected. Reason: ${reason}`);
            if (this.players[userId]) {
                delete this.players[userId];
                this.playerCount--;
                socket.broadcast.to(this.id).emit("playerLeft", { userID: userId, reason: reason });
                console.log(`Remaining players in ${this.name}: ${this.playerCount}`);
            }
        });

        socket.on("error", (error) => {
            console.error(`\n-- Socket.IO Error in ${this.name} for ${userId} --`);
            console.error(`Error:`, error);
        });
        console.log(`----------------------------------\n`);
    }

    // ⭐ CRITICAL: This static property must be defined correctly at the end of the class. ⭐
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
