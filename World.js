// World.js

class World {
    constructor(name, ownerId, maxPlayers, tag, path, icon, full = 0) {
        this.name = name;
        this.id = name.toLowerCase().replace(/\s/g, '-');
        this.ownerId = ownerId;
        this.maxPlayers = maxPlayers;
        this.tag = tag;
        this.path = path; // Store the path for WebSocket connections
        this.icon = icon; // Store the icon name
        this.full = full; // 0: available, 1: almost full, 2: full

        this.players = {}; // { userId: { zone, socket } }
        this.playerCount = 0;
    }

    /**
     * Handles a new WebSocket connection from a client.
     * @param {WebSocket} socket
     * @param {URLSearchParams} query (from "?userId=...&zone=...")
     */
    handleConnection(socket, query) {
        const userId = query.get("userId");
        const zone = query.get("zone") || "unknown";

        if (!userId) {
            socket.close();
            return;
        }

        const added = this.addPlayer(userId, zone, socket);
        if (!added) {
            socket.send(JSON.stringify({ code: 503, message: "World is full" }));
            socket.close();
            return;
        }

        // Send player list to the new client
        socket.send(JSON.stringify({
            type: "playerList",
            payload: this.getPlayerList()
        }));

        // Notify others
        this.broadcastExcept(userId, "playerJoined", userId);

        console.log(`Player ${userId} joined world: ${this.name} in zone: ${zone}. Current players: ${this.playerCount}/${this.maxPlayers}`);
    }

    addPlayer(userId, zone, socket) {
        if (this.playerCount >= this.maxPlayers) {
            return false;
        }

        this.players[userId] = { zone, socket };
        this.playerCount++;
        return true;
    }

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

    broadcast(type, payload) {
        const message = JSON.stringify({ type, payload });
        for (const { socket } of Object.values(this.players)) {
            if (socket.readyState === 1) {
                socket.send(message);
            }
        }
    }

    broadcastExcept(excludeUserId, type, payload) {
        const message = JSON.stringify({ type, payload });
        for (const [uid, { socket }] of Object.entries(this.players)) {
            if (uid !== excludeUserId && socket.readyState === 1) {
                socket.send(message);
            }
        }
    }

    getPlayerList() {
        return Object.keys(this.players);
    }

    getBroadcastData() {
        return {
            name: this.name,
            path: this.path,
            playerCount: this.playerCount,
            maxPlayers: this.maxPlayers,
            tag: this.tag,
            icon: this.icon,
            full: this.full
        };
    }
}

// ⭐ IMPORTANT CHANGE: Define World.allWorlds explicitly after the class declaration ⭐
// This ensures the static property is assigned to the World class object before it's exported.
World.allWorlds = [
    new World("Forest Glade", "admin", 10, "Adventure", "/game-api/world/forest-glade", "tree", 0),
    new World("Desert Oasis", "admin", 5, "Survival", "/game-api/world/desert-oasis", "cactus", 0),
    new World("Mountain Peak", "admin", 2, "Challenge", "/game-api/world/mountain-peak", "mountain", 2), // Example of a full world
    new World("Underwater City", "admin", 8, "Exploration", "/game-api/world/underwater-city", "fish", 0),
    new World("Volcanic Caverns", "admin", 4, "Danger", "/game-api/world/volcanic-caverns", "volcano", 1) // Example of an almost full world
];

module.exports = World;
