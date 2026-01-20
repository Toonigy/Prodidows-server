const express = require('express');
const router = express.Router();

/**
 * Matchmaking Module
 * Handles Arena queueing logic for PVP.
 * Optimized: Satisfies BattleRequests.createChallenge and processChallenge requirements.
 */

module.exports = (activePlayers, matchmakingQueue, io) => {

    // Server-side global toggle for forcebot
    let globalForceBot = false;

    // POST /matchmaking-api/begin
    router.post('/begin', (req, res) => {
        const body = req.body || {};
        const userID = body.userID || req.query.userID;
        const forceBot = body.forceBot === true || body.forceBot === "true" || globalForceBot;
        
        if (!userID) {
            return res.status(400).json({ success: false, message: "Missing userID" });
        }

        console.log(`[Matchmaking] Player ${userID} entered queue. (ForceBot: ${forceBot})`);

        /**
         * BOT LOGIC:
         * Specifically designed to satisfy Prodigy.Container.BattleRequests.
         * createChallenge expects: i.data.player.appearance, i.data.player.data.level
         * processChallenge expects: i.data.player.equipment, i.data.player.isMember
         */
        if (forceBot) {
            const botMatch = {
                success: true,
                matchID: `bot_match_${Date.now()}_${userID}`,
                challengerID: "SERVER_BOT",
                data: {
                    userID: "SERVER_BOT",
                    player: {
                        userID: "SERVER_BOT",
                        name: "Arena Challenger",
                        isMember: true,
                        // Required for BattleRequests.createChallenge to show name/nick
                        appearance: {
                            gender: "male",
                            hair: { style: 1, color: 1 },
                            skin: 1,
                            face: 1,
                            name: "Arena Challenger",
                            nick: "Elite Bot"
                        },
                        // Required for BattleRequests.processChallenge (Player.init) 
                        // to prevent undefined equipment errors during battle load
                        equipment: {
                            hat: 1,
                            outfit: 1,
                            weapon: 1,
                            boots: 1,
                            relic: 1
                        },
                        // Required for createChallenge: i.data.player.data.level
                        // Added arenaRank to satisfy player.getArenaRank()
                        // Added arenaScore to satisfy onLoadPlayerListDataSuccess expectations
                        data: {
                            level: 100,
                            stars: 500,
                            winStreak: 10,
                            arenaRank: 1,
                            arenaScore: 5000 
                        }
                    }
                }
            };

            console.log(`[Matchmaking] Dispatching bot arena challenge for ${userID}`);
            
            // Dispatch via socket to the user's room
            setTimeout(() => {
                if (io) {
                    io.to(userID).emit('arena', botMatch);
                }
            }, 1000);

            return res.json({
                success: true,
                status: 'matched',
                matchID: botMatch.matchID
            });
        }

        // Standard PVP Matchmaking
        if (!matchmakingQueue.includes(userID)) {
            matchmakingQueue.push(userID);
        }

        if (matchmakingQueue.length >= 2) {
            const p1 = matchmakingQueue.shift();
            const p2 = matchmakingQueue.shift();
            const matchID = `pvp_${Date.now()}_${p1}_${p2}`;

            const matchData = {
                success: true,
                matchID: matchID,
                playerA: p1,
                playerB: p2
            };

            io.to(p1).emit('arena', matchData);
            io.to(p2).emit('arena', matchData);
        }

        res.json({
            success: true,
            status: 'queued',
            queueTime: new Date().getTime()
        });
    });

    /**
     * Admin Command: Toggle Global ForceBot
     */
    router.get('/forcebot/:state', (req, res) => {
        const state = req.params.state.toLowerCase();
        if (state === 'on') {
            globalForceBot = true;
            return res.json({ success: true, globalForceBot: true });
        } else if (state === 'off') {
            globalForceBot = false;
            return res.json({ success: true, globalForceBot: false });
        }
        res.status(400).json({ success: false, message: "Invalid state." });
    });

    /**
     * POST /matchmaking-api/end
     * Handles leaving the queue.
     * Fixed: Added safety check for req.body to prevent TypeError.
     */
    router.post('/end', (req, res) => {
        const body = req.body || {};
        const userID = body.userID || req.query.userID;
        
        if (userID) {
            const index = matchmakingQueue.indexOf(userID);
            if (index > -1) {
                matchmakingQueue.splice(index, 1);
                console.log(`[Matchmaking] Player ${userID} left the queue.`);
            }
        }
        
        res.json({ success: true });
    });

    return router;
};
