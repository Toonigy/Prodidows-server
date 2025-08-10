// patch.js - This file applies runtime patches to game.min.js without modifying it directly.

// ⭐ PATCH 1: Ensure basic Util functions exist globally ⭐
// This section ensures that Util.log, Util.error, Util.warn, and Util.isDefined are
// properly defined, as they are used throughout the patched code.
(function() {
    // Ensure Util object exists. If it's a function by default, keep it, otherwise create object.
    // This handles potential variations in how Util might be defined in game.min.js.
    if (typeof Util === 'undefined' || typeof Util !== 'object' && typeof Util !== 'function') {
        window.Util = {};
    }

    if (typeof Util.log === 'undefined') {
        Util.log = function(...args) { console.log("[Util.log][Patch]", ...args); };
    }
    if (typeof Util.error === 'undefined') {
        Util.error = function(...args) { console.error("[Util.error][Patch]", ...args); };
    }
    if (typeof Util.warn === 'undefined') {
        Util.warn = function(...args) { console.warn("[Util.warn][Patch]", ...args); };
    }
    if (typeof Util.isDefined === 'undefined') {
        Util.isDefined = function(val) { return typeof val !== 'undefined' && val !== null; };
    }
    Util.log("⭐ Patch 1: Basic Util functions ensured.");
})();


// ⭐ PATCH 2: Ensure window.Prodigy.game.prodigy.player is initialized with mock data ⭐
// This is critical for development/testing when a full login flow might not be executed,
// providing necessary player data for ApiClient and other game logic.
(function() {
    if (!window.Prodigy) window.Prodigy = {};
    if (!window.Prodigy.game) window.Prodigy.game = {};
    if (!window.Prodigy.game.prodigy) window.Prodigy.game.prodigy = {};

    if (!window.Prodigy.game.prodigy.player) {
        window.Prodigy.game.prodigy.player = {
            userID: "mockPlayer_" + Math.random().toString(36).substring(2, 9), // Generate a unique mock ID
            token: "mockAuthToken_xyz123", // A simple mock token
            wizardData: {
                level: 1,
                name: "MockWizard",
                element: "fire"
            }
        };
        Util.log("⭐ Patch 2: Mock Prodigy.game.prodigy.player initialized.");
    } else {
        // Ensure userID and token exist on an existing player object
        if (!window.Prodigy.game.prodigy.player.userID) {
            window.Prodigy.game.prodigy.player.userID = "mockPlayer_" + Math.random().toString(36).substring(2, 9);
            Util.log("⭐ Patch 2: Existing Prodigy.game.prodigy.player.userID set.");
        }
        if (!window.Prodigy.game.prodigy.player.token) {
            window.Prodigy.game.prodigy.player.token = "mockAuthToken_xyz123";
            Util.log("⭐ Patch 2: Existing Prodigy.game.prodigy.player.token set.");
        }
    }
})();

