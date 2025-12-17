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
const { json } = require('body-parser'); // NEW: Import json body parser

// --- 1. MANDATORY GLOBAL CONFIGURATION ---

// In a real application, these must be securely loaded from environment variables.

const FIREBASE_CONFIG = {
    // UPDATED FIREBASE CONFIGURATION
    apiKey: "AIzaSyBWVP1pba2QK8YU59Ot6Jx7BWLI3FD3c4c",
    authDomain: "pde13532.firebaseapp.com",
    databaseURL: "https://pde13532-default-rtdb.firebaseio.com", // Keeping the requested URL
    projectId: "pde13532",
    storageBucket: "pde13532.firebasestorage.app",
    messagingSenderId: "1091179956834",
    appId: "1:1091179956834:web:f38302513f56d953245451"
};

// Use the Service Account JSON here (or load from environment in a real deployment)
const serviceAccount = {
    // NOTE: This is placeholder data and MUST be replaced with a valid service account JSON.
    "type": "service_account",
    "project_id": "pde13532",
    "private_key_id": "MOCK_KEY_ID",
    "private_key": "MOCK_PRIVATE_KEY",
    "client_email": "firebase-adminsdk@pde13532.iam.gserviceaccount.com",
    "client_id": "MOCK_CLIENT_ID",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-q0p29%40pde13532.iam.gserviceaccount.com"
};

// Initialize Firebase Admin SDK (used for verifying tokens and RTDB access)
initializeApp({
    credential: cert(serviceAccount),
    databaseURL: FIREBASE_CONFIG.databaseURL,
});

const adminAuth = getAuth();
const adminDB = getDatabase();

const PORT = process.env.PORT || 3000;
const API_ROOT = '/game-api/v1';

// --- 2. EXPRESS & SOCKET.IO SETUP ---

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: "*" // Allow all origins for the game client
    },
    // Set a very high ping timeout to prevent premature disconnects during debugging
    pingTimeout: 30000, // 30 seconds
    pingInterval: 10000 // 10 seconds
}); 

// --- 3. MIDDLEWARE ---

app.use(cors());
// NOTE: Prodigy client often sends payloads that are URL-encoded or form data, 
// but for a mock API, we primarily handle JSON.
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- 4. AUTHENTICATION MIDDLEWARE ---

// Middleware to verify the client's authentication token (uniqueKey)
const authenticate = async (req, res, next) => {
    const uniqueKey = req.body.uniqueKey || req.query.uniqueKey;
    const userID = req.body.userID || req.query.userID;

    if (!uniqueKey || !userID) {
        console.warn(`[AUTH] Missing authentication keys for route: ${req.path}`);
        return res.status(401).send({ error: 'Authentication required: missing uniqueKey or userID.' });
    }

    // In this mock, we simply check if the key matches the pattern: TOKEN_<userID>
    // In a real system, you would verify this key using Firebase Admin Auth.
    const expectedToken = `TOKEN_${userID}`;
    if (uniqueKey === expectedToken) {
        req.userID = userID; // Attach userID to the request for route handlers
        next();
    } else {
        console.warn(`[AUTH] Invalid token for user ${userID}. Provided: ${uniqueKey}. Expected: ${expectedToken}`);
        res.status(401).send({ error: 'Invalid authentication token.' });
    }
};

// --- 5. API ROUTER SETUP ---

const apiRouter = express.Router();
apiRouter.use(authenticate); // Apply authentication to all routes defined below

// --- 6. AUTHENTICATED API ROUTES (e.g., Save, Load, Leaderboards) ---

// Mock route for saving game data
apiRouter.post('/save', async (req, res) => {
    const { userID, save } = req.body;
    console.log(`[SAVE] Receiving save data for user: ${userID}`);

    if (!save) {
        return res.status(400).send({ error: 'Missing save data.' });
    }

    try {
        // Mock saving to Firebase Realtime Database
        await set(ref(adminDB, `users/${userID}/save`), save);
        console.log(`[SAVE] Data saved successfully for user: ${userID}`);
        res.status(200).send({ success: true, message: 'Save successful.' });
    } catch (error) {
        console.error(`[SAVE] Error saving data for user ${userID}:`, error);
        res.status(500).send({ success: false, error: 'Database error during save.' });
    }
});

// Mock route for loading game data
apiRouter.post('/load', async (req, res) => {
    const { userID } = req.body;
    console.log(`[LOAD] Loading data for user: ${userID}`);
    
    try {
        const snapshot = await get(ref(adminDB, `users/${userID}/save`));
        let save = snapshot.val();

        if (save) {
            console.log(`[LOAD] Data loaded successfully for user: ${userID}`);
        } else {
            // Return an empty object if no save data exists (simulates a new user's first load)
            save = {}; 
            console.log(`[LOAD] No save data found for user: ${userID}. Returning empty object.`);
        }

        // The client often expects the save data nested under a 'save' key
        res.status(200).send({ success: true, save: save });
    } catch (error) {
        console.error(`[LOAD] Error loading data for user ${userID}:`, error);
        res.status(500).send({ success: false, error: 'Database error during load.' });
    }
});

// --- 7. UNATHENTICATED API ROUTES (e.g., Login, World Status) ---

