const express = require('express');
const router = express.Router();
const axios = require('axios');

/**
 * Friend API Module
 * Updated to return data inside a 'data' block to satisfy the game engine's 
 * FriendsListNetworkHandler.getTotalFriendRequestsSuccess logic:
 * this.pendingRequests = e.data.pendingRequests
 */

module.exports = (activePlayers, RTDB_URL, FB_SECRET, Debugger) => {

    const authParam = FB_SECRET ? `?auth=${FB_SECRET}` : "";

    const isOnline = (uid) => {
        if (!uid || uid === "undefined") return false;
        for (let player of activePlayers.values()) {
            if (player.userID === uid) return true;
        }
        return false;
    };

    router.get('/v1/friend/:uid/countFriendRequest', async (req, res) => {
        const uid = req.params.uid;
        if (Debugger) Debugger.trackEvent('friend_request_count_check', { uid });

        // IMPORTANT: The game engine expects 'data.pendingRequests'
        const defaultResponse = {
            success: true,
            data: {
                pendingRequests: 0
            },
            meta: { friendsCap: 100, totalFriends: 0 }
        };

        if (!uid || uid === "undefined") return res.json(defaultResponse);

        try {
            const [requestRes, friendsRes] = await Promise.all([
                axios.get(`${RTDB_URL}/friendRequests/${uid}.json${authParam}`),
                axios.get(`${RTDB_URL}/friends/${uid}.json${authParam}`)
            ]);

            const requests = requestRes.data || {};
            const friends = friendsRes.data || {};
            
            const pendingCount = Object.values(requests).filter(r => r.status === "pending").length;
            const totalFriends = Object.keys(friends).length;
            
            res.json({ 
                success: true, 
                data: {
                    pendingRequests: pendingCount
                },
                meta: {
                    friendsCap: 100,
                    totalFriends: totalFriends
                }
            });
        } catch (error) {
            if (Debugger) Debugger.trackError('Friend Request Count', error);
            res.json(defaultResponse); 
        }
    });

    const getFriends = async (req, res) => {
        const uid = req.params.uid;
        if (Debugger) Debugger.trackEvent('friend_list_fetch', { uid });

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

            res.json({ success: true, friends: friends });
        } catch (error) {
            if (Debugger) Debugger.trackError('Get Friends List', error);
            res.status(500).json({ success: false, error: "Failed to load friends" });
        }
    };

    router.get('/:uid', getFriends);
    router.get('/v1/friend/:uid', getFriends);

    return router;
};
