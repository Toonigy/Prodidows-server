const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io'); 
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase, ref, get, set } = require('firebase-admin/database'); 
const { getAuth } = require('firebase-admin/auth'); 
const cors = require('cors');
const crypto = require('crypto');

// --- 1. MANDATORY GLOBAL CONFIGURATION ---\r\n
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBWVP1pba2QK8YU59Ot6Jx7BWLI3FD3c4c",
    authDomain: "pde13532.firebaseapp.com",
    databaseURL: "https://pde13532-default-rtdb.firebaseio.com",
    projectId: "pde13532",
    storageBucket: "pde13532.firebasestorage.app",
    messagingSenderId: "1091179956834",
    appId: "1:1091179956834:web:8e3289d3ca0a61fe829f3b",
    measurementId: "G-GXT9N6J6Y2"
};
const PORT = 3000;
const API_ROOT = '/game-api/v1';

// --- NEW GLOBAL STATE: Mock Persistence for Signed-In Status ---
const mockUsers = new Map(); // userID -> { uniqueKey: string, googleSignedIn: boolean, save: object }
// --- END NEW GLOBAL STATE ---

// --- 2. FIREBASE ADMIN INITIALIZATION ---\r\n
try {
    const serviceAccount = require('./pde13532-firebase-adminsdk-fbsvc-2f5beb97b6.json');
    
    initializeApp({
        credential: cert(serviceAccount),
        databaseURL: FIREBASE_CONFIG.databaseURL,
        projectId: FIREBASE_CONFIG.projectId
    });
} catch (error) {
    console.warn("Firebase Admin failed to initialize. Ensure 'pde13532-firebase-adminsdk-fbsvc-2f5beb97b6.json' is present or configuration is correct:", error.message);
}

const dbAdmin = getDatabase();
const authAdmin = getAuth();

// --- 3. EXPRESS APP AND MIDDLEWARE ---\r\n

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// --- 4. SOCKET.IO SETUP ---\r\n

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// --- 5. SOCKET.IO MULTIPLAYER LOGIC ---\r\n

// Mock storage for connected users/worlds (in-memory)
const worldUsers = new Map();

io.on('connection', (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);

    // NEW DEBUG: Log all query parameters received
    console.log(`[SOCKET DEBUG] Handshake Query:`, socket.handshake.query);

    // NEW: Listen for client logs and output them to the server console
    socket.on('clientLog', (logs) => {
        console.log(`[CLIENT LOG from ${socket.id}]:`, ...logs);
    });
    
    // Extract connection details from query. We will derive userId from userToken.
    const { worldId, userToken, zone } = socket.handshake.query;
    let userId; // Will be set after token validation

    if (!worldId || !userToken) {
        const missingParams = [];
        if (!worldId) missingParams.push('worldId');
        if (!userToken) missingParams.push('userToken');

        console.warn(`[SOCKET ERROR] Connection attempt rejected due to missing parameters: ${missingParams.join(', ')} for socket: ${socket.id}. Handshake Query:`, socket.handshake.query);
        socket.disconnect(true);
        return;
    }

    // Authenticate token (Mock Authentication)
    // FIX: Derive userId directly from the userToken, as the client may not be setting userId correctly.
    const expectedPrefix = 'TOKEN_';
    
    if (userToken.startsWith(expectedPrefix)) {
        // Derive the userId from the valid token format
        userId = userToken.substring(expectedPrefix.length);
    }
    
    if (!userId) {
        // The token didn't start with TOKEN_ or derivation failed.
        console.warn(`[SOCKET ERROR] Connection attempt rejected: Invalid mock token format or failed User ID derivation. Received: ${userToken}`);
        socket.disconnect(true);
        return;
    }

    // Since the userId is derived from the token, we can proceed.
    
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
        socket.to(worldId).emit('message', {
            sender: userId,
            content: message
        });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`[SOCKET] User disconnected: ${socket.id}, UserID: ${userId}`);

        if (worldUsers.has(worldId)) {
            const users = worldUsers.get(worldId);
            if (users.delete(userId)) {
                socket.to(worldId).emit('playerLeft', userId);
                if (users.size === 0) {
                    worldUsers.delete(worldId);
                    console.log(`[WORLD] World ${worldId} is now empty and removed from tracking.`);
                }
            }
        }
    });
});

// --- 6. AUTHENTICATED API ENDPOINTS (Express Router) ---\r\n

const mockAuthMiddleware = (req, res, next) => {
    const uniqueKey = req.headers['auth-key'] || req.body.token || req.query.token;
    
    if (uniqueKey && uniqueKey.startsWith('TOKEN_')) {
        req.userID = uniqueKey.replace('TOKEN_', '');
        next();
    } else {
        console.warn(`[API] Auth failed for request to ${req.path}. Token: ${uniqueKey}`);
        res.status(401).send({ error: 'Unauthorized: Invalid or missing uniqueKey' });
    }
};

