// World.js - Relevant section for sending player data

class World {
    // ... (constructor and other methods remain the same) ...

    _getMockWizardData(userId, zoneId) {
        // This function now provides the exact detailed wizard structure as per your request
        // ... (This function remains the same as your last update, providing full wizard data) ...
        return {
            "wizard": { /* ... full wizard data as previously provided ... */ },
            "userID": userId
        };
    }

    handleConnection(socket) {
        // ... (initial connection, query param parsing, and basic checks remain the same) ...

        const userId = socket.handshake.query.userID;
        const worldId = socket.handshake.query.worldId;
        const zone = socket.handshake.query.zone || "skywatch-C3";
        const authKey = socket.handshake.query.authKey;

        // ... (connection validation and player count check) ...

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
        // This client needs to know about ITSELF and ALL OTHER existing players.
        console.log(`Sending YOUR wizard-update to ${userId}.`);
        socket.emit("message", {
            event: "wizard-update",
            wizard: newPlayerWizard, // Full wizard data for self
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

        // ⭐ CRITICAL: Send a complete playerList to the NEWLY JOINING client ⭐
        // This list includes the new player AND all existing players, with their full wizard data and positions.
        const currentPlayersData = Object.entries(this.players).map(([id, playerInfo]) => ({
            userID: id,
            wizard: playerInfo.wizardData, // Ensure full wizard data is included for all players
            zone: playerInfo.zone,
            position: { x: playerInfo.x, y: playerInfo.y }
        }));
        console.log(`Sending playerList (${currentPlayersData.length} total players) to ${userId}.`);
        socket.emit("playerList", { players: currentPlayersData });


        // --- Notify OTHER existing players about the new player ---
        // Existing players need to know that a NEW player has joined.
        if (this.playerCount > 1) { // Only broadcast if there are other players to notify
            console.log(`Broadcasting new player (${userId}) info to other players in ${this.name}.`);
            socket.broadcast.to(this.id).emit("playerJoined", {
                userID: newPlayerUserID,
                wizard: newPlayerWizard, // Full wizard data for the new player
                zone: zone,
                position: { x: initialX, y: initialY } // Include position for new player
            });
            // Also send 'wizard-update' and 'zone-update' for the new player to others (as game.min.js often expects this pattern)
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

        // ... (socket.on event listeners for 'message', 'disconnect', 'error' remain the same) ...
    }
    // ... (static allWorlds array remains the same) ...
}

module.exports = World;
