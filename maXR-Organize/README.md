# maXR-Organize — Requirements Trace Graph

A Lens Studio (Spectacles AR) experience that renders a live, interactive 3D
visualization of a requirements-traceability graph for a medical-device-style
V-model: **User Requirements → System Requirements → {Design Input
Requirements, Software Requirements}**.

It pulls real requirements data from a local **maXR requirements backend**
(REST + WebSocket), lays the hierarchy out as a 3-layer radial graph in
world space, and lets the user select a node, change its type, and add/remove
trace links — all of which are pushed back to the backend and kept in sync
live across clients.

## What it does

- Fetches requirements from `http://localhost:3000` on start; falls back to a
  bundled 21-item demo dataset (a fictional "Telesurgery Robot" project) if
  the backend is unreachable or returns unusable data.
- Renders each requirement as a sphere node with a persistent name label,
  colored and positioned by type, clustered under its parent in a 3-layer
  radial hierarchy (UR ring on top, SR clusters beneath each UR, DIR/SWR
  clusters beneath each SR).
- Tap a node to select it: opens a detail panel showing its title,
  description, "Traces to" / "Traced by" lists, and highlights it plus its
  directly-connected neighbors in the graph (dimming everything else).
- From the detail panel: reassign the requirement's type (UR/SR/DIR/SWR),
  add a new trace link (arm "Add Trace", then tap the target node in the 3D
  graph), or remove an existing link from either list.
- Every edit — type change, trace-link add, trace-link remove — is persisted
  back to the backend asynchronously. Local edits apply immediately (UI never
  waits on the network); a failed persist is logged but never rolled back.
- Live sync: a WebSocket connection to the backend re-fetches the full
  requirement set whenever *anything* changes there (from this Lens or any
  other client), so the graph reflects concurrent edits without restarting
  the Lens.

## Architecture

```
TraceGraphMain (orchestrator)
 ├─ TraceGraphState       — in-memory data model, mutation logic
 ├─ TraceGraphBackendData — REST + WS I/O against the maXR backend
 ├─ TraceGraphMockData    — bundled demo dataset (fallback)
 ├─ TraceGraphRenderer    — procedural 3D graph (nodes, edges, selection)
 │   ├─ TraceGraphLayout    — pure radial layout algorithm
 │   ├─ TraceGraphNodeView  — node/edge SceneObject construction helpers
 │   └─ TraceGraphTapInteraction — per-node SIK tap/hover wrapper
 ├─ TraceGraphLegendUI    — HUD: title + per-type live counts
 └─ TraceGraphDetailUI    — selected-node panel: type change, trace-link edit
```

`TraceGraphTypes.ts` holds the shared `Requirement` model and hierarchy
constants used by every module above.

### Identity vs. display name

Every requirement has two separate identifiers, and the split matters
throughout the codebase:

- **`id`** — a globally unique UUID, assigned once and never reassigned. This
  is the only thing used for lookups, Map keys, trace-link references, and
  selection tracking.
- **`name`** — a human-readable display string (`"SR-02"`). Regenerated
  whenever a requirement's type changes (see below). Safe to show in UI;
  never used as a key.

Keeping these separate means a type change (which renames the requirement)
never has to cascade-update any reference to it anywhere in the app.

### Data model (`TraceGraphState.ts`)

`TraceGraphState` is a plain class (no scene access) holding a
`Map<id, Requirement>` — the single source of truth for the currently
displayed dataset. `TraceGraphMain` is its sole owner/caller.

