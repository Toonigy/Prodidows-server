/**
 * GamePatch class for overriding Google Sign-In, Google Save Load,
 * Cloud Save, Google Authorization, Open Worlds, Bot PVP Matchmaking, Open Message, and Login Success handlers
 * in legacy Prodigy game client builds.
 */
class GamePatch {
    /**
     * @param {Object} game - The Phaser / Prodigy game instance
     */
    constructor(game) {
        this.game = game;
        console.log("[GamePatch] Initialized with game instance:", game);
        this.applyPatches();
    }

    /**
     * Applies patches to target prototypes or instances.
     */
    applyPatches() {
        if (!this.game || !this.game.prodigy) {
            console.warn("[GamePatch] Prodigy game instance not found yet.");
            return;
        }

        console.log("[GamePatch] Applying game patches...");
        this.patchGoogleSignIn();
        this.patchGoogleSaveLoad();
        this.patchGetCloudSave();
        this.patchAuthorizeWithGoogle();
        this.patchOpenWorlds();
        this.patchTryBotMatch();
        this.patchOpenMessage();
        this.patchLoginSuccess();
        this.bindGlobalHandlers();
        this.hookProdigyPrototypes();
        this.hookGoogleLoginButton();
    }

    /**
     * Hooks into global window, network objects, and OAuth postMessage listeners.
     */
    bindGlobalHandlers() {
        const self = this;

        if (typeof window !== 'undefined') {
            window.onGoogleSignIn = (data) => {
                console.log("[GamePatch] Global window.onGoogleSignIn invoked:", data);
                self.onGoogleSignIn(data || { success: true, userID: "google_user_default" });
            };

            // Global fallback function for legacy buttons
            window.authorizeWithGoogle = () => {
                console.log("[GamePatch] Global authorizeWithGoogle invoked.");
                self.authorizeWithGoogle();
            };

            // Listen for postMessage responses sent back from Google OAuth popup/iframe
            if (!window.__gamePatchMessageBound) {
                window.__gamePatchMessageBound = true;
                window.addEventListener('message', (event) => {
                    if (event && event.data) {
                        let parsedData = event.data;
                        if (typeof parsedData === 'string' && parsedData.includes('userID')) {
                            try { parsedData = JSON.parse(parsedData); } catch (e) {}
                        }
                        if (parsedData && (parsedData.userID || parsedData.type === 'google_auth' || parsedData.success)) {
                            console.log("[GamePatch] Captured OAuth postMessage event:", parsedData);
                            self.onGoogleSignIn(parsedData);
                        }
                    }
                });
            }
        }

        if (this.game && this.game.prodigy) {
            if (this.game.prodigy.network) {
                this.game.prodigy.network.onGoogleSignIn = this.onGoogleSignIn;
            }
            if (this.game.prodigy.login) {
                this.game.prodigy.login.onGoogleSignIn = this.onGoogleSignIn;
                this.game.prodigy.login.authorizeWithGoogle = this.authorizeWithGoogle;
                this.game.prodigy.login.openWorlds = this.openWorlds;
            }
        }
    }

    /**
     * Automatically hooks into Prodigy Login/PVP prototypes and active Phaser scene states.
     */
    hookProdigyPrototypes() {
        if (typeof window !== 'undefined' && window.Prodigy) {
            if (window.Prodigy.Login && window.Prodigy.Login.prototype) {
                window.Prodigy.Login.prototype.authorizeWithGoogle = this.authorizeWithGoogle;
                window.Prodigy.Login.prototype.onGoogleSignIn = this.onGoogleSignIn;
                window.Prodigy.Login.prototype.onGoogleSaveLoad = this.onGoogleSaveLoad;
                window.Prodigy.Login.prototype.openWorlds = this.openWorlds;
                console.log("[GamePatch] Patched Prodigy.Login prototype.");
            }
            if (window.Prodigy.PVP && window.Prodigy.PVP.prototype) {
                window.Prodigy.PVP.prototype.tryBotMatch = this.tryBotMatch;
                window.Prodigy.PVP.prototype.openMessage = this.openMessage;
            }
        }

        if (this.game && this.game.state) {
            const states = this.game.state.states || {};
            for (const key in states) {
                if (states.hasOwnProperty(key)) {
                    this.attachToState(states[key]);
                }
            }
        }
    }

