// World.js
// This class encapsulates the logic for an individual game world.
const WebSocket = require("ws");

class World {
  constructor(name, path, icon, maxConnections) {
    this.name = name;
    this.path = path;
    this.icon = icon;
    this.maxConnections = maxConnections;
    this.players = 0; // Tracks the number of connected players.
    
    // Create a new WebSocket server for this specific world.
    this.wss = new WebSocket.Server({ noServer: true });

    // Handle incoming connections for this world.
    this.wss.on("connection", (ws) => {
      this.players++;
      console.log(`🌐 Player connected to ${this.name}. Current players: ${this.players}`);
      
      // Notify all clients in this world about the player count update.
      this.broadcastWorldsUpdate();

      // Handle messages from the client.
      ws.on("message", (msg) => {
        try {
          const data = JSON.parse(msg);
          if (data.type === "login" && data.userId) {
            console.log(`✅ User logged in: ${data.userId}`);
            // Broadcast a message to all clients about the new player.
            this.broadcast({ type: "playerJoined", userId: data.userId });
          }
        } catch (e) {
          console.error(`Invalid message received in ${this.name} world:`, e);
        }
      });

      // Handle client disconnection.
      ws.on("close", () => {
        this.players--;
        console.log(`❌ Player disconnected from ${this.name}. Current players: ${this.players}`);
        this.broadcastWorldsUpdate();
      });
    });
  }

  // Helper method to send a message to all connected clients in this world.
  broadcast(message) {
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(message));
      }
    });
  }
  
  // Sends a message to all clients with the updated world list.
  broadcastWorldsUpdate() {
    // Note: The world list would typically be managed by the main server.
    // For this example, we'll send a simplified update.
    this.broadcast({ 
      type: "worldUpdate",
      world: {
        name: this.name,
        path: this.path,
        icon: this.icon,
        full: this.players
      }
    });
  }
}

module.exports = World;
