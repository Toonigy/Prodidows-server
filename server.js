const WebSocket = require('ws');

// Create a WebSocket server
const server = new WebSocket.Server({ port: 8080 });

console.log("WebSocket server running on ws://localhost:8080");

server.on('connection', (socket) => {
    console.log('A client connected.');

    // Listen for messages from clients
    socket.on('message', (message) => {
        console.log(`Received: ${message}`);
        
        // Broadcast the message to all clients
        server.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    // Handle client disconnection
    socket.on('close', () => {
        console.log('A client disconnected.');
    });

    // Send a welcome message to the new client
    socket.send('Welcome to the WebSocket server!');
});
