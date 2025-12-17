// --- REQUIRED SETUP ---
// 1. Install Node.js if you haven't already.
// 2. Open your terminal in the directory where this file is saved.
// 3. Initialize a Node.js project: `npm init -y`
// 4. Install dependencies: `npm install express socket.io firebase-admin` // <-- UPDATED
// 5. Run the server: `node server.js`
// 6. **CREATE A FOLDER NAMED 'public'** in the same directory as this file.
// 7. **Place your index.html and any other client files (like game.min.js) inside the 'public' folder.**
// ------------------------

const express = require('express');
const http = require('http');
const path = require('path'); // Import the path module to handle file paths correctly
const { Server } = require('socket.io');

// NEW: Firebase Admin SDK imports
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase, ref, get, set } = require('firebase-admin/database');

// Define the port the server will run on. Prodigy often uses port 8080.
const PORT = 8080;
const app = express();
const server = http.createServer(app);

// Middleware to parse JSON bodies for POST requests (needed for mock login)
app.use(express.json());

// --- FIREBASE CONFIGURATION (FOR RTDB CONNECTION) ---
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBWVP1pba2QK8YU59Ot6Jx7BWLI3FD3c4c",
    authDomain: "pde13532.firebaseapp.com",
    databaseURL: "https://pde13532-default-rtdb.firebaseio.com", 
    projectId: "pde13532",
    storageBucket: "pde13532.firebasestorage.app",
    messagingSenderId: "1091179956834",
    appId: "1:1091179956834:web:8e3289d3ca0a61fe829f3b",
    measurementId: "G-KBF4METH5J"
};

// Initialize Firebase Admin App and get RTDB reference
const firebaseAdminApp = initializeApp({
    // Use the databaseURL from the configuration for initialization
    databaseURL: FIREBASE_CONFIG.databaseURL 
});
const db = getDatabase(firebaseAdminApp);

// --- MOCK AUTH/TOKEN CONSTANTS ---
const MOCK_USER_ID = "MOCK_USER_ID_12345";
const MOCK_TOKEN = "MOCK_AUTH_TOKEN_ABCDEF";
// ---------------------------------

// ----------------------------------------------------
// NEW: MOCK AUTHENTICATION SYSTEM
// Simulates Firebase Admin SDK's token verification.
// ----------------------------------------------------
const MOCK_AUTH_SYSTEM = {
    verifyIdToken: async (token) => {
        if (token === MOCK_TOKEN) {
            // Return a mock decoded token object with the UID
            return { uid: MOCK_USER_ID };
        }
        // Throw an error if the token is invalid
        throw new Error("Invalid token provided.");
    }
};

// --- HELPER FUNCTION FOR AUTHENTICATION IN EXPRESS ENDPOINTS ---
/**
 * Extracts the user token from the Authorization header and verifies it (using the mock system).
 * @param {object} req - Express request object
 * @returns {Promise<string|null>} The authenticated UID or null.
 */
async function authenticateRequest(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const userToken = authHeader.split(' ')[1];

    if (userToken) {
        try {
            const decodedToken = await MOCK_AUTH_SYSTEM.verifyIdToken(userToken);
            return decodedToken.uid;
        } catch (error) {
            return null;
        }
    }
    return null;
}
// ----------------------------------------------------

// ----------------------------------------------------
// Configure Express to serve static files from the 'public' directory.
// ----------------------------------------------------
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Socket.IO server with CORS enabled for development,
// allowing any client (like your modified game.min.js running locally) to connect.
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for testing
        methods: ["GET", "POST"]
    }
});

// --- GLOBAL GAME STATE ---
const players = {};
let nextPlayerId = 1;

// Mock storage for connected users/worlds (in-memory).
const worldUsers = new Map(); 
const MAX_POPULATION = 1000; 

console.log("Starting Mock Prodigy Multiplayer Server...");

// ----------------------------------------------------
// 1. ROOT ROUTE
// ----------------------------------------------------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ----------------------------------------------------
// 2. MOCK AUTH ENDPOINT: /game-api/v1/auth/login
// The client hits this first to get a token and user ID.
// ----------------------------------------------------
app.post('/game-api/v1/auth/login', (req, res) => {
    console.log('[API CALL] Received POST /game-api/v1/auth/login');
    
    // Respond with a mock success payload containing the necessary auth token and user ID
    res.json({
        success: true,
        data: {
            auth: MOCK_TOKEN,
            userId: MOCK_USER_ID
        }
    });
});


