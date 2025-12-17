const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io'); 
const path = require('path');
// Import Admin App functions - we will use a mix of real RTDB and mocked Auth
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getDatabase, ref, get, set } = require('firebase-admin/database'); 
const cors = require('cors');

// --- 1. MANDATORY GLOBAL CONFIGURATION ---

// In a real application, these must be securely loaded from environment variables.
const FIREBASE_CONFIG = {
    // UPDATED FIREBASE CONFIGURATION
    apiKey: "AIzaSyBWVP1pba2QK8YU59Ot6Jx7BWLI3FD3c4c",
    authDomain: "pde13532.firebaseapp.com",
    databaseURL: "https://pde13532-default-rtdb.firebaseio.com", 
    projectId: "pde13532",
    storageBucket: "pde13532.firebasestorage.app",
    messagingSenderId: "1091179956834",
    appId: "1:1091179956834:web:8e3289d3ca0a61fe829f3b",
    measurementId: "G-KBF4METH5J"
};

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app); 

// Configure Socket.IO
// Allow all origins for compatibility in development/Render environment
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Prodigy uses 'worldId' in its client-side URL parameters.
const WORLD_ID_QUERY_PARAM = 'worldId'; 
const ROOMS = {}; // Simple object to hold connected users by worldID

// Initialize Firebase Admin
initializeApp({
    credential: applicationDefault(),
    databaseURL: FIREBASE_CONFIG.databaseURL
});
const dbAdmin = getDatabase();

// --- 2. AUTHENTICATION MOCK (Simplified for Demo) ---

// Mock function to simulate user authentication and return a userID
async function authenticateRequest(req) {
    // In a real Prodigy setup, you would validate an auth token (session key).
    // For this example, we mock a user ID from a query parameter 'uid' or a header.
    const userID = req.query.uid || req.headers['x-user-id'];
    if (userID) {
        // Basic check to ensure a user with this ID exists (or is created)
        // In a real scenario, this would involve token validation.
        return userID;
    }
    return null; // No user authenticated
}


// --- 3. MIDDLEWARE & STATIC FILES ---

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // for parsing application/json

