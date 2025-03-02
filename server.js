const express = require("express");
const cors = require("cors");
const http = require("http"); // Import http module to create a server
const socketIo = require("socket.io"); // Import Socket.IO
const app = express();
const port = process.env.PORT || 3000; // Use Render's port

// Enable CORS for a specific frontend (Replace with your actual frontend URL)
const corsOptions = {
    origin: ["https://toonigy.github.io", "https://prodidows-server.onrender.com"],
    methods: "GET, POST, OPTIONS",
    allowedHeaders: "Content-Type, Authorization"
};
app.use(cors(corsOptions));

// Middleware to parse JSON requests
app.use(express.json());

// Serve static files if needed
app.use(express.static("public"));

// Handle preflight requests
app.options("*", cors(corsOptions));

// Create HTTP server and attach Socket.IO to it
const server = http.createServer(app);
const io = socketIo(server); // Initialize Socket.IO with the server

// Route for the root URL
app.get("/", (req, res) => {
    res.send("Server is running on Render!");
});

// Initialize the world list
let worlds = [
    {
        "id": 1,
        "full": 76,
        "name": "Fireplane",
        "meta": {
            "tag": "fire"
        }
    },
    {
        "id": 2,
        "full": 6,
        "name": "Waterscape",
        "meta": {
            "tag": "water"
        }
    }
];

// Handle GET request to retrieve the world list
app.get("/worlds-api/world-list", (req, res) => {
    console.log("GET /worlds-api/world-list request received");
    res.json(worlds);
});

// Handle POST request to add a new world to the list
app.post("/worlds-api/world-list", (req, res) => {
    const newWorld = req.body;
    console.log("Received request body:", newWorld);

    // Validate required fields
    if (!newWorld || !newWorld.id || !newWorld.full || !newWorld.name || !newWorld.meta) {
        return res.status(400).json({ error: "Missing required fields: id, full, name, or meta" });
    }

    // Add the new world to the list
    worlds.push(newWorld);
    console.log("New world added:", newWorld);

    res.json({ message: "World added successfully", world: newWorld });
});

// Multiplayer functionality using Socket.IO
io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Handle a player joining a world
    socket.on("joinWorld", (worldId) => {
        console.log(`Player ${socket.id} joined world ${worldId}`);

        // Broadcast to all clients that the player joined
        io.emit("playerJoined", {
            playerId: socket.id,
            worldId: worldId
        });
    });

    // Handle player actions or movements in the world
    socket.on("playerAction", (actionData) => {
        console.log(`Player ${socket.id} performed action:`, actionData);

        // Broadcast the player's action to other players
        io.emit("playerAction", {
            playerId: socket.id,
            action: actionData
        });
    });

    // Handle player disconnection
    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        // Notify other players when someone disconnects
        io.emit("playerDisconnected", {
            playerId: socket.id
        });
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server running at http://localhost:${port} or Render`);
});
