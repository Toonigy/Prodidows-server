const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io'); 
const path = require('path');
// CHANGE 1: Import 'cert' for explicit service account credentials
const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
// Change: Import Realtime Database functions instead of Firestore
const { getDatabase, ref, get, set } = require('firebase-admin/database'); 
// NEW: Import Firebase Admin Auth for token verification
const { getAuth } = require('firebase-admin/auth'); 
const cors = require('cors');
const crypto = require('crypto'); // NEW: Import crypto for generating unique user IDs

// --- 1. MANDATORY GLOBAL CONFIGURATION ---\r\n\r\n
// In a real application, these must be securely loaded from environment variables.\r\n
const FIREBASE_CONFIG = {
    // UPDATED FIREBASE CONFIGURATION
    apiKey: "AIzaSyBWVP1pba2QK8YU59Ot6Jx7BWLI3FD3c4c",
    authDomain: "pde13532.firebaseapp.com",
    databaseURL: "https://pde13532-default-rtdb.firebaseio.com", // Keeping the requested URL
    projectId: "pde13532",
    storageBucket: "pde13532.firebasestorage.app",
    messagingSenderId: "1091179956834",
    appId: "1:1091179956834:web:8e3289d3ca0a61fe829f3b",
    measurementId: "G-GXT9N6J6Y2"
};
const PORT = 3000;
const API_ROOT = '/game-api/v1';

// --- 2. FIREBASE ADMIN INITIALIZATION ---\r\n
// CHANGE 2: Load the service account file and use cert() for explicit authentication.
try {
    // NOTE: In a real environment, the service account key file 'pde13532-firebase-adminsdk-fbsvc-2f5beb97b6.json' 
    // must be available in the process's working directory.
    const serviceAccount = require('./pde13532-firebase-adminsdk-fbsvc-2f5beb97b6.json');
    
    initializeApp({
        // Updated to use the explicit service account key file
        credential: cert(serviceAccount),
        databaseURL: FIREBASE_CONFIG.databaseURL,
        projectId: FIREBASE_CONFIG.projectId
    });
} catch (error) {
    // Catch if already initialized or if the service account file is missing/invalid
    console.warn("Firebase Admin failed to initialize. Ensure 'pde13532-firebase-adminsdk-fbsvc-2f5beb97b6.json' is present or configuration is correct:", error.message);
}

const dbAdmin = getDatabase();
const authAdmin = getAuth();

// --- 3. EXPRESS APP AND MIDDLEWARE ---\r\n

const app = express();
app.use(express.json()); // for parsing application/json
app.use(cors()); // Enable CORS for all routes
// NEW: Use express.static to serve files from the 'public' folder, which automatically handles index.html for the root route (/)
app.use(express.static('public'));

// --- 4. SOCKET.IO SETUP ---\r\n

const server = http.createServer(app);
// Socket.IO server setup. Allowing all origins for development.
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// --- 5. SOCKET.IO MULTIPLAYER LOGIC ---\r\n

// Mock storage for connected users/worlds (in-memory)
const worldUsers = new Map(); // { worldId: { userId: socketId, ... }, ... }

