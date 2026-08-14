import express from 'express';
import http from 'http';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

// Routes
import projectsRouter from './routes/projects';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Load Swagger Document
const swaggerDocument = YAML.load(path.join(__dirname, '../docs/openapi.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// REST API Routes
app.use('/api/projects', projectsRouter);

// Export a global broadcast helper for the REST routes to use
export function broadcast(payload: any) {
    const message = JSON.stringify(payload);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// WebSocket setup
wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    console.log('Client connected to WebSocket');
    
    ws.on('message', (message: string) => {
        // We no longer echo messages. The backend is the source of truth.
        console.log(`Received client message (ignored) => ${message}`);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Swagger UI is available at http://localhost:${PORT}/api-docs`);
});