    /**
     * DOM and Canvas Event Hook: Intercepts clicks on Google Login UI elements directly.
     */
    hookGoogleLoginButton() {
        const self = this;
        if (typeof document === 'undefined') return;

        const bindClickEvents = () => {
            const googleButtons = document.querySelectorAll('[id*="google"], [class*="google"], #google-signin, .google-btn');
            googleButtons.forEach(btn => {
                if (!btn.__patchedGoogle) {
                    btn.__patchedGoogle = true;
                    btn.addEventListener('click', (e) => {
                        console.log("[GamePatch] Google Login button clicked via DOM interceptor.");
                        self.authorizeWithGoogle();
                    });
                }
            });
        };

        bindClickEvents();
        setInterval(bindClickEvents, 1000);
    }

    /**
     * Patches Google Authorization initiation logic
     */
    patchAuthorizeWithGoogle() {
        const self = this;

        this.authorizeWithGoogle = function() {
            console.log("[GamePatch] authorizeWithGoogle triggered.");
            const gameInst = (this && this.game) ? this.game : self.game;
            
            // Resolve active scene context safely
            let stateContext = this || {};
            if ((!stateContext.gotoLoginMode && !stateContext.error) && gameInst && gameInst.state) {
                if (typeof gameInst.state.getCurrentState === 'function') {
                    const activeState = gameInst.state.getCurrentState();
                    if (activeState) stateContext = activeState;
                }
            }

            if (typeof stateContext.gotoLoginMode === 'function') {
                try {
                    stateContext.gotoLoginMode("Logging in with Google...");
                } catch (e) {
                    console.error("[GamePatch] Error executing gotoLoginMode:", e);
                }
            } else if (stateContext.error && typeof stateContext.error.setText === 'function') {
                stateContext.error.setText("Logging in with Google...");
            }

            const signInCallback = typeof stateContext.onGoogleSignIn === 'function'
                ? stateContext.onGoogleSignIn.bind(stateContext)
                : self.onGoogleSignIn.bind(stateContext);

            // Attempt prodigy.old.signInWithGoogle if defined
            if (gameInst && gameInst.prodigy && gameInst.prodigy.old && typeof gameInst.prodigy.old.signInWithGoogle === 'function') {
                try {
                    console.log("[GamePatch] Invoking game.prodigy.old.signInWithGoogle...");
                    gameInst.prodigy.old.signInWithGoogle(signInCallback);
                } catch (err) {
                    console.error("[GamePatch] Error in signInWithGoogle execution, triggering fallback:", err);
                    signInCallback({ success: true, userID: "google_user_default" });
                }
            } else {
                console.warn("[GamePatch] game.prodigy.old.signInWithGoogle unavailable. Proceeding with instant Google sign-in fallback.");
                signInCallback({ success: true, userID: "google_user_default" });
            }
        };
    }

    /**
     * Patches openWorlds logic to always open the world/server list.
     */
    patchOpenWorlds() {
        const self = this;

        this.openWorlds = function(e) {
            console.log("[GamePatch] openWorlds triggered with payload:", e);
            const gameInst = (this && this.game) ? this.game : self.game;
            const stateContext = this || {};
            const screenData = e || stateContext._screenData;

            const chooseServerCallback = typeof stateContext.chooseServer === 'function'
                ? stateContext.chooseServer.bind(stateContext)
                : null;

            // 1. Try opening via prodigy.open.server if screenData or fallback list is available
            if (gameInst && gameInst.prodigy && gameInst.prodigy.open && typeof gameInst.prodigy.open.server === 'function') {
                console.log("[GamePatch] Opening world list via game.prodigy.open.server...");
                gameInst.prodigy.open.server(screenData || [], chooseServerCallback);
                return;
            }

            // 2. Otherwise request world list from network directly
            if (gameInst && gameInst.prodigy && gameInst.prodigy.network && typeof gameInst.prodigy.network.getWorldList === 'function') {
                console.log("[GamePatch] Requesting world list via network.getWorldList...");
                const openPlayerCallback = typeof stateContext.openPlayer === 'function' ? stateContext.openPlayer.bind(stateContext) : null;
                const openPlayerNullCallback = typeof stateContext.openPlayer === 'function' ? stateContext.openPlayer.bind(stateContext, null) : null;
                gameInst.prodigy.network.getWorldList(openPlayerCallback, openPlayerNullCallback);
                return;
            }

            // 3. Fallback to chooseServer directly
            if (typeof stateContext.chooseServer === 'function') {
                console.log("[GamePatch] Falling back to direct chooseServer call.");
                stateContext.chooseServer(screenData, false);
            } else {
                console.warn("[GamePatch] Unable to open worlds: server browser functions not found.");
            }
        };
    }