const apiRouter = express.Router();
apiRouter.use(mockAuthMiddleware);

// Endpoint 1: Mock Cloud Save Data (GET)
apiRouter.get('/save', (req, res) => {
    const userID = req.userID;
    let userData = mockUsers.get(userID) || { googleSignedIn: false }; // Get stored mock status

    // Mock save data structure (minimal for client to function)
    const mockSaveData = {
        save: {
            // FIX: Explicitly include the userID within the save object, 
            // as the client often expects it here to initialize game state.
            userID: userID, 
            name: "Mock Wizard",
            pet: { type: "epona" },
            isMember: false,
            appearancedata: { hat: 1, hair: 2, glasses: 0, mouth: 1, nose: 1, eyes: 1, head: 1, body: 1 },
            gold: 500,
            level: 1,
            lastModified: Date.now(),
            // NEW: Add flag that server transmits regarding Google authentication status
            isGoogleAuthenticated: userData.googleSignedIn 
        },
        loggedIn: true
    };

    console.log(`[RESPONSE] Returned mock cloud save for user ${userID}. Google Auth Status: ${userData.googleSignedIn}`);
    return res.status(200).send(mockSaveData); 
});

// Endpoint 3: Mock Save Game Data (POST)
apiRouter.post('/save', (req, res) => {
    const userID = req.userID;
    console.log(`[SAVE] User ${userID} attempting to save data:`, req.body);
    
    // In a real app, you would save req.body.save to the database
    
    res.status(200).send({
        lastModified: Date.now()
    });
});

// Endpoint 4 & 5 (Account): Omitted for brevity, but exist and use mockAuthMiddleware

// --- 7. UNATHENTICATED API ENDPOINTS (App) ---

// Endpoint A: Mock World List 
app.get(`${API_ROOT}/worlds`, (req, res) => {
    console.log("[RESPONSE] Returning mock world list.");
    const worldsArray = [
        { id: "1", name: "Dark Tower", activePlayers: worldUsers.has("1") ? worldUsers.get("1").size : 0, zone: "tower" },
        { id: "2", name: "Shiverchill", activePlayers: worldUsers.has("2") ? worldUsers.get("2").size : 0, zone: "town" },
        { id: "3", name: "Bonfire Spire", activePlayers: worldUsers.has("3") ? worldUsers.get("3").size : 0, zone: "spire" }
    ];
    res.status(200).send(worldsArray);
});

// Endpoint B: Mock Status Check
app.get('/game-api/status', (req, res) => {
    console.log("[RESPONSE] Returning mock status OK.");
    res.status(200).send({ status: "OK" });
});

// Endpoint C: Mock Authentication (POST) - Login/Create Endpoint
app.post(`${API_ROOT}/account/save`, (req, res) => {
    let providedUserID = req.body.userID || req.body.save?.userID;
    let isGoogleSignOn = !!providedUserID; // Assume if client sends an ID, they are logging in (Google or existing session)

    let mockUserID = providedUserID;

    if (!mockUserID) {
        // New user sign-up (anonymous flow in a real app)
        mockUserID = crypto.randomBytes(16).toString('hex');
        isGoogleSignOn = false;
        console.log(`[LOGIN/CREATE] Mocking new anonymous user: ${mockUserID}.`);
    } else {
        console.log(`[LOGIN/CREATE] Mocking login for existing user: ${mockUserID}.`);
    }
    
    const mockToken = `TOKEN_${mockUserID}`;
    
    // --- Server-Side Persistence Update ---
    let userData = mockUsers.get(mockUserID);
    if (!userData) {
        // New user data for persistence
        userData = {
            uniqueKey: mockToken,
            googleSignedIn: isGoogleSignOn, // Store the sign-in status
            save: {}
        };
        mockUsers.set(mockUserID, userData);
    } else {
        // Existing user, update token and potentially status (if the client logic dictates)
        userData.uniqueKey = mockToken;
        // If the user logs in via a persistent UID, we maintain/set their signed-in status
        if (isGoogleSignOn) {
            userData.googleSignedIn = true;
        }
    }
    // --- End Persistence Update ---

    res.status(200).send({
        userID: mockUserID,
        uniqueKey: mockToken,
        loggedIn: true
    });
});


// Attach all authenticated API routes
app.use(API_ROOT, apiRouter);


// --- 9. START SERVER ---\r\n

server.listen(PORT, () => {
    console.log(`\n🎉 Server is running and serving game at http://localhost:${PORT}`);
    console.log(`Serving static content from: /public`);
    console.log(`API Endpoints: /game-api/v1/worlds (UNAUTHENTICATED), /game-api/v1/save (GET & POST), /game-api/v1/account, /game-api/status`);
    console.log(`Multiplayer Socket: ws://localhost:${PORT}`);
    console.log("Mock Login Token format: TOKEN_<UserID>");
});
