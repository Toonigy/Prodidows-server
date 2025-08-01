const WebSocket = require("ws");

/**
 * A class representing a single game world.
 * Each World instance manages its own WebSocket server and player connections.
 */
class World {
  /**
   * Creates an instance of a World.
   * @param {string} name The name of the world (e.g., "Fireplane").
   * @param {string} path The WebSocket path for this world (e.g., "/worlds/fireplane").
   * @param {string} icon The icon associated with the world.
   * @param {number} maxConnections The maximum number of players allowed in this world.
   * @param {Function} playerCountChangeCallback A callback to notify the main server of player count changes.
   */
  constructor(name, path, icon, maxConnections, playerCountChangeCallback) {
    this.name = name;
    this.path = path;
    this.icon = icon;
    this.maxConnections = maxConnections;
    this.players = 0;
    this.playerCountChangeCallback = playerCountChangeCallback;

    // Create a new WebSocket server instance for this specific world, but don't listen yet.
    // The main HTTP server will handle the 'upgrade' event for us.
    this.wss = new WebSocket.Server({ noServer: true });

    // Handle new connections to this world's WebSocket server.
    this.wss.on("connection", (ws) => {
      console.log(`✅ Player connected to world: ${this.name}`);
      this.players++;
      this.playerCountChangeCallback(); // Notify the main server of the player count change

      // Listen for messages from this player
      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message);
          // Simple example of handling a message
          if (data.type === "player_update") {
            // Broadcast the player update to all other clients in this world.
            this.wss.clients.forEach(client => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
              }
            });
          }
        } catch (e) {
          console.error("Failed to parse message from client:", e);
        }
      });

      // Handle a player disconnecting from this world
      ws.on("close", () => {
        console.log(`❌ Player disconnected from world: ${this.name}`);
        this.players--;
        this.playerCountChangeCallback(); // Notify the main server of the player count change
      });
    });
  }
}

// Export the World class so it can be imported by other files.
module.exports = World;
