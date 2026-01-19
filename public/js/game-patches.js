/**
 * game-patches.js
 * Optimized for Prodigy Arena Leaderboard structure and identity sync.
 * Enhanced with deep debugging for matchmaking and state tracing.
 */

(function() {
    console.log("[Patch] Initializing Game Patches...");

    window.PatchDiagnostics = {
        lastSocketEvent: null,
        identitySource: "none",
        socketStatus: "disconnected",
        registeredUID: null,
        eventsReceived: [],
        apiHistory: []
    };

    const logDebug = (msg, data = "") => {
        console.log(`%c[Patch Debug] ${msg}`, "color: #00dbff; font-weight: bold;", data);
    };

    const logError = (msg, data = "") => {
        console.error(`%c[Patch Error] ${msg}`, "color: #ff4747; font-weight: bold;", data);
    };

    const findUID = () => {
        let uid = window.prodigy?.player?.userID || window.game?.prodigy?.player?.userID;
        if (uid) return { uid, source: "prodigy_engine" };

        const fbUser = window.firebase?.auth?.currentUser;
        if (fbUser?.uid) return { uid: fbUser.uid, source: "firebase_auth" };

        const apiUniqueKey = window.game?.prodigy?.api?.uniqueKey || window.prodigy?.api?.uniqueKey;
        if (apiUniqueKey && apiUniqueKey.length > 5) return { uid: apiUniqueKey, source: "api_unique_key" };

        const storedUid = localStorage.getItem("prodigy_userID") || localStorage.getItem("userID");
        if (storedUid) return { uid: storedUid, source: "local_storage" };

        return null;
    };

    const forcePVPStart = (payload, retryCount = 0) => {
        const game = window.game || window.prodigy?.game;
        
        if (!game || !game.prodigy || !game.prodigy.pvp) {
            if (retryCount < 10) {
                logDebug(`Game engine not ready yet, retrying... (${retryCount}/10)`);
                setTimeout(() => forcePVPStart(payload, retryCount + 1), 500);
            } else {
                logError("Cannot force PVP: Game engine or PVP module not found after multiple attempts.");
            }
            return;
        }

        logDebug("Attempting Manual PVP State Transition...");

        try {
            const pvpData = {
                data: payload,
                challengerID: payload.challengerID || "SERVER_BOT"
            };

            if (game.state.states['PVPLoading']) {
                game.state.start("PVPLoading", true, false, pvpData);
            } else {
                const opponentID = payload.playerB?.id || "SERVER_BOT";
                const player = game.prodigy.player;
                game.prodigy.pvp.start(opponentID, player, payload, () => {}, false, "Arena");
            }
        } catch (e) {
            logError("Failed to force PVP transition:", e);
        }
    };

    // 1. Patch jQuery AJAX for Leaderboard and Matchmaking
    const originalAjax = window.$.ajax;
    window.$.ajax = function(options) {
        if (options && options.url) {
            // Identity Injection
            if (options.url.includes('/matchmaking') || options.url.includes('/game-api')) {
                const identity = findUID();
                if (identity && options.data && !options.data.userID && !options.data.uid) {
                    options.data.userID = identity.uid;
                    options.data.uid = identity.uid;
                }
            }

            // LEADERBOARD FIX: Prevent 'length' of undefined crash
            if (options.url.includes('/leaderboard')) {
                const originalSuccess = options.success;
                options.success = function(response) {
                    if (response && response.success) {
                        // The engine expects 'leaderboard' property to exist and be an array.
                        let list = response.leaderboard || response.leaders || response.player_list || [];
                        
                        if (!Array.isArray(list)) list = [];

                        list.forEach((p, index) => {
                            if (typeof p.appearance === 'string') {
                                try { p.appearance = JSON.parse(p.appearance); } catch(e) { p.appearance = {}; }
                            }
                            p.appearance = p.appearance || {};
                            p.isMember = (p.isMember === true || p.isMember === 1) ? 1 : 0;
                            p.username = p.username || p.name || "Wizard";
                            p.rank = p.rank || (index + 1);
                        });

                        response.leaderboard = list;
                    } else if (response) {
                        response.leaderboard = [];
                        response.success = true; 
                    }
                    if (typeof originalSuccess === 'function') originalSuccess.apply(this, arguments);
                };
            }
        }
        return originalAjax.apply(this, arguments);
    };

    // 2. Socket.io Interceptor
    if (window.io) {
        const originalIo = window.io;
        window.io = function(url, opts) {
            const socket = originalIo(url, opts);
            const trackedEvents = ['playerJoined', 'playerLeft', 'playerMoved', 'playerList', 'registered', 'need_registration', 'playerFullInfo', 'arena', 'message'];
            
            trackedEvents.forEach(eventName => {
                socket.on(eventName, (data) => {
                    if (eventName === 'arena' || (eventName === 'message' && data.action === 'challenge')) {
                        forcePVPStart(eventName === 'arena' ? data : data.data);
                    }
                    
                    // Handle incoming full character data for rendering
                    if (eventName === 'playerFullInfo' && data) {
                        const currentState = window.game?.state?.getCurrentState();
                        if (currentState && currentState.playersInfo) {
                            if (typeof data.appearance === 'string') {
                                try { data.appearance = JSON.parse(data.appearance); } catch(e) {}
                            }
                            currentState.playersInfo[data.userID] = data;
                            if (typeof currentState.addPlayer === 'function') currentState.addPlayer(data);
                        }
                    }

                    // Patch: Handle playerList synchronization
                    if (eventName === 'playerList' && Array.isArray(data)) {
                        const currentState = window.game?.state?.getCurrentState();
                        if (currentState && currentState.game && currentState.playersInfo) {
                            let hasOtherPlayers = false;
                            const myID = currentState.game.prodigy.player.userID;

                            for (let i = 0; i < data.length; i++) {
                                const targetID = data[i];
                                if (targetID !== myID) {
                                    hasOtherPlayers = true;
                                    // If we have their data cached, add them to the visual world
                                    if (currentState.playersInfo[targetID]) {
                                        if (typeof currentState.addPlayer === 'function') {
                                            currentState.addPlayer(currentState.playersInfo[targetID]);
                                        }
                                    }
                                }
                            }
                            // If we see others, ensure the server broadcasts our own info so they see us too
                            if (hasOtherPlayers && currentState.user && typeof currentState.user.broadcastPlayerFullInfo === 'function') {
                                currentState.user.broadcastPlayerFullInfo();
                            }
                        }
                    }

                    if (eventName === 'need_registration') {
                        const identity = findUID();
                        if (identity) socket.emit('register', identity.uid);
                    }
                });
            });

            socket.on('connect', () => { 
                const identity = findUID();
                if (identity) socket.emit('register', identity.uid);
            });

            return socket;
        };
        window.io.connect = window.io;
    }

    // 3. Identity Sync
    setInterval(() => {
        const identity = findUID();
        const player = (window.game || window.prodigy?.game)?.prodigy?.player || window.prodigy?.player;
        if (identity && player && !player.userID) {
            player.userID = identity.uid;
        }
    }, 5000);

    logDebug("Matchmaking, Leaderboard, and PlayerList synchronization patches active.");
})();
