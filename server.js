const WebSocket = require('ws');
const http = require('http');

// Create an HTTP server to support WebSocket connections
const server = http.createServer();
const wss = new WebSocket.Server({ server });

server.listen(process.env.PORT || 8080, () => {
    console.log(`Server running on port ${process.env.PORT || 8080}`);
});

// Handle WebSocket connections
wss.on('connection', (socket) => {
    console.log('A client connected.');

    socket.on('message', (message) => {
        console.log(`Received: ${message}`);
        
        // Broadcast the message to all connected clients
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    socket.on('close', () => {
        console.log('A client disconnected.');
    });

    socket.send('Welcome to the WebSocket server!');
});

// Start the HTTP server
server.listen(process.env.PORT || 8080, () => {
    console.log('WebSocket server is up and running!');
});

