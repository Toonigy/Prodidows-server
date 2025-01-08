const WebSocket = require('ws');

// Use the port provided by Render or default to 8080 for local testing
const PORT = process.env.PORT || 8080;

// Create a WebSocket server
const wss = new WebSocket.Server({ port: PORT });

console.log(`WebSocket server is running on port ${PORT}`);

// Object to hold clients grouped by worlds
const worlds = {};

wss.on('connection', (ws) => {
    console.log('A client connected');

    // Initialize the client's world
    let clientWorld = null;

    // Send a welcome message to the client
    ws.send(JSON.stringify({ message: 'Welcome to the server! Please join a world.' }));

    // Listen for messages from the client
    ws.on('message', (data) => {
        try {
            const parsedData = JSON.parse(data);

            // Handle joining a world
            if (parsedData.type === 'join') {
                const worldName = parsedData.world;

                // Leave the previous world (if any)
                if (clientWorld) {
                    worlds[clientWorld] = worlds[clientWorld].filter(client => client !== ws);
                    if (worlds[clientWorld].length === 0) delete worlds[clientWorld];
                    console.log(`Client left world: ${clientWorld}`);
                }

                // Join the new world
                clientWorld = worldName;
                if (!worlds[clientWorld]) worlds[clientWorld] = [];
                worlds[clientWorld].push(ws);

                ws.send(JSON.stringify({ message: `You joined world: ${clientWorld}` }));
                console.log(`Client joined world: ${clientWorld}`);
                return;
            }

            // Broadcast messages to all clients in the same world
            if (parsedData.type === 'message' && clientWorld) {
                const message = parsedData.message;
                console.log(`Message in world "${clientWorld}": ${message}`);
                worlds[clientWorld].forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ world: clientWorld, message }));
                    }
                });
                return;
            }

            // Handle invalid or unknown message types
            ws.send(JSON.stringify({ error: 'Invalid message type or command.' }));
        } catch (err) {
            console.error('Error parsing message:', err);
            ws.send(JSON.stringify({ error: 'Invalid JSON format.' }));
        }
    });

    // Handle client disconnection
    ws.on('close', () => {
        if (clientWorld) {
            worlds[clientWorld] = worlds[clientWorld].filter(client => client !== ws);
            if (worlds[clientWorld].length === 0) delete worlds[clientWorld];
            console.log(`Client disconnected from world: ${clientWorld}`);
        }
        console.log('A client disconnected');
    });
});
