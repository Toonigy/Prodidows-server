/**
 * updated game-patches.js
 * Added explicit socket listeners and UI/API patches to fix Arena Leaderboard crashes.
 */
(function() {
    const ORIGIN = "[GamePatch]";
    console.log(`${ORIGIN} Initializing Socket Listeners...`);

    // --- SOCKET IO HOOK ---
    const originalIo = window.io;
    window.io = function(u, o) {
        const socket = originalIo(u, o);

        socket.on('connect', () => {
            console.log(`%c${ORIGIN} Connected to Server!`, "color: #00ff00; font-weight: bold;");
        });

        socket.on('need_registration', () => {
            const uid = window.prodigy?.player?.userID;
            console.log(`${ORIGIN} Server requested registration. Sending UID: ${uid}`);
            if (uid) socket.emit('register', uid);
        });

        socket.on('player_list', (list) => {
            console.log(`%c${ORIGIN} RECEIVED PLAYER LIST:`, "background: #222; color: #bada55; padding: 2px;", list);
        });

        socket.on('player_joined', (uid) => {
            console.log(`${ORIGIN} Another player joined: ${uid}`);
        });

        socket.on('player_full_info', (data) => {
            console.log(`${ORIGIN} Data for player ${data.userID} received:`, data);
        });

        return socket;
    };
    Object.assign(window.io, originalIo);

    // --- API & UI PATCHES ---
    const patchInterval = setInterval(() => {
        if (typeof Prodigy !== 'undefined' && Prodigy.Container) {
            
            // 1. Fix Arena Leaderboard crash (Cannot read properties of undefined (reading 'length'))
            // This happens when the leaderboard response is malformed or empty.
            if (Prodigy.Container.ArenaLeaderboard && !Prodigy.Container.ArenaLeaderboard.prototype._patched) {
                console.log(`${ORIGIN} Patching ArenaLeaderboard logic...`);
                
                const originalLoadWizards = Prodigy.Container.ArenaLeaderboard.prototype.loadWizardsComplete;
                Prodigy.Container.ArenaLeaderboard.prototype.loadWizardsComplete = function(data) {
                    // Force data to have a valid leaderboard array to prevent .length crash
                    if (!data) data = {};
                    if (!data.leaderboard) {
                        console.warn(`${ORIGIN} Leaderboard data missing array, providing fallback.`);
                        data.leaderboard = [];
                    }
                    return originalLoadWizards.call(this, data);
                };
                
                Prodigy.Container.ArenaLeaderboard.prototype._patched = true;
            }

            // 2. Patch ApiClient to handle redirect/malformed responses for PVP Leaderboards
            if (window.ApiClient && window.ApiClient.prototype && !window.ApiClient.prototype._patched) {
                const originalGetPvp = window.ApiClient.prototype.getPvpLeaderboard;
                window.ApiClient.prototype.getPvpLeaderboard = function(mode, season, callbacks) {
                    const successWrapper = callbacks["200"];
                    callbacks["200"] = function(response) {
                        // Ensure the response matches what loadWizardsComplete expects
                        if (response && response.success && !response.leaderboard) {
                            response.leaderboard = [];
                        }
                        if (successWrapper) successWrapper(response);
                    };
                    return originalGetPvp.call(this, mode, season, callbacks);
                };
                window.ApiClient.prototype._patched = true;
            }

            // 3. Prevent setIconData crash (missing in some engine versions)
            if (Prodigy.Container.ArenaLeaderboard && !Prodigy.Container.ArenaLeaderboard.prototype.setIconData) {
                Prodigy.Container.ArenaLeaderboard.prototype.setIconData = function(playerData) {
                    if (this.icon && typeof this.icon.reload === 'function') this.icon.reload();
                    if (this.top && typeof this.top.reload === 'function') this.top.reload();
                };
            }

            clearInterval(patchInterval);
            console.log(`${ORIGIN} All engine patches applied successfully.`);
        }
    }, 500);

    // Patch jQuery AJAX to handle potential redirect issues or legacy response formats
    const originalAjax = window.$.ajax;
    window.$.ajax = function(options) {
        if (options.url && options.url.includes('/leaderboard-api')) {
            const originalSuccess = options.success;
            options.success = function(res) {
                // If the server returns the array directly or a wrapped object, normalize it
                if (Array.isArray(res)) {
                    res = { success: true, leaderboard: res };
                } else if (res && !res.leaderboard && res.data) {
                    res.leaderboard = res.data; // Handle common alternate naming
                }
                if (originalSuccess) originalSuccess(res);
            };
        }
        return originalAjax.apply(this, arguments);
    };

})();
