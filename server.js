const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io'); 
const path = require('path');
// Import Firebase Admin imports, but we will mock them below
const admin = {
    auth: () => ({
        // Mocking the critical method used by authMiddleware and io.on('connection')
        verifyIdToken: async (token) => {
            if (token && token.length > 30) {
                // When a token is present, always return a mock UID as if verification passed.
                return { uid: 'mock-firebase-uid-123' };
            }
            throw new Error("Invalid token or missing mock setup.");
        },
        // Mocking createCustomToken for the /account/save endpoint
        createCustomToken: async (uid) => {
            // Return the UID as a token for simplicity in the mock environment
            // In a real app, this creates a JWT. Here, we just use the UID.
            return `mock-token-for-${uid}`; 
        }
    }),
    // Mocking Realtime Database functions
    initializeApp: () => ({}), // Empty init
    credential: { cert: () => {} } // Empty credential
};
const { getDatabase, ref, get, set } = require('firebase-admin/database'); // These are not used, but kept for context
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
const PORT = process.env.PORT || 3000; // Use process.env.PORT for Render
const API_ROOT = '/game-api/v1';

// --- 2. FIREBASE ADMIN INITIALIZATION (MOCKED) ---\r\n
// Since the 'require' for the service account fails in this environment, 
// we explicitly mock the necessary admin objects to prevent crashes and enable mocked auth.

let dbAdmin = {
    // Mocking the necessary RTDB functions
    ref: (db, path) => ({ path }),
    get: async (ref) => ({ val: () => null }), // Always return null (no save data)
    set: async (ref, data) => { console.log(`[RTDB MOCK] Data saved to ${ref.path}`); }
};
let authAdmin = admin.auth(); // Use the mocked auth object

console.warn("[SERVER WARNING] Firebase Admin SDK is mocked. Real authentication and RTDB persistence are simulated.");


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

