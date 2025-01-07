const WebSocket = require('ws');

// Use the port provided by Render or default to 8080 for local testing
const PORT = process.env.PORT || 8080;

// Create a WebSocket server
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server is running on port ${PORT}`);

wss.on('connection', (ws) => {
    console.log('A client connected');

    // Send a welcome message to the client
    ws.send(JSON.stringify({ message: 'Welcome to the server!' }));

    // Listen for messages from the client
    ws.on('message', (data) => {
        console.log(`Received: ${data}`);
        
        // Broadcast the message to all connected clients
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });

    // Handle client disconnection
    ws.on('close', () => {
        console.log('A client disconnected');
    });
});
