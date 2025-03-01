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

// Handle world list
let worlds = [];

app.get("/world-list", (req, res) => {
    res.json(worlds);
});

app.post("/world-list", (req, res) => {
    const newWorld = req.body;
    if (!newWorld || !newWorld.name) {
        return res.status(400).json({ error: "World name is required" });
    }
    worlds.push(newWorld);
    res.json({ message: "World added!", world: newWorld });
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port} or Render`);
});