io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    // NEW DEBUG: Log all query parameters received
    console.log(`[SOCKET DEBUG] Handshake Query:`, socket.handshake.query);

    // NEW: Listen for client logs and output them to the server console
    socket.on('clientLog', (logs) => {
        // logs is an array of arguments from the client's Util.log call
        console.log(`[CLIENT LOG from ${socket.id}]:`, ...logs);
    });
    
    // Extract connection details from query
    const { userId, worldId, userToken, zone } = socket.handshake.query;

    if (!userId || !worldId || !userToken) {
        // FIX: Improve logging to identify missing parameters explicitly
        const missingParams = [];
        if (!userId) missingParams.push('userId');
        if (!worldId) missingParams.push('worldId');
        if (!userToken) missingParams.push('userToken');

        console.warn(`[SOCKET ERROR] Connection attempt rejected due to missing parameters: ${missingParams.join(', ')} for socket: ${socket.id}. userId=${userId}, worldId=${worldId}, userToken=${userToken}`);
        socket.disconnect(true);
        return;
    }

    // Authenticate token (Mock Authentication - in a real app, verify with authAdmin.verifyIdToken(userToken))
    const expectedToken = `TOKEN_${userId}`;

    if (userToken !== expectedToken) {
        // FIX: Ensure userId is logged defensively
        const loggedUserId = userId ? userId : 'undefined (missed initial check)';
        console.warn(`[SOCKET ERROR] Connection attempt rejected: Invalid mock token for user ${loggedUserId}. Expected: ${expectedToken}, Received: ${userToken}`);
        // socket.emit('error', { code: 401, message: 'Invalid token' }); 
        socket.disconnect(true);
        return;
    }

    // Join the world room
    socket.join(worldId);
    
    // Track user in the world
    if (!worldUsers.has(worldId)) {
        worldUsers.set(worldId, new Map());
    }
    worldUsers.get(worldId).set(userId, { socketId: socket.id, zone: zone });
    
    // --- CONFIRMATION LOG: Show World ID and user count ---
    console.log(`[SOCKET SUCCESS] User ${userId} joined World ID: ${worldId} in Zone: ${zone}. Current users in world: ${worldUsers.get(worldId).size}`);
    // --- END CONFIRMATION LOG ---
    
    // Notify others in the world that a player joined
    socket.to(worldId).emit('playerJoined', userId);

    // Send the current player list to the newly connected user
    const playerList = Array.from(worldUsers.get(worldId).keys());
    socket.emit('playerList', playerList);

    // Handle incoming game messages
    socket.on('gameMessage', (message) => {
        // Simple broadcast to all others in the same world
        socket.to(worldId).emit('message', {
            sender: userId,
            content: message
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        // Log the reason if available, though client-side logging usually provides "undefined"
        console.log(`[SOCKET] User disconnected: ${socket.id}, UserID: ${userId}`);

        if (worldUsers.has(worldId)) {
            const users = worldUsers.get(worldId);
            if (users.delete(userId)) {
                // Notify others that the player left
                socket.to(worldId).emit('playerLeft', userId);

                // Clean up world map if empty
                if (users.size === 0) {
                    worldUsers.delete(worldId);
                    console.log(`[WORLD] World ${worldId} is now empty and removed from tracking.`);
                }
            }
        }
    });
});

// --- 6. AUTHENTICATED API ENDPOINTS (Express Router) ---\r\n

// Middleware to mock token validation for Express endpoints
const mockAuthMiddleware = (req, res, next) => {
    // In a real application, check req.headers['auth-key'] against a database session
    const uniqueKey = req.headers['auth-key'] || req.body.token || req.query.token;
    
    // Check for a valid mock token
    if (uniqueKey && uniqueKey.startsWith('TOKEN_')) {
        // Mock success
        req.userID = uniqueKey.replace('TOKEN_', '');
        next();
    } else {
        // If the path is for authenticated endpoints, require a token.
        // The /worlds path is defined separately, but this is a fail-safe check
        // in case the client attempts to send an invalid token to an endpoint that 
        // should be authenticated.
        console.warn(`[API] Auth failed for request to ${req.path}. Token: ${uniqueKey}`);
        res.status(401).send({ error: 'Unauthorized: Invalid or missing uniqueKey' });
    }
};

const apiRouter = express.Router();

// Apply auth middleware to all API routes defined below
apiRouter.use(mockAuthMiddleware);

// Endpoint 1: Mock Cloud Save Data (GET)
apiRouter.get('/save', (req, res) => {
    // NOTE: For authenticated routes, req.userID will be set by mockAuthMiddleware
    const userID = req.userID;
    
    // Mock response structure that client expects
    const mockSaveData = {
        save: {
            // Minimal required keys to prevent client errors
            name: "Mock Wizard",
            pet: { type: "epona" },
            isMember: false,
            appearancedata: { hat: 1, hair: 2, glasses: 0, mouth: 1, nose: 1, eyes: 1, head: 1, body: 1 },
            // Add other mock data needed by the client, such as gold or level, to ensure the game loads
            gold: 500,
            level: 1,
            // The client expects a timestamp for 'lastModified'
            lastModified: Date.now() 
        },
        // CRITICAL FIX: The client checks for this flag in the response to set network.loggedIn
        loggedIn: true
    };

    console.log(`[RESPONSE] Successfully returned mock cloud save for user ${userID} (Post-Login).`);

    // The client expects the full 'save' object directly in the response root if successful.
    // In this path, the client expects the object containing the 'save' property.
    return res.status(200).send(mockSaveData); 
});

