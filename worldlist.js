/**
 * Defines the base list of available game worlds/instances.
 * This data is used to populate the server list for the client.
 */
const baseWorlds = [
    // --- Shiverchill Mountain Worlds (Ice Element) ---
    { id: 'shiverchill-1', name: 'Shiverchill Mountain - 1', basePath: '/worlds/shiverchill', icon: 'ice', maxPlayers: 50 },
    { id: 'shiverchill-2', name: 'Shiverchill Mountain - 2', basePath: '/worlds/shiverchill', icon: 'ice', maxPlayers: 50 },
    { id: 'shiverchill-3', name: 'Shiverchill Mountain - 3', basePath: '/worlds/shiverchill', icon: 'ice', maxPlayers: 50 },
    { id: 'shiverchill-4', name: 'Shiverchill Mountain - 4', basePath: '/worlds/shiverchill', icon: 'ice', maxPlayers: 50 },
    
    // --- Bonfire Spire Worlds (Fire Element) ---
    { id: 'bonfire-1', name: 'Bonfire Spire - 1', basePath: '/worlds/bonfire', icon: 'fire', maxPlayers: 50 },
    { id: 'bonfire-2', name: 'Bonfire Spire - 2', basePath: '/worlds/bonfire', icon: 'fire', maxPlayers: 50 },
    { id: 'bonfire-3', name: 'Bonfire Spire - 3', basePath: '/worlds/bonfire', icon: 'fire', maxPlayers: 50 },
    
    // --- Fireplane Worlds (Fire Element) ---
    { id: 'fireplane-1', name: 'Fireplane - 1', basePath: '/worlds/fireplane', icon: 'fire', maxPlayers: 50 }, 
    { id: 'fireplane-2', name: 'Fireplane - 2', basePath: '/worlds/fireplane', icon: 'fire', maxPlayers: 50 },
    { id: 'fireplane-3', name: 'Fireplane - 3', basePath: '/worlds/fireplane', icon: 'fire', maxPlayers: 50 }, 
];

/**
 * Helper function to return a list of available worlds with current player counts.
 * It takes the live activePlayers object from the server state maintained in server.js.
 * * @param {object} activePlayers - The server's map of active players, keyed by socketId.
 * @returns {Array} A list of world objects structured for the client, ensuring it is always an array.
 */
const getAvailableWorlds = (activePlayers) => {
    try {
        // 1. Count players in active worlds based on the real-time state
        const worldCounts = Object.values(activePlayers).reduce((acc, player) => {
            acc[player.worldID] = (acc[player.worldID] || 0) + 1;
            return acc;
        }, {});

        // 2. Map base worlds and update player counts to match expected client structure
        return baseWorlds.map(world => {
            const playerCount = worldCounts[world.id] || 0;
            const isFull = playerCount >= world.maxPlayers;
            
            // Returning the minimal object required by the old client for the menu
            // Ensuring all required fields are present
            return {
                full: isFull ? 1 : 0, // 0 for available, 1 for full (required)
                // FIX: Changed 'icon' to 'type'. The client's Util.convertItemToIcon expects the property name 'type'.
                type: world.icon,     // e.g., 'fire', 'ice' (required)
                // NEW FIX: Add ID to satisfy Util.convertItemToIcon for creating the icon path (e.g., 'fire/1')
                ID: 1, 
                name: world.name,     // e.g., 'Fireplane' (required)
                path: `${world.basePath}/${world.id}`, // e.g., /worlds/fireplane/fireplane-1 (required for connection)
                
                // Keeping ID and player count for utility/debugging
                id: world.id,
                players: playerCount
            };
        });
    } catch (e) {
        // Log the error and return an empty array to prevent client-side sort errors
        console.error("Error in getAvailableWorlds:", e);
        return [];
    }
};

module.exports = {
    getAvailableWorlds,
    baseWorlds 
};