// ----------------------------------------------------
// 3. MOCK WORLD LIST ENDPOINT: /game-api/v1/worlds
// ----------------------------------------------------
app.get('/game-api/v1/worlds', (req, res) => {
    console.log('[API CALL] Received GET /game-api/v1/worlds');
    
    const createWorld = (id, name, fullAmount) => ({
        id: id,
        name: name,
        icon: "fire",
        path: "/worlds/fireplane", 
        full: fullAmount,           
        players: fullAmount, 
        maxPlayers: 100,
        "0": 0 
    });

    const worldList = [
        createWorld(1, "Fireplane 1", 10),
        createWorld(2, "Fireplane 2", 20),
        createWorld(3, "Tundra 3", 30),
        createWorld(4, "Volcano 4", 40),
        createWorld(5, "Crystal 5", 50),
        createWorld(6, "Ocean 6", 60)
    ];
    
    return res.status(200).send(worldList); 
});
// ----------------------------------------------------

// ----------------------------------------------------
// 4. FIREBASE RTDB ENDPOINT: /game-api/v1/cloud/save
// This endpoint simulates both data loading and saving using Firebase RTDB.
// Data is stored at /users/<userID>/save
// ----------------------------------------------------
app.post('/game-api/v1/cloud/save', async (req, res) => {
    // Authenticate the user token sent in the Authorization: Bearer header
    const userID = await authenticateRequest(req); 

    if (!userID) {
        console.error('[RTDB] Save/Load failed: Missing or invalid authentication token.');
        return res.status(401).send({ 
            success: false, 
            message: "Unauthorized: Missing or invalid authentication token."
        });
    }

    const savePath = 'users/' + userID + '/save';
    const characterData = req.body;

    if (Object.keys(characterData).length > 0) {
        // --- SAVE OPERATION ---
        try {
            // Use RTDB set to write the data to the user's path
            await set(ref(db, savePath), characterData);
            console.log(`[RTDB SUCCESS] Data saved for user ${userID} at path: ${savePath}`);
            return res.status(200).send({
                success: true,
                message: "Data saved successfully.",
                data: characterData // Return the saved data back
            });
        } catch (error) {
            console.error(`[RTDB ERROR] Database save failed for user ${userID}:`, error);
            return res.status(500).send({
                success: false,
                message: "Internal server error during database save.",
                error: error.message
            });
        }
    } else {
        // --- LOAD OPERATION (If body is empty, assume load request) ---
        try {
            // Use RTDB get to retrieve the data
            const snapshot = await get(ref(db, savePath));
            
            if (snapshot.exists()) {
                const loadedData = snapshot.val();
                console.log(`[RTDB SUCCESS] Data loaded for user ${userID}.`);
                return res.status(200).send({
                    success: true,
                    message: "Data loaded successfully.",
                    data: loadedData
                });
            } else {
                console.log(`[RTDB NOTICE] No existing data for user ${userID}.`);
                // Return a basic template if no data exists
                return res.status(200).send({
                    success: true,
                    message: "No existing data found, returning default structure.",
                    data: { name: "New Wizard", gold: 0, level: 1 } 
                });
            }
        } catch (error) {
             console.error(`[RTDB ERROR] Database load failed for user ${userID}:`, error);
            return res.status(500).send({
                success: false,
                message: "Internal server error during database load.",
                error: error.message
            });
        }
    }
});
// ----------------------------------------------------