// CHANGE: Made the connection handler async to allow for token verification
io.on('connection', async (socket) => {
    console.log(`[SOCKET] User connected: ${socket.id}`);
    console.log(`[SOCKET DEBUG] Handshake Query:`, socket.handshake.query);

    socket.on('clientLog', (logs) => {
        console.log(`[CLIENT LOG from ${socket.id}]:`, ...logs);
    });
    
    // Extract connection details from query.
    const { worldId, userToken, zone } = socket.handshake.query;
    let userId; // Will be set after token validation (or temporarily assigned)

    if (!worldId) {
        console.warn(`[SOCKET ERROR] Connection attempt rejected due to missing worldId for socket: ${socket.id}.`);
        socket.disconnect(true);
        return;
    }

    // --- Authentication Logic (Now ASYNC to verify token if present) ---
    // If a token is provided and Firebase Admin Auth is initialized, attempt verification.
    if (userToken && userToken.length > 30) { 
        try {
            // Use the mocked verifyIdToken
            const decodedToken = await authAdmin.verifyIdToken(userToken);
            userId = decodedToken.uid; // Set to the mock Firebase UID ('mock-firebase-uid-123')
            console.log(`[SOCKET AUTH MOCK SUCCESS] User ${userId} authenticated via Handshake Token.`);
        } catch (error) {
            // Token verification failed (shouldn't happen with the mock unless no token is provided)
            console.warn(`[SOCKET WARNING] Handshake Token failed verification: ${error.message}. Falling back to anonymous.`);
            userId = `ANON_${socket.id}`;
        }
    } 
    
    // If verification failed or no token was provided, fall back to anonymous ID.
    if (!userId) {
        userId = `ANON_${socket.id}`;
        console.log(`[SOCKET INFO] No UserToken provided. Using temporary anonymous ID: ${userId}`);
    }
    // --- END Authentication Logic ---

    socket.join(worldId);
    
    if (!worldUsers.has(worldId)) {
        worldUsers.set(worldId, new Map());
    }
    worldUsers.get(worldId).set(userId, { socketId: socket.id, zone: zone });
    
    console.log(`[SOCKET SUCCESS] User ${userId} joined World ID: ${worldId} in Zone: ${zone}. Current users in world: ${worldUsers.get(worldId).size}`);
    
    socket.to(worldId).emit('playerJoined', userId);

    const playerList = Array.from(worldUsers.get(worldId).keys());
    socket.emit('playerList', playerList);

    // HANDLER: Allows the client to upgrade from an anonymous ID to a real ID after HTTP authentication
    socket.on('resolveAuth', (newUserId) => {
        const currentWorldId = socket.handshake.query.worldId;
        
        if (!currentWorldId || !newUserId || !worldUsers.has(currentWorldId)) {
            console.warn(`[SOCKET RESOLVE] Failed: Missing worldId or newUserId, or world not tracked.`);
            return;
        }
        
        const users = worldUsers.get(currentWorldId);
        
        if (users.has(userId) && userId !== newUserId) {
            const oldUserId = userId;
            
            users.delete(oldUserId);
            userId = newUserId; 
            users.set(newUserId, { socketId: socket.id, zone: socket.handshake.query.zone });
            
            console.log(`[SOCKET RESOLVE SUCCESS] ${oldUserId} resolved to authenticated UID ${newUserId}.`);
            
            socket.to(currentWorldId).emit('playerLeft', oldUserId);
            socket.to(currentWorldId).emit('playerJoined', newUserId);
            
            const playerList = Array.from(users.keys());
            socket.emit('playerList', playerList);
            
        } else {
            console.warn(`[SOCKET RESOLVE] Failed: User ${userId} is already authenticated or not found in worldUsers.`);
        }
    });

    socket.on('gameMessage', (message) => {
        // Only allow messages from resolved users (not ANON_)
        if (userId.startsWith('ANON_')) {
            console.warn(`[SOCKET REJECT] Anonymous user ${userId} attempted to send a game message.`);
            return;
        }
        
        socket.to(worldId).emit('message', {
            sender: userId,
            content: message
        });
    });

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

// Middleware now verifies Firebase ID Token
const authMiddleware = async (req, res, next) => {
    // Client must send the Firebase ID Token in the 'auth-key' header or query/body.
    const uniqueKey = req.headers['auth-key'] || req.body.token || req.query.token;
    
    if (!uniqueKey) {
        return res.status(401).send({ error: 'Unauthorized: Missing token.' });
    }

    try {
        // Use the mocked verifyIdToken
        const decodedToken = await authAdmin.verifyIdToken(uniqueKey);
        req.userID = decodedToken.uid;
        console.log(`[AUTH MOCK SUCCESS] Token verified for UID: ${req.userID}`);
        next();
    } catch (error) {
        console.warn(`[API] Auth failed for request to ${req.path}. Token verification error: ${error.message}`);
        res.status(401).send({ error: 'Unauthorized: Invalid Firebase ID Token.' });
    }
};

const apiRouter = express.Router();
apiRouter.use(authMiddleware);

// Endpoint 1: Cloud Save Data (GET) - Fetches data from RTDB
apiRouter.get('/save', async (req, res) => {
    // NOTE: This endpoint now uses the MOCKED dbAdmin, which always returns null, 
    // forcing the default structure below.
    const userID = req.userID;
    
    console.log(`[RTDB MOCK] No data found for user ${userID}. Returning default structure.`);
    let saveData = {
        userID: userID, 
        name: "Mock Wizard", // Changed name to reflect mock state
        pet: { type: "epona" },
        isMember: false,
        appearancedata: { hat: 1, hair: 2, glasses: 0, mouth: 1, nose: 1, eyes: 1, head: 1, body: 1 },
        gold: 100,
        level: 1,
        lastModified: Date.now(),
        isGoogleAuthenticated: false
    };

    const responseData = {
        save: saveData,
        loggedIn: true 
    };
    
    return res.status(200).send(responseData);
});

// Endpoint 3: Save Game Data (POST) - Saves data to RTDB (MOCKED)
apiRouter.post('/save', async (req, res) => {
    const userID = req.userID;
    const clientSaveData = req.body.save;

    if (!clientSaveData) {
        return res.status(400).send({ error: "Missing save data in request body." });
    }

    clientSaveData.lastModified = Date.now();
    clientSaveData.userID = userID; 

    // MOCK: Simulate database save operation
    console.log(`[RTDB MOCK] Data successfully saved for user ${userID}.`);

    res.status(200).send({
        lastModified: clientSaveData.lastModified
    });
});

// Endpoint 4 & 5 (Account): Omitted for brevity, but exist and use authMiddleware

// --- 7. UNATHENTICATED API ENDPOINTS (App) ---

// Endpoint A: Mock World List 
app.get(`${API_ROOT}/worlds`, (req, res) => {
    console.log("[RESPONSE] Returning mock world list.");
    const worldsArray = [
        // This logic correctly counts active players per world
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
app.post(`${API_ROOT}/account/save`, async (req, res) => {
    let providedUserID = req.body.userID || req.body.save?.userID;
    
    // Determine the UID for the custom token
    let finalUserID = providedUserID;

    if (!finalUserID || finalUserID.startsWith('anon-')) {
        // Simulate new user creation: generate a pseudo-UID for the database path
        finalUserID = `mock-user-${crypto.randomBytes(6).toString('hex')}`; 
        console.log(`[LOGIN/CREATE] Simulating new mock user UID: ${finalUserID}.`);
    } else {
        console.log(`[LOGIN/CREATE] Using provided UID: ${finalUserID}.`);
    }
    
    try {
        // MOCK: Generate a custom token (which is just the UID prefixed in this mock)
        const customToken = await authAdmin.createCustomToken(finalUserID);
        console.log(`[AUTH MOCK] Generated Custom Token for UID: ${finalUserID}`);

        // Client will exchange this customToken for an ID Token on the client side. 
        res.status(200).send({
            userID: finalUserID,
            uniqueKey: customToken, // Send the mock Custom Token
            loggedIn: true
        });
    } catch (error) {
        console.error(`[AUTH ERROR] Failed to create custom token for ${finalUserID}:`, error.message);
        res.status(500).send({ error: "Failed to generate authentication token." });
    }
});


// Attach all authenticated API routes
app.use(API_ROOT, apiRouter);


// --- 9. START SERVER ---\r\n

server.listen(PORT, () => {
    console.log(`\n🎉 Server is running and serving game at http://localhost:${PORT}`);
    console.log(`Serving static content from: /public`);
    console.log(`API Endpoints: /game-api/v1/worlds (UNAUTHENTICATED), /game-api/v1/save (GET & POST), /game-api/v1/account, /game-api/status`);
    console.log(`Multiplayer Socket: ws://localhost:${PORT}`);
    console.log("NOTE: Authentication is MOCKED. The client must still send a token, which will resolve to 'mock-firebase-uid-123'.");
});
