const express = require("express");
const http = require("http");
const path = require("path");
const World = require("./World"); // Import the World class.
const WebSocket = require("ws"); // Import WebSocket for broadcasting

// --- NEW: Firebase Admin SDK imports and setup ---
const admin = require("firebase-admin");
// IMPORTANT: You will need to ensure this path is correct in your Render deployment.
// It should point to where you've stored the service account key.
const serviceAccount = require("./prodidows-backend-firebase-adminsdk-fbsvc-fd603bf56e.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // IMPORTANT: Replace this with your actual database URL from the Firebase Console
  databaseURL: "https://prodidows-backend.firebaseio.com"
});

const db = admin.firestore();

const app = express();
// Render automatically provides a PORT environment variable.
const PORT = process.env.PORT || 10000;

const server = http.createServer(app);

// Map world paths to their corresponding WebSocket server instances.
const worldWebSocketServers = new Map();

// --- NEW: Asynchronous function to get world list from Firestore ---
// This function now reads directly from the database
async function getWorlds() {
  const worldList = [];
  try {
    // IMPORTANT: Replace 'YOUR_APP_ID' with the actual document ID you created in the 'artifacts' collection
    const worldsRef = db.collection('artifacts').doc('YOUR_APP_ID').collection('public').doc('data').collection('worlds');
    const snapshot = await worldsRef.get();
    
    if (snapshot.empty) {
      console.log('No worlds found in Firestore.');
      return [];
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      worldList.push({
        name: data.name,
        path: data.path,
        icon: data.icon,
        full: data.full // Use the live player count from the database
      });
    });
    return worldList;

  } catch (error) {
    console.error('🚨 Error getting world list from Firestore:', error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

// Function to broadcast the updated world list to all connected clients.
// This function is now async to handle the database call.
async function broadcastWorldList() {
  try {
    const worldList = await getWorlds();
    // We need to iterate through all WebSocket clients and send the updated list.
    // This is a placeholder for a more robust broadcasting system.
    worldWebSocketServers.forEach(wssInstance => {
      wssInstance.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: "worlds", servers: worldList }));
        }
      });
    });
  } catch (error) {
    console.error("🚨 Failed to broadcast world list:", error);
  }
}

// --- World class instances and WebSocket handling remain the same ---
// Create and manage your worlds here.
const worlds = [
  // The World constructor now receives a callback function to handle player count changes.
  new World("Fireplane", "/worlds/fireplane", "fire", 100, () => broadcastWorldList())
];

worlds.forEach(world => {
  worldWebSocketServers.set(world.path, world.wss);
});

// --- UPDATED: API Endpoint for world list as JSON. ---
// This now handles the GET request for the world list by calling the async function.
app.get("/v2/game-api/worlds", async (req, res) => {
  try {
    const worlds = await getWorlds();
    res.json({ worlds });
  } catch (error) {
    console.error("🚨 Error getting world list for GET request:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Serve static files from a 'public' folder.
app.use(express.static(path.join(__dirname, "public")));

// Serve `index.html`
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Upgrade WebSocket
server.on("upgrade", (req, socket, head) => {
  const wssInstance = worldWebSocketServers.get(req.url);
  
  if (wssInstance) {
    wssInstance.handleUpgrade(req, socket, head, (ws) => {
      wssInstance.emit("connection", ws, req);
    });
  } else {
    // Refuse upgrade for other paths
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

