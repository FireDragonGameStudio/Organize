# maXR Organize - Frontend

The frontend for maXR Organize is an immersive 3D application and management dashboard built with Angular 18 and Three.js. It visualizes requirements traceability data as a hierarchical radial graph in both standard web browsers and WebXR-compatible VR headsets, while providing standard 2D tools for managing the data.

## 🛠️ Tech Stack
* **Framework**: Angular 18 (Standalone Components)
* **3D Engine**: Three.js
* **XR API**: WebXR (via Three.js `XRButton`)
* **Styling**: Vanilla CSS (Glassmorphism design system)
* **Components**: Angular Material

## 📁 Architecture Overview
* `src/app/components/` - The UI modules of the application.
  * `dashboard/` & `project-details/` - Standard 2D management views for navigating projects.
  * `requirement-editor/` - An inline-editable Angular Material data grid (`MatTable`) for creating, editing, bulk-selecting/editing/deleting requirements, and managing their trace links via multi-select dropdowns.
  * `traceability-matrix/` - A recursive hierarchical tree view (User → System → Design Input/Software) for analyzing traceability links, plus an orphaned-requirements section.
  * `graph-3d/` - The core component handling all 3D rendering and XR logic.
    * `graph-3d.component.ts` - Manages the Three.js scene, rendering loop, desktop/VR interaction models, radial graph layout algorithms, and real-time WebSocket data merging.
* `src/app/services/`
  * `project.service.ts` - REST API client for fetching the requirements hierarchy from the backend.
  * `websocket.service.ts` - Maintains a live WebSocket connection to trigger graph rebuilds when backend data changes.

## 🥽 WebXR Integration
The application uses Three.js's native WebXR support to provide a full 6-DOF VR experience. 
* **Oculus Hand Tracking**: Leverages `OculusHandModel` and `OculusHandPointerModel` to render the user's hands and provide laser pointers.
* **Wrist UI**: The details panel (`VrUi` class) is rendered dynamically to an offscreen Canvas, applied as a texture to a 3D Plane, and parented to the user's left hand/controller tracking space.
* **Interactions**: Users select nodes by aiming their hand laser and performing a pinch gesture. The UI automatically scales and billboard-faces the camera.

## 💻 Desktop Controls
For users without VR headsets, the application falls back to a highly capable desktop mode:
* **OrbitControls**: Mouse dragging rotates the camera around the focal point.
* **Flight Controls**: `WASD` (horizontal translation) and `Q`/`E` (vertical translation) allow the user to fly through the graph relative to their look direction, ensuring OrbitControls remain smooth while exploring large datasets.

## 💡 Graph Focus Mode
To manage complexity, the graph features an intelligent Focus Mode:
* Selecting (or hovering over) a node locks the focus.
* The focal node and its entire traceability chain (parents and children) are brightly highlighted.
* All unrelated nodes, edges, and text labels fade into a dark, translucent state, eliminating visual clutter.

## 🚀 Running the Frontend

> **CRITICAL**: WebXR APIs are restricted to Secure Contexts. You MUST run the Angular development server with SSL enabled to test VR functionality on a headset.

```bash
# Serve over HTTPS on your local network
npx @angular/cli serve --host 0.0.0.0 --ssl true
```

* Navigate to `https://localhost:4200` on your desktop.
* Navigate to `https://<YOUR_LOCAL_IP>:4200` on your VR headset's browser.
