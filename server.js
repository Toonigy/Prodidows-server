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
    res.json(worlds);
});

// Handle POST request to add a new world to the list
app.post("/worlds-api/world-list", (req, res) => {
    const newWorld = req.body;

    // Log the request body for debugging
    console.log('Received request body:', newWorld);

    // Check if the required fields are present
    if (!newWorld || !newWorld.id || !newWorld.full || !newWorld.name || !newWorld.meta) {
        return res.status(400).json({ error: "Missing required fields: id, full, name, or meta" });
    }

    // Add the new world to the list
    worlds.push(newWorld);

    // Respond with a success message
    res.json({ message: "World added successfully", world: newWorld });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port} or Render`);
});
