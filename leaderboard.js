const express = require('express');
const router = express.Router();

/**
 * Leaderboard Module
 * Handles the retrieval of the global game leaderboard.
 */

module.exports = (activePlayers, normalizeAppearance) => {
    
    // GET /leaderboard
    router.get('/', (req, res) => {
        // In a real production environment, you would query your Database (RTDB/Firestore)
        // and sort by stars/level. For now, we utilize the live activePlayers state.
        
        const mockLeaders = Array.from(activePlayers.values())
            .filter(p => p.userID && p.userID !== "Connecting...")
            .slice(0, 10)
            .map((player, index) => ({
                userID: player.userID,
                name: player.name || "Wizard",
                username: player.name || "Wizard",
                rank: index + 1,
                stars: player.stars || 0,
                level: player.level || 1,
                isMember: 1,
                appearance: player.appearance || normalizeAppearance({})
            }));

        // Provide a fallback if no players are currently online
        if (mockLeaders.length === 0) {
            mockLeaders.push({ 
                userID: "OFFLINE_HERO", 
                name: "Grand Master", 
                username: "Grand Master", 
                rank: 1, 
                stars: 9999, 
                level: 100, 
                isMember: 1, 
                appearance: normalizeAppearance({ name: "Grand Master"}) 
            });
        }

        res.json({ 
            success: true, 
            leaderboard: mockLeaders 
        });
    });

    return router;
};
