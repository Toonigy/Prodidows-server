// server.js - A Node.js and Express server that uses the Firebase Admin SDK
// to provide a real-time, WebSocket-based world list from Firestore.

const express = require("express");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

// Import the Firebase Admin SDK for server-side database access.
const admin = require('firebase-admin');

// --- Server Setup ---
const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

// A Map to store all active WebSocket clients connected to the world list.
const worldListWssClients = new Map();

// --- Firebase Admin SDK Initialization ---
// The `__firebase_admin_config` is now hardcoded with the content of your service account key.
// The `__app_id` is provided by the environment.
const firebaseAdminConfig = {
  "type": "service_account",
  "project_id": "prodidows-backend",
  "private_key_id": "fd603bf56e42051aae770fa242a8bbee217558ab",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDAS3JTBMbCFaDY\n1b9dtmax7c8cMR7UVOsWUiboTOUrDd27t1BbPpWwaUXK9kEi2Pi8UUcqRKc/bER8\nUswck/bWdgrzInlDulkQjcdqNINk1Oeo1L1wAgMWr0WdsP9FM9ag/c37vqrT7du7\n79s6KSaax8GL6RxEqA/13BnxqbeynxXw/tlu7OfNZxRgDwAKtv5MC0apuCV7t9I6\nikZcZZrOmgHay0OR7veM5oeccyegeAtnzXO3Mw6pjA5p1FXV7w7ld7ZtM6B1BPKo\nfQDLCDrHhnBVYbgzmxuZ8t4/lq85drpbJQt3SPJ45MT1aNjZoyXc7hfAC1d7jxwS\n0nbIlrCbAgMBAAECggEAKo7oHACUHrNbuHHCGzL50opPyq0CZjrvFq8S5lnSZG96\nsgd1tOQKjBMYe715mAVOM5uHdQ7htxM2qw9GFlMXD8rrTHlGPluZR6UhS9uYcvH9\n3WtMC+SeG2CqNybLsFyzNUlG098UfrgHaDZDHkGqRhpMtzLd60II2kCey1HlEpZo\n86Tl0FN9h+ktT8cTA8Aqw7VjxgBtZFkJpfQQRvcyCZmzD0aNVLCB/hb5FEKfxtPb\n+UQq+piwNeyDVXSItZtOP7199htAMkC9IE/+o9Bkl66Z3lDaCcC6SZ/oZESgMoOC\nNoXfF0OW9MviKh8CIpY/7+/4eboipxxZCiofVx/q+QKBgQD7Q78S7irN+o8ex/Wi\nSZswxUSd12G1JlMqzKk3B6WVgNEUxDJ+7ocZZlwI3UGzm4m6W82tm+yoHsBnlV58\nysB82GpgHdvTzg0usSyHTmxijXa1GMMiYhSUr9rSpwBBaByTDxMKpBD5zJu5kcWD\nY2+a2CiXksurOv6zBtSTzf7McwKBgQDD6zGBoUE3bIQMfJFMsK6u7tO6uGgd6diT\nyQb552AaeCzdXOJ67c1S5sy7PvJoaBfk2h5bQCjwE0/cajqqXdgQJf7laXOywFBe\nfP2yxa/O3wMX4+0F5qgEP11vTg16Di2ei/g0yIvUe/sfLKf64b4y2KYcvCE/NUJs\nKWt0swBpOQKBgQCtoZsgkcSyojrUoolzpDnB8hAAox25+MnwAY3NoVMjhOj22L2s\nSVjCjKF83qjQXONIDLiNB/r6EoYTDn1E7zclDsgzs259Zx5k7bo/pknvsKIfcwUl\ndXGTbhJhD1Z13GQim4AlEktI08Oo8Lr0mHo/HrCuTZrAsPvg6w9rNCanUQKBgGTQ\n1jzaefDHSnwSbcKE+J7UDuf6lLkv6F7EB275fR6h0JRog7K2Q/3w/lEsZxkK16DQ\nDObv8SD5DxNhJqcce15z7uKmjP7ir3iv4OzphTpyz+ivRPzQYI0u/imUhKLWQOth\nI2wl9q50zhiQpjAXkgQgL/qBZKpeAbwe5Ei9A+0hAoGBAMV5LGCKrcxv3T+B524g\n5j7l/6+5iJ/qe4cJdn+dDuPJa60/9PYZRrW2/hGEN+M0pLxcAK7WrBreMWC2vUvu\nFtp0taFwEzb0T9riybqjgUlxyHlashJJlZHKbpFu9U0FWgjyfmurk0kFr3ZZ1vLS\nNXHLavTLfpLy1IXxwg/tGB5P\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@prodidows-backend.iam.gserviceaccount.com",
  "client_id": "114486745540291157696",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40prodidows-backend.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
};

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

