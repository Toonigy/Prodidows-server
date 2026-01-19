/**
 * game-patches.js
 * Enhanced with Origin Tracing and Global Error Capturing
 */

(function() {
    const ORIGIN = "[GamePatch]";
    console.log(`${ORIGIN} Initializing Debugging & Patches...`);

    // Global Error Catcher to identify responsible file/patch
    window.onerror = function(message, source, lineno, colno, error) {
        console.error(`%c${ORIGIN} Uncaught Error in ${source} at line ${lineno}:`, "color: #ff4747; font-weight: bold;", message);
        return false;
    };

    window.DevSettings = { forceBotPVP: false, debugLogging: true };

    const logDebug = (msg, data = "") => {
        if (!window.DevSettings.debugLogging) return;
        console.log(`%c${ORIGIN} [DEBUG] ${msg}`, "color: #00dbff;", data);
    };

    /**
     * UI Component: Dev Settings Panel
     * Moved to bottom-right to avoid obstructing game UI buttons (like the X button).
     */
    const initDevPanel = () => {
        if (document.getElementById('prodigy-dev-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'prodigy-dev-panel';
        panel.style = `
            position: fixed; bottom: 10px; right: 10px; z-index: 9999;
            background: rgba(0, 0, 0, 0.85); color: white; padding: 12px;
            border-radius: 8px; font-family: sans-serif; font-size: 12px;
            border: 1px solid #00dbff; box-shadow: 0 0 10px rgba(0, 219, 255, 0.3);
            user-select: none;
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
            
            const state = isChecked ? 'on' : 'off';
            fetch(`/matchmaking-api/forcebot/${state}`).catch(err => {
                logDebug("Server toggle failed (server may be using different route or offline)");
            });
        });
    };

    /**
     * Patching BattleRequests Logic
     */
    const forcePVPStart = (payload) => {
        const game = window.game || window.prodigy?.game;
        if (!game?.prodigy?.pvp) {
            logDebug("PVP Module not ready, queuing request.");
            window._queuedBattle = payload;
            return;
        }

        try {
            const opponent = payload.data?.player || payload.playerB;
            // High fidelity mapping for BattleRequests
            const formatted = {
                userID: opponent?.userID || "BOT",
                name: opponent?.name || "Opponent",
                appearance: opponent?.appearance || { gender: "male" },
                equipment: opponent?.equipment || { hat: 1, outfit: 1, weapon: 1 },
                isMember: true,
                data: { level: opponent?.data?.level || 100 }
            };

            game.prodigy.pvp.start(formatted.userID, game.prodigy.player, { data: { player: formatted } }, () => {}, false, "Arena");
        } catch (e) {
            console.error(`${ORIGIN} [BattleRequests Patch] Failed transition:`, e);
        }
    };

    // AJAX Interceptor with Source Logging
    const originalAjax = window.$.ajax;
    window.$.ajax = function(options) {
        const url = options.url || "";
        const player = window.prodigy?.player || window.game?.prodigy?.player;
        
        /**
         * FIX: Patching Matchmaking Requests to include userID
         * Also converts any GET requests to POST to avoid the "Cannot GET /matchmaking-api/begin" error.
         */
        if (url.includes('/matchmaking-api/begin')) {
            logDebug(`Intercepting Matchmaking Request -> ${url}`);
            
            // Force method to POST even if the game tried to use GET
            options.type = "POST";
            options.method = "POST";

            if (player && player.userID) {
                options.data = options.data || {};
                
                // Ensure data is an object if it's a string
                if (typeof options.data === 'string') {
                    try {
                        options.data = JSON.parse(options.data);
                    } catch (e) {
                        options.data = {};
                    }
                }

                // Inject the missing userID and the forceBot flag
                options.data.userID = player.userID;
                options.data.forceBot = window.DevSettings.forceBotPVP;
                
                logDebug(`Injected userID ${player.userID} and forced POST for matchmaking.`);
            }
        }

        /**
         * FIX: Patching Friends List responses to prevent "Cannot read properties of undefined (reading 'length')"
         * The game engine expects a nested 'data' object containing 'pendingRequests' and a 'friends' array.
         */
        if (url.includes('/friend') || url.includes('/countFriendRequest')) {
            const originalSuccess = options.success;
            options.success = function(response) {
                if (response && typeof response === 'object') {
                    // Ensure the 'data' property exists
                    if (!response.data) {
                        response.data = {};
                    }
                    
                    // Fix 'pendingRequests' - must be a number
                    if (typeof response.data.pendingRequests === 'undefined') {
                        response.data.pendingRequests = response.pendingRequests || 0;
                    }

                    // Fix 'friends' - must be an array to prevent .length errors
                    if (!Array.isArray(response.data.friends)) {
                        response.data.friends = response.friends || [];
                    }
                    
                    // Ensure metadata exists
                    response.meta = response.meta || { friendsCap: 100, totalFriends: response.data.friends.length };
                    response.success = true;
                }
                if (typeof originalSuccess === 'function') originalSuccess.apply(this, arguments);
            };
        }

        const originalError = options.error;
        options.error = function(xhr, status, err) {
            console.error(`%c${ORIGIN} [AJAX Error] Source: ${url}`, "background: #330000; color: #ff4747;", { status, err, response: xhr.responseText });
            if (originalError) originalError.apply(this, arguments);
        };

        return originalAjax.apply(this, arguments);
    };

    /**
     * FIX: io.connect is missing.
     * Some versions of game.min.js call io.connect() instead of just io().
     */
    if (window.io) {
        const originalIo = window.io;
        
        const socketWrapper = function(u, o) {
            logDebug(`Socket initialized for: ${u}`);
            const socket = originalIo(u, o);
            
            socket.on('arena', (d) => {
                logDebug("Socket Event: 'arena' received.");
                forcePVPStart(d);
            });

            // Auto-registration handler
            socket.on('need_registration', () => {
                const uid = window.prodigy?.player?.userID || window.game?.prodigy?.player?.userID;
                if (uid) {
                    logDebug(`Auto-registering socket with UID: ${uid}`);
                    socket.emit('register', uid);
                }
            });

            return socket;
        };

        // Assign the wrapper back to io and ensure .connect exists
        window.io = socketWrapper;
        window.io.connect = socketWrapper;
        
        logDebug("Socket.io patches and .connect polyfill applied.");
    }

    // Readiness Loop
    setInterval(() => {
        initDevPanel();
        if (window._queuedBattle && window.game?.prodigy?.pvp) {
            logDebug("Processing queued battle payload.");
            forcePVPStart(window._queuedBattle);
            window._queuedBattle = null;
        }
    }, 2000);

})();
