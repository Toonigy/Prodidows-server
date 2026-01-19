const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Friend API Module
 * Manages social relationships and real-time status tracking for friends.
 * Patched to support /friend-api/v1 pathing used by the game engine.
 */

module.exports = (activePlayers, RTDB_URL, FB_SECRET) => {

    const authParam = FB_SECRET ? `?auth=${FB_SECRET}` : "";

    // Helper: Check if a UID is currently connected to the socket server
    const isOnline = (uid) => {
        if (!uid || uid === "undefined") return false;
        for (let player of activePlayers.values()) {
            if (player.userID === uid) return true;
        }
        return false;
    };

    /**
     * GET /friend-api/v1/friend/:uid/countFriendRequest
     * Specific endpoint for the notification badge in the game UI.
     */
    router.get('/v1/friend/:uid/countFriendRequest', async (req, res) => {
        const uid = req.params.uid;
        if (!uid || uid === "undefined") {
            return res.json({ success: true, count: 0 });
        }

        try {
            const response = await axios.get(`${RTDB_URL}/friendRequests/${uid}.json${authParam}`);
            const requests = response.data || {};
            const pendingCount = Object.values(requests).filter(r => r.status === "pending").length;
            
            res.json({ success: true, count: pendingCount });
        } catch (error) {
            res.json({ success: true, count: 0 }); // Fallback to 0 to prevent UI crash
        }
    });

    /**
     * GET /friends/:uid or /friend-api/v1/friend/:uid
     * Fetches the friend list with online status.
     */
    const getFriends = async (req, res) => {
        const uid = req.params.uid;
        if (!uid || uid === "undefined") return res.json({ success: true, friends: [] });

        try {
            const response = await axios.get(`${RTDB_URL}/friends/${uid}.json${authParam}`);
            const friendData = response.data || {};

            const friends = Object.keys(friendData).map(friendUid => ({
                userID: friendUid,
                name: friendData[friendUid].name || "Wizard",
                online: isOnline(friendUid),
                lastSeen: friendData[friendUid].lastSeen || Date.now()
            }));

            res.json({ success: true, friends });
        } catch (error) {
            console.error(`[FriendAPI] Error fetching friends for ${uid}:`, error.message);
            res.status(500).json({ success: false, error: "Failed to load friends" });
        }
    };

    router.get('/:uid', getFriends);
    router.get('/v1/friend/:uid', getFriends);

    /**
     * POST /friends/request
     */
    router.post('/request', async (req, res) => {
        const { fromUid, toUid, fromName } = req.body;
        if (!fromUid || !toUid || fromUid === "undefined" || toUid === "undefined") {
            return res.status(400).json({ success: false, error: "Missing or invalid UIDs" });
        }

        try {
            await axios.patch(`${RTDB_URL}/friendRequests/${toUid}/${fromUid}.json${authParam}`, {
                name: fromName || "Wizard",
                timestamp: Date.now(),
                status: "pending"
            });

            res.json({ success: true, message: "Friend request sent" });
        } catch (error) {
            res.status(500).json({ success: false, error: "Database error" });
        }
    });

    return router;
};