// Endpoint 3: Mock Save Game Data (POST)
apiRouter.post('/save', (req, res) => {
    const userID = req.userID;
    // Log the data the client tried to save (for debugging)
    console.log(`[SAVE] User ${userID} attempting to save data:`, req.body);
    
    // In a real app, save req.body.save to the database
    
    // Mock response structure (client expects a 200 OK for save success)
    res.status(200).send({
        // Client expects a timestamp
        lastModified: Date.now()
    });
});

// Endpoint 4: Mock Account Update (POST)
apiRouter.post('/account', (req, res) => {
    const userID = req.userID;
    console.log(`[ACCOUNT] User ${userID} updating account data:`, req.body);
    // Mock success
    res.status(200).send({});
});

// Endpoint 5: Mock Account Details (GET)
apiRouter.get('/account', (req, res) => {
    const userID = req.userID;
    console.log(`[ACCOUNT] Fetching account details for user ${userID}.`);
    // Mock minimal account data
    res.status(200).send({
        account: {
            userID: userID,
            email: `user_${userID}@mock.com`,
            name: `Player ${userID}`
        }
    });
});

// --- 7. UNATHENTICATED API ENDPOINTS (App) ---

// Endpoint A: Mock World List (MOVED TO BE UNATHENTICATED)
app.get(`${API_ROOT}/worlds`, (req, res) => {
    console.log("[RESPONSE] Returning mock world list.");
    // FIX: Return the array of world objects directly, instead of { worlds: [...] },
    // as the client expects a sortable array as the response root.
    const worldsArray = [
        { id: "1", name: "Dark Tower", activePlayers: worldUsers.has("1") ? worldUsers.get("1").size : 0, zone: "tower" },
        { id: "2", name: "Shiverchill", activePlayers: worldUsers.has("2") ? worldUsers.get("2").size : 0, zone: "town" },
        { id: "3", name: "Bonfire Spire", activePlayers: worldUsers.has("3") ? worldUsers.get("3").size : 0, zone: "spire" }
    ];
    res.status(200).send(worldsArray);
});

// Endpoint B: Mock Status Check (GET) - No auth required
app.get('/game-api/status', (req, res) => {
    console.log("[RESPONSE] Returning mock status OK.");
    res.status(200).send({ status: "OK" });
});

// Endpoint C: Mock Authentication (POST) - No auth required (this is the login endpoint)
app.post(`${API_ROOT}/account/save`, (req, res) => {
    // This mocks the creation/login process, simulating a UID from Firebase.
    // Prioritize an existing ID sent by the client (e.g., from this.game.prodigy.player.userID)
    let mockUserID = req.body.userID || req.body.save?.userID;

    if (!mockUserID) {
        // If no existing ID is provided, simulate a new user sign-up (or session start) by generating a unique ID.
        mockUserID = crypto.randomBytes(16).toString('hex'); // Use a unique hex string
        console.log(`[LOGIN/CREATE] Mocking new user sign-up with generated ID: ${mockUserID}.`);
    } else {
        console.log(`[LOGIN/CREATE] Mocking existing user login using ID from client: ${mockUserID}.`);
    }
    
    const mockToken = `TOKEN_${mockUserID}`;

    // The client expects the token and user ID to be returned, allowing it to start authenticated calls.
    res.status(200).send({
        userID: mockUserID,
        uniqueKey: mockToken,
        loggedIn: true
    });
});


// Attach all authenticated API routes under /game-api/v1 (Must be placed after the specific UNATHENTICATED /worlds route to ensure priority)
app.use(API_ROOT, apiRouter);


// --- 9. START SERVER ---\r\n

server.listen(PORT, () => {
    console.log(`\n🎉 Server is running and serving game at http://localhost:${PORT}`);
    console.log(`Serving static content from: /public`);
    console.log(`API Endpoints: /game-api/v1/worlds (UNAUTHENTICATED), /game-api/v1/save (GET & POST), /game-api/v1/account, /game-api/status`);
    console.log(`Multiplayer Socket: ws://localhost:${PORT}`);
    console.log("Mock Login Token format: TOKEN_<UserID>");
});