    /**
     * Patches tryBotMatch logic for PVP matchmaking fallback when no real players are found.
     */
    patchTryBotMatch() {
        const self = this;

        this.tryBotMatch = function() {
            console.log("[GamePatch] tryBotMatch triggered.");
            const gameInst = (this && this.game) ? this.game : self.game;
            const stateContext = this || {};

            // Clear active timers & watchdog
            if (typeof Util !== 'undefined' && typeof Util.isDefined === 'function') {
                if (Util.isDefined(stateContext.botTimeout)) {
                    globalThis.clearTimeout(stateContext.botTimeout);
                }
                if (Util.isDefined(globalThis.matchmakingWatchdog)) {
                    delete globalThis.matchmakingWatchdog;
                }
                if (Util.isDefined(stateContext.matchmakingInterval)) {
                    window.clearInterval(stateContext.matchmakingInterval);
                }
            } else {
                if (stateContext.botTimeout) globalThis.clearTimeout(stateContext.botTimeout);
                if (globalThis.matchmakingWatchdog) delete globalThis.matchmakingWatchdog;
                if (stateContext.matchmakingInterval) window.clearInterval(stateContext.matchmakingInterval);
            }

            // Instantiate bot opponent object
            const CharacterClass = (typeof Prodigy !== 'undefined' && Prodigy.Character) ? Prodigy.Character : function(g) { this.game = g; };
            let botPlayer = new CharacterClass(gameInst);

            const playerData = (gameInst && gameInst.prodigy && gameInst.prodigy.player && gameInst.prodigy.player.data) ? gameInst.prodigy.player.data : {};
            const playerLevel = playerData.level || 10;
            const playerScore = playerData.arenaScore || 1000;

            let botData = {
                'id': 'BOT_ACCOUNT',
                'equipment': {
                    'hat': Math.round(Math.random() * 20),
                    'outfit': Math.round(Math.random() * 20),
                    'weapon': Math.round(Math.random() * 20),
                    'boots': Math.round(Math.random() * 20)
                },
                'data': {
                    'arenaScore': Math.max(0, Math.min(5000, playerScore + (Math.round(1850 * Math.random()) - 600))),
                    'arenaRank': playerData.arenaRank || 1,
                    'level': Math.max(1, Math.min(100, playerLevel + (Math.round(30 * Math.random()) - 15))),
                    'team': Math.random() > 0.5 ? 2 : 0
                },
                'pets': Math.random() > 0.25 ? [{
                    'ID': 1 + Math.round(Math.random() * 100),
                    'level': 1,
                    'isPVPTeam': true,
                    'team': 1
                }] : []
            };

            if (botData.pets.length > 0) {
                botData.pets[0].level = Math.max(1, Math.min(100, botData.data.level + Math.round(40 * Math.random() - 20)));
            }

            if (typeof botPlayer.load === 'function') {
                botPlayer.load(botData);
            } else {
                botPlayer.data = botData;
            }

            let onCompleteCallback = null;
            if (gameInst && gameInst.state && gameInst.state.current === "CharCreate") {
                onCompleteCallback = gameInst.prodigy.start.bind(gameInst.prodigy, "CharCreate");
            } else if (gameInst && gameInst.broadcaster) {
                let position = { x: 400, y: 300 };
                try {
                    position = gameInst.broadcaster.broadcast("PlayerLocomotion.GET_POSITION", gameInst, [true]) || position;
                } catch (e) {}

                if (gameInst.prodigy && gameInst.prodigy.player && gameInst.prodigy.player.pvp && gameInst.prodigy.player.pvp.open) {
                    onCompleteCallback = gameInst.prodigy.player.pvp.open.bind(
                        gameInst.prodigy.player.pvp,
                        gameInst.prodigy.player.data ? gameInst.prodigy.player.data.zone : "lamplight_town",
                        position.x,
                        position.y
                    );
                }
            }

            if (gameInst && gameInst.prodigy && gameInst.prodigy.player) {
                if (gameInst.prodigy.player.data) {
                    gameInst.prodigy.player.data.isBotMatch = true;
                }
                
                if (gameInst.prodigy.pvpNetwork && typeof gameInst.prodigy.pvpNetwork.quitMatchmaking === 'function') {
                    const userId = gameInst.prodigy.api ? gameInst.prodigy.api.userID : (gameInst.prodigy.player.userID || "guest");
                    gameInst.prodigy.pvpNetwork.quitMatchmaking(userId);
                }

                if (gameInst.prodigy.pvpHandler && typeof gameInst.prodigy.pvpHandler.startPVP === 'function') {
                    const pvpSocket = gameInst.prodigy.pvpNetwork ? gameInst.prodigy.pvpNetwork.socket : null;
                    gameInst.prodigy.pvpHandler.startPVP(
                        pvpSocket,
                        gameInst.prodigy.player,
                        botPlayer,
                        onCompleteCallback,
                        true,
                        true
                    );
                }
            }
        };
    }

