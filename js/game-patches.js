/**
 * game-patches.js
 * GamePatches Class for Prodigy Matchmaking & Bot Fallback
 * 
 * Monitors PVP matchmaking and automatically spawns a bot wizard 
 * if no human opponent is found within 7 seconds.
 */

class GamePatches {
    /**
     * @param {Object} options Configuration options
     * @param {number} options.timeoutMs Matchmaking timeout in milliseconds (default: 7000ms)
     */
    constructor(options = {}) {
        this.timeoutMs = options.timeoutMs || 7000;
        this.botMatchTimer = null;
        this.isApplied = false;

        console.log(`[GamePatches] Initialized GamePatches class (Timeout: ${this.timeoutMs}ms)`);
    }

    /**
     * Helper to safely resolve the core prodigy game/main instance context
     */
    static getProdigyContext(ctx) {
        if (!ctx) return null;
        if (ctx.main && ctx.main.prodigy) return ctx.main.prodigy;
        if (ctx.game && ctx.game.prodigy) return ctx.game.prodigy;
        if (ctx.prodigy) return ctx.prodigy;
        if (window.Prodigy && window.Prodigy.game && window.Prodigy.game.prodigy) return window.Prodigy.game.prodigy;
        if (window.game && window.game.prodigy) return window.game.prodigy;
        return null;
    }

    /**
     * Helper to safely resolve the Phaser game state instance context.
     */
    static getGameContext(ctx) {
        if (!ctx) return null;
        if (ctx.game) return ctx.game;
        if (ctx.main && ctx.main.game) return ctx.main.game;
        if (window.game) return window.game;
        return null;
    }

    /**
     * Safe helper check replacing global `Util.isDefined`
     */
    static isDefined(val) {
        if (typeof Util !== "undefined" && typeof Util.isDefined === "function") {
            return Util.isDefined(val);
        }
        return val !== undefined && val !== null;
    }

    /**
     * Initializes and applies the PvP patches to Prodigy menu prototypes
     */
    apply() {
        if (this.isApplied) {
            console.warn("[GamePatches] Patch has already been applied.");
            return;
        }

        if (typeof window.Prodigy === "undefined" || !window.Prodigy.Menu || !window.Prodigy.Menu.PvP) {
            setTimeout(() => this.apply(), 500);
            return;
        }

        const self = this;
        const pvpProto = window.Prodigy.Menu.PvP.prototype;

        const originalOpenMessage = pvpProto.openMessage;
        const originalMessageRecieved = pvpProto.messageRecieved;

        // Patch openMessage to start 7s bot countdown
        pvpProto.openMessage = function () {
            self.clearTimer();

            if (typeof originalOpenMessage === "function") {
                originalOpenMessage.apply(this, arguments);
            }

            console.log(`[GamePatches] Matchmaking search started. ${self.timeoutMs / 1000}s bot timer armed...`);
            self.botMatchTimer = setTimeout(() => {
                console.log("[GamePatches] Matchmaking timed out. Triggering bot battle...");
                self.tryBotMatch.call(this);
            }, self.timeoutMs);
        };

        // Patch messageRecieved to cancel bot timer when real opponent matches
        pvpProto.messageRecieved = function (data) {
            console.log("[GamePatches] Opponent found! Clearing bot match timer.");
            self.clearTimer();

            if (typeof originalMessageRecieved === "function") {
                originalMessageRecieved.apply(this, arguments);
            }
        };

        this.isApplied = true;
        console.log("[GamePatches] Successfully applied GamePatches to Prodigy.Menu.PvP!");
    }

