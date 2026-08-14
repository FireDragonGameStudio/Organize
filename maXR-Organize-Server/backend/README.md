# maXR Organize - Backend

The backend for maXR Organize is a robust Node.js application built with Express and TypeScript. It serves as the data provider and real-time synchronization hub for the 3D frontend.

## 🛠️ Tech Stack
* **Runtime**: Node.js
* **Framework**: Express.js
* **Language**: TypeScript
* **Real-time**: `ws` (WebSockets)
* **Documentation**: `swagger-ui-express`

## 📁 Directory Structure
* `src/` - TypeScript source code
  * `index.ts` - Express app + HTTP server setup, WebSocket server, Swagger UI mount, `broadcast()` helper
  * `routes/` - API route definitions (`projects.ts`, `files.ts`) — thin, delegate to `services/`
  * `services/` - Core business logic and file system operations (`projectService.ts`, `fileService.ts`) — reads/writes the JSON files directly, no controllers/models layer
* `docs/openapi.yaml` - OpenAPI spec served by Swagger UI (currently incomplete — see below)
* `data/projects/` - The JSON-based local database: one folder per project (`meta.json` + one JSON file per requirement type)
* `uploads/` - Multer's transient staging directory for file uploads; files are deleted immediately after being parsed
* `dist/` - Compiled JavaScript output

## 🔌 API Endpoints
The backend provides a RESTful API for querying the requirements hierarchy.
Full API documentation can be explored interactively via Swagger UI:
* **Swagger UI**: `http://localhost:3000/api-docs`

### Key Routes
`:fileType` is one of `user` | `system` | `design_input` | `software`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create a project (`{ name }`) |
| DELETE | `/api/projects/:id` | Delete a project |
| GET | `/api/projects/:projectId/files/:fileType` | List requirements of one type |
| POST | `/api/projects/:projectId/files/:fileType` | Bulk upload/replace a file (multipart, JSON or CSV) |
| POST | `/api/projects/:projectId/files/:fileType/requirements` | Add one requirement |
| PUT | `/api/projects/:projectId/files/:fileType/requirements/bulk` | Bulk update requirements |
| DELETE | `/api/projects/:projectId/files/:fileType/requirements/bulk` | Bulk delete requirements |
| PUT | `/api/projects/:projectId/files/:fileType/requirements/:reqId` | Update one requirement |
| DELETE | `/api/projects/:projectId/files/:fileType/requirements/:reqId` | Delete one requirement |
| POST | `/api/projects/:projectId/files/:fileType/requirements/:reqId/change-type` | Move a requirement to a different type (`{ newFileType }`) |

**Note:** `docs/openapi.yaml` (and therefore the Swagger UI below) does not
yet document the single-requirement create, the two `/requirements/bulk`
routes, or `/change-type` — this table is the complete, code-accurate list.

Whenever a requirement's `traceLinks` change (create/update/delete/bulk),
`FileService` also rewrites the *other* end of each added/removed link on
whichever file it lives in, so `traceLinks` stays a consistent bidirectional
adjacency list across all 4 files — a single write can silently touch more
than one JSON file, though only the primary requirement's own mutation
triggers a WebSocket broadcast.

## 📡 WebSockets
The server exposes a WebSocket endpoint at `ws://localhost:3000` (the `ws`
server is attached to the same HTTP server/port as Express, with no path
filtering or auth — any connection is accepted and receives every
broadcast for every project). There is no file watcher: broadcasts are
fired explicitly from inside the REST route handlers immediately after a
mutation, not by watching the `data/` directory. Message shape is
`{ type, projectId, [fileType], data }`; `type` is one of `PROJECT_CREATED`,
`PROJECT_DELETED`, `FILE_REPLACED`, `REQUIREMENT_CREATED`,
`REQUIREMENT_UPDATED`, `REQUIREMENT_DELETED`, `REQUIREMENT_TYPE_CHANGED`,
`REQUIREMENTS_BULK_UPDATED`, `REQUIREMENTS_BULK_DELETED`. Clients don't need
to parse the payload to benefit from it — treating any message as "something
changed, refetch" is sufficient and is what both the frontend and the Specs
Lens client do.

## 🚀 Running the Server

### Development Mode
Runs the server with hot-reloading via `nodemon` (using `ts-node` to run
`src/index.ts` directly, no separate build step):
```bash
npm run dev
```

### Production Build
Compiles the TypeScript code to `dist/` and runs it:
```bash
npm run build
npm start
```
