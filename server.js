const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const port = process.env.PORT || 3000;

const corsOptions = {
    origin: ["https://toonigy.github.io", "https://prodidows-server.onrender.com", "https://xpmuser.github.io", "http://localhost"],
    methods: ["GET", "POST"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Attach WebSocket server to the HTTP server
const io = new Server(server, {
    cors: {
        origin: ["https://toonigy.github.io", "https://prodidows-server.onrender.com", "https://xpmuser.github.io", "http://localhost"],
        methods: ["GET", "POST"],
        credentials: true,
        transports: ["websocket"] // Ensure WebSocket support
    }
});

// Socket.io Event Handling
io.on("connection", (socket) => {
    console.log(`A user connected: ${socket.id}`);

    socket.on("joinWorld", (worldId) => {
        console.log(`Player ${socket.id} joined world ${worldId}`);
        io.emit("playerJoined", { playerId: socket.id, worldId });
    });

    socket.on("disconnect", () => {
        console.log(`Player disconnected: ${socket.id}`);
        io.emit("playerDisconnected", { playerId: socket.id });
    });
});

// Start the server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