try {
  // Initialize the Admin SDK with a service account, which allows for full access.
  admin.initializeApp({
    credential: admin.credential.cert(firebaseAdminConfig)
  });
} catch (error) {
  console.error("🚨 FATAL ERROR: Firebase Admin SDK initialization failed.", error);
  // It's important to exit if the app can't connect to Firebase.
  process.exit(1);
}


// Get a reference to the Firestore database.
const db = admin.firestore();

// --- Real-time Firestore Listener and WebSocket Broadcaster ---
// Define the collection path for the public world list.
const worldListCollectionPath = `/artifacts/${appId}/public/data/worlds`;
const worldsCollection = db.collection(worldListCollectionPath);

// Use a real-time listener (`onSnapshot`) to get updates whenever the data changes.
try {
  worldsCollection.onSnapshot(snapshot => {
    const worldList = [];
    snapshot.forEach(doc => {
      worldList.push({ id: doc.id, ...doc.data() });
    });
    console.log("🔥 Worlds data updated in Firestore. Broadcasting to clients.");
    worldListWssClients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "worlds", servers: worldList }));
      }
    });
  }, err => {
    console.error("🚨 Error listening to worlds collection:", err);
  });
} catch (error) {
  console.error("🚨 An error occurred while setting up the Firestore listener:", error);
}

// --- NEW: HTTP GET endpoint for the world list ---
// This handles the standard GET request that your jQuery code is likely making.
app.get("/game-api/v2/worlds", async (req, res) => {
  console.log("📄 Received a GET request for the world list.");
  try {
    const snapshot = await worldsCollection.get();
    const worldList = [];
    snapshot.forEach(doc => {
      worldList.push({ id: doc.id, ...doc.data() });
    });
    res.json({ worlds: worldList });
  } catch (err) {
    // This is the key change: logging the full error object for better debugging.
    console.error("🚨 Error getting world list for GET request:", err);
    res.status(500).send("Internal Server Error");
  }
});


// --- WebSocket Upgrade Handler ---
// This listens for HTTP "upgrade" requests to establish a WebSocket connection.
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/game-api/v2/worlds") {
    const wss = new WebSocket.Server({ noServer: true });
    wss.handleUpgrade(req, socket, head, async (ws) => {
      console.log("🌐 Client connected to /game-api/v2/worlds");
      worldListWssClients.set(ws, ws);
      ws.on("close", () => {
        console.log("❌ Client disconnected from world list.");
        worldListWssClients.delete(ws);
      });
      try {
        const snapshot = await worldsCollection.get();
        const worldList = [];
        snapshot.forEach(doc => {
          worldList.push({ id: doc.id, ...doc.data() });
        });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "worlds", servers: worldList }));
        }
      } catch (err) {
        console.error("🚨 Error getting initial world list for WebSocket:", err);
      }
    });
  } else {
    socket.write("HTTP/1.1 404 Not Found\\r\\n\\r\\n");
    socket.destroy();
  }
});


// --- Express Static File Serving ---
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
