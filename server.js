const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');

// Create the HTTPS server
const server = https.createServer({
  // Render handles SSL certificates automatically, so no need to set your own certs
  // You can omit these if you're using Render's default HTTPS support
  // cert: fs.readFileSync('path_to_cert.pem'),
  // key: fs.readFileSync('path_to_key.pem')
});

// Create the WebSocket server using the existing HTTPS server
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

// Listen on the port provided by Render's environment variables (e.g., 10000 or `process.env.PORT`)
server.listen(process.env.PORT || 8080, () => {
    console.log(`WebSocket server is up and running on port ${process.env.PORT || 8080}`);
});