// --- SOCKET.IO CONNECTION HANDLER ---
// This is the fundamental entry point for ALL Socket.IO connections.
io.on('connection', async (socket) => {
    let { worldId, userToken, zone } = socket.handshake.query;

    console.log(`\n[SOCKET.IO] New connection attempt:`);
    console.log(`[SOCKET.IO DEBUG] Query: worldId=${worldId}, token present=${!!userToken}, zone=${zone}`);
    
    let authenticatedUID = null;
    if (userToken) {
        try {
            // Step 1: Verify the token using the MOCKED auth system
            const decodedToken = await MOCK_AUTH_SYSTEM.verifyIdToken(userToken);
            authenticatedUID = decodedToken.uid;
            console.log(`[SOCKET.IO AUTH SUCCESS] Token verified. UID: ${authenticatedUID}`);
        } catch (error) {
            console.error("[SOCKET.IO ERROR] Token verification failed:", error.message);
        }
    }
    
    // Step 2: Check for valid credentials (Must have a verified UID and a worldId)
    if (!authenticatedUID || !worldId) { 
        console.error("[SOCKET.IO ERROR] Connection rejected: Missing required worldId or failed token verification (No authenticated UID).");
        
        // Use emit('error') before disconnecting to give the client a defined reason.
        socket.emit('error', { code: '401', message: 'Authentication required for multiplayer connection.' });
        
        // Ensure disconnection and stop processing this connection.
        return socket.disconnect(true);
    }

    // --- Connection Successful ---
    const playerId = socket.id;
    const userId = authenticatedUID;
    const currentWorldId = worldId; 

    // 1. Initialize Player State (Critical for other handlers)
    if (!players[playerId]) {
        players[playerId] = {
            id: playerId,
            userId: userId, 
            x: 500, // Starting coordinates for the mock player list
            y: 500, // Starting coordinates for the mock player list
            hp: 100,
            world: currentWorldId, // Set the world in the global player object
            name: `Wizard_${nextPlayerId++}`
        };
        // 2. Update World Users Map
        if (!worldUsers.has(currentWorldId)) {
            worldUsers.set(currentWorldId, new Set());
        }
        worldUsers.get(currentWorldId).add(playerId);

        console.log(`[PLAYER INIT] Initialized Player ${players[playerId].name} (UID: ${authenticatedUID}) for socket ID: ${playerId}`);
    }

    // 3. Join Room (using the worldId directly as the room name)
    socket.join(currentWorldId);

    console.log(`[SOCKET.IO SUCCESS] User ${userId} successfully joined room: ${currentWorldId}`); 

    // 4. Send Initial State (playerList)
    const mockPlayerList = [
        { id: 'mock-1', name: 'Bob', position: [100, 100] },
        { id: playerId, name: players[playerId].name, position: [players[playerId].x, players[playerId].y] } 
    ];
    socket.emit('playerList', mockPlayerList); // Client receives its own starting position
    
    // 5. Broadcast the new player joining to others in the room
    socket.to(currentWorldId).emit('playerJoined', playerId); 

    // --- Setup Event Handlers ---
    
    // 2. Player Movement Update
    socket.on('player:move', (data) => {
        if (players[playerId] && players[playerId].world) {
            players[playerId].x = data.x;
            players[playerId].y = data.y;
            
            // Broadcast the move only to other players in the same world
            socket.to(players[playerId].world).emit('player:moved', {
                id: playerId,
                x: data.x,
                y: data.y
            });
        }
    });

    // 3. Message Handling (Simplified based on user input)
    socket.on('message', (data) => {
        if (players[playerId] && players[playerId].world) {
            console.log(`[MESSAGE] Player ${players[playerId].name} sent message: ${data}`);
            socket.to(currentWorldId).emit('message', data); 
        }
    });

    // 4. Player Battle Action
    socket.on('battle:action', (data) => {
        if (players[playerId] && players[playerId].world) {
            console.log(`[BATTLE] Player ${players[playerId].name} used spell: ${data.spell}`);
            
            // In a real server, this would calculate damage and update the battle state.
            io.to(players[playerId].world).emit('battle:update', {
                casterId: playerId,
                spell: data.spell,
                targetId: data.targetId,
                damage: Math.floor(Math.random() * 20) + 10 // Mock damage
            });
        }
    });
    
    // 5. Player Disconnect (Simplified based on user input)
    socket.on('disconnect', () => {
        const playerName = players[playerId]?.name || 'Unknown';
        const playerWorld = players[playerId]?.world;
        
        console.log(`[SOCKET.IO] User ${userId} (${playerName}) disconnected.`);

        // Update World Users Map
        if (playerWorld && worldUsers.has(playerWorld)) {
            worldUsers.get(playerWorld).delete(playerId);
        }
        
        delete players[playerId];
        
        // Notify all other players in that world
        if (playerWorld) {
            socket.to(currentWorldId).emit('playerLeft', userId); 
        }
    });
});

// Start the server listening
server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
