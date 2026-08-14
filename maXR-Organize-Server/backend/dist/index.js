"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcast = broadcast;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yamljs_1 = __importDefault(require("yamljs"));
const path_1 = __importDefault(require("path"));
// Routes
const projects_1 = __importDefault(require("./routes/projects"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Load Swagger Document
const swaggerDocument = yamljs_1.default.load(path_1.default.join(__dirname, '../docs/openapi.yaml'));
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocument));
// REST API Routes
app.use('/api/projects', projects_1.default);
// Export a global broadcast helper for the REST routes to use
function broadcast(payload) {
    const message = JSON.stringify(payload);
    wss.clients.forEach(client => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(message);
        }
    });
}
// WebSocket setup
wss.on('connection', (ws, req) => {
    console.log('Client connected to WebSocket');
    ws.on('message', (message) => {
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