- **`traceLinks` is strictly downward-only.** A requirement's `traceLinks`
  array holds the IDs of what it decomposes into (a UR's traceLinks are SR
  ids; an SR's are DIR/SWR ids; DIR/SWR always have an empty array). The
  reverse ("traced by") is never stored — it's computed on demand by scanning
  every requirement's `traceLinks` for a match.
- **Hierarchy is strictly enforced**: `UR → SR`, `SR → {DIR, SWR}`, `DIR/SWR →`
  (nothing). `addTraceLink()` rejects any pairing outside this table, plus
  self-links, duplicates, and cycles.
- **`setType(id, newType)`** changes a requirement's type, regenerates its
  `name` (see below), and prunes any now-invalid trace links in either
  direction (silently — this is a documented, deliberate design choice, not a
  bug).
- **Renaming (`nextNameForType`)** starts from `(count of requirements of
  that type) + 1` and probes upward past collisions, rather than scanning for
  `(max existing numeric suffix) + 1`. The count-based approach was chosen
  after a live bug: real backend data contains outlier records (e.g. a stray
  `UR-970991`), and a max-based scheme would permanently propagate that
  outlier into every future rename of that type.
- **`deleteRequirement(id)`** exists (with correct cascading cleanup of
  dangling references) but is intentionally not wired to any UI — no delete
  affordance exists in this experience today.

## Backend integration (`TraceGraphBackendData.ts`)

Talks to a local **maXR requirements backend** at `http://localhost:3000`
(Swagger docs at `/api-docs`). All backend I/O goes through
`InternetModule.fetch()` / `InternetModule.createWebSocket()` — never raw
`curl`/`fetch` calls from outside Lens Studio's runtime.

### REST shape

The backend organizes a project's requirements into 4 per-type "files":

| App type | Backend fileType path |
|---|---|
| UR  | `user` |
| SR  | `system` |
| DIR | `design_input` |
| SWR | `software` |

```
GET    /api/projects                                          — list projects (this app uses the first one)
GET    /api/projects/{projectId}/files/{fileType}              — list requirements in a file
POST   /api/projects/{projectId}/files/{fileType}/requirements — create one requirement
PUT    /api/projects/{projectId}/files/{fileType}/requirements/{id} — update one (full-body replace)
DELETE /api/projects/{projectId}/files/{fileType}/requirements/{id} — delete one
```

A requirement's own `type` field — not which file it was fetched from — is
what this app trusts for classification, since the two can disagree in real
data (observed live: a `system`-file entry typed `SWR`).

### The undirected-adjacency-list quirk

The backend's `traceLinks` field is an **undirected adjacency list**: each
endpoint of a link independently lists the *other* endpoint's id, so an SR's
raw `traceLinks` contains both its parent UR's id and its DIR/SWR children's
ids, all flat in one array. This app's own model is strictly
downward-only-and-hierarchy-filtered (see above), so it can never be pushed
back wholesale — doing so would silently delete legitimate upward references
and hierarchy-violating links the backend still holds.

`mapBackendRequirement()` handles the *read* side by filtering to only the
ids whose type is a valid downward target per the hierarchy table.

The *write* side (`persistTraceLinkAddToBackend` /
`persistTraceLinkRemoveToBackend`) fetches each endpoint's **current raw
record fresh** immediately before writing, and patches only the single id
being (dis)connected — leaving every other entry in that endpoint's raw array
untouched.

### Writes

| Local edit | Backend operation |
|---|---|
| Type change | `persistTypeChangeToBackend` — since a requirement's type determines which file it lives in, a type change is a **move**: `POST` to the new file first, then `DELETE` from the old file. Create-before-delete ordering means a partial failure leaves a duplicate rather than losing data. |
| Trace-link add/remove | `persistTraceLinkAddToBackend` / `persistTraceLinkRemoveToBackend` — fetch-patch-`PUT` both endpoints, as described above. |

All writes are fire-and-forget from the UI's point of view: the local edit
applies and renders immediately; the backend write happens asynchronously.
On success, the app's `lastKnownSignature` is updated immediately to match
the new local state, so the WebSocket echo of its own write doesn't trigger a
redundant rebuild. On failure, a warning is logged but the local edit is
**not** rolled back — the graph keeps showing the change; a future live-sync
refresh may revert it once the backend still has the stale data.

### Live sync (WebSocket)

`TraceGraphMain.connectLiveSync()` opens `ws://localhost:3000` and treats
**any** message on it as "something changed, re-fetch" — it doesn't parse the
payload shape, so it stays correct even if the backend adds new event types.
(The backend does broadcast typed `REQUIREMENT_CREATED` / `_UPDATED` /
`_DELETED` messages on every REST mutation, confirmed via live probing
against the correct single-requirement JSON endpoints — an earlier
investigation wrongly concluded the socket never broadcasts, because it had
tested against the multipart file-upload endpoint shape instead.)

- Every message (or a fresh connect) triggers a **debounced** (1s) full
  re-fetch via `loadRequirementsFromBackend()` — always the whole set, never
  a partial apply, since one requirement's mapped `traceLinks` depend on
  every other requirement's type.
- The re-fetched set is compared via `computeRequirementsSignature()` — an
  order-independent signature — against the last-known state; a rebuild
  (`renderer.buildGraph()`) only happens if the content actually differs.
- The socket auto-reconnects with exponential backoff (2s → 20s cap) on
  close/error, and every successful (re)connect immediately triggers one
  catch-up re-fetch in case a change was missed while disconnected.

## Rendering (`TraceGraphRenderer.ts`, `TraceGraphLayout.ts`, `TraceGraphNodeView.ts`)

### Layout algorithm

`computeLayout()` is a pure function (no scene access) producing a
`Map<id, vec3>`. It runs in three ordered passes, each depending on the
previous level's already-computed positions:

1. **URs** on a primary ring around the graph center, at the top Y layer.
2. **SRs** clustered on a small ring directly beneath whichever UR claims
   them first (a multi-parent SR is clustered under its first claimant, never
   duplicated). Unclaimed ("orphan") SRs go to the middle layer's center.
3. **DIRs/SWRs**, same pattern, one level down, clustered under their
   claiming SR; DIR and SWR share the bottom Y layer.

A final **same-layer collision-relaxation pass** iteratively pushes apart any
two same-layer nodes closer than 7cm, regardless of which cluster placed
them. This exists specifically because SIK's hand near-field detection can
register two node centers within ~5.4cm as simultaneously "nearby" to one
hand position — the original cause of a hover-flicker bug (see "Removed
features" below).

### Node/edge visuals

Each requirement becomes one sphere (shared mesh, per-node cloned+tinted
material) with a persistent Billboard-facing name label as a child, sized and
offset to stay visually constant regardless of the node's own scale
(selection highlighting scales the sphere, not the label). Each trace link
becomes one thin oriented box "edge" between its two endpoints, updated every
frame to track its live endpoints (cheap at this node/edge count).

### Selection highlighting

Owned entirely by `TraceGraphRenderer`: tapping a node self-applies highlight
(scale boost, accent color, neighbor coloring, dimming everything else) from
its own edge-list topology — no requirement-data decision-making happens in
the renderer. `TraceGraphMain` only calls `clearHighlight()` when the detail
panel closes.

## UI panels

- **`TraceGraphLegendUI`** — small fixed HUD: title + a 4-cell legend
  (icon, type code, live count) for UR/SR/DIR/SWR. Display-only.
- **`TraceGraphDetailUI`** — the panel that opens on node selection. Shows
  name/type/title/description, a capped+truncated "Traces to" / "Traced by"
  list (each row has its own remove button), an "Add Trace" toggle that arms
  spatial pick mode (next node tap becomes the new link target), and a 4-way
  type-selector row. Passive view — holds no domain state; reports intent via
  events (`onTypeChange`, `onRemoveLink`, `onAddTraceToggle`, `onClose`) and
  `TraceGraphMain` decides what to do with them.

  Notably, the trace-links list container's height is a **fixed constant**
  (`LINKS_LIST_FIXED_HEIGHT`), sized for the worst case, rather than derived
  from the actual row count — see "Known quirks and fixes" below for why.

## Interaction (`TraceGraphTapInteraction.ts`)

A thin per-node wrapper around SIK's `Interactable`, used for both tap and
(now-unused, see below) hover. Sets `targetingMode = TargetingMode.All`
(Direct | Indirect | Poke) rather than the more common Direct | Indirect —
required for hover to fire reliably on small (~1–3cm) node colliders, since
SIK's Direct-only hover path gates on a "hand nearby" proximity check that a
non-pinching hover rarely satisfies against a small target. Also enables
`HandInteractor.sphereCastEnabled` once globally, as a harmless additive
mitigation for far-field indirect (ray) hover missing small colliders.

## Known quirks and fixes (worth knowing before touching this code)

- **No hover tooltip.** An earlier version showed a tooltip on node hover.
  It was removed entirely — a hovered node's near-field interaction zone
  reliably competed with nearby UI panels' own interaction zones for the
  hand's targeting focus, causing persistent flicker that survived several
  rounds of fixes (collider cleanup, panel relocation, layout collision
  relaxation). Tap-to-select is unaffected — it resolves through a different,
  discrete trigger path.
- **Detail panel's trace-link list has a fixed height, not a content-derived
  one.** An earlier version sized the list container to its actual row
  count. Because of SIK FlexLayout's parent-bubbling, that resize reflowed
  every sibling row below it — including relocating the Close button's
  collider by up to ~7.85cm — which could land directly under an in-progress
  pinch and produce a spurious `hideDetail()` call even though Close was
  never tapped. Deferring the reflow by one frame did **not** fix it (a held
  pinch re-resolves hover every frame, not just once). The actual fix: make
  the container's footprint constant, so nothing below it can ever move as a
  side effect of a link-count change.
- **Renaming uses a count-based scheme, not a max-suffix scan** — see
  `TraceGraphState.nextNameForType()` above. This was a live bug
  (`UR-05 → SR → UR` producing `UR-970992`) caused by an outlier record
  already present in real backend data.
- **Local edits are never rolled back on a failed backend persist.** The
  graph always reflects the user's local action immediately; a persist
  failure only risks being overwritten by a later live-sync refresh, which
  is treated as an acceptable, logged failure mode rather than something the
  UI needs to actively guard against.

## Backend

None of the backend server code lives in this repository — this project only
contains the Lens Studio client. Point a local maXR requirements backend at
`http://localhost:3000` before launching the Lens preview; without it, the
experience runs entirely on the bundled demo dataset with no persistence or
live sync.

## Project structure

```
maXR-Organize.esproj      — Lens Studio project manifest
Assets/
├── Scene.scene            — main scene
├── Scripts/                — all TypeScript source (see Architecture above)
├── Icons/                  — UI icon textures (person, hub, architecture, code, link, close, swap, add_link, account_tree)
├── Materials/               — node/edge/image materials + shaders
├── Meshes/                  — shared sphere (node) and box (edge) meshes
├── GeneratedSFX/            — node-select / type-change / link-added / link-removed cues
├── Render/                  — render target + HDR environment
└── InternetModule.internetModule — backend network access asset
Cache/                      — Lens Studio generated, do not edit
Support/                    — generated TypeScript API definitions (Lens API, Editor API)
```

This project uses **Lens Studio**; scripts are TypeScript (ES2021-compliant
runtime). See `AGENTS.md` for Lens Studio-specific development conventions
(coordinate system, units, script lifecycle, MCP tooling rules) if you're
working on this project with an AI coding agent.
