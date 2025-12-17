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

const PORT = process.env.PORT || 8080;

// --- 2. FIREBASE ADMIN MOCK/INITIALIZATION ---

// 2a. Mock Firebase Auth for stability in the environment
const auth = {
    // Mock the critical method used for token verification (API and Socket.IO)
    verifyIdToken: async (token) => {
        if (token && token.length > 30) {
            // Success: Return a hardcoded mock UID as if verification passed.
            return { uid: 'mock-firebase-uid-123' }; 
        }
        // Failure: Throw an error if no token is provided, forcing the code to reject.
        throw new Error("Token missing or too short for verification.");
    },
    // Mock the method used for the /account/save endpoint
    createCustomToken: async (uid) => {
        // Return the UID as a mock custom token
        return `mock-token-for-${uid}`; 
    }
};

// 2b. Initialize Realtime Database (RTDB)
initializeApp({
    credential: applicationDefault(),
    databaseURL: FIREBASE_CONFIG.databaseURL, 
});
const rtdb = getDatabase(); 

console.warn("[SERVER WARNING] Firebase Admin Auth is MOCKED. All valid tokens resolve to 'mock-firebase-uid-123'. RTDB is active.");


// --- 3. EXPRESS APP SETUP ---

const app = express();
const server = http.createServer(app);
// Socket.IO Server initialization
const io = new Server(server, { 
    cors: { 
        origin: '*',
        credentials: true
    } 
}); 

app.use(cors()); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 3.5. HEALTH CHECK ENDPOINT ---

app.get('/game-api/status', (req, res) => {
    return res.status(200).send({
        success: true,
        message: "Server is online and healthy.",
        serverTime: Date.now()
    });
});

// --- 4. AUTHENTICATION UTILITY ---

/**
 * Extracts the user token string (l.uniqueKey) from common request locations.
 */
function extractUserToken(req) {
    const authKey = req.headers['auth-key'];
    const token = req.headers.token;
    const userTokenQuery = req.query.userToken;
    const userTokenBody = req.body.userToken;
    const userToken = authKey || token || userTokenQuery || userTokenBody;
    return userToken || null;
}

/**
 * Verifies the token using the MOCKED auth service and returns the authenticated Firebase UID.
 */
async function authenticateRequest(req) {
    const userToken = extractUserToken(req);
    if (!userToken) {
        return null;
    }

    try {
        const decodedToken = await auth.verifyIdToken(userToken); // Uses MOCKED auth
        const uid = decodedToken.uid;
        console.log(`[AUTH MOCK SUCCESS] Token verified. UID: ${uid}`);
        return uid;
    } catch (error) {
        console.error("[AUTH MOCK ERROR] Token verification failed:", error.message);
        return null;
    }
}


// --- 5. GAME API ENDPOINTS: /game-api/v1/worlds ---