    /**
     * Patches openMessage logic for PVP matchmaking search dialog and bot match timeout fallback.
     */
    patchOpenMessage() {
        const self = this;

        this.openMessage = function() {
            console.log("[GamePatch] openMessage triggered.");
            const gameInst = (this && this.game) ? this.game : self.game;
            let stateContext = this || {};

            const isPvpEnabled = (gameInst && gameInst.prodigy && gameInst.prodigy.player && gameInst.prodigy.player.pvp && gameInst.prodigy.player.pvp.isEnabled)
                ? gameInst.prodigy.player.pvp.isEnabled()
                : true;

            if (isPvpEnabled) {
                if (gameInst && gameInst.prodigy && gameInst.prodigy.network && typeof gameInst.prodigy.network.emit === 'function') {
                    gameInst.prodigy.network.emit('PVP', 'try-match', {});
                }
                if (gameInst && gameInst.prodigy && gameInst.prodigy.network && typeof gameInst.prodigy.network.send === 'function') {
                    gameInst.prodigy.network.send('pvp', {
                        'type': 'start-matchmaking',
                        'classID': gameInst.prodigy.player && gameInst.prodigy.player.getClassID ? gameInst.prodigy.player.getClassID() : 1,
                        'grade': gameInst.prodigy.player && gameInst.prodigy.player.grade ? gameInst.prodigy.player.grade : 1
                    }, true);
                }

                if (typeof stateContext.closeMessage === 'function') {
                    stateContext.closeMessage();
                }

                // Setup 30s - 90s bot match fallback timer
                const botDelay = 30000 + Math.round(60000 * Math.random());
                if (typeof stateContext.tryBotMatch === 'function') {
                    stateContext.botTimeout = globalThis.setTimeout(stateContext.tryBotMatch.bind(stateContext), botDelay);
                } else {
                    stateContext.botTimeout = globalThis.setTimeout(self.tryBotMatch.bind(stateContext), botDelay);
                }

                if (gameInst && gameInst.prodigy && gameInst.prodigy.old && typeof gameInst.prodigy.old.isFeatureEnabled === 'function') {
                    if (gameInst.prodigy.old.isFeatureEnabled(gameInst.prodigy.player && gameInst.prodigy.player.userID)) {
                        globalThis.matchmakingWatchdog = (() => {
                            delete globalThis.matchmakingWatchdog;
                            if (typeof stateContext.tryBotMatch === 'function') {
                                stateContext.tryBotMatch();
                            } else {
                                self.tryBotMatch.call(stateContext);
                            }
                        }).bind(stateContext);
                    }
                }

                if (gameInst && gameInst.prodigy && gameInst.prodigy.open && typeof gameInst.prodigy.open.message === 'function') {
                    stateContext.message = gameInst.prodigy.open.message(
                        "Searching for an opponent based on your arena ranking. (If none are found, you will be matched with a bot after 30 seconds.)",
                        typeof stateContext.closeMessage === 'function' ? stateContext.closeMessage.bind(stateContext, true) : null,
                        null,
                        "Searching..."
                    );
                }
            } else {
                if (gameInst && gameInst.prodigy && gameInst.prodigy.open && typeof gameInst.prodigy.open.message === 'function') {
                    stateContext.message = gameInst.prodigy.open.message("You cannot take part in PVP matches in Offline Mode.");
                }
            }
        };
    }

