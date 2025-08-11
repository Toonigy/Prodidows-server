// World.js
// This file defines the various game worlds and their properties.

class World {
    constructor(id, name, path, meta = {}) {
        this.id = id;
        this.name = name;
        this.path = path;
        this.meta = meta; // Additional metadata like element type, etc.
        this.currentPlayers = 0; // Simulate player count for display
        this.maxPlayers = 100; // Max players for this world
        // Store connected sockets for this world to manage player lists and broadcasting
        this.connectedSockets = new Map(); // Map: socket.id -> { socket, userID, wizardData }
        console.log(`🌍 World: Initialized "${this.name}" (ID: ${this.id}, Path: ${this.path})`);
    }

    /**
     * Returns a simplified object representation of the world,
     * suitable for sending to the client in the world list.
     * The client typically expects 'id', 'name', 'path', and 'full' (player count status).
     */
    toSimplifiedObject() {
        // Calculate a simulated 'fullness' percentage for demonstration
        // In a real game, this would come from actual player counts.
        const fullness = Math.floor((this.connectedSockets.size / this.maxPlayers) * 100);

        return {
            id: this.id,
            name: this.name,
            path: this.path,
            full: fullness, // Percentage of fullness (0-100)
            meta: this.meta
        };
    }

    // This method is called by WorldSystem when a Socket.IO client connects
    // to this World's associated path.
    handleConnection(socket) {
        console.log(`World "${this.name}": New raw socket connection for ID: ${socket.id}`);

        // Handle 'joinGameWorld' event after the initial socket connection.
        // This is the primary event where the client tells the server it wants to join a specific world/zone.
        socket.on('joinGameWorld', (data, callback) => {
            console.log(`World "${this.name}": Received 'joinGameWorld' from socket ${socket.id} for UserID: ${data.userID} (Zone: ${data.zone})`);

            // Basic validation
            if (!data.userID || !data.uniqueKey || !data.wizardData) {
                console.warn(`World "${this.name}": 'joinGameWorld' failed for socket ${socket.id}: Missing required data.`);
                if (callback) {
                    callback({ success: false, message: "Missing UserID, uniqueKey, or wizardData." });
                }
                return;
            }

            // Simulate adding player to the world
            const playerInfo = {
                socket: socket,
                userID: data.userID,
                wizardData: data.wizardData,
                location: { x: 100 + Math.random() * 50, y: 100 + Math.random() * 50 } // Example starting location
            };
            this.connectedSockets.set(socket.id, playerInfo);
            console.log(`World "${this.name}": Player ${data.userID} added. Total players: ${this.connectedSockets.size}`);

            // ⭐ CRITICAL: Acknowledge the 'joinGameWorld' request as successful ⭐
            if (callback) {
                callback({ success: true, message: `Successfully joined ${this.name}!` });
                console.log(`World "${this.name}": Sent 'joinGameWorld' acknowledgment success to socket ${socket.id}.`);
            }

            // ⭐ CRITICAL: Send the initial player list to the newly connected client ⭐
            // The client often waits for this to know who else is in the world and proceed.
            const playersInWorld = Array.from(this.connectedSockets.values()).map(p => ({
                userID: p.userID,
                wizardData: p.wizardData,
                location: p.location
            }));
            socket.emit('playerList', { players: playersInWorld });
            console.log(`World "${this.name}": Sent initial 'playerList' to new player ${data.userID}.`);


            // Broadcast 'playerJoined' to other existing players in this world
            socket.broadcast.to(this.path).emit('playerJoined', {
                userID: data.userID,
                wizardData: data.wizardData,
                location: playerInfo.location
            });
            console.log(`World "${this.name}": Broadcast 'playerJoined' for ${data.userID} to others.`);
        });

        // Handle socket disconnection
        socket.on('disconnect', (reason) => {
            const playerLeft = this.connectedSockets.get(socket.id);
            if (playerLeft) {
                this.connectedSockets.delete(socket.id);
                console.log(`World "${this.name}": Player ${playerLeft.userID} (socket ${socket.id}) disconnected. Reason: ${reason}. Remaining players: ${this.connectedSockets.size}`);
                // Broadcast 'playerLeft' to other players in this world
                socket.broadcast.to(this.path).emit('playerLeft', {
                    userID: playerLeft.userID,
                    reason: reason
                });
            } else {
                console.log(`World "${this.name}": Unknown socket ${socket.id} disconnected. Reason: ${reason}.`);
            }
        });

        // Add more world-specific event handlers as needed (e.g., player movement, interactions)
        // Example: Listen for generic 'message' events from the client
        socket.on('message', (messageData, callback) => {
            console.log(`World "${this.name}": Received generic message from ${socket.id}:`, messageData);
            // Optionally, process messageData and broadcast to others
            // socket.broadcast.to(this.path).emit('message', messageData);
            if (callback) {
                callback({ status: 'received', timestamp: Date.now() });
            }
        });
    }
}

// ⭐ Define all your game worlds here ⭐
World.allWorlds = [
    new World("world-fireplane-1", "Fireplane", "/worlds/fireplane", { tag: 'fire', description: 'A volcanic land' }),
    new World("world-icepeak-1", "Icepeak", "/worlds/icepeak", { tag: 'ice', description: 'Frozen mountains' }),
    new World("world-mystic-1", "Mystic Realm", "/worlds/mystic", { tag: 'magic', description: 'Enchanted forests' }),
    new World("world-town-1", "Town Square", "/worlds/town", { tag: 'town', description: 'The bustling central hub' })
    // Add more worlds as your game expands
];

module.exports = World;
