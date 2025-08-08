// World.js

class World {
    constructor(name, ownerId, maxPlayers, tag, icon, path) {
        this.name = name;
        this.id = name.toLowerCase().replace(/\s/g, '-');
        this.ownerId = ownerId;
        this.maxPlayers = maxPlayers;
        this.tag = tag;

        // ✅ Ensure icon is a full URL/path
        this.icon = `/assets/icons/${icon}.png`; 

        this.path = path;

        this.players = {};
        this.playerCount = 0;
    }

    get full() {
        if (this.maxPlayers === 0) return 0;
        return Math.min(100, Math.floor((this.playerCount / this.maxPlayers) * 100));
    }

    addPlayer(userId, zone, socket) {
        if (this.players[userId]) {
            console.log(`Player ${userId} already in world ${this.name}, updating connection.`);
            this.players[userId].socket.close();
            delete this.players[userId];
            this.playerCount--;
        }

        if (this.playerCount >= this.maxPlayers) return false;

        this.players[userId] = { zone, socket };
        this.playerCount++;
        return true;
    }

    removePlayer(userId) {
        if (!this.players[userId]) return false;
        const { socket } = this.players[userId];
        if (socket && socket.readyState === 1) socket.close();
        delete this.players[userId];
        this.playerCount--;
        return true;
    }

    broadcast(type, payload) {
        const message = JSON.stringify({ type, payload });
        for (const { socket } of Object.values(this.players)) {
            if (socket.readyState === 1) socket.send(message);
        }
    }

    broadcastExcept(excludeUserId, type, payload) {
        const message = JSON.stringify({ type, payload });
        for (const [uid, { socket }] of Object.entries(this.players)) {
            if (uid !== excludeUserId && socket.readyState === 1) socket.send(message);
        }
    }

    getPlayerList() {
        return Object.keys(this.players);
    }

    updatePlayerPosition(userId, x, y) {
        if (this.players[userId]) {
            this.players[userId].x = x;
            this.players[userId].y = y;
            this.broadcastExcept(userId, "playerMoved", { userId, x, y });
        }
    }

    getBroadcastData() {
        return {
            id: this.id,
            name: this.name,
            path: this.path,
            icon: this.icon, // ✅ Now a real image path
            playerCount: this.playerCount,
            maxPlayers: this.maxPlayers,
            tag: this.tag,
            full: this.full
        };
    }

    static allWorlds = [
        new World("Fireplane", "admin", 50, "adventure", "fire", "/worlds/fireplane"),
        new World("Ice Caverns", "admin", 30, "dungeon", "ice", "/worlds/ice-caverns"),
        new World("Sky Sanctuary", "admin", 40, "quest", "sky", "/worlds/sky-sanctuary"),
        new World("Deep Woods", "admin", 60, "explore", "tree", "/worlds/deep-woods")
    ];
}

module.exports = World;