// Serve the index.html or game.html file
app.get('/', (req, res) => {
    // Ensure the main game file (index.html, if it exists) or a placeholder is served
    // For this environment, we assume the client HTML loads game.min.js
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 4. SOCKET.IO MULTIPLAYER LOGIC ---

io.on('connection', (socket) => {
    // CRITICAL: Extract the world ID from the handshake query
    const worldID = socket.handshake.query[WORLD_ID_QUERY_PARAM];
    const userID = socket.handshake.query.userID || 'anonymous'; // Assuming client passes userID

    if (!worldID || worldID === 'undefined') {
        console.error(`[SOCKET.IO ERROR] Connection rejected: Missing or invalid ${WORLD_ID_QUERY_PARAM}. User: ${userID}`);
        // Optionally disconnect the socket if worldID is essential
        socket.disconnect(true);
        return;
    }

    // 1. Join the specified room (World)
    socket.join(worldID);

    // 2. Initialize or update room state
    if (!ROOMS[worldID]) {
        ROOMS[worldID] = new Set();
    }
    ROOMS[worldID].add(socket.id);

    console.log(`[SOCKET.IO] User ${userID} connected to World: ${worldID}. Total in world: ${ROOMS[worldID].size}`);

    // 3. Emit a welcome/ready message back to the connecting client
    socket.emit('ready', {
        worldID: worldID,
        message: `Welcome to world ${worldID}!`
    });

    // 4. Handle player movement or game data (Relay to all others in the same world)
    socket.on('playerMove', (data) => {
        // Broadcast the movement data to everyone *else* in this world
        socket.to(worldID).emit('playerMove', {
            ...data,
            socketId: socket.id,
            userID: userID // Include user ID for client-side identification
        });
        // console.log(`[SOCKET.IO] Player ${userID} moved in World ${worldID}.`);
    });

    // 5. Handle disconnection
    socket.on('disconnect', () => {
        if (ROOMS[worldID]) {
            ROOMS[worldID].delete(socket.id);
            if (ROOMS[worldID].size === 0) {
                delete ROOMS[worldID];
            }
        }
        console.log(`[SOCKET.IO] User ${userID} disconnected from World: ${worldID}. Remaining in world: ${ROOMS[worldID] ? ROOMS[worldID].size : 0}`);
        // Notify others in the room that this player has left
        socket.to(worldID).emit('playerLeft', { socketId: socket.id, userID: userID });
    });
});


// --- 5. API ENDPOINTS (MOCK & REAL) ---

// --- 5.1. Prodigy API Endpoints (MOCK) ---

// This endpoint is used by the client to get the WebSocket endpoint.
app.get('/api/v1/endpoints', (req, res) => {
    // When deploying to Render, the client needs the public domain/IP.
    // For simplicity, we return the current host, or a default local address.
    const host = req.headers.host;
    const protocol = req.secure ? 'wss' : 'ws'; // Secure web sockets for HTTPS/WSS
    const wsUrl = `${protocol}://${host}`;

    // Respond with a mock endpoint list
    res.status(200).send({
        success: true,
        endpoints: {
            "webSocketURL": wsUrl
        },
        message: "Endpoints Retrieved"
    });
});

// --- 5.2. NEW MOCK ENDPOINT: /game-api/v1/worlds ---
// The client is requesting a list of worlds, so we must provide one.
app.get('/game-api/v1/worlds', (req, res) => {
    // Helper function to get current user count
    const getUserCount = (worldId) => Object.keys(ROOMS).includes(worldId) ? ROOMS[worldId].size : 0;
    
    // Construct the worlds array
    const worldList = [
        // FIXED: The 'icon' property must be an object with a 'type' property
        { id: "AstralPlane", name: "Astral Plane", full: getUserCount("AstralPlane"), icon: { type: "star" }, path: "/worlds/astralplane" },
        { id: "Phoenix", name: "Phoenix", full: getUserCount("Phoenix"), icon: { type: "fire" }, path: "/worlds/phoenix" },
        { id: "Glacier", name: "Glacier", full: getUserCount("Glacier"), icon: { type: "ice" }, path: "/worlds/glacier" },
        { id: "Nova", name: "Nova", full: getUserCount("Nova"), icon: { type: "bolt" }, path: "/worlds/nova" }
    ];

    // CRITICAL FIX: Return ONLY the array (worldList), not an object with a 'worlds' property.
    // This allows the client's internal `t.sort` function to execute successfully.
    console.log('[API MOCK] Serving mock world list at /game-api/v1/worlds');
    res.status(200).send(worldList);
});

// --- 5.3. MOCK ENDPOINT: /game-api/v1/cloud/load ---

app.get('/game-api/v1/cloud/load', async (req, res) => {
    const userID = await authenticateRequest(req);

    if (!userID) {
        return res.status(403).send({
            success: false,
            message: "missing user id or token"
        });
    }

    try {
        const snapshot = await get(ref(dbAdmin, `users/${userID}/save`));
        if (snapshot.exists()) {
            console.log(`[RTDB INFO] Database load successful for user ${userID}.`);
            return res.status(200).send({
                save: snapshot.val(),
                loggedIn: true
            });
        } else {
            console.warn(`[RTDB WARN] No save data found for user ${userID}. Returning mock data.`);
            // Return default mock data for new users
            const mockSaveData = {
                save: {
                    name: "New Wizard",
                    pet: { type: "epona" },
                    isMember: false,
                    // Use a unique appearance key based on user ID for variety
                    appearancedata: { hat: userID.charCodeAt(0) % 5, hair: userID.charCodeAt(1) % 5, glasses: 0, mouth: 1, nose: 1, eyes: 1, head: 1, body: 1 },
                    gold: 500,
                    level: 1,
                    lastModified: Date.now() 
                },
                loggedIn: true
            };
             // Save the mock data to the database immediately for persistence
            await set(ref(dbAdmin, `users/${userID}/save`), mockSaveData.save);
            return res.status(200).send(mockSaveData);
        }
    } catch (error) {
        console.error(`[RTDB ERROR] Database load failed for user ${userID}:`, error);
        return res.status(500).send({
            success: false,
            message: "Internal server error during database load.",
            error: error.message
        });
    }
});

// --- 5.4. MOCK ENDPOINT: /game-api/v1/cloud/save (POST) ---

app.post('/game-api/v1/cloud/save', async (req, res) => {
    const userID = await authenticateRequest(req);
    const saveData = req.body; // Assuming the client sends the save data in the body

    if (!userID) {
        return res.status(403).send({
            success: false,
            message: "missing user id or token"
        });
    }

    if (!saveData || !saveData.save) {
         console.warn(`[RTDB WARN] Received empty or invalid save data from user ${userID}.`);
         return res.status(400).send({
             success: false,
             message: "Invalid save data provided."
         });
    }

    try {
        // Sanitize and update the lastModified time
        saveData.save.lastModified = Date.now();
        // Save the received data to the Realtime Database
        await set(ref(dbAdmin, `users/${userID}/save`), saveData.save);
        console.log(`[RTDB INFO] Database save successful for user ${userID}.`);
        
        // Return a success message (or the saved data, as Prodigy often expects)
        return res.status(200).send({
             success: true,
             message: "Save successful.",
             save: saveData.save, // Return the saved data structure
             loggedIn: true
        });

    } catch (error) {
        console.error(`[RTDB ERROR] Database save failed for user ${userID}:`, error);
        return res.status(500).send({
            success: false,
            message: "Internal server error during database save.",
            error: error.message
        });
    }
});

// --- 5.5. MOCK ENDPOINT: /game-api/v1/cloud/save (GET - for simple client load) ---

app.get('/game-api/v1/cloud/save', async (req, res) => {
    const userID = await authenticateRequest(req); 

    if (!userID) {
        return res.status(403).send({ 
            success: false, 
            message: "missing user id or token"
        });
    }

    // This is typically a POST route, but if the client makes a GET request,
    // we return a mock response to ensure the game doesn't crash.
    const mockSaveData = {
        save: {
            name: "Mock Wizard",
            pet: { type: "epona" },
            isMember: false,
            appearancedata: { hat: 1, hair: 2, glasses: 0, mouth: 1, nose: 1, eyes: 1, head: 1, body: 1 },
            gold: 500,
            level: 1,
            lastModified: Date.now() 
        },
        loggedIn: true
    };

    return res.status(200).send(mockSaveData); 
});


// --- 6. START SERVER ---

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
