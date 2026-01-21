/**
 * Player Broadcast Module
 * Manages the synchronization of player states across all connected clients.
 * Enhanced with deep debugging for state-tracking.
 */

module.exports = (io, activePlayers) => {
    
    const logBroadcast = (msg, context = "Broadcaster") => {
        console.log(`[${new Date().toLocaleTimeString()}] [DEBUG] [${context}] ${msg}`);
    };

    // Returns a list of all validated UIDs currently in the world
    const getActiveUIDs = () => {
        return Array.from(activePlayers.values())
            .filter(p => p.userID && p.userID !== "Connecting..." && p.userID !== null)
            .map(p => p.userID);
    };

    // Broadcasts the global player list (UIDs) to everyone
    const broadcastPlayerList = () => {
        const uids = getActiveUIDs();
        logBroadcast(`Broadcasting global UID list. Count: ${uids.length}`);
        io.emit('player_list', uids);
    };

    // Notifies others of a new join and shares character appearance
    const announceJoin = (socket, playerData) => {
        const uid = playerData.userID;
        logBroadcast(`Announcing join for UID: ${uid}`, "JoinSync");

        // 1. Tell everyone else this specific UID joined
        socket.broadcast.emit('player_joined', uid);
        
        // 2. Send the new player's full info to everyone else
        socket.broadcast.emit('player_full_info', playerData);
        
        // 3. IMPORTANT: Send all CURRENT players' full info to the NEW player
        // This is the most critical step for visibility synchronization
        let syncCount = 0;
        activePlayers.forEach((otherPlayer) => {
            if (otherPlayer.userID && otherPlayer.userID !== uid && otherPlayer.userID !== "Connecting...") {
                socket.emit('player_full_info', otherPlayer);
                syncCount++;
            }
        });
        
        logBroadcast(`Synchronized ${syncCount} existing players to new player ${uid}`, "JoinSync");
        
        // 4. Refresh the global list for everyone
        broadcastPlayerList();
    };

    // Notifies others when a player leaves
    const announceLeave = (userID) => {
        if (!userID || userID === "Connecting...") return;
        
        logBroadcast(`Announcing leave for UID: ${userID}`, "LeaveSync");
        io.emit('player_left', userID);
        broadcastPlayerList();
    };

    // Broadcasts movement updates
    const broadcastMove = (socket, player) => {
        if (!player.userID || player.userID === "Connecting...") return;
        
        // Only log movement occasionally to prevent console flooding
        if (Math.random() < 0.05) {
            logBroadcast(`Broadcasting move for ${player.userID} to (${player.x}, ${player.y})`, "MoveSync");
        }

        socket.broadcast.emit('player_moved', {
            userID: player.userID,
            x: player.x,
            y: player.y,
            appearance: player.appearance
        });
    };

    return {
        broadcastPlayerList,
        announceJoin,
        announceLeave,
        broadcastMove
    };
};