// ⭐ PATCH 3: Re-define ApiClient and NetworkManager for correct server connection ⭐
// This addresses the `NetworkManager is not a constructor` and `ApiClient` connection issues.
// We are assuming `ApiClient` is originally defined somewhere in `game.min.js`
// and `Prodigy.extends` is also available.
(function() {
    // Attempt to access original ApiClient for potential reuse of internal methods if possible,
    // otherwise define a basic structure if it's completely missing or broken.
    const OriginalApiClient = window.ApiClient; // Store reference if it exists

    // Define ApiClient if it's not properly defined or if we need to completely override it
    // This is a minimal definition assuming 'get' and 'post' methods are primary.
    function PatchedApiClient(gameProdigy, options) {
        this.gameProdigy = gameProdigy;
        this.root = (options && options.root) || "/game-api/"; // Default to /game-api/
        this.uniqueKey = null; // Will be set by a later patch or game logic
        this.userID = null;    // Will be set by a later patch or game logic
        Util.log("PatchedApiClient: Initializing with root:", this.root);

        // This should be bound by NetworkManager or similar.
        this.generic_ajax_error = function(...args) {
            Util.error("PatchedApiClient: Generic AJAX Error (unhandled):", ...args);
        };

        // Basic GET implementation for fetching data
        this.get = function(path, successCb, errorCb) {
            const url = this.root + path.replace(/^\//, ''); // Ensure no double slashes
            Util.log("PatchedApiClient: GET request to:", url, "with uniqueKey:", this.uniqueKey, "userID:", this.userID);
            $.ajax({
                url: url,
                type: "GET",
                headers: {
                    "auth-key": this.uniqueKey || '', // Use assigned uniqueKey
                    "token": this.uniqueKey || '',     // Use assigned uniqueKey
                    "user-id": this.userID || ''       // Use assigned userID
                },
                success: (data) => {
                    Util.log("PatchedApiClient: GET success for", path, ":", data);
                    if (successCb) successCb(data);
                },
                error: (jqXHR, textStatus, errorThrown) => {
                    Util.error("PatchedApiClient: GET error for", path, ":", textStatus, errorThrown, jqXHR);
                    if (errorCb) errorCb(jqXHR.status, jqXHR.responseText, errorThrown); // Pass status, responseText, errorThrown
                    if (this.generic_ajax_error) this.generic_ajax_error(jqXHR, textStatus, errorThrown);
                },
                // Added for cross-domain requests
                crossDomain: true
            });
        };

        // Basic POST implementation
        this.post = function(path, data, successCb, errorCb) {
            const url = this.root + path.replace(/^\//, ''); // Ensure no double slashes
            Util.log("PatchedApiClient: POST request to:", url, "with data:", data);
            $.ajax({
                url: url,
                type: "POST",
                headers: {
                    "auth-key": this.uniqueKey || '',
                    "token": this.uniqueKey || '',
                    "user-id": this.userID || ''
                },
                data: JSON.stringify(data), // Send data as JSON
                contentType: "application/json", // Specify JSON content type
                success: (responseData) => {
                    Util.log("PatchedApiClient: POST success for", path, ":", responseData);
                    if (successCb) successCb(responseData);
                },
                error: (jqXHR, textStatus, errorThrown) => {
                    Util.error("PatchedApiClient: POST error for", path, ":", textStatus, errorThrown, jqXHR);
                    if (errorCb) errorCb(jqXHR.status, jqXHR.responseText, errorThrown);
                    if (this.generic_ajax_error) this.generic_ajax_error(jqXHR, textStatus, errorThrown);
                },
                // Added for cross-domain requests
                crossDomain: true
            });
        };

        // ⭐ MODIFIED: Updated logout method to use Firebase authentication ⭐
        this.logout = function(successCb, errorCb) {
            Util.log("PatchedApiClient: Attempting Firebase logout.");
            // Ensure firebase object and auth service are available
            if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
                firebase.auth().signOut().then(() => {
                    Util.log("PatchedApiClient: Firebase logout successful.");
                    // Clear credentials locally upon successful logout
                    this.uniqueKey = null;
                    this.userID = null;
                    if (successCb) successCb({ success: true, message: "Firebase logout successful." });
                }).catch((error) => {
                    Util.error("PatchedApiClient: Firebase logout error:", error);
                    if (errorCb) errorCb(error.code || "FIREBASE_ERROR", error.message || "Firebase logout failed.", error);
                    if (this.generic_ajax_error) this.generic_ajax_error(null, "Firebase error", error);
                });
            } else {
                Util.error("PatchedApiClient: Firebase or Firebase auth service not available for logout.");
                if (errorCb) errorCb("FIREBASE_NOT_READY", "Firebase library or auth service not loaded.");
                if (this.generic_ajax_error) this.generic_ajax_error(null, "Firebase not ready", "Firebase library not available.");
            }
        };

        // ⭐ NEW: Add getWorldList method to PatchedApiClient to satisfy game.min.js if it calls directly ⭐
        // This will allow game.min.js to call `this.api.getWorldList()` without error.
        this.getWorldList = function(successCb, errorCb) {
            Util.log("PatchedApiClient: Delegating getWorldList to generic GET (from PatchedApiClient).");
            this.get("v1/world-list", successCb, errorCb);
        };

        // ⭐ NEW: Add emitMessage method to PatchedApiClient to satisfy game.min.js if it calls directly ⭐
        // This is a placeholder as APIClient is typically for HTTP, but added to prevent TypeError
        // if game.min.js expects it on this.api directly.
        this.emitMessage = function(eventName, data, callback) {
            Util.warn(`PatchedApiClient: Called emitMessage for event '${eventName}'. APIClient typically handles HTTP, not Socket.IO. This might be a misrouted call in game.min.js.`);
            // You might choose to try and route it to the actual socket here if one exists globally
            if (window.Prodigy && window.Prodigy.game && window.Prodigy.game.prodigy && window.Prodigy.game.prodigy.socket && typeof window.Prodigy.game.prodigy.socket.emit === 'function') {
                window.Prodigy.game.prodigy.socket.emit(eventName, data, callback);
            } else {
                Util.error(`PatchedApiClient: Failed to emit '${eventName}'. No Socket.IO client available.`);
                if (typeof callback === 'function') {
                    callback({ success: false, message: "Socket.IO not available on ApiClient." });
                }
            }
        };
    }

    // Assign the PatchedApiClient globally
    window.ApiClient = PatchedApiClient;
    window.Prodigy.game.apiClient = new window.ApiClient(window.Prodigy.game.prodigy, { root: "/game-api/" });
    Util.log("⭐ Patch 3: ApiClient defined and Prodigy.game.apiClient re-initialized.");


    // ⭐ PATCH 4: Re-define NetworkManager for correct constructor and API usage ⭐
    // This addresses "NetworkManager is not a constructor" and ensures it uses the correct ApiClient.
    var NetworkManager_Patched = function() {
        function NetworkManager_Constructor(gameInstance) {
            $(document).ajaxError(function() {
                Util.log("NetworkManager AJAX error:", arguments);
            });
            this.player = null; // Will be populated by game
            this.game = gameInstance;
            this.open = new Prodigy.MenuFactory(gameInstance); // Assuming MenuFactory is stable
            this.socketConnected = true;

            // Use the globally initialized and patched ApiClient instance
            this.api = window.Prodigy.game.apiClient;

            // Propagate credentials to ApiClient if they are ready
            if (window.Prodigy.game.prodigy.player) {
                 this.api.uniqueKey = window.Prodigy.game.prodigy.player.token;
                 this.api.userID = window.Prodigy.game.prodigy.player.userID;
                 Util.log("NetworkManager: ApiClient credentials propagated from Prodigy.game.prodigy.player.");
            } else {
                 Util.warn("NetworkManager: Prodigy.game.prodigy.player not fully ready for ApiClient credentials.");
            }

            // Ensure generic_ajax_error is correctly bound
            this.api.generic_ajax_error = this.onError.bind(this);

            // Mock initBoot (if used by ApiClient) - can be refined later
            this.initBoot = function() {
                Util.log("NetworkManager: initBoot called (mock).");
                // Potentially redirect to a boot screen or display a message
                // if (typeof this.game.prodigy.displayMessage === 'function') {
                //    this.game.prodigy.displayMessage("Server unavailable. Please try again.", 2);
                // }
            };

            // Bind the 503 error handler from ApiClient to initBoot
            // This needs to be correctly handled by how ApiClient manages its error callbacks.
            // If ApiClient has a dedicated property for 503, set it directly:
            // this.api['503'] = this.initBoot.bind(this);
            // Otherwise, rely on generic_ajax_error to route.

            setInterval(this.updateCharacter.bind(this), 3000); // Example interval
        }

        // Static properties (e.g., error codes, flags)
        NetworkManager_Constructor.LOGIN = {
            200: "All Good!", 400: "The login api's coming soon.", 401: "Incorrect Username Or Password",
            403: "Access is Forbidden!", 503: "The login api's coming soon.", 500: "The login api's coming soon.",
            0: "The login api's coming soon."
        };
        NetworkManager_Constructor.SKILLS = { 0: "There was an error loading your skills. Please try again." };
        NetworkManager_Constructor.VERBOSE_ANALYTICS = false;
        NetworkManager_Constructor.emitMessageCount = 0;

        // Prototype methods
        NetworkManager_Constructor.prototype.getKey = function() {
            return this.api.uniqueKey;
        };
        NetworkManager_Constructor.prototype.openWebsite = function(url, openInNewWindow) {
            openInNewWindow = !Util.isDefined(openInNewWindow) || openInNewWindow;
            try {
                var fullUrl = "https://" + url;
                openInNewWindow ? window.open(fullUrl) : window.location.href = fullUrl;
            } catch (error) {
                Util.error("NetworkManager.openWebsite error:", error);
            }
        };
        NetworkManager_Constructor.prototype.sendNotification = function(notificationData) {
            var owners = this.game.prodigy.player.owners;
            notificationData.timestamp = new Date();
            var apiUrl = "https://www.prodigygame.org/notification-api/v1/";
            try {
                if (document.domain.indexOf("prodigygame.com") >= 0) {
                    apiUrl = "https://prodigygame.com/notification-api/v1/";
                }
            } catch (error) {
                Util.error("NetworkManager.sendNotification domain check error:", error);
            }
            for (var i = 0; i < owners.length; i++) {
                try {
                    $.ajax({
                        url: apiUrl + owners[i].ownerID,
                        type: "POST",
                        data: notificationData
                    });
                } catch (error) {
                    Util.error("NetworkManager.sendNotification AJAX error for owner:", owners[i].ownerID, error);
                }
            }
        };

        NetworkManager_Constructor.prototype.onError = function(...args) {
            Util.error("NetworkManager.onError handler:", ...args);
            // Further error handling, e.g., display a user-friendly message
            // if (typeof this.game.prodigy.displayMessage === 'function') {
            //     this.game.prodigy.displayMessage("Network Error. Please try again.", 2);
            // }
        };

        NetworkManager_Constructor.prototype.updateCharacter = function() {
            // This is the interval function; implement actual logic later.
            // Util.log("NetworkManager.updateCharacter: (Placeholder) Sending character update.");
        };

        // ⭐ NEW: Add canUseMP method to NetworkManager prototype ⭐
        NetworkManager_Constructor.prototype.canUseMP = function () {
            // Assuming this.game.prodigy.old.signedIn refers to the game's internal signed-in state
            // and this.socketConnected refers to the NetworkManager's socket status.
            // We need to ensure 'zone' is part of the NetworkManager's instance if it's used.
            // For now, defaulting `this.zone` to a safe check.
            return (this.game.prodigy.old && this.game.prodigy.old.signedIn) &&
                   this.socketConnected &&
                   Util.isDefined(this.game.prodigy.player.zone); // Assuming zone is on the player object for multiplayer context
        };


        // Removed getWorldList and emitMessage from here. They are now directly overridden in PATCH 6.

        return NetworkManager_Constructor;
    }(); // IIFE for NetworkManager_Patched

    // Assign the patched NetworkManager to its global/Prodigy scope.
    // This part is crucial and should happen during the game's core initialization if possible.
    // If your game already assigns `NetworkManager` to `window.Prodigy.game.prodigy.network`,
    // this line ensures it's the patched version.
    if (window.Prodigy && window.Prodigy.game && window.Prodigy.game.prodigy) {
        window.Prodigy.game.prodigy.network = new NetworkManager_Patched(window.Prodigy.game);
        Util.log("⭐ Patch 4: Prodigy.game.prodigy.network initialized with patched NetworkManager.");

        // Propagate credentials again after NetworkManager might have re-initialized ApiClient
        if (window.Prodigy.game.apiClient && window.Prodigy.game.prodigy.player) {
            window.Prodigy.game.apiClient.uniqueKey = window.Prodigy.game.prodigy.player.token;
            window.Prodigy.game.apiClient.userID = window.Prodigy.game.prodigy.player.userID;
            Util.log(`⭐ Patch: ApiClient credentials updated after NetworkManager initialization: UserID=${window.Prodigy.game.apiClient.userID}.`);
        }
    } else {
        Util.warn("⭐ Patch 4: Prodigy.game.prodigy not ready for NetworkManager initialization.");
    }
})();


// ⭐ PATCH 5: Re-define Prodigy.Menu.Server for proper structure and event handling ⭐
// This addresses the `b.addChild is not a function` and other menu-related errors.
// It ensures that Prodigy.Menu.Server is a properly structured constructor with its prototype methods.
(function() {
    if (!window.Prodigy || !window.Prodigy.Control || !window.Prodigy.Control.Menu || !window.Prodigy.extends) {
        Util.error("⭐ Patch 5: Prerequisites for Prodigy.Menu.Server not met. Skipping menu patch.");
        return;
    }

    /**
     * Constructor for Prodigy.Menu.Server.
     * @param {object} gameInstance - The game instance (e).
     * @param {object} parentContainer - Parent container (t).
     * @param {Array} serversData - Array of server data (i).
     * @param {function} callbackFn - Callback function (a).
     */
    function Prodigy_Menu_Server_Constructor(gameInstance, parentContainer, serversData, callbackFn) {
        Prodigy.Control.Menu.call(this, gameInstance, parentContainer, 11);
        this.callback = callbackFn;
        this.servers = serversData;
        this.socket = null; // Initialize socket property for this instance
        this.socketConnectFailed = false; // Initialize connection failed flag
        this.setup(); // Call the setup method
    }

    // Extend Prodigy.Menu.Server from Prodigy.Control.Menu
    Prodigy.extends(Prodigy_Menu_Server_Constructor, Prodigy.Control.Menu, {
        constructor: Prodigy_Menu_Server_Constructor, // Explicitly set the constructor

        menuSetup: function () {
            Prodigy.Control.Menu.prototype.menuSetup.call(this);

            this.showFrame("map", "CHOOSE YOUR WORLD", []);
            this.game.prodigy.create.font(this, 125, 60, "Pick the same world as your friends to play together!", {
                size: 20
            });
            this.game.prodigy.create.textButton(this, 930, 20, {
                size: Prodigy.Control.TextButton.MED,
                icon: "next",
                text: "play offline"
            }, this.close.bind(this, true));
            this.game.prodigy.create.textButton(this, 50, 650, {
                icon: "back",
                text: "back"
            }, this.close.bind(this, false, true));

            // ⭐ FIX: Ensure this.content is initialized as a proper Phaser Group-like object ⭐
            // Changed from this.game.prodigy.create.group() to this.game.add.group()
            this.content = this.game.add.group();

            this.showSuggestedServers(this.servers);
            this.setupComplete = true;
        },

        showSuggestedServers: function (serversData) { // Renamed 'e' to 'serversData' for clarity
            if (!this.content) {
                // Changed from this.game.prodigy.create.group() to this.game.add.group()
                this.content = this.game.add.group();
                Util.warn("Prodigy.Menu.Server.showSuggestedServers: `this.content` was not initialized. Creating it now.");
            }
            this.content.removeAll(true);

            if (!Util.isDefined(serversData)) {
                this.game.prodigy.create.font(this.content, 0, 320, "Loading world list...", {
                    size: 30,
                    width: 1280,
                    align: "center"
                });
                // Use the NetworkManager's getWorldList to fetch data
                // This call should now correctly route to the patched NetworkManager.prototype.getWorldList (in Patch 6)
                this.game.prodigy.network.getWorldList(
                    this.showSuggestedServers.bind(this),
                    this.showError.bind(this, "Could not load world list. Check your connection and try again.", this.showSuggestedServers.bind(this))
                );
                return;
            }

            var suggestedServers = this.getSuggested(serversData);
            for (var i = 0; i < suggestedServers.length; i++) {
                var worldData = suggestedServers[i];
                Util.log(`DEBUG in showSuggestedServers: worldData for server '${worldData.name}':`, JSON.stringify(worldData));
                if (Util.isDefined(worldData)) {
                    this.createButton(worldData, 140 + i % 3 * 350, 210 + 140 * Math.floor(i / 3), this.content, this.showSuggestedServers.bind(this));
                }
            }

            var s = this.content.add(this.game.prodigy.create.sprite(520, 530, "core", "server-icon"));
            s.tint = 8111468;
            this.game.prodigy.create.font(this.content, 560, 540, " = wizards online", {
                size: 20
            });

            this.game.prodigy.create.textButton(this.content, 880, 650, {
                size: Prodigy.Control.TextButton.LG,
                text: "more worlds",
                icon: "map"
            }, this.showAllServers.bind(this));
        },

        createButton: function (worldData, xPos, yPos, parentContainer, callbackData) { // Renamed parameters for clarity
            if (!this.game || !this.game.prodigy) {
                Util.error("Prodigy.Menu.Server.createButton: `this.game` or `this.game.prodigy` is not defined. Cannot create button.");
                return null;
            }

            var buttonElement = this.game.prodigy.create.element(xPos, yPos, parentContainer);
            var buttonSprite = buttonElement.add(this.game.prodigy.create.sprite(0, 0, "core-2", "store-panel"));
            buttonSprite.inputEnabled = true;

            buttonSprite.events.onInputDown.add(this.joinMultiplayerServer.bind(
                this,
                worldData, // worldInfo
                "zone-login", // clientZone
                { // callbacks object for success/error
                    200: (response) => {
                        Util.log("⭐ CLIENT: World join successful! Server response:", response);
                        if (typeof this.game.prodigy.hideMessage === 'function') {
                            this.game.prodigy.hideMessage();
                        }
                        // Add game state transition logic here
                    },
                    500: (error) => {
                        Util.error("⭐ CLIENT: World join failed!", error);
                        if (typeof this.game.prodigy.displayMessage === 'function') {
                            this.game.prodigy.displayMessage("Connection failed: " + (error.message || "Unknown error"), 2);
                        }
                    },
                    503: (error) => {
                        Util.error("⭐ CLIENT: Service Unavailable Error:", error);
                        if (typeof this.game.prodigy.displayMessage === 'function') {
                            this.game.prodigy.displayMessage("Server unavailable. Please try again later.", 2);
                        }
                    }
                },
                this.handleSocketMessage.bind(this),
                this.handlePlayerList.bind(this),
                this.handleSocketDisconnect.bind(this),
                this.handlePlayerJoined.bind(this),
                this.handlePlayerLeft.bind(this)
            ), this);

            if (Util.isDefined(worldData.meta)) {
                buttonElement.add(this.game.prodigy.create.sprite(0, 0, Items.getIconAtlas(worldData.meta), this.getServerIcon(worldData.meta)));
            }

            this.game.prodigy.create.font(buttonElement, 85, -2, worldData.name);

            for (var n = 0 === worldData.full ? 12364703 : worldData.full <= 80 ? 8111468 : worldData.full < 95 ? 15194464 : 14307665, h = 0; 5 > h; h++) {
                var l = buttonElement.add(this.game.prodigy.create.sprite(96 + 39 * h, 36, "core", "server-icon"));
                l.tint = worldData.full >= 20 * h ? n : 12364703;
            }
            return buttonElement;
        },

        handleSocketMessage: function(data) {
            Util.log("⭐ CLIENT: Received generic socket message:", data);
        },

        handlePlayerList: function(data) {
            Util.log("⭐ CLIENT: Received playerList:", data.players);
        },

        handleSocketDisconnect: function(reason) {
            Util.log("⭐ CLIENT: Socket disconnected. Reason:", reason);
            if (typeof this.game.prodigy.displayMessage === 'function') {
                this.game.prodigy.displayMessage("Disconnected: " + reason, 1);
            }
            this.socket = undefined;
        },

        handlePlayerJoined: function(player) {
            Util.log("⭐ CLIENT: Player joined:", player.userID, player.wizardData);
        },

        handlePlayerLeft: function(player) {
            Util.log("⭐ CLIENT: Player left:", player.userID, player.reason);
        },

        joinMultiplayerServer: function (worldInfo, clientZone, callbacks, onMessageCb, onPlayerListCb, onDisconnectCb, onPlayerJoinedCb, onPlayerLeftCb) {
            Util.log("DEBUG in joinMultiplayerServer: Received worldInfo:", JSON.stringify(worldInfo));

            const playerProdigy = window.Prodigy && window.Prodigy.game && window.Prodigy.game.prodigy;
            const playerObject = playerProdigy && playerProdigy.player;

            const authKey = (playerObject && playerObject.token) ? playerObject.token : 'FALLBACK_AUTHKEY_MISSING';
            const userID = (playerObject && playerObject.userID) ? playerObject.userID : 'FALLBACK_USERID_MISSING';

            const worldId = (worldInfo && worldInfo.id) ? worldInfo.id : 'FALLBACK_WORLDID_MISSING';

            Util.log(`Attempting to connect with worldId=${worldId}, userID=${userID}, authKey=${authKey ? 'PRESENT' : 'MISSING'}.`, Util.INFO);

            if (typeof io === 'undefined') {
                Util.error("⭐ ERROR: Socket.IO client library (io) is not loaded. Cannot establish multiplayer connection.");
                if (callbacks && typeof callbacks[500] === 'function') {
                    callbacks[500]();
                }
                return false;
            }

            if (this.socket && this.socket.connected) {
                Util.log("Disconnecting existing Socket.IO connection before new attempt.", Util.INFO);
                this.socket.disconnect();
            }
            this.socket = undefined;
            this.socketConnectFailed = false;

            if (!worldInfo || !worldInfo.path) {
                Util.error("Prodigy.Menu.Server.joinMultiplayerServer: worldInfo or worldInfo.path is missing. Cannot construct Socket.IO URL.");
                if (callbacks && typeof callbacks[500] === 'function') {
                    callbacks[500](new Error("Missing world path information."));
                }
                return false;
            }
            const socketUrl = window.location.origin + worldInfo.path;
            Util.log(`Attempting Socket.IO connection to: ${socketUrl}`);

            this.socket = io(socketUrl, {
                query: {
                    token: authKey,
                    userID: userID,
                    worldId: worldId,
                    zone: clientZone,
                    wizardData: JSON.stringify(playerObject.wizardData || {})
                },
                transports: ['websocket', 'polling'],
                'force new connection': true,
                reconnection: false
            });

            this.socket.on('connect', () => {
                Util.log("⭐ Socket.IO connected! Socket ID:", this.socket.id, `to world ${worldId} for user ${userID}`);
                // ⭐ NEW: Store the active socket in a global Prodigy property ⭐
                if (window.Prodigy && window.Prodigy.game && window.Prodigy.game.prodigy) {
                    window.Prodigy.game.prodigy.socket = this.socket;
                    Util.log("Prodigy.Menu.Server: Active Socket.IO client stored at window.Prodigy.game.prodigy.socket.");
                } else {
                    Util.warn("Prodigy.Menu.Server: Could not store active socket. Prodigy.game.prodigy not available.");
                }

                if (callbacks && typeof callbacks[200] === 'function') {
                    callbacks[200]({ success: true, worldId: worldId, zone: clientZone, userID: userID });
                }

                this.socket.emit('joinGameWorld', {
                    worldId: worldId,
                    zone: clientZone,
                    uniqueKey: authKey,
                    userID: userID,
                    wizardData: playerObject.wizardData
                }, (response) => {
                    Util.log("⭐ Server 'joinGameWorld' acknowledgment received:", response);
                    if (!response.success) {
                        Util.error("Server 'joinGameWorld' failed:", response.message || "Unknown error from server");
                        if (callbacks && typeof callbacks[500] === 'function') {
                            callbacks[500](new Error(response.message || "Server join failed"));
                        }
                    }
                });
            });

            this.socket.on('connect_error', (error) => {
                this.socketConnectFailed = true;
                Util.error("⭐ Socket.IO connection error:", error.message || error);
                if (callbacks && typeof callbacks[503] === 'function') {
                    callbacks[503](error);
                } else if (callbacks && typeof callbacks[500] === 'function') {
                    callbacks[500](error);
                }
            });

            this.socket.on('error', (error) => {
                Util.error("⭐ General Socket.IO error:", error.message || error);
                if (error && error.code && callbacks && typeof callbacks[error.code] === 'function') {
                    callbacks[error.code](error);
                } else if (callbacks && typeof callbacks[500] === 'function') {
                     callbacks[500](error);
                }
            });

            this.socket.on('disconnect', (reason) => {
                Util.log("⭐ Socket.IO disconnected:", reason);
                if (onDisconnectCb && typeof onDisconnectCb === 'function') {
                    onDisconnectCb(reason);
                }
                this.socket = undefined;
                // ⭐ Clear the global socket reference on disconnect ⭐
                if (window.Prodigy && window.Prodigy.game && window.Prodigy.game.prodigy) {
                    delete window.Prodigy.game.prodigy.socket;
                    Util.log("Prodigy.Menu.Server: Global active Socket.IO client cleared.");
                }
            });

            this.socket.on('message', (data) => {
                Util.log("⭐ CLIENT RECEIVED GENERIC MESSAGE:", data, Util.INFO);
                if (onMessageCb && typeof onMessageCb === 'function') {
                    onMessageCb(data);
                }
            });

            this.socket.on('playerList', (data) => {
                Util.log("⭐ CLIENT RECEIVED PLAYERLIST! Players:", data.players, Util.INFO);
                if (onPlayerListCb && typeof onPlayerListCb === 'function') {
                    onPlayerListCb(data);
                }
            });

            this.socket.on('playerJoined', (player) => {
                Util.log("⭐ CLIENT RECEIVED PLAYERJOINED! New Player:", player, Util.INFO);
                if (onPlayerJoinedCb && typeof onPlayerJoinedCb === 'function') {
                    onPlayerJoinedCb(player);
                }
            });

            this.socket.on('playerLeft', (player) => {
                Util.log("⭐ CLIENT RECEIVED PLAYERLEFT! Player:", player, Util.INFO);
                if (onPlayerLeftCb && typeof onPlayerLeftCb === 'function') {
                    onPlayerLeftCb(player);
                }
            });
            return true;
        },

        emitMessage: function (messageData, callbacks) {
            if (this.socket && this.socket.connected) {
                Util.log("⭐ CLIENT: Emitting generic message:", messageData);
                this.socket.emit("message", messageData, (response) => {
                    if (callbacks && typeof callbacks[200] === 'function') {
                        callbacks[200](response);
                    }
                });
                return true;
            } else {
                Util.error("⭐ CLIENT: Cannot emit message. Socket is not connected or not defined.");
                if (callbacks && typeof callbacks[500] === 'function') {
                    callbacks[500](new Error("Socket not connected."));
                }
                return false;
            }
        },

        getSuggested: function(servers) {
            return servers ? servers.slice(0, 6) : [];
        },

        getServerIcon: function(meta) {
            if (meta && meta.tag) {
                switch(meta.tag) {
                    case 'fire': return 'server-icon-fire';
                    case 'ice': return 'server-icon-ice';
                    case 'magic': return 'server-icon-magic';
                    case 'town': return 'server-icon-town';
                    default: return 'server-icon-default';
                }
            }
            return 'server-icon-default';
        },

        showError: function(message, retryCallback) {
            Util.error("Prodigy.Menu.Server.showError: " + message);
            if (typeof this.game.prodigy.displayMessage === 'function') {
                this.game.prodigy.displayMessage(message + " Tap to retry.", 2, () => {
                    if (typeof retryCallback === 'function') {
                        retryCallback();
                    }
                });
            }
        },

        showAllServers: function() {
            Util.log("Prodigy.Menu.Server: showAllServers method called. Implement displaying all servers here.");
        },

        close: function(playOffline, goBack) {
            Util.log(`Prodigy.Menu.Server: close method called. playOffline: ${playOffline}, goBack: ${goBack}`);
            if (typeof this.game.prodigy.hideMessage === 'function') {
                 this.game.prodigy.hideMessage();
            }
        }
    });

    // Alias for convenience
    window.Prodigy.Menu.Server = Prodigy_Menu_Server_Constructor;
    Util.log("⭐ Patch 5: Prodigy.Menu.Server re-defined.");
})();

// ⭐ PATCH 6: Directly override NetworkManager prototype methods from game.min.js ⭐
// This patch targets the specific methods on the original NetworkManager prototype
// that are causing TypeErrors due to misdirected calls to `this.api.getWorldList` etc.
// This runs AFTER game.min.js has likely defined `window.NetworkManager` and its prototype.
(function() {
    // Ensure NetworkManager is accessible and has a prototype
    if (typeof window.NetworkManager !== 'undefined' && typeof window.NetworkManager.prototype !== 'undefined') {

        // Override the getWorldList method on NetworkManager's prototype
        // This ensures that when game.min.js calls NetworkManager.prototype.getWorldList,
        // it uses our corrected logic.
        window.NetworkManager.prototype.getWorldList = function (successCb, errorCb) {
            Util.log("⭐ Patch 6: Overriding NetworkManager.prototype.getWorldList. Calling this.api.get.");
            // `this.api` here refers to the ApiClient instance within the NetworkManager.
            // Our PatchedApiClient (from Patch 3) already has a generic `get` method.
            this.api.get("v1/world-list", successCb, errorCb);
        };
        Util.log("⭐ Patch 6: NetworkManager.prototype.getWorldList overridden.");


        // Override the emitMessage method on NetworkManager's prototype
        // This ensures that when game.min.js calls NetworkManager.prototype.emitMessage,
        // it uses our corrected logic, routing through the global socket.
        window.NetworkManager.prototype.emitMessage = function (eventName, data, callback) {
            Util.log(`⭐ Patch 6: Overriding NetworkManager.prototype.emitMessage. Emitting '${eventName}' via socket.`);
            // Use the globally stored Socket.IO client instance, which is managed by Prodigy.Menu.Server
            if (window.Prodigy && window.Prodigy.game && window.Prodigy.game.prodigy && window.Prodigy.game.prodigy.socket && typeof window.Prodigy.game.prodigy.socket.emit === 'function') {
                window.Prodigy.game.prodigy.socket.emit(eventName, data, callback);
            } else {
                Util.warn(`Patch 6: Cannot emit '${eventName}'. Socket.IO client not ready or not available at window.Prodigy.game.prodigy.socket.`);
                if (typeof callback === 'function') {
                    callback({ success: false, message: "Socket.IO not connected." });
                }
            }
        };
        Util.log("⭐ Patch 6: NetworkManager.prototype.emitMessage overridden.");

    } else {
        Util.error("⭐ Patch 6: window.NetworkManager or its prototype not found. Cannot apply direct method overrides.");
    }
})();