    /**
     * Patches Google Sign-In handler logic to load wizard data and worlds.
     */
    patchGoogleSignIn() {
        const self = this;

        // Custom implementation for onGoogleSignIn
        this.onGoogleSignIn = function(data) {
            console.log("[GamePatch] onGoogleSignIn triggered. Received data:", data);
            
            // Resolve game instance and current state context safely
            const gameInst = (this && this.game) ? this.game : self.game;
            let stateContext = this || {};

            // If called from global window scope, acquire active Phaser state
            if ((!stateContext.error || typeof stateContext.error.setText !== 'function') && gameInst && gameInst.state) {
                if (typeof gameInst.state.getCurrentState === 'function') {
                    const activeState = gameInst.state.getCurrentState();
                    if (activeState) stateContext = activeState;
                }
            }

            // Fallback object if data is boolean or missing userID
            if (data === true || (data && !data.userID)) {
                data = { success: true, userID: (data && data.userID) ? data.userID : "google_user_default" };
            }

            try {
                if (data && data.success) {
                    console.log("[GamePatch] Sign-in successful for userID:", data.userID);
                    
                    if (gameInst && gameInst.prodigy) {
                        if (!gameInst.prodigy.player) {
                            console.log("[GamePatch] game.prodigy.player was null/undefined, initializing blank object.");
                            gameInst.prodigy.player = {};
                        }
                        gameInst.prodigy.player.userID = data.userID;
                    } else {
                        console.warn("[GamePatch] Warning: game or game.prodigy missing when setting userID.");
                    }

                    if (stateContext.error && typeof stateContext.error.setText === 'function') {
                        stateContext.error.setText("Loading wizard data...");
                    }

                    let loadedFinished = false;

                    const loadWorldsAndFinish = () => {
                        if (loadedFinished) {
                            console.log("[GamePatch] loadWorldsAndFinish already executed. Skipping duplicate call.");
                            return;
                        }
                        loadedFinished = true;
                        console.log("[GamePatch] Transitioning to loadWorldsAndFinish...");

                        if (stateContext.error && typeof stateContext.error.setText === 'function') {
                            stateContext.error.setText("Loading worlds...");
                        }

                        if (typeof stateContext.openWorlds === 'function') {
                            stateContext.openWorlds();
                        } else if (gameInst && gameInst.prodigy && gameInst.prodigy.network && typeof gameInst.prodigy.network.getWorldList === 'function') {
                            console.log("[GamePatch] Fetching world list from network...");
                            const openPlayerCallback = typeof stateContext.openPlayer === 'function' ? stateContext.openPlayer.bind(stateContext) : null;
                            const openPlayerNullCallback = typeof stateContext.openPlayer === 'function' ? stateContext.openPlayer.bind(stateContext, null) : null;
                            gameInst.prodigy.network.getWorldList(openPlayerCallback, openPlayerNullCallback);
                        } else {
                            console.error("[GamePatch] Network or getWorldList missing from game instance!", {
                                prodigy: gameInst ? gameInst.prodigy : null,
                                network: gameInst && gameInst.prodigy ? gameInst.prodigy.network : null
                            });
                        }
                    };

                    const handleSaveLoad = (saveData) => {
                        console.log("[GamePatch] getCloudSave callback received. saveData:", saveData);
                        if (saveData) {
                            const saveLoadFn = typeof stateContext.onGoogleSaveLoad === 'function' 
                                ? stateContext.onGoogleSaveLoad.bind(stateContext)
                                : self.onGoogleSaveLoad.bind(stateContext);

                            if (typeof saveLoadFn === 'function') {
                                try {
                                    console.log("[GamePatch] Executing onGoogleSaveLoad...");
                                    saveLoadFn(saveData);
                                } catch (e) {
                                    console.error("[GamePatch] Error in onGoogleSaveLoad execution:", e);
                                }
                            } else {
                                console.warn("[GamePatch] onGoogleSaveLoad is not available.");
                            }
                            loadWorldsAndFinish();
                        } else {
                            console.log("[GamePatch] No save data found or first time sign-in.");
                            if (gameInst && gameInst.prodigy && gameInst.prodigy.open && typeof gameInst.prodigy.open.confirm === 'function') {
                                console.log("[GamePatch] Showing first-time wizard confirmation prompt...");
                                gameInst.prodigy.open.confirm(
                                    "It looks like this is your first time signing in with this account. Do you want to load a wizard?",
                                    typeof stateContext.openFileForCharacter === 'function' ? stateContext.openFileForCharacter.bind(stateContext, true) : null,
                                    typeof gameInst.prodigy.start === 'function' ? gameInst.prodigy.start.bind(gameInst.prodigy, "CharCreate") : null,
                                    null,
                                    "Hey!"
                                );
                            } else {
                                console.warn("[GamePatch] prodigy.open.confirm missing, proceeding directly to world load.");
                                loadWorldsAndFinish();
                            }
                        }
                    };

                    // Fallback timeout in case cloud save fetch hangs
                    const saveTimeout = setTimeout(() => {
                        if (!loadedFinished) {
                            console.warn("[GamePatch] TIMEOUT: Save data fetch took > 5s. Forcing world load.");
                            loadWorldsAndFinish();
                        }
                    }, 5000);

                    // Ensure prodigy.old has the patched getCloudSave implementation
                    if (gameInst && gameInst.prodigy) {
                        if (!gameInst.prodigy.old) {
                            console.warn("[GamePatch] game.prodigy.old missing; creating placeholder object.");
                            gameInst.prodigy.old = {};
                        }
                        if (typeof self.getCloudSave === 'function') {
                            console.log("[GamePatch] Binding patch getCloudSave to game.prodigy.old");
                            gameInst.prodigy.old.getCloudSave = self.getCloudSave.bind(self);
                        }
                    }

                    if (gameInst && gameInst.prodigy && gameInst.prodigy.old && typeof gameInst.prodigy.old.getCloudSave === 'function') {
                        try {
                            console.log("[GamePatch] Calling getCloudSave for userID:", data.userID);
                            gameInst.prodigy.old.getCloudSave(data.userID, (saveData) => {
                                clearTimeout(saveTimeout);
                                handleSaveLoad(saveData);
                            });
                        } catch (err) {
                            console.error("[GamePatch] Exception throwing while invoking getCloudSave:", err);
                            clearTimeout(saveTimeout);
                            loadWorldsAndFinish();
                        }
                    } else {
                        console.warn("[GamePatch] getCloudSave unavailable on prodigy.old.");
                        clearTimeout(saveTimeout);
                        loadWorldsAndFinish();
                    }
                } else {
                    console.warn("[GamePatch] Sign-in payload reported failure or was invalid:", data);
                    if (typeof stateContext.showLogin === 'function') {
                        stateContext.showLogin(true);
                    }
                    if (stateContext.error && typeof stateContext.error.setText === 'function') {
                        stateContext.error.setText("");
                    }
                    if (gameInst && gameInst.prodigy && gameInst.prodigy.open) {
                        gameInst.prodigy.open.message("Google Sign-In was unsuccessful or account is disabled. Please try again or contact support.");
                    }
                    if (stateContext.closeButton) {
                        stateContext.closeButton.visible = true;
                    }
                }
            } catch (fatalErr) {
                console.error("[GamePatch] Fatal exception caught inside onGoogleSignIn:", fatalErr);
                if (typeof stateContext.showLogin === 'function') {
                    stateContext.showLogin(true);
                }
                if (stateContext.error && typeof stateContext.error.setText === 'function') {
                    stateContext.error.setText("Sign-in failed. Please check browser developer console.");
                }
                if (stateContext.closeButton) {
                    stateContext.closeButton.visible = true;
                }
            }
        };
    }

    /**
     * Patches Google Save Load handler logic
     */
    patchGoogleSaveLoad() {
        const self = this;

        this.onGoogleSaveLoad = function(data) {
            console.log("[GamePatch] onGoogleSaveLoad called with data:", data);
            const gameInst = (this && this.game) ? this.game : self.game;
            let stateContext = this || {};

            if ((!stateContext.offlineMode || typeof stateContext.offlineMode !== 'function') && gameInst && gameInst.state) {
                if (typeof gameInst.state.getCurrentState === 'function') {
                    const activeState = gameInst.state.getCurrentState();
                    if (activeState) stateContext = activeState;
                }
            }

            if (data && data.success) {
                // Successfully loaded the cloud save!
                const isWizardDefined = (typeof Util !== 'undefined' && typeof Util.isDefined === 'function')
                    ? Util.isDefined(data.wizard)
                    : (data.wizard !== undefined && data.wizard !== null);

                console.log("[GamePatch] isWizardDefined:", isWizardDefined, "Wizard payload:", data.wizard);

                if (isWizardDefined) {
                    if (gameInst && gameInst.prodigy && gameInst.prodigy.old && typeof gameInst.prodigy.old.loadSave === 'function') {
                        try {
                            console.log("[GamePatch] Invoking game.prodigy.old.loadSave...");
                            gameInst.prodigy.old.loadSave(data.wizard);
                        } catch (err) {
                            console.error("[GamePatch] Error running loadSave:", err);
                        }
                    } else {
                        console.warn("[GamePatch] loadSave function not available on prodigy.old.");
                    }

                    if (typeof stateContext.offlineMode === 'function') {
                        try {
                            console.log("[GamePatch] Invoking offlineMode on current state...");
                            stateContext.offlineMode();
                        } catch (err) {
                            console.error("[GamePatch] Error running offlineMode:", err);
                        }
                    } else {
                        console.warn("[GamePatch] offlineMode function not available on current state.");
                    }
                } else {
                    console.log("[GamePatch] Wizard data missing in save; asking user to load wizard...");
                    if (gameInst && gameInst.prodigy && gameInst.prodigy.open && typeof gameInst.prodigy.open.confirm === 'function') {
                        gameInst.prodigy.open.confirm(
                            "It looks like this is your first time signing in with this account. Do you want to load a wizard?",
                            typeof stateContext.openFileForCharacter === 'function' ? stateContext.openFileForCharacter.bind(stateContext, true) : null,
                            typeof gameInst.prodigy.start === 'function' ? gameInst.prodigy.start.bind(gameInst.prodigy, "CharCreate") : null,
                            null,
                            "Hey!"
                        );
                    }
                }
            } else {
                console.warn("[GamePatch] Cloud save load reported success=false. Starting CharCreate scene...");
                if (gameInst && gameInst.prodigy && typeof gameInst.prodigy.start === 'function') {
                    gameInst.prodigy.start("CharCreate");
                }
            }
        };
    }

    /**
     * Patches or defines getCloudSave handler logic to fetch wizard save data from Firebase DB
     */
    patchGetCloudSave() {
        this.getCloudSave = function(userID, callback) {
            console.log("[GamePatch] getCloudSave invoked for userID:", userID);

            if (typeof firebase !== 'undefined' && firebase.utils && firebase.utils.db) {
                console.log("[GamePatch] Querying Firebase Realtime DB at `users/" + userID + "`...");
                
                firebase.utils.db.get(firebase.utils.db.ref(firebase.database, `users/${userID}`)).then((save) => {
                    console.log("[GamePatch] Firebase DB response received. Save exists:", save.exists());
                    if (save.exists()) {
                        let wizard = save.val();
                        console.log("[GamePatch] Raw Firebase wizard data type:", typeof wizard);
                        if (typeof wizard === "string") {
                            try {
                                wizard = JSON.parse(wizard);
                                console.log("[GamePatch] Successfully parsed wizard JSON string.");
                            } catch (e) {
                                console.error("[GamePatch] Error parsing wizard JSON:", e);
                            }
                        }
                        const isCallbackValid = (typeof Util !== 'undefined' && typeof Util.isDefined === 'function')
                            ? Util.isDefined(callback)
                            : (typeof callback === 'function');

                        if (isCallbackValid) {
                            callback({
                                success: true,
                                wizard: wizard
                            });
                        }
                    } else {
                        console.log("[GamePatch] No snapshot exists in Firebase for this user.");
                        const isCallbackValid = (typeof Util !== 'undefined' && typeof Util.isDefined === 'function')
                            ? Util.isDefined(callback)
                            : (typeof callback === 'function');

                        if (isCallbackValid) {
                            callback({
                                success: true
                            });
                        }
                    }
                }).catch((error) => {
                    console.error("[GamePatch] Firebase database query failed:", error);
                    if (typeof Util !== 'undefined' && typeof Util.log === 'function' && typeof Util.ERROR !== 'undefined') {
                        Util.log("Error loading character data.", Util.ERROR);
                    }
                    const isCallbackValid = (typeof Util !== 'undefined' && typeof Util.isDefined === 'function')
                        ? Util.isDefined(callback)
                        : (typeof callback === 'function');

                    if (isCallbackValid) {
                        callback({
                            success: false
                        });
                    }
                });
            } else {
                console.warn("[GamePatch] Firebase DB utility not found (`firebase.utils.db`). Returning success fallback.");
                if (typeof callback === 'function') {
                    callback({ success: true });
                }
            }
        };

        // Automatically bind to prodigy.old if present on game instance
        if (this.game && this.game.prodigy && this.game.prodigy.old) {
            this.game.prodigy.old.getCloudSave = this.getCloudSave.bind(this);
            console.log("[GamePatch] Bound getCloudSave to game.prodigy.old");
        }
    }