    /**
     * Deobfuscated openMessage method with fallback HTTP fetch for matchmaking-api/begin.
     */
    openMessage() {
        const prodigy = GamePatches.getProdigyContext(this);
        const game = GamePatches.getGameContext(this);

        const isConnected = (prodigy && prodigy.network) || (game && game.prodigy && game.prodigy.network);

        if (isConnected) {
            const network = (prodigy && prodigy.network) ? prodigy.network : game.prodigy.network;
            const player = (prodigy && prodigy.player) ? prodigy.player : game.prodigy.player;

            if (network && typeof network.logEvent === "function") {
                network.logEvent("PVP", "try-match", "found");
            }
            if (network && typeof network.track === "function") {
                network.track("matchmaking", {
                    type: "search",
                    classID: player && typeof player.getClassID === "function" ? player.getClassID() : 1,
                    grade: player && player.data ? player.data.grade : 1
                }, true);
            }

            // Attempt native methods or dispatch direct HTTP call to /matchmaking-api/begin
            if (typeof this.sendMatchmakingRequest === "function") {
                this.sendMatchmakingRequest();
            } else if (network && typeof network.sendMatchmakingRequest === "function") {
                network.sendMatchmakingRequest();
            } else {
                // Fallback: Dispatch HTTP request directly to /matchmaking-api/begin
                const payload = {
                    userID: player && player.data ? (player.data.userID || player.data.id) : (network.userID || "anon_player"),
                    level: player && player.data ? player.data.level : 1,
                    score: player && player.data ? player.data.arenaScore : 0,
                    playerData: player && player.data ? player.data : {}
                };

                console.log("[GamePatches] Sending direct POST request to /matchmaking-api/begin:", payload);

                if (network && network.http && typeof network.http.post === "function") {
                    network.http.post("/matchmaking-api/begin", payload, (err, res) => {
                        if (err) console.warn("[GamePatches] Matchmaking begin HTTP call failed:", err);
                        else console.log("[GamePatches] Matchmaking begin queued successfully:", res);
                    });
                } else if (typeof fetch === "function") {
                    fetch("/matchmaking-api/begin", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    }).catch(err => console.warn("[GamePatches] Matchmaking fetch failed:", err));
                }
            }

            const botMatchCallback = (typeof this.tryBotMatch === "function") 
                ? this.tryBotMatch.bind(this) 
                : () => {
                    if (typeof GamePatches.prototype.tryBotMatch === "function") {
                        GamePatches.prototype.tryBotMatch.call(this);
                    }
                };

            this.searchTimer = setTimeout(botMatchCallback, 30000 + Math.floor(60000 * Math.random()));

            if (prodigy && prodigy.user && typeof prodigy.user.isGuest === "function" && network.userID) {
                if (prodigy.user.isGuest(network.userID)) {
                    globalThis.tryBotMatch = () => {
                        delete globalThis.tryBotMatch;
                        if (typeof this.tryBotMatch === "function") {
                            this.tryBotMatch();
                        } else if (typeof GamePatches.prototype.tryBotMatch === "function") {
                            GamePatches.prototype.tryBotMatch.call(this);
                        }
                    };
                }
            }

            let secondsWaiting = 0;
            const getBaseText = (sec) => 
                `Searching for a good match based on your current arena ranking... please wait. \n\n(If 7 seconds passed without human player, bot will be assigned as opponent.) \n\nTime waiting: ${sec}s`;

            const closeCallback = (typeof this.closeMessage === "function")
                ? this.closeMessage.bind(this, true) 
                : () => {
                    if (typeof this.clearTimer === "function") this.clearTimer();
                    if (this.searchTimer) clearTimeout(this.searchTimer);
                };

            const openService = (prodigy && prodigy.open) ? prodigy.open : (game && game.prodigy && game.prodigy.open ? game.prodigy.open : null);

            if (openService && typeof openService.message === "function") {
                this.message = openService.message(
                    getBaseText(secondsWaiting),
                    closeCallback,
                    null,
                    "Finding Challenger"
                );
            }

            if (this.waitingTimerInterval) {
                clearInterval(this.waitingTimerInterval);
            }
            this.waitingTimerInterval = setInterval(() => {
                secondsWaiting++;
                if (this.message && typeof this.message.setText === "function") {
                    this.message.setText(getBaseText(secondsWaiting));
                } else if (!this.botMatchTimer) {
                    clearInterval(this.waitingTimerInterval);
                }
            }, 1000);

        } else if ((prodigy && prodigy.open) || (game && game.prodigy && game.prodigy.open)) {
            const targetOpen = (prodigy && prodigy.open) ? prodigy.open : game.prodigy.open;
            this.message = targetOpen.message("Cannot take part in the arena in Offline Mode.");
        } else {
            console.error("[GamePatches] Unable to locate Prodigy engine instance context during openMessage.");
        }
    }

    /**
     * Deobfuscated messageRecieved method.
     */
    messageRecieved(data) {
        console.log("Matchmaking match response received:", data);
        const prodigy = GamePatches.getProdigyContext(this);
        const game = GamePatches.getGameContext(this);

        if (!prodigy) {
            console.error("[GamePatches] Unable to locate Prodigy instance context in messageRecieved.");
            return;
        }

        if (GamePatches.isDefined(this.searchTimer)) {
            globalThis.clearTimeout(this.searchTimer);
        }

        if (GamePatches.isDefined(globalThis.tryBotMatch)) {
            delete globalThis.tryBotMatch;
        }

        if (GamePatches.isDefined(this.searchingDialog) && typeof window.closeDialog === "function") {
            window.closeDialog(this.searchingDialog);
        }

        if (this.message && typeof this.message.setText === "function") {
            this.message.setText("Match found! Preparing battle...");
        }
        
        if (prodigy.services && prodigy.services.analytics) {
            prodigy.services.analytics.logEvent("matchmaking", "match", "found");
            prodigy.services.analytics.track("matchmaking", {
                type: "match",
                classID: prodigy.player.getClassID(),
                grade: prodigy.player.data.grade
            }, true);
        }

        const mainContext = this.main || game || { prodigy };
        var opponentPlayer = new Player(mainContext);
        var playerRole = "A";

        if (data.playerA.id !== prodigy.player.data.userID) {
            opponentPlayer.init(data.playerA.data);
            playerRole = "B";
        } else if (data.playerB.id !== prodigy.player.data.userID) {
            opponentPlayer.init(data.playerB.data);
        }

        var teleportCallback = null;
        if (game && "Tower" === game.state.current) {
            teleportCallback = prodigy.start.bind(prodigy, "Tower");
        } else if (game && game.broadcaster) {
            var playerLoc = game.broadcaster.broadcast(BroadcasterEvents.PlayerLoc.GET_TARGET, mainContext, [true]);
            teleportCallback = prodigy.world.teleport.bind(
                prodigy.world,
                prodigy.player.data.zone,
                playerLoc.x,
                playerLoc.y
            );
        }

        prodigy.player.data.deserter = true;
        if (game && game.prodigy && game.prodigy.api && typeof game.prodigy.api.cancelMatchmaking === "function") {
            game.prodigy.api.cancelMatchmaking(prodigy.network.userID);
        }
        prodigy.pvp.start(data.playerA.id, prodigy.player, opponentPlayer, teleportCallback, true);

        if (prodigy.network && typeof prodigy.network.syncPlayer === "function") {
            setTimeout(
                prodigy.network.syncPlayer.bind(
                    prodigy.network,
                    "A" === playerRole ? data.playerA.data : data.playerB.data,
                    "B" === playerRole ? data.playerA.data : data.playerB.data
                ),
                1000
            );
        }
    }

    /**
     * Clears any active bot timer
     */
    clearTimer() {
        if (this.botMatchTimer) {
            clearTimeout(this.botMatchTimer);
            this.botMatchTimer = null;
        }
    }

    /**
     * Deobfuscated tryBotMatch method with safe data fallbacks.
     */
    tryBotMatch() {
        const prodigy = GamePatches.getProdigyContext(this);
        const game = GamePatches.getGameContext(this);

        if (!prodigy) {
            console.error("[GamePatches] Unable to locate Prodigy instance context in tryBotMatch.");
            return;
        }

        if (GamePatches.isDefined(this.searchTimer)) {
            globalThis.clearTimeout(this.searchTimer);
        }

        if (GamePatches.isDefined(globalThis.searchTimeout)) {
            delete globalThis.searchTimeout;
        }

        if (GamePatches.isDefined(this.searchingDialog) && typeof window.closeDialog === "function") {
            window.closeDialog(this.searchingDialog);
        }

        const mainContext = this.main || game || { prodigy };
        let botPlayer = new Player(mainContext);

        // Safe checks for GameData data structures
        const getEquipmentMax = (type) => {
            if (typeof GameData !== "undefined" && GameData.data && GameData.data[type] && Array.isArray(GameData.data[type])) {
                return GameData.data[type].length;
            }
            return 10;
        };

        const playerLevel = (prodigy.player && prodigy.player.data && prodigy.player.data.level) ? prodigy.player.data.level : 10;
        const playerScore = (prodigy.player && prodigy.player.data && prodigy.player.data.arenaScore) ? prodigy.player.data.arenaScore : 1000;
        const playerRank = (prodigy.player && prodigy.player.data && prodigy.player.data.arenaRank) ? prodigy.player.data.arenaRank : 1;

        let botData = {
            id: 'BOT_ACCOUNT',
            equipment: {
                hat: Math.round(Math.random() * getEquipmentMax('hat')),
                outfit: Math.round(Math.random() * getEquipmentMax('outfit')),
                weapon: Math.round(Math.random() * getEquipmentMax('weapon')),
                boots: Math.round(Math.random() * getEquipmentMax('boots'))
            },
            data: {
                arenaScore: Math.max(0, Math.min(5000, playerScore + (Math.round(1850 * Math.random()) - 600))),
                arenaRank: playerRank,
                level: Math.max(1, Math.min(100, playerLevel + (Math.round(30 * Math.random()) - 15))),
                team: Math.random() > 0.5 ? 2 : 0
            },
            pets: Math.random() > 0.25 ? [{
                ID: 1 + Math.round(Math.random() * ((typeof PetData !== "undefined" && PetData.MAX_ID ? PetData.MAX_ID : 125) - 1)),
                level: 1,
                isPVPTeam: true,
                team: 1
            }] : []
        };

        if (botData.pets.length > 0) {
            botData.pets[0].level = Math.max(1, Math.min(100, botData.data.level + Math.round(40 * Math.random() - 20)));
        }

        botPlayer.init(botData);

        var teleportCallback = null;
        if (game && 'house' === game.state.current) {
            teleportCallback = prodigy.start.bind(prodigy, 'house');
        } else if (game && game.broadcaster) {
            var playerLoc = game.broadcaster.broadcast(BroadcasterEvents.PlayerLoc.GET_TARGET, mainContext, [true]);
            teleportCallback = prodigy.world.teleport.bind(
                prodigy.world,
                prodigy.player.data.zone,
                playerLoc.x,
                playerLoc.y
            );
        }

        if (prodigy.player && prodigy.player.data) {
            prodigy.player.data.isBotMatch = true;
        }

        if (prodigy.network && typeof prodigy.network.cancelMatchmaking === "function") {
            prodigy.network.cancelMatchmaking(prodigy.network.userID || (game && game.prodigy && game.prodigy.api && game.prodigy.api.userID));
        }

        if (prodigy.pvp && typeof prodigy.pvp.start === "function") {
            prodigy.pvp.start(
                prodigy.network ? prodigy.network.room : "bot_room",
                prodigy.player,
                botPlayer,
                teleportCallback,
                true,
                true
            );
        }

        if (prodigy.message && typeof prodigy.message.closeMessage === "function") {
            prodigy.message.closeMessage(
                this.parent ? this.parent.getDialog(!0) : null,
                this.parent ? this.parent.getDialog(!1) : null
            );
        }
    }
}

// Global instantiation & export
window.GamePatches = GamePatches;
window.gamePatches = new GamePatches({ timeoutMs: 7000 });

if (document.readyState === "complete" || document.readyState === "interactive") {
    window.gamePatches.apply();
} else {
    document.addEventListener("DOMContentLoaded", () => window.gamePatches.apply());
}