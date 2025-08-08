/**
 * public/multiplayer.js
 *
 * This script handles the client-side logic for a multiplayer game.
 * It connects to a central world list WebSocket, allows users to join
 * specific game worlds, and manages basic player interactions within a world.
 *
 * It also manages the visibility of its own UI versus the original game content.
 */

// --- Configuration ---
// ⭐ UPDATED: Use the secure WebSocket URL for your Render backend ⭐
const SERVER_BASE_URL = "wss://prodidows-backend.onrender.com";
const WORLD_LIST_PATH = "/game-api/v2/worlds"; // Path for the central world list WebSocket

// --- Global Variables ---
let userId = null; // Unique ID for the current player
let worldListWs = null; // WebSocket for the world list
let gameWorldWs = null; // WebSocket for the currently joined game world
let currentWorldPath = null; // Path of the currently joined world
let playersInWorld = {}; // Stores player positions/data in the current world { userId: { x, y } }
const GAME_AREA_WIDTH = 800; // Logical width of the game area for player positions
const GAME_AREA_HEIGHT = 400; // Logical height of the game area for player positions

// --- DOM Elements ---
const multiplayerClientUI = document.getElementById("multiplayer-client-ui");
const originalGameContent = document.getElementById("original-game-content");
const userIdDisplay = document.getElementById("userIdDisplay");
const worldListSection = document.getElementById("worldListSection");
const worldListDiv = document.getElementById("worldList");
const loadingWorldsText = document.getElementById("loadingWorlds");
const gameSection = document.getElementById("gameSection");
const currentWorldNameSpan = document.getElementById("currentWorldName");
const gameAreaDiv = document.getElementById("gameArea");
const leaveWorldBtn = document.getElementById("leaveWorldBtn");
const gameLogDiv = document.getElementById("gameLog");

// --- Utility Functions ---

/**
 * Generates a unique user ID or retrieves it from local storage.
 * @returns {string} The unique user ID.
 */
function getOrCreateUserId() {
    let id = localStorage.getItem("multiplayer_userId");
    if (!id) {
        id = "player_" + Math.random().toString(36).substr(2, 9);
        localStorage.setItem("multiplayer_userId", id);
    }
    return id;
}

/**
 * Logs a message to the game log UI.
 * @param {string} message The message to log.
 * @param {string} type The type of message (e.g., 'info', 'error', 'system').
 */
function logMessage(message, type = "info") {
    const p = document.createElement("p");
    p.classList.add("mb-1");
    switch (type) {
        case "system":
            p.classList.add("text-blue-400");
            break;
        case "error":
            p.classList.add("text-red-400");
            break;
        case "player":
            p.classList.add("text-yellow-300");
            break;
        case "success":
            p.classList.add("text-green-400");
            break;
        default:
            p.classList.add("text-gray-300");
            break;
    }
    p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    gameLogDiv.appendChild(p);
    gameLogDiv.scrollTop = gameLogDiv.scrollHeight; // Auto-scroll to bottom
}

/**
 * Displays an error message in a custom modal-like fashion.
 * @param {string} title The title of the error.
 * @param {string} message The error message.
 */
function showCustomError(title, message) {
    const errorModal = document.createElement('div');
    errorModal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
    errorModal.innerHTML = `
        <div class="bg-gray-800 p-8 rounded-lg shadow-xl text-center max-w-sm mx-auto border border-red-500">
            <h3 class="text-2xl font-bold text-red-400 mb-4">${title}</h3>
            <p class="text-gray-200 mb-6">${message}</p>
            <button id="errorModalCloseBtn" class="mp-btn-primary">OK</button>
        </div>
    `;
    document.body.appendChild(errorModal);

    document.getElementById('errorModalCloseBtn').addEventListener('click', () => {
        document.body.removeChild(errorModal);
    });
}

/**
 * Toggles the visibility between the multiplayer UI and the original game content.
 * @param {boolean} showMultiplayer True to show multiplayer UI, false to show original game.
 */
function toggleUIMode(showMultiplayer) {
    if (showMultiplayer) {
        multiplayerClientUI.classList.remove("hidden");
        originalGameContent.classList.add("hidden");
    } else {
        multiplayerClientUI.classList.add("hidden");
        originalGameContent.classList.remove("hidden");
        // If the original game has a Boot.init() or similar, call it here
        if (typeof Boot !== 'undefined' && typeof Boot.init === 'function') {
            Boot.init();
        } else {
            logMessage("Warning: Boot.init() not found. Original game might not start.", "error");
        }
    }
}

// --- World List Management ---

/**
 * Connects to the central world list WebSocket and handles incoming messages.
 */
function connectToWorldList() {
    logMessage("Connecting to world list...", "system");
    // Ensure the WebSocket URL uses wss:// for secure connections
    worldListWs = new WebSocket(`${SERVER_BASE_URL}${WORLD_LIST_PATH}`);

    worldListWs.onopen = () => {
        logMessage("Connected to world list WebSocket.", "success");
        loadingWorldsText.textContent = "Fetching available worlds...";
    };

    worldListWs.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "worlds") {
            logMessage(`Received ${message.servers.length} available worlds.`, "system");
            setupWorldListUI(message.servers);
        }
    };

    worldListWs.onclose = (event) => {
        logMessage(`Disconnected from world list WebSocket. Code: ${event.code}, Reason: ${event.reason || 'N/A'}`, "system");
        worldListDiv.innerHTML = `<p class="text-center text-red-400">Could not connect to world list. Server might be down or connection was closed.</p>`;
    };

    worldListWs.onerror = (error) => {
        logMessage("World list WebSocket error: " + (error.message || JSON.stringify(error)), "error");
        showCustomError("Connection Error", "Failed to connect to the world list server. Please try again later.");
    };
}

/**
 * Renders the list of available worlds in the UI.
 * @param {Array<Object>} worlds An array of world objects { id, name, path }.
 */
function setupWorldListUI(worlds) {
    worldListDiv.innerHTML = ""; // Clear loading message
    if (worlds.length === 0) {
        worldListDiv.innerHTML = `<p class="text-center text-gray-400">No worlds available. Check server logs.</p>`;
        return;
    }

    worlds.forEach(world => {
        const worldCard = document.createElement("div");
        worldCard.className = "mp-card flex flex-col items-center p-4 bg-gray-700 hover:bg-gray-600 cursor-pointer transition duration-200 ease-in-out transform hover:scale-105 rounded-xl";
        worldCard.innerHTML = `
            <h3 class="text-xl font-semibold text-indigo-300">${world.name}</h3>
            <p class="text-gray-400 text-sm mb-3">${world.path}</p>
            <button class="mp-btn-primary mt-auto join-world-btn" data-world-path="${world.path}" data-world-name="${world.name}">
                Join World
            </button>
        `;
        worldListDiv.appendChild(worldCard);
    });

    // Add event listeners to join buttons
    document.querySelectorAll(".join-world-btn").forEach(button => {
        button.addEventListener("click", (event) => {
            const worldPath = event.target.dataset.worldPath;
            const worldName = event.target.dataset.worldName;
            joinWorld(worldPath, worldName);
        });
    });
}

// --- Game World Management ---

/**
 * Connects to a specific game world WebSocket.
 * @param {string} path The WebSocket path for the world.
 * @param {string} name The name of the world.
 */
function joinWorld(path, name) {
    if (gameWorldWs && gameWorldWs.readyState === WebSocket.OPEN) {
        logMessage("Already in a world. Leaving current world first.", "system");
        leaveWorld();
    }

    logMessage(`Attempting to join world: ${name} (${path})...`, "system");
    currentWorldPath = path;
    currentWorldNameSpan.textContent = name;

    // Close world list WS if open, as we no longer need it.
    if (worldListWs && worldListWs.readyState === WebSocket.OPEN) {
        worldListWs.close();
    }

    // Initialize player position for this client (e.g., random starting point)
    playersInWorld[userId] = {
        x: Math.floor(Math.random() * (GAME_AREA_WIDTH - 20)), // -20 for player dot size
        y: Math.floor(Math.random() * (GAME_AREA_HEIGHT - 20))
    };

    // Ensure this WebSocket connection also uses wss://
    gameWorldWs = new WebSocket(`${SERVER_BASE_URL}${path}?userId=${userId}&zone=main`);

    gameWorldWs.onopen = () => {
        logMessage(`Successfully joined world: ${name}!`, "success");
        worldListSection.classList.add("hidden");
        gameSection.classList.remove("hidden");
        toggleUIMode(false); // Hide multiplayer UI, show original game content
        renderPlayers(); // Initial render of players
        // Focus on body to capture key events
        document.body.focus();
    };

    gameWorldWs.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleGameWorldMessage(message);
    };

    gameWorldWs.onclose = (event) => {
        logMessage(`Disconnected from world: ${name}. Code: ${event.code}, Reason: ${event.reason || 'N/A'}`, "system");
        gameSection.classList.add("hidden");
        worldListSection.classList.remove("hidden");
        playersInWorld = {}; // Clear players
        gameAreaDiv.innerHTML = ""; // Clear player dots
        toggleUIMode(true); // Show multiplayer UI again
        connectToWorldList(); // Reconnect to world list
    };

    gameWorldWs.onerror = (error) => {
        logMessage(`Game world WebSocket error for ${name}: ${error.message || JSON.stringify(error)}`, "error");
        showCustomError("World Connection Error", `Failed to connect to world "${name}". It might be full or offline.`);
        leaveWorld(); // Attempt to clean up
    };
}

/**
 * Handles incoming messages from the game world WebSocket.
 * @param {Object} message The parsed JSON message from the server.
 */
function handleGameWorldMessage(message) {
    switch (message.type) {
        case "playerList":
            // Initial list of players when joining
            logMessage(`Players in this world: ${message.payload.join(", ")}`, "system");
            // For simplicity, we're not updating positions from playerList,
            // assuming 'playerMoved' will send initial positions or we start at random.
            // If the server sends initial positions with playerList, update playersInWorld here.
            break;
        case "playerJoined":
            logMessage(`Player ${message.payload} joined the world.`, "player");
            // Add new player with a default/random position if not already tracked
            if (!playersInWorld[message.payload]) {
                playersInWorld[message.payload] = {
                    x: Math.floor(Math.random() * (GAME_AREA_WIDTH - 20)),
                    y: Math.floor(Math.random() * (GAME_AREA_HEIGHT - 20))
                };
            }
            renderPlayers();
            break;
        case "playerLeft":
            logMessage(`Player ${message.payload} left the world.`, "player");
            delete playersInWorld[message.payload];
            renderPlayers();
            break;
        case "playerMoved":
            // Update position of a specific player
            const { userId: movedUserId, x, y } = message.payload;
            if (playersInWorld[movedUserId]) {
                playersInWorld[movedUserId].x = x;
                playersInWorld[movedUserId].y = y;
                renderPlayers(); // Re-render all players
            }
            break;
        case "error":
            logMessage(`Server Error: ${message.payload}`, "error");
            showCustomError("Server Error", message.payload);
            break;
        case "message": // Generic message from server
            logMessage(`[Server] ${message.payload}`, "system");
            break;
        // ⭐ NEW: Handle wizard-update and zone-update from server (as per World.js changes) ⭐
        case "wizard-update": // Note: your server sends this as 'event: "wizard-update"'
            const { wizard, userID } = message;
            if (userID && wizard) {
                if (!playersInWorld[userID]) {
                    playersInWorld[userID] = { x: 0, y: 0 }; // Initialize if not present
                }
                playersInWorld[userID].wizardData = wizard; // Store wizard data
                logMessage(`Wizard data received for ${userID}`, "info");
            }
            break;
        case "zone-update": // Note: your server sends this as 'event: "zone-update"'
            const { position, userID: zoneUserID } = message;
            if (zoneUserID && position) {
                if (!playersInWorld[zoneUserID]) {
                    playersInWorld[zoneUserID] = { x: 0, y: 0 }; // Initialize if not present
                }
                playersInWorld[zoneUserID].x = position.x;
                playersInWorld[zoneUserID].y = position.y;
                renderPlayers();
                logMessage(`Position update for ${zoneUserID}: (${position.x}, ${position.y})`, "info");
            }
            break;
        default:
            logMessage(`Unknown message type: ${message.type}`, "info");
            break;
    }
}

