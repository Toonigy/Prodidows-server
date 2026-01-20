/**
 * Player Broadcast Module
 * Manages the synchronization of player states across all connected clients.
 */

module.exports = (io, activePlayers) => {
    
    // Returns a list of all validated UIDs currently in the world
    const getActiveUIDs = () => {
        return Array.from(activePlayers.values())
            .filter(p => p.userID && p.userID !== "Connecting..." && p.userID !== null)
            .map(p => p.userID);
    };

    // Broadcasts the global player list (UIDs) to everyone
    const broadcastPlayerList = () => {
        const uids = getActiveUIDs();
        io.emit('player_list', uids);
    };

    // Notifies others of a new join and shares character appearance
    const announceJoin = (socket, playerData) => {
        // 1. Tell everyone else this specific UID joined
        socket.broadcast.emit('player_joined', playerData.userID);
        
        // 2. Send the new player's full info to everyone else
        socket.broadcast.emit('player_full_info', playerData);
        
        // 3. IMPORTANT: Send all CURRENT players' full info to the NEW player
        // Without this, the new player sees an empty world even if 10 people are there
        activePlayers.forEach((otherPlayer) => {
            if (otherPlayer.userID && otherPlayer.userID !== playerData.userID && otherPlayer.userID !== "Connecting...") {
                socket.emit('player_full_info', otherPlayer);
            }
        });
        
        // 4. Refresh the global list for everyone
        broadcastPlayerList();
    };

    // Notifies others when a player leaves
    const announceLeave = (userID) => {
        if (!userID || userID === "Connecting...") return;
        io.emit('player_left', userID);
        broadcastPlayerList();
    };

    // Broadcasts movement updates
    const broadcastMove = (socket, player) => {
        if (!player.userID || player.userID === "Connecting...") return;
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
