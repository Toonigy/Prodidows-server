/**
 * game-patches.js
 * Optimized for Prodigy Arena Leaderboard structure and identity sync.
 * Enhanced with deep debugging for matchmaking and state tracing.
 * Includes Developer Settings for Bot-assisted PVP testing.
 */

(function() {
    console.log("[Patch] Initializing Game Patches...");

    // Global Dev Settings
    window.DevSettings = {
        forceBotPVP: false,
        debugLogging: true,
        showPanel: true
    };

    window.PatchDiagnostics = {
        lastSocketEvent: null,
        identitySource: "none",
        socketStatus: "disconnected",
        registeredUID: null,
        eventsReceived: [],
        apiHistory: []
    };

    const logDebug = (msg, data = "") => {
        if (!window.DevSettings.debugLogging) return;
        console.log(`%c[Patch Debug] ${msg}`, "color: #00dbff; font-weight: bold;", data);
    };

    const logError = (msg, data = "") => {
        console.error(`%c[Patch Error] ${msg}`, "color: #ff4747; font-weight: bold;", data);
    };

    /**
     * UI Component: Dev Settings Panel
     * Adds a small toggle overlay for testing bots.
     */
    const initDevPanel = () => {
        if (document.getElementById('prodigy-dev-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'prodigy-dev-panel';
        panel.style = `
            position: fixed; top: 10px; right: 10px; z-index: 9999;
            background: rgba(0, 0, 0, 0.85); color: white; padding: 12px;
            border-radius: 8px; font-family: sans-serif; font-size: 12px;
            border: 1px solid #00dbff; box-shadow: 0 0 10px rgba(0, 219, 255, 0.3);
        `;

        panel.innerHTML = `
            <div style="font-weight: bold; color: #00dbff; margin-bottom: 8px; border-bottom: 1px solid #444; padding-bottom: 4px;">ARENA DEV SETTINGS</div>
            <label style="display: flex; align-items: center; cursor: pointer; margin-bottom: 8px;">
                <input type="checkbox" id="toggle-bot" ${window.DevSettings.forceBotPVP ? 'checked' : ''}> 
                <span style="margin-left: 8px;">Force Bot in Arena</span>
            </label>
            <div id="dev-status" style="font-size: 10px; color: #aaa;">Status: Ready</div>
        `;

        document.body.appendChild(panel);

        document.getElementById('toggle-bot').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            window.DevSettings.forceBotPVP = isChecked;
            document.getElementById('dev-status').innerText = `Status: ${isChecked ? 'Force Bot ON' : 'Normal MM'}`;
            logDebug(`Force Bot PVP Toggle: ${isChecked}`);
            
            /**
             * FIX: Adjusted endpoint path to match the Matchmaking module router.
             * Also using relative path to ensure it hits the current origin.
             */
            const state = isChecked ? 'on' : 'off';
            fetch(`/matchmaking/forcebot/${state}`).catch(err => {
                logDebug("Server toggle failed (server may be using different route or offline)");
            });
        });
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

    /**
     * Transition logic for PVP.
     * Can be triggered by socket events or forced by Dev Settings.
     */
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

        logDebug("Attempting PVP State Transition...");

        try {
            /**
             * STRUCTURE FIX FOR BattleRequests:
             * The game engine (game.min.js) and BattleRequests container expect:
             * i.data.player.appearance
             * i.data.player.data.level
             * i.data.player.equipment
             */
            const rawOpponent = payload.data?.player || payload.playerB;
            
            const formattedOpponent = {
                userID: rawOpponent?.userID || rawOpponent?.id || "SERVER_BOT",
                name: rawOpponent?.name || "Arena Challenger",
                appearance: rawOpponent?.appearance || { gender: "male", hair: { style: 1, color: 1 }, skin: 1, face: 1 },
                equipment: rawOpponent?.equipment || { hat: 1, outfit: 1, weapon: 1, boots: 1 },
                isMember: rawOpponent?.isMember || true,
                data: {
                    level: rawOpponent?.data?.level || rawOpponent?.level || 100,
                    stars: rawOpponent?.data?.stars || rawOpponent?.stars || 0
                }
            };

            const pvpData = {
                data: {
                    player: formattedOpponent
                },
                challengerID: payload.challengerID || formattedOpponent.userID
            };

            // If we are in the World, we need to handle the incoming request UI
            // However, the 'arena' event usually bypasses the mail system and goes straight to battle
            if (game.state.states['PVPLoading']) {
                game.state.start("PVPLoading", true, false, pvpData);
            } else {
                const opponentID = formattedOpponent.userID;
                const player = game.prodigy.player;
                game.prodigy.pvp.start(opponentID, player, pvpData, () => {}, false, "Arena");
            }
        } catch (e) {
            logError("Failed to force PVP transition:", e);
        }
    };

    // 1. Patch jQuery AJAX for Leaderboard and Matchmaking
    const originalAjax = window.$.ajax;
    window.$.ajax = function(options) {
        if (options && options.url) {
            
            // INTERCEPT: Matchmaking Force Bot Logic
            if (options.url.includes('/matchmaking/begin')) {
                // If the local dev setting is on, ensure we tell the server
                if (window.DevSettings.forceBotPVP) {
                    logDebug("Matchmaking request detected. Injecting forceBot flag.");
                    if (typeof options.data === 'string') {
                        try {
                            let parsed = JSON.parse(options.data);
                            parsed.forceBot = true;
                            options.data = JSON.stringify(parsed);
                        } catch(e) {}
                    } else {
                        options.data = options.data || {};
                        options.data.forceBot = true;
                    }
                }
            }

            // FIX: FriendsListNetworkHandler 'pendingRequests' crash
            if (options.url.includes('/friend/')) {
                const originalSuccess = options.success;
                options.success = function(response) {
                    if (response && typeof response === 'object') {
                        if (!response.data) response.data = {};
                        if (!response.data.pendingRequests) response.data.pendingRequests = [];
                        
                        if (!response.meta) response.meta = {};
                        if (typeof response.meta.friendsCap === 'undefined') response.meta.friendsCap = 100;
                        if (typeof response.meta.totalFriends === 'undefined') response.meta.totalFriends = 0;
                        
                        if (!response.friendsList) response.friendsList = [];
                        response.success = true;
                    }
                    if (typeof originalSuccess === 'function') originalSuccess.apply(this, arguments);
                };
            }

            // Identity Injection for normal requests
            if (options.url.includes('/matchmaking') || options.url.includes('/game-api')) {
                const identity = findUID();
                if (identity && options.data && !options.data.userID && !options.data.uid) {
                    if (typeof options.data === 'object') {
                        options.data.userID = identity.uid;
                        options.data.uid = identity.uid;
                    }
                }
            }

            // LEADERBOARD FIX
            if (options.url.includes('/leaderboard')) {
                const originalSuccess = options.success;
                options.success = function(response) {
                    if (response && response.success) {
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
                    
                    if (eventName === 'playerFullInfo' && data) {
                        const world = window.game?.state?.states?.Battle || window.game?.state?.getCurrentState();
                        if (world && world.playersInfo) {
                            if (typeof data.appearance === 'string') {
                                try { data.appearance = JSON.parse(data.appearance); } catch(e) {}
                            }
                            world.playersInfo[data.userID] = data;
                            if (typeof world.addPlayer === 'function') world.addPlayer(data);
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

    // 3. Maintenance Loop
    setInterval(() => {
        const identity = findUID();
        const prodigy = (window.game || window.prodigy?.game)?.prodigy || window.prodigy;
        if (identity && prodigy?.player && !prodigy.player.userID) {
            prodigy.player.userID = identity.uid;
        }

        if (prodigy?.friendsListNetworkHandler) {
            if (!prodigy.friendsListNetworkHandler.friendsList) {
                prodigy.friendsListNetworkHandler.friendsList = [];
            }
        }

        if (window.DevSettings.showPanel) initDevPanel();
    }, 3000);

    logDebug("Dev Settings and Matchmaking patches initialized.");
})();