/**
 * Renders or updates player dots in the game area.
 */
function renderPlayers() {
    // Only render players if the game section is visible (i.e., we are in a world)
    if (gameSection.classList.contains("hidden")) {
        return;
    }
    gameAreaDiv.innerHTML = ""; // Clear existing player dots
    for (const id in playersInWorld) {
        const player = playersInWorld[id];
        const playerDot = document.createElement("div");
        playerDot.className = `mp-player-dot ${id === userId ? 'mp-local-player' : ''}`;
        playerDot.style.left = `${player.x}px`;
        playerDot.style.top = `${player.y}px`;
        // Use wizard data name if available, otherwise fallback to user ID snippet
        const displayName = player.wizardData && player.wizardData.appearance && player.wizardData.appearance.name
                            ? player.wizardData.appearance.name.split(' ')[0] // Just first name
                            : (id === userId ? "You" : id.substring(0, 3));
        playerDot.textContent = displayName;
        gameAreaDiv.appendChild(playerDot);
    }
}

/**
 * Sends player movement data to the server.
 * @param {string} direction The direction of movement ('up', 'down', 'left', 'right').
 */
function sendMovement(direction) {
    if (gameWorldWs && gameWorldWs.readyState === WebSocket.OPEN) {
        const player = playersInWorld[userId];
        if (!player) return; // Should not happen if in a world

        let newX = player.x;
        let newY = player.y;
        const speed = 10; // Pixels per move

        switch (direction) {
            case "up":
                newY = Math.max(0, player.y - speed);
                break;
            case "down":
                newY = Math.min(GAME_AREA_HEIGHT - 20, player.y + speed); // -20 for player dot size
                break;
            case "left":
                newX = Math.max(0, player.x - speed);
                break;
            case "right":
                newX = Math.min(GAME_AREA_WIDTH - 20, player.x + speed); // -20 for player dot size
                break;
        }

        // Only send if position actually changed
        if (newX !== player.x || newY !== player.y) {
            playersInWorld[userId].x = newX;
            playersInWorld[userId].y = newY; // Update local position immediately for responsiveness
            renderPlayers(); // Re-render local player quickly

            // Send 'move' message to the server
            gameWorldWs.send(JSON.stringify({
                type: "move",
                payload: { x: newX, y: newY }
            }));
        }
    }
}

/**
 * Leaves the current game world.
 */
function leaveWorld() {
    if (gameWorldWs) {
        gameWorldWs.close(); // This will trigger the onclose handler
        gameWorldWs = null;
        currentWorldPath = null;
        logMessage("Left the current world.", "system");
    }
}

// --- Event Listeners ---

// Initialize when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    userId = getOrCreateUserId();
    userIdDisplay.textContent = userId;
    logMessage(`Your User ID is: ${userId}`, "system");

    // Initially show the multiplayer UI
    toggleUIMode(true);

    connectToWorldList();

    // Leave world button listener
    leaveWorldBtn.addEventListener("click", leaveWorld);

    // Keyboard controls for movement (only when in a game world)
    document.addEventListener("keydown", (event) => {
        // Only allow movement if the game section of the multiplayer UI is visible
        if (!gameSection.classList.contains("hidden") && gameWorldWs && gameWorldWs.readyState === WebSocket.OPEN) {
            switch (event.key) {
                case "ArrowUp":
                case "w":
                    sendMovement("up");
                    break;
                case "ArrowDown":
                case "s":
                    sendMovement("down");
                    break;
                case "ArrowLeft":
                case "a":
                    sendMovement("left");
                    break;
                case "ArrowRight":
                case "d":
                    sendMovement("right");
                    break;
            }
        }
    });
});
