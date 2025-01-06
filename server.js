const WebSocket = require('ws');
const http = require('http');

// Create the HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WebSocket server running...');
});

// Create the WebSocket server using the existing HTTP server
const wss = new WebSocket.Server({ server });

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

// Only call listen() once
server.listen(process.env.PORT || 8080, () => {
    console.log(`WebSocket server is up and running on port ${process.env.PORT || 8080}`);
});
