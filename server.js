const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000; // Use Render's port

// Enable CORS for all origins
app.use(cors());

// Serve static files if needed
app.use(express.static("public"));

// Middleware to parse JSON requests
app.use(express.json());

// Sample world list to start with
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

// Route for the root URL
app.get("/", (req, res) => {
    res.send("Server is running on Render!");
});

// Route to get the world list
app.get("/worlds-api/world-list", (req, res) => {
    res.json(worlds); // Return the world list as JSON
});

// Route to post a new world to the list
app.post("/worlds-api/world-list", (req, res) => {
    const newWorld = req.body;
    if (!newWorld || !newWorld.name || !newWorld.id || !newWorld.full || !newWorld.meta) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    worlds.push(newWorld);
    res.json({ message: "World added successfully", world: newWorld });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port} or https://prodidows-server.onrender.com`);
});
