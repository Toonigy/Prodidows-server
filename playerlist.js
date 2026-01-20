/**
 * Player List Module
 * Handles the retrieval and formatting of player data for world list API requests.
 */

module.exports = (activePlayers) => {
    /**
     * Returns an array of formatted player objects currently active in the world.
     * Used by the /worlds and /game-api/v2/worlds endpoints.
     */
    const getFormattedPlayerList = () => {
        const players = [];
        activePlayers.forEach((player) => {
            // Only include players who have completed registration
            if (player && player.userID && player.userID !== "Connecting...") {
                players.push({
                    userID: player.userID,
                    name: player.name || "Wizard",
                    level: player.level || 1,
                    appearance: player.appearance || {},
                    stars: player.stars || 0
                });
            }
        });
        return players;
    };

    /**
     * Returns a summary for the world list.
     */
    const getWorldSummary = (worldId = "Crystal Caverns") => {
        const players = getFormattedPlayerList();
        return {
            id: worldId,
            name: worldId,
            playerCount: players.length,
            players: players,
            maxPlayers: 100,
            isFull: players.length >= 100
        };
    };

    return {
        getFormattedPlayerList,
        getWorldSummary
    };
};