// Mock Login/Register/Token Refresh route
app.post('/login', (req, res) => {
    // The client typically sends its last known userID or an object containing a save.
    // We simulate a login or registration flow.
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


// --- 8. MULTIPLAYER SOCKET.IO HANDLER (NEW SECTION) ---

// Store active connections and their associated user data (in a real app, this would be a sophisticated state store)
const activeUsers = new Map();

/**
 * Helper function to get all player IDs in a specific room/world.
 * @param {string} worldID 
 * @returns {Array<string>} List of authenticated user IDs in the room.
 */
const getPlayersInWorld = (worldID) => {
    const players = [];
    for (const user of activeUsers.values()) {
        if (user.world === worldID) {
            players.push(user.userID);
        }
    }
    return players;
};

/**
 * Handle new Socket.IO connections. This is the core multiplayer entry point.
 * @param {Socket} socket - The connected socket object.
 */
io.on('connection', (socket) => {
    // This runs immediately after the client sees "client connected"
    console.log(`[SOCKET.IO] New connection established with ID: ${socket.id}`);
    
    // 8.1 AUTHENTICATION HANDLER
    // The client must send its credentials (uniqueKey/token) before joining a world.
    socket.on('authenticate', ({ userID, uniqueKey }) => {
        const expectedToken = `TOKEN_${userID}`;

        if (uniqueKey === expectedToken) {
            console.log(`[AUTH] User ${userID} authenticated successfully.`);
            // Store minimal user data for later lookup
            activeUsers.set(socket.id, {
                socketId: socket.id,
                userID: userID,
                isAuthenticated: true,
                world: null // Will be set on join_world
            });
            // Acknowledge successful authentication to the client
            socket.emit('auth_success', { userID: userID });
        } else {
            console.warn(`[AUTH] User ${userID} failed authentication. Disconnecting.`);
            socket.emit('auth_failure', { message: 'Invalid token.' });
            socket.disconnect(true); // Close the connection immediately
        }
    });

    // 8.2 JOIN WORLD HANDLER
    socket.on('join_world', ({ worldID }) => {
        const user = activeUsers.get(socket.id);

        if (!user || !user.isAuthenticated) {
            console.warn(`[JOIN] Socket ${socket.id} attempted to join world ${worldID} without authentication. Disconnecting.`);
            socket.disconnect(true);
            return;
        }

        // Leave any previous room the user might have been in (good practice)
        if (user.world) {
            socket.leave(user.world);
            // Broadcast that the user left the old world
            io.to(user.world).emit('player_left', { userID: user.userID });
            console.log(`[JOIN] User ${user.userID} left world ${user.world}.`);
        }

        // Join the new world room
        socket.join(worldID);
        user.world = worldID;
        activeUsers.set(socket.id, user); // Update the map

        console.log(`[JOIN] User ${user.userID} joined world ${worldID}.`);
        
        // 1. Get list of other players currently in the room (for the joining client)
        const otherPlayers = getPlayersInWorld(worldID).filter(id => id !== user.userID);
        
        // 2. Notify the joining client of existing players
        socket.emit('world_data', { 
            worldID: worldID,
            players: otherPlayers 
        });

        // 3. Notify all existing players in the room that a new player has joined
        socket.to(worldID).emit('player_joined', { userID: user.userID });
    });

    // 8.3 PLAYER MOVEMENT HANDLER (Example of a real-time game event)
    socket.on('player_movement', (movementData) => {
        const user = activeUsers.get(socket.id);
        
        if (user && user.world) {
            // Broadcast movement data to everyone else in the same world room
            socket.to(user.world).emit('player_moved', { 
                userID: user.userID, 
                position: movementData.position, 
                direction: movementData.direction 
            });
        }
    });
    
    // 8.4 DISCONNECT HANDLER (Modified to include cleanup broadcast)
    socket.on('disconnect', (reason) => {
        // When a user disconnects, log the reason and clean up.
        console.log(`[SOCKET.IO] Socket ID ${socket.id} disconnected. Reason: ${reason}`);
        
        const disconnectedUser = activeUsers.get(socket.id);
        if (disconnectedUser) {
            console.log(`[USER] User ${disconnectedUser.userID} left the server.`);
            
            // If the user was in a world, broadcast their departure
            if (disconnectedUser.world) {
                io.to(disconnectedUser.world).emit('player_left', { userID: disconnectedUser.userID });
            }
            activeUsers.delete(socket.id);
        }
    });

    // The client will typically send an 'authenticate' or 'join_world' message next
    // with their uniqueKey and userID.
    
    // MOCK: Send a welcome message just to show the connection is open
    // This is optional, but often useful for immediate client feedback.
    // socket.emit('welcome', { message: 'You have connected to the mock multiplayer server!' });
});

// Attach all authenticated API routes under /game-api/v1 (Must be placed after the specific UNATHENTICATED /worlds route to ensure priority)
app.use(API_ROOT, apiRouter);


// --- 9. START SERVER ---


server.listen(PORT, () => {
    console.log(`\n🎉 Server is running and serving game at http://localhost:${PORT}`);
    console.log(`Serving static content from: /public`);
    console.log(`API Endpoints: /game-api/v1/login, /game-api/v1/save, /game-api/v1/load`);
    console.log(`Socket.IO Endpoint: /`);
});
