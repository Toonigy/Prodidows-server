// server.js - A Node.js and Express server with Firebase integration for a real-time world list.

const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

// Import the Firebase client SDKs for app, auth, and firestore.
const { initializeApp } = require("firebase/app");
const { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } = require("firebase/auth");
const { getFirestore, collection, onSnapshot, doc, setDoc } = require("firebase/firestore");

const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

// --- Firebase Configuration and Initialization ---
// The `__firebase_config` and `__app_id` globals are provided by the environment.
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Initialize Firebase with the provided configuration.
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

let userId = null;
let isAuthReady = false;

// Authenticate the user. The `__initial_auth_token` is provided by the environment.
// We listen for the auth state change to ensure we have a valid user ID.
onAuthStateChanged(auth, async (user) => {
  if (user) {
    userId = user.uid;
    isAuthReady = true;
    console.log("✅ Firebase authenticated as user:", userId);

    // After authentication, we can set up the real-time database listener.
    setupFirestoreListener();
  } else {
    // If no user is signed in, sign in anonymously.
    try {
      if (typeof __initial_auth_token !== 'undefined') {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    } catch (error) {
      console.error("🚨 Anonymous sign-in failed:", error);
    }
  }
});

// A Map to store all active WebSocket clients connected to the world list.
const worldListWssClients = new Map();

// Helper function to broadcast the world list to all connected clients.
function broadcastWorldList(worldList) {
  // Iterate through all connected clients and send the updated list.
  worldListWssClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      // The `servers` key is used to be consistent with the original client-side code.
      ws.send(JSON.stringify({ type: "worlds", servers: worldList }));
    }
  });
}

// Set up the Firestore listener for the world list.
function setupFirestoreListener() {
  if (!isAuthReady) {
    console.warn("⚠️ Firebase authentication is not ready. Skipping Firestore listener setup.");
    return;
  }

  // Define the collection path for the public world list.
  // This path follows the security rule guidelines for shared, public data.
  const worldListCollectionPath = `/artifacts/${appId}/public/data/worlds`;
  const worldsCollection = collection(db, worldListCollectionPath);

  // Use a real-time listener (`onSnapshot`) to get updates whenever the data changes.
  onSnapshot(worldsCollection, (snapshot) => {
    const worldList = [];
    snapshot.forEach((doc) => {
      worldList.push({ id: doc.id, ...doc.data() });
    });
    console.log("🔥 Worlds data updated. Broadcasting to clients.");
    broadcastWorldList(worldList);
  }, (error) => {
    console.error("🚨 Error listening to worlds collection:", error);
  });
}

// --- WebSocket Upgrade Handler ---
// This listens for HTTP "upgrade" requests to establish a WebSocket connection.
server.on("upgrade", (req, socket, head) => {
  // Check if the request is for the world list WebSocket path.
  if (req.url === "/game-api/v2/worlds") {
    const wss = new WebSocket.Server({ noServer: true });
    wss.handleUpgrade(req, socket, head, (ws) => {
      console.log("🌐 Client connected to /game-api/v2/worlds");

      // Add the new client to our map of active clients.
      worldListWssClients.set(ws, ws);

      ws.on("close", () => {
        console.log("❌ Client disconnected from world list.");
        worldListWssClients.delete(ws);
      });

      // Once a client connects, we need to immediately send them the current
      // state of the world list. The `onSnapshot` listener will handle
      // subsequent updates.
      if (isAuthReady) {
        const worldListCollectionPath = `/artifacts/${appId}/public/data/worlds`;
        onSnapshot(collection(db, worldListCollectionPath), (snapshot) => {
          const worldList = [];
          snapshot.forEach((doc) => {
            worldList.push({ id: doc.id, ...doc.data() });
          });
          // This will only be called once for the initial data,
          // then the main listener handles all future updates.
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "worlds", servers: worldList }));
          }
        }, (error) => {
          console.error("🚨 Error getting initial world list:", error);
        });
      }
    });
  } else {
    // If the path doesn't match, reject the upgrade.
    socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
    socket.destroy();
  }
});


// Serve static files from the 'public' folder.
app.use(express.static(path.join(__dirname, "public")));

// Serve `index.html` for the root URL.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the server.
server.listen(PORT, () => {
  console.log(`✅ Server is listening on port ${PORT}`);
});
