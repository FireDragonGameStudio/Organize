# maXR Organize

**maXR Organize** is a full-stack Requirements Traceability management and visualization tool built for the spatial computing era. It allows systems engineers to explore complex requirements hierarchies (User Requirements -> System Requirements -> Design/Software Requirements) in a fully immersive 3D environment.

## 🚀 Key Features

* **3D Traceability Graph**: Visualize complex requirement traceability links as a node-based force-directed 3D graph.
* **WebXR Integration**: Native support for Meta Quest and other WebXR-compatible headsets.
* **Hand Tracking**: Intuitive Oculus hand-tracking controls (pinch to select, point to raycast) in VR.
* **Desktop Flight Mode**: Full 6-DOF flight controls (WASD + QE) and OrbitControls for exploring the graph seamlessly in a standard web browser.
* **Real-time Synchronization**: WebSocket integration ensures that updates to the requirement database are instantly reflected in the 3D graph.
* **Focus Mode**: Selecting a requirement dims unrelated nodes and highlights its entire traceability chain, reducing visual clutter.

## 🏗️ Architecture

The project is structured as a monorepo containing two main parts:

* **`/backend`**: A Node.js + Express server written in TypeScript. It provides a REST API, Swagger documentation, and a WebSocket server for real-time requirement updates.
* **`/frontend`**: An Angular 18 application that utilizes `three.js` and WebXR to render the interactive 3D graph.

## 🏁 Getting Started

### Prerequisites
* Node.js (v18 or higher recommended)
* npm

### Starting the Backend
1. Navigate to the backend directory: `cd backend`
2. Install dependencies: `npm install`
3. Start the server in dev mode (hot-reload via `nodemon` + `ts-node`, no build step needed): `npm run dev`
   * For a production-style run instead: `npm run build` (compiles `src/` → `dist/`) then `npm start` (runs `dist/index.js`) — `npm start` alone fails on a fresh checkout since `dist/` doesn't exist yet.
*The backend will run on `http://localhost:3000` (Swagger UI at `/api-docs`).*

### Starting the Frontend
> **Important**: WebXR requires a secure context (HTTPS). The Angular dev server must be run with the `--ssl` flag.

1. Navigate to the frontend directory: `cd frontend`
2. Install dependencies: `npm install`
3. Start the Angular server with SSL: `npx @angular/cli serve --host 0.0.0.0 --ssl true`
4. On your local machine, open `https://localhost:4200`.
5. On your VR headset, navigate to your computer's local IP address (e.g., `https://192.168.x.x:4200`). You will need to accept the self-signed certificate warning in your headset's browser.

## 🥽 Controls

**Desktop Mode:**
* **Look/Rotate**: Left-Click & Drag
* **Pan**: Right-Click & Drag
* **Fly**: `W`, `A`, `S`, `D` (Horizontal) / `Q`, `E` (Vertical)
* **Select Node**: Left-Click on a node

**WebXR Mode:**
* **Select Node**: Aim your hand-controller laser pointer at a node and perform a pinch gesture.
* **UI Panel**: The details panel will automatically spawn attached to your left wrist for easy reading while exploring.
