// World.js

class World {
    // Added 'path' to constructor, removed 'full' as it's a getter
    constructor(name, ownerId, maxPlayers, tag, icon, path) {
        this.name = name;
        this.id = name.toLowerCase().replace(/\s/g, '-'); // Automatically generate ID
        this.ownerId = ownerId; // Owner ID for this world
        this.maxPlayers = maxPlayers; // Maximum players allowed in this world
        this.tag = tag;
        this.icon = icon; // Icon for the world (e.g., "fire", "ice")
        this.path = path; // ⭐ NEW: Explicit path for the world

        this.players = {}; // { userId: { zone, socket } }
        this.playerCount = 0; // Current number of players in the world
    }

    /**
     * Getter for the 'full' status, calculated as a percentage.
     * This will provide a value from 0 to 100, which game.min.js expects.
     * @returns {number} Percentage of world fullness (0-100).
     */
    get full() {
        if (this.maxPlayers === 0) {
            return 0; // Avoid division by zero if maxPlayers is 0
        }
        return Math.min(100, Math.floor((this.playerCount / this.maxPlayers) * 100));
    }

    /**
     * Adds a player to the world.
     * @param {string} userId - The ID of the user.
     * @param {string} zone - The zone the player is in.
     * @param {WebSocket} socket - The WebSocket connection for the player.
     * @returns {boolean} True if the player was added, false if the world is full or player already exists.
     */
    addPlayer(userId, zone, socket) {
        if (this.players[userId]) {
            // Player already exists, close existing socket and update
            console.log(`Player ${userId} already in world ${this.name}, updating connection.`);
            this.players[userId].socket.close(); // Close old connection
            delete this.players[userId];
            this.playerCount--;
        }

        if (this.playerCount >= this.maxPlayers) {
            return false;
        }

        this.players[userId] = { zone, socket };
        this.playerCount++;
        return true;
    }

    /**
     * Removes a player from the world.
     * @param {string} userId - The ID of the user to remove.
     * @returns {boolean} True if the player was removed, false if not found.
     */
    removePlayer(userId) {
        if (!this.players[userId]) return false;

        const { socket } = this.players[userId];
        if (socket && socket.readyState === 1) {
            socket.close();
        }

        delete this.players[userId];
        this.playerCount--;
        return true;
    }

    /**
     * Broadcasts a message to all players in the world.
     * @param {string} type - The type of message.
     * @param {object} payload - The message payload.
     */
    broadcast(type, payload) {
        const message = JSON.stringify({ type, payload });
        for (const { socket } of Object.values(this.players)) {
            if (socket.readyState === 1) { // Check if socket is open
                socket.send(message);
            }
        }
    }

    /**
     * Broadcasts a message to all players in the world except one.
     * @param {string} excludeUserId - The ID of the user to exclude from the broadcast.
     * @param {string} type - The type of message.
     * @param {object} payload - The message payload.
     */
    broadcastExcept(excludeUserId, type, payload) {
        const message = JSON.stringify({ type, payload });
        for (const [uid, { socket }] of Object.entries(this.players)) {
            if (uid !== excludeUserId && socket.readyState === 1) {
                socket.send(message);
            }
        }
    }

    /**
     * Gets a list of user IDs currently in the world.
     * @returns {string[]} An array of user IDs.
     */
    getPlayerList() {
        return Object.keys(this.players);
    }

    /**
     * Updates a player's position and broadcasts it to others.
     * @param {string} userId - The ID of the user whose position is being updated.
     * @param {number} x - The new X coordinate.
     * @param {number} y - The new Y coordinate.
     */
    updatePlayerPosition(userId, x, y) {
        if (this.players[userId]) {
            this.players[userId].x = x;
            this.players[userId].y = y;
            // Broadcast the updated position to all other players in this world
            this.broadcastExcept(userId, "playerMoved", { userId, x, y });
        }
    }

    /**
     * Returns data about the world suitable for broadcasting or listing.
     * This now includes 'icon' and the dynamically calculated 'full' property.
     * @returns {object} World data.
     */
    getBroadcastData() {
        return {
            id: this.id, // Include ID for client-side use
            name: this.name,
            path: this.path, // ⭐ UPDATED: Use the explicit path
            icon: this.icon,
            playerCount: this.playerCount, // Include current player count
            maxPlayers: this.maxPlayers, // Include max players
            tag: this.tag,
            full: this.full // Now uses the dynamic getter
        };
    }

    // Static property to hold all defined worlds.
    // Constructor arguments: name, ownerId, maxPlayers, tag, icon, path
    static allWorlds = [
        // ⭐ ADDED: Fireplane world ⭐
        new World("Fireplane", "admin", 50, "adventure", "fire", "/worlds/fireplane"),
        new World("Ice Caverns", "admin", 30, "dungeon", "ice", "/worlds/ice-caverns"),
        new World("Sky Sanctuary", "admin", 40, "quest", "sky", "/worlds/sky-sanctuary"),
        new World("Deep Woods", "admin", 60, "explore", "tree", "/worlds/deep-woods")
    ];
}

module.exports = World;
