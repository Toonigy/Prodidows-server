const express = require("express");
const http = require("http");
const https = require("https"); // Import https module for WSS
const fs = require("fs");     // Import fs module for file system operations
const cors = require("cors"); 
const path = require("path");
const World = require("./World"); 
const WorldSystem = require("./WorldSystem"); 

const app = express();
const PORT = process.env.PORT || 10000;

let server; // Declare server variable outside try/catch

// --- SSL/TLS Certificate Configuration (for WSS) ---
// Make sure 'cert.pem' and 'key.pem' files exist in a 'certs' folder in your project root.
const privateKeyPath = path.join(__dirname, 'certs', 'key.pem');
const certificatePath = path.join(__dirname, 'certs', 'cert.pem');

try {
  // Check if certificate files exist before creating HTTPS server
  if (fs.existsSync(privateKeyPath) && fs.existsSync(certificatePath)) {
    const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    const certificate = fs.readFileSync(certificatePath, 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    // Create an HTTPS server
    server = https.createServer(credentials, app);
    console.log("✅ HTTPS server created. Ready for WSS connections.");
  } else {
    // Fallback to HTTP if certificates are not found
    console.warn("SSL/TLS certificates (key.pem, cert.pem) not found in 'certs/' folder.");
    console.warn("Starting HTTP server instead of HTTPS. Socket.IO will be WS, not WSS.");
    server = http.createServer(app);
  }
} catch (error) {
  console.error("❌ ERROR: Failed to create HTTPS server. Check 'certs/' folder and certificate files (key.pem, cert.pem).");
  console.error("Falling back to HTTP. Socket.IO will be WS, not WSS.");
  server = http.createServer(app); // Fallback to HTTP
}


app.use(cors()); 
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); 

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ⭐ Socket.IO Server Setup ⭐
// The Socket.IO server is now attached to the 'server' variable,
// which could be either HTTP or HTTPS.
const { Server } = require("socket.io"); 
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development. Restrict in production.
        methods: ["GET", "POST"]
    }
});
console.warn("Socket.IO server setup complete. Using HTTP/HTTPS as determined by main server setup.");


// --- HTTP Endpoints for API Calls ---
app.get("/v2/worlds", (req, res) => {
    const simplifiedWorlds = World.allWorlds
        .filter(world => world instanceof World && typeof world.toSimplifiedObject === 'function')
        .map(world => world.toSimplifiedObject());
    res.status(200).json(simplifiedWorlds);
});

app.get("/game-api/v1/world-list", (req, res) => {
    const simplifiedWorlds = World.allWorlds
        .filter(world => world instanceof World && typeof world.toSimplifiedObject === 'function')
        .map(world => world.toSimplifiedObject());
    res.status(200).json(simplifiedWorlds);
});

app.post("/game-api/v1/log-event", (req, res) => {
    res.status(200).json({ status: "received", message: "Game event logged." });
});

app.post("/game-api/v1/matchmaking-api/begin", (req, res) => {
    res.status(200).json({ status: "success", message: "Matchmaking request received." });
});


// --- Socket.IO Connection Handling ---
const worldSystems = {};
World.allWorlds.forEach(world => {
    const system = new WorldSystem(world);
    worldSystems[world.path] = system; 
});

io.on("connection", (socket) => {
    const requestPath = socket.handshake.url; 
    const worldSystem = worldSystems[requestPath];

    if (worldSystem) {
        worldSystem.handleConnection(socket);
    } else {
        console.warn(`\n--- Socket.IO Warning ---`);
        console.warn(`No WorldSystem found for path: ${requestPath}. Disconnecting socket.`);
        socket.disconnect(true);
        console.log(`-------------------------\n`);
    }
});


// --- Server Startup ---
server.listen(PORT, () => {
    console.log(`\n--- Server Startup ---`);
    console.log(`✅ Server is listening on port ${PORT}...`);
    if (server instanceof https.Server) {
      console.log(`🌐 Serving HTTP/S & Socket.IO over WSS.`);
    } else {
      console.log(`🌐 Serving HTTP & Socket.IO over WS (SSL/TLS certificates not found or invalid).`);
    }
    console.log(`Defined worlds:`);
    World.allWorlds.forEach(world => {
        console.log(`  - ID: ${world.id}, Name: "${world.name}", Path: "${world.path}"`);
    });
    console.log(`-----------------------\n`);
});