app.get('/game-api/v1/worlds', (req, res) => {
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

// ** ACCOUNT API ENDPOINTS **

// GET /game-api/v1/account
app.get('/game-api/v1/account', async (req, res) => {
    const userID = await authenticateRequest(req);

    if (!userID) {
        return res.status(403).send({ 
            success: false, 
            message: "missing user id or token"
        });
    }

    return res.status(200).send({
        success: true,
        uniqueKey: userID, 
        isMember: true, 
        currentWorld: "Fireplane 1",
        displayName: "Authenticated Wizard"
    });
});

// POST /game-api/v1/account
app.post('/game-api/v1/account', async (req, res) => {
    const userID = await authenticateRequest(req);

    if (!userID) {
        return res.status(403).send({ 
            success: false, 
            message: "missing user id or token"
        });
    }
    
    // Account update logic (mocked)
    return res.status(200).send({
        success: true,
        message: "Account settings updated successfully.",
        uniqueKey: userID 
    });
});


// POST /game-api/v1/account/save (Login/Registration Endpoint)
app.post('/game-api/v1/account/save', async (req, res) => {
    let requestedID = req.body.userID || req.body.email || 'guest_user_' + Date.now();
    
    try {
        // MOCK: Generate a custom token (which is just the UID prefixed in this mock)
        const customToken = await auth.createCustomToken(requestedID); 
        console.log(`[AUTH MOCK] Generated Custom Token for ID: ${requestedID}`);

        // Client will exchange this customToken for an ID Token on the client side. 
        res.status(200).send({
            success: true,
            uniqueKey: requestedID, 
            displayName: 'GuestWizard',
            email: 'guest@example.com'
        });
    } catch (error) {
        console.error(`[AUTH ERROR] Failed to create custom token:`, error.message);
        res.status(500).send({ error: "Failed to generate authentication token." });
    }
});


// GET /game-api/v1/inventory (Mock Item Loading)
app.get('/game-api/v1/inventory', async (req, res) => {
    const userID = await authenticateRequest(req);

    if (!userID) {
        return res.status(403).send({ 
            success: false, 
            message: "missing user id or token"
        });
    }

    const mockInventory = {
        success: true,
        items: [1000, 1001, 2005, 3010],
        equipment: { hat: 1000, weapon: 2005, trinket: null },
        currency: { gold: 500, shards: 10 }
    };

    return res.status(200).send(mockInventory);
});

// POST /game-api/v1/zones/switch 
app.post('/game-api/v1/zones/switch', async (req, res) => {
    const userID = await authenticateRequest(req);

    if (!userID) {
        return res.status(401).send({ 
            success: false, 
            message: "Unauthorized: Missing or invalid user token."
        });
    }

    const { zoneName } = req.body; 

    if (!zoneName) {
         return res.status(400).send({ 
            success: false, 
            message: "Bad Request: Missing zoneName."
        });
    }
    
    return res.status(200).send({
        success: true,
        message: `Successfully switched to zone ${zoneName}.`
    });
});

// --- 6. SOCKET.IO MULTIPLAYER HANDLER (FIXED DISCONNECT) ---

// The client expects io.connect(c.url.multiplayer)
io.on('connection', async (socket) => { 
    let { worldId, userToken, zone } = socket.handshake.query;

    console.log(`\n[SOCKET.IO] New connection attempt:`);
    console.log(`[SOCKET.IO DEBUG] Query: worldId=${worldId}, token present=${!!userToken}`);
    
    let authenticatedUID = null;
    if (userToken) {
        try {
            // Step 1: Verify the token using the MOCKED auth
            const decodedToken = await auth.verifyIdToken(userToken);
            authenticatedUID = decodedToken.uid;
            console.log(`[SOCKET.IO AUTH MOCK] Token verified. UID: ${authenticatedUID}`);
        } catch (error) {
            console.error("[SOCKET.IO ERROR] Token verification failed:", error.message);
        }
    }
    
    // Step 2: Check for valid credentials (Must have a verified UID and a worldId)
    if (!authenticatedUID || !worldId) { 
        console.error("[SOCKET.IO ERROR] Connection rejected: Missing required worldId or failed token verification (No authenticated UID).");
        
        // Use emit('error') before disconnecting to give the client a defined reason.
        socket.emit('error', { code: '401', message: 'Authentication required for multiplayer connection.' });
        
        // FIX: The disconnect call itself might be what is logged as 'undefined'.
        // We ensure we send a specific message first, then disconnect.
        return socket.disconnect(true);
    }

    // --- Connection Successful ---
    const userId = authenticatedUID;
    const worldRoomName = `world-${worldId}`; 
    socket.join(worldRoomName);

    console.log(`[SOCKET.IO SUCCESS] User ${userId} successfully joined room: ${worldRoomName}`); 

    // Send a simulated playerList (including the current user)
    const mockPlayerList = [
        { id: 'mock-1', name: 'Bob', position: [100, 100] },
        { id: userId, name: 'Current Wizard', position: [500, 500] } 
    ];
    socket.emit('playerList', mockPlayerList);

    // Broadcast the new player joining to others in the room
    socket.to(worldRoomName).emit('playerJoined', userId);

    socket.on('message', (data) => {
        socket.to(worldRoomName).emit('message', data);
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET.IO] User ${userId} disconnected.`);
        socket.to(worldRoomName).emit('playerLeft', userId);
    });
});


// --- 7. GAME API ENDPOINTS: /game-api/v1/save (GET: LOAD WIZARD DATA) ---

app.get('/game-api/v1/save', async (req, res) => {
    const userID = await authenticateRequest(req); 

    if (!userID) {
        return res.status(403).send({ 
            success: false, 
            message: "missing user id or token" 
        });
    }
    
    try {
        const userRef = ref(rtdb, `users/${userID}`);
        const snapshot = await get(userRef);

        let wizardData = snapshot.val(); 
        
        if (!snapshot.exists() || !wizardData) {
            console.log(`[RTDB] No save data found for user ${userID}. Returning null.`);
            return res.status(200).send({
                success: true,
                wizard: null, 
                message: "No existing save data found."
            });
        }

        console.log(`[RTDB] Successfully retrieved wizard save for user ${userID}.`);

        return res.status(200).send({
            success: true,
            wizard: wizardData, 
            message: "Wizard data loaded successfully."
        });

    } catch (error) {
        console.error(`[RTDB ERROR] Database load failed for user ${userID}:`, error);
        return res.status(500).send({
            success: false,
            message: "Internal server error during database lookup.",
            error: error.message
        });
    }
});

// --- 8. GAME API ENDPOINTS: /game-api/v1/save (POST: SAVE WIZARD DATA) ---

app.post('/game-api/v1/save', async (req, res) => {
    const userID = await authenticateRequest(req); 

    if (!userID) {
        return res.status(403).send({ 
            success: false, 
            message: "missing user id or token"
        });
    }

    const saveObject = req.body; 

    if (!saveObject || !saveObject.appearancedata) {
         return res.status(400).send({ 
            success: false, 
            message: "Invalid save data provided."
        });
    }

    try {
        const userRef = ref(rtdb, `users/${userID}`);
        await set(userRef, saveObject);

        console.log(`[RTDB] Successfully saved wizard data for user ${userID}.`);

        return res.status(200).send({
            success: true,
            message: "Wizard data saved successfully."
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

// --- 8.5. NEW MOCK ENDPOINT: /game-api/v1/cloud/save ---

app.get('/game-api/v1/cloud/save', async (req, res) => {
    const userID = await authenticateRequest(req); 

    if (!userID) {
        return res.status(403).send({ 
            success: false, 
            message: "missing user id or token"
        });
    }

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


// --- 9. START SERVER ---

server.listen(PORT, () => {
    console.log(`\n🎉 Server is running and serving game at http://localhost:${PORT}`);
    console.log(`API Endpoints: /game-api/v1/worlds, /game-api/v1/save (GET & POST), /game-api/v1/account/save, /game-api/v1/account (GET & POST), /game-api/v1/cloud/save, /game-api/v1/inventory, /game-api/v1/zones/switch, /game-api/status and WebSocket/Socket.IO listener for multiplayer connect`);
});
