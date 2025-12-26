/**
 * Prodigy World Connection Bridge
 * Forces the game's internal NetworkHandler to use Socket.io instead of XHR for world joining.
 */

(function() {
    console.log("%c [World Bridge] Initializing Socket-to-Game Link...", "color: #ffa500; font-weight: bold;");

    const injectBridge = () => {
        // Ensure the game engine and Network system are ready
        if (typeof Prodigy !== 'undefined' && Prodigy.Network && Prodigy.Network.NetworkHandler) {
            
            // 1. Patch emitMessage to pipe data through our socket
            const originalEmit = Prodigy.Network.NetworkHandler.prototype.emitMessage;
            
            Prodigy.Network.NetworkHandler.prototype.emitMessage = function(packet) {
                console.log("[World Bridge] Intercepted Packet:", packet.action, packet.data);

                // If the game is trying to join a world
                if (packet.action === "join" || this._state === "join") {
                    const worldData = packet.data || {};
                    
                    if (window.socket && window.socket.connected) {
                        console.log("[World Bridge] Redirecting 'join' to Socket.io...");
                        
                        // Send to your server.js 'join:world' listener
                        window.socket.emit('join:world', {
                            ID: worldData.worldID || worldData.id || this._data.worldID,
                            userID: window.Prodigy.game.prodigy.player.userID
                        });

                        // 2. Manually trigger the "success" state in the game 
                        // This prevents the infinite "Connecting" spinner
                        setTimeout(() => {
                            console.log("[World Bridge] Faking successful connection response...");
                            this.completed(); // This tells the game the 'join' action finished
                        }, 500);

                        return; // Stop the original XHR from firing
                    }
                }

                return originalEmit.apply(this, arguments);
            };

            // 3. Patch the Update loop to prevent Heartbeat timeouts
            const originalUpdate = Prodigy.Network.NetworkHandler.prototype.update;
            Prodigy.Network.NetworkHandler.prototype.update = function() {
                // Keep the timeout far in the future so we don't get 'Connection Lost'
                if (this._processConnections && this._timeout) {
                    this._timeout = (new Date).getTime() + 60000; 
                }
                return originalUpdate.apply(this, arguments);
            };

            console.log("[World Bridge] NetworkHandler Patched Successfully.");
        } else {
            setTimeout(injectBridge, 500);
        }
    };

    injectBridge();
})();