    /**
     * Patches Login Success handler logic
     */
    patchLoginSuccess() {
        const self = this;

        // Custom implementation for loginSuccess
        this.loginSuccess = function(e) {
            console.log("[GamePatch] loginSuccess triggered with parameter:", e);
            const gameInst = (this && this.game) ? this.game : self.game;
            let stateContext = this || {};

            if (gameInst && gameInst.prodigy) {
                if (gameInst.prodigy.education && typeof gameInst.prodigy.education.init === 'function') {
                    console.log("[GamePatch] Initializing education module...");
                    gameInst.prodigy.education.init(e);
                }
                
                if (stateContext.error && typeof stateContext.error.setText === 'function') {
                    stateContext.error.setText("Loading worlds...");
                }

                if (typeof stateContext.openWorlds === 'function') {
                    stateContext.openWorlds(e);
                } else if (gameInst.prodigy.network && typeof gameInst.prodigy.network.getWorldList === 'function') {
                    console.log("[GamePatch] Calling getWorldList from loginSuccess...");
                    const openPlayerCallback = typeof stateContext.openPlayer === 'function' ? stateContext.openPlayer.bind(stateContext) : null;
                    const openPlayerNullCallback = typeof stateContext.openPlayer === 'function' ? stateContext.openPlayer.bind(stateContext, null) : null;
                    
                    gameInst.prodigy.network.getWorldList(openPlayerCallback, openPlayerNullCallback);
                }
            }
        };
    }

    /**
     * Attaches methods directly to a login state or scene prototype
     * @param {Object} targetState - The state object or prototype (e.g., Login state prototype)
     */
    attachToState(targetState) {
        if (targetState) {
            targetState.authorizeWithGoogle = this.authorizeWithGoogle;
            targetState.openWorlds = this.openWorlds;
            targetState.tryBotMatch = this.tryBotMatch;
            targetState.openMessage = this.openMessage;
            targetState.onGoogleSignIn = this.onGoogleSignIn;
            targetState.onGoogleSaveLoad = this.onGoogleSaveLoad;
            targetState.getCloudSave = this.getCloudSave;
            targetState.loginSuccess = this.loginSuccess;
            console.log("[GamePatch] Successfully attached patches to target state:", targetState);
        } else {
            console.warn("[GamePatch] attachToState called with null or undefined targetState.");
        }
    }
}

// Make available globally or via module exports
if (typeof window !== 'undefined') {
    window.GamePatch = GamePatch;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GamePatch;
}
