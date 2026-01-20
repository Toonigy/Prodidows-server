const express = require('express');
const router = express.Router();

/**
 * World List Module
 * Handles the retrieval of available game worlds/servers.
 */

module.exports = (activePlayers) => {
    
    // GET /worlds
    router.get('/', (req, res) => {
        // Calculate population based on active players
        const currentPopulation = activePlayers.size;

        /**
         * FIX: The game engine (game.min.js:46520) calls .sort() on the response.
         * If we return { success: true, worlds: [...] }, it fails because an Object doesn't have .sort().
         * We must return the ARRAY directly.
         */
        const worlds = [
            {
                id: "prodigy-fireplane",
                name: "Fireplane",
                population: currentPopulation,
                max: 50,
                status: currentPopulation >= 50 ? "full" : "online"
            },
            {
                id: "prodigy-caverns",
                name: "Crystal Caverns",
                population: 0,
                max: 50,
                status: "online"
            },
            {
                id: "prodigy-forest",
                name: "Firefly Forest",
                population: 0,
                max: 50,
                status: "online"
            }
        ];

        // Return just the array to prevent the "e.sort is not a function" error
        res.json(worlds);
    });

    return router;
};
