const axios = require('axios');

/**
 * Registration Module
 * Handles fetching user data from Firebase RTDB and normalizing character appearances.
 */

// Firebase Configuration for reference and internal use
const firebaseConfig = {
    apiKey: "AIzaSyAkqq1G5oxjdN5z-rYApExpJvlEiXG04os",
    authDomain: "prodigyplus1500.firebaseapp.com",
    databaseURL: "https://prodigyplus1500-default-rtdb.firebaseio.com",
    projectId: "prodigyplus1500",
    storageBucket: "prodigyplus1500.firebasestorage.app",
    messagingSenderId: "457513275768",
    appId: "1:457513275768:web:4527fe6ad1892798e5f88d",
    measurementId: "G-4L0QLCF2HD"
};

module.exports = (RTDB_URL, FB_SECRET, Util) => {

    /**
     * Normalizes raw appearance data from the database into a format 
     * the game engine expects for rendering sprites.
     */
    const normalizeAppearance = (rawAppearance) => {
        if (!rawAppearance) {
            return { name: "Wizard", gender: "male", hair: { style: 1, color: 1 }, skin: 1, face: 1 };
        }

        let appearance = rawAppearance;
        if (typeof rawAppearance === 'string') {
            try {
                appearance = JSON.parse(rawAppearance);
            } catch (e) {
                appearance = {};
            }
        }

        return {
            gender: appearance.gender || "male",
            name: appearance.name || "Wizard",
            hair: { 
                style: appearance.hairStyle || appearance.hair?.style || 1, 
                color: appearance.hairColor || appearance.hair?.color || 1 
            },
            skin: appearance.skinColor || appearance.skin || 1,
            face: appearance.face || 1
        };
    };

    /**
     * Fetches complete character data from Firebase RTDB for a specific UID.
     */
    const getCharacterData = async (uid) => {
        if (!uid || uid === "undefined") return null;

        try {
            // Priority: Use the provided RTDB_URL (from factory) or fallback to config
            const base_url = RTDB_URL || firebaseConfig.databaseURL;
            const authParam = FB_SECRET ? `?auth=${FB_SECRET}` : "";
            const url = `${base_url}/users/${uid}.json${authParam}`;
            
            const response = await axios.get(url, { timeout: 4000 });
            const raw = response.data;

            if (!raw) {
                Util.log(`No database record found for UID: ${uid}`, "DEBUG");
                return null;
            }

            const appearance = normalizeAppearance(raw.appearancedata);
            
            // Map RTDB structure to the internal Server Player object
            return {
                userID: uid,
                name: appearance.name,
                appearance: appearance,
                stars: parseInt(raw.data?.stars) || 0,
                level: parseInt(raw.data?.level) || 1,
                data: { 
                    level: parseInt(raw.data?.level) || 1, 
                    stars: parseInt(raw.data?.stars) || 0 
                },
                x: 0, 
                y: 0
            };
        } catch (e) {
            if (Util) Util.log(`Character Fetch Error (UID: ${uid}): ${e.message}`, "ERROR");
            return null;
        }
    };

    return {
        normalizeAppearance,
        getCharacterData,
        config: firebaseConfig // Exporting config if needed elsewhere
    };
};
