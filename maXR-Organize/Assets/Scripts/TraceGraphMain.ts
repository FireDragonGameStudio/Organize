/**
 * TraceGraphMain — orchestrator for the requirements trace-graph experience.
 *
 * Owns: the TraceGraphState instance (single source of truth), lifecycle,
 * SFX playback, and wiring between the three UI modules and the renderer.
 * Does NOT build UI, does NOT touch scene geometry directly — delegates to
 * TraceGraphRenderer (graph) and the TraceGraph*UI modules (panels).
 *
 * Trace-link editing: the detail panel's remove buttons and "Add Trace"
 * toggle only report user intent (onRemoveLink / onAddTraceToggle) — this
 * class is the one that calls TraceGraphState's mutators, decides what a
 * node tap means while an add is armed, and re-syncs the renderer's edge set
 * (renderer.syncEdges) so a link change is visible immediately, with no
 * separate "apply" step. tryAddLink()/onRemoveLinkRequested() also persist
 * the edit to the backend the same way a type change does — see
 * persistTraceLinkAdd()/persistTraceLinkRemove() below.
 *
 * Type-change persistence: onTypeChangeRequested() applies the edit locally
 * (via TraceGraphState.setType(), which also renames the requirement — see
 * that method's doc comment) and fires persistTypeChange() to write it back
 * to the backend via persistTypeChangeToBackend() (TraceGraphBackendData.ts).
 * This matters because a type change changes which of the backend's 4
 * fileType files the requirement lives in — without persisting it, the next
 * live-sync refresh (triggered by ANY unrelated backend change, or the next
 * WS reconnect's catch-up fetch) would silently revert the edit back to
 * whatever the backend still has. A persist failure is logged but does NOT
 * roll back the local edit — the graph keeps showing the change; only a
 * future refresh may then revert it, since the backend never actually got
 * it. On persist success, lastKnownSignature is updated immediately to the
 * post-change state, so the WS broadcast our own write triggers doesn't
 * cause a redundant rebuild when it echoes back.
 *
 * No hover tooltip: an earlier version of this experience showed a
 * lightweight tooltip on node hover. It was removed — a hovered node's
 * near-field interaction zone reliably competed with nearby UI panels'
 * (DetailPanel, LegendPanel, the tooltip itself) own interaction zones for
 * the hand's proximity/targeting focus, causing persistent flicker that
 * survived several rounds of fixes (disabling/destroying leftover UI
 * colliders, relocating panels, and a same-layer node-collision relaxation
 * pass in TraceGraphLayout.ts). Tap-to-select is unaffected — it resolves
 * through a different, discrete trigger path, not the continuous hover
 * state machine that caused the flicker.
 *
 * Data source: onStart() asynchronously attempts loadRequirementsFromBackend()
 * (see TraceGraphBackendData.ts) against the local maXR requirements backend
 * before building anything — the graph, legend, and detail panel are only
 * ever constructed ONCE, after that attempt settles either way. On any
 * failure (server unreachable, bad response, unrecognized data) this falls
 * back to the bundled demo dataset (generateMockRequirements()) rather than
 * leaving the experience unbuilt.
 *
 * Live sync: after the initial load, connectLiveSync() opens the backend's
 * push WebSocket (BACKEND_WS_URL, ws://localhost:3000) and re-fetches on
 * every message it sends — confirmed live to broadcast a
 * REQUIREMENT_CREATED/UPDATED/DELETED message on every REST mutation (see
 * TraceGraphBackendData.ts's BACKEND_WS_URL doc comment for why an earlier
 * probe wrongly concluded otherwise). This app never parses the pushed
 * payload itself — any message is treated as "something changed", which
 * triggers a debounced (LIVE_SYNC_DEBOUNCE_SEC) re-fetch of the FULL
 * requirement set via loadRequirementsFromBackend(), since one requirement's
 * mapped traceLinks depend on every other requirement's type (see
 * mapBackendRequirement), so a partial/single-record payload can't safely be
 * applied in isolation. Each re-fetch compares computeRequirementsSignature()
 * against the last-known signature (order-independent, so re-fetch ordering
 * jitter alone never triggers a rebuild) and only calls applyLiveUpdate() —
 * a full renderer.buildGraph() — when the content actually differs. The
 * socket auto-reconnects with exponential backoff (WS_RECONNECT_BASE_DELAY_SEC
 * up to WS_RECONNECT_MAX_DELAY_SEC) on close/error, and every successful
 * (re)connect immediately triggers one catch-up re-fetch in case a change was
 * missed while disconnected.
 *
 * @input contract: legendPanel, detailPanel, renderer, internetModule —
 * authored SceneObjects/assets wired by the Phase 3a bootstrap (Phase B,
 * after the first recompile).
 */
import { TraceGraphLegendUI } from "./TraceGraphLegendUI"
import { TraceGraphDetailUI, TraceGraphDetailData, TraceLinkItem, TraceLinkRemoveRequest } from "./TraceGraphDetailUI"
import { TraceGraphRenderer } from "./TraceGraphRenderer"
import { TraceGraphState } from "./TraceGraphState"
import { generateMockRequirements } from "./TraceGraphMockData"
import {
  loadRequirementsFromBackend,
  persistTypeChangeToBackend,
  persistTraceLinkAddToBackend,
  persistTraceLinkRemoveToBackend,
  computeRequirementsSignature,
  BACKEND_WS_URL,
} from "./TraceGraphBackendData"
import { TYPE_INFO, RequirementTypeCode, Requirement } from "./TraceGraphTypes"

@component
export class TraceGraphMain extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TraceGraphMain – Orchestrator (state, wiring, SFX)</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Legend HUD panel (TraceGraphLegendUI) — displays the title + per-class counts")
  legendPanel: TraceGraphLegendUI

  @input
  @hint("Detail panel (TraceGraphDetailUI) — shows the selected requirement and its type-change control")
  detailPanel: TraceGraphDetailUI

  @input
  @hint("Renderer (TraceGraphRenderer) that owns the procedural graph nodes and edges")
  renderer: TraceGraphRenderer

  @input
  @hint("InternetModule asset — used to fetch requirements from the local maXR backend (http://localhost:3000). Falls back to demo data if unassigned or unreachable.")
  internetModule: InternetModule
  @ui.group_end

  private state!: TraceGraphState
  /** Globally unique UUID (Requirement.id) of the currently selected node, or
   * null. Named selectedId because it is used purely as a lookup key into
   * TraceGraphState — see TraceGraphTypes.ts for why identity and the
   * renamable display name are kept separate. */
  private selectedId: string | null = null

  /** True while the detail panel's "Add Trace" toggle is armed — the next
   * node tap in the 3D graph becomes a new outgoing trace target for
   * selectedId instead of opening its own detail panel. See onNodeSelected. */
  private addTraceArmed: boolean = false

  private nodeSelectAudio!: AudioComponent
  private typeChangeAudio!: AudioComponent
  private linkAddedAudio!: AudioComponent
  private linkRemovedAudio!: AudioComponent

  /** All SFX cues play at this volume multiplier (0-1). Turned down from the
   * default 1.0 — the generated cues were too loud at full volume. */
  private static readonly SFX_VOLUME = 0.2

  /** id of the requirement a type-change refresh is pending for, or null.
   * See onTypeChangeRequested/runDeferredTypeChangeRefresh — the refresh is
   * deferred one frame past the triggering tap, so this survives the gap
   * between "type change requested" and "refresh actually applied". */
  private pendingRefreshId: string | null = null
  private pendingRefreshEvent!: DelayedCallbackEvent

  /** computeRequirementsSignature() of whatever data the graph was last
   * built/updated from (demo or backend) — see refetchFromBackend(). Set
   * after every successful build so a re-fetch only rebuilds if the
   * backend's data has actually diverged from what's currently shown. */
  private lastKnownSignature: string = ""
  /** Resolved by loadRequirementsFromBackend()/refetchFromBackend() — needed
   * by persistTypeChange() to know which backend project to write into. */
  private backendProjectId: string | null = null

  private socket: WebSocket | null = null
  /** Set true only by the intentional close in OnDestroyEvent — lets
   * onclose tell "we're shutting down" apart from "connection dropped, go
   * reconnect" without racing a fresh socket into existence post-destroy. */
  private isDestroyed: boolean = false
  private wsReconnectEvent!: DelayedCallbackEvent
  private wsReconnectDelaySec: number = TraceGraphMain.WS_RECONNECT_BASE_DELAY_SEC
  private wsRefetchEvent!: DelayedCallbackEvent

  private static readonly WS_RECONNECT_BASE_DELAY_SEC = 2
  private static readonly WS_RECONNECT_MAX_DELAY_SEC = 20
  private static readonly LIVE_SYNC_DEBOUNCE_SEC = 1

  onAwake(): void {
    this.createEvent("OnStartEvent").bind(() => this.onStart())
    this.pendingRefreshEvent = this.createEvent("DelayedCallbackEvent")
    this.pendingRefreshEvent.bind(() => this.runDeferredTypeChangeRefresh())
    this.wsReconnectEvent = this.createEvent("DelayedCallbackEvent")
    this.wsReconnectEvent.bind(() => this.connectLiveSync())
    this.wsRefetchEvent = this.createEvent("DelayedCallbackEvent")
    this.wsRefetchEvent.bind(() => this.refetchFromBackend())
    this.createEvent("OnDestroyEvent").bind(() => {
      this.isDestroyed = true
      this.socket?.close()
    })
  }

  private onStart(): void {
    if (!this.legendPanel || !this.detailPanel || !this.renderer) {
      console.error("[TraceGraphMain] ERROR: required @input(s) not assigned (legendPanel / detailPanel / renderer) — check the scene bootstrap wiring")
      return
    }

    this.setupAudio()

    this.renderer.onNodeSelected.add((id: string) => this.onNodeSelected(id))
    this.detailPanel.onTypeChange.add((newType: RequirementTypeCode) => this.onTypeChangeRequested(newType))
    this.detailPanel.onRemoveLink.add((req: TraceLinkRemoveRequest) => this.onRemoveLinkRequested(req))
    this.detailPanel.onAddTraceToggle.add((armed: boolean) => { this.addTraceArmed = armed })
    this.detailPanel.onClose.add(() => {
      this.selectedId = null
      this.addTraceArmed = false
      this.renderer.clearHighlight()
    })

    this.loadRequirementsAndBuildGraph()
  }

  /** Attempts to load real requirements from the local maXR backend before
   * building anything — the graph/legend are only ever constructed ONCE,
   * after this settles either way, so there's no "rebuild after fallback"
   * flicker. Falls back to the bundled demo dataset on any failure (no
   * internetModule assigned, network error, bad HTTP status, unparsable or
   * unrecognized data) — see TraceGraphBackendData.ts for what counts as a
   * failure there. */
  private async loadRequirementsAndBuildGraph(): Promise<void> {
    let requirements: Requirement[]
    if (!this.internetModule) {
      console.warn("[TraceGraphMain] No internetModule assigned — using demo data")
      requirements = generateMockRequirements()
    } else {
      try {
        const result = await loadRequirementsFromBackend(this.internetModule)
        this.backendProjectId = result.projectId
        requirements = result.requirements
        console.log(`[TraceGraphMain] Loaded ${requirements.length} requirements from the maXR backend`)
      } catch (e) {
        console.warn(`[TraceGraphMain] Backend unreachable or returned unusable data, falling back to demo data: ${e}`)
        requirements = generateMockRequirements()
      }
    }

    this.state = new TraceGraphState(requirements)
    this.lastKnownSignature = computeRequirementsSignature(requirements)
    this.renderer.buildGraph(this.state.getAll())
    this.legendPanel.setCounts(this.state.getCounts())

    // Start live sync regardless of whether this first load came from the
    // backend or fell back to demo data — if the backend was down at launch
    // and comes online later, connectLiveSync()'s own connect-time catch-up
    // re-fetch picks it up automatically (its data won't match
    // lastKnownSignature, which was computed from the demo dataset).
    if (this.internetModule) this.connectLiveSync()
  }

  /** Opens the backend's push WebSocket — see this class's doc comment for
   * why any message on it (regardless of payload) triggers a debounced
   * re-fetch rather than being parsed and applied directly. Safe to call
   * repeatedly (e.g. from the reconnect timer): each call replaces
   * this.socket with a fresh connection. */
  private connectLiveSync(): void {
    if (!this.internetModule || this.isDestroyed) return
    try {
      this.socket = this.internetModule.createWebSocket(BACKEND_WS_URL)
      this.socket.binaryType = "blob"

      this.socket.onopen = () => {
        console.log("[TraceGraphMain] Live-sync WebSocket connected")
        this.wsReconnectDelaySec = TraceGraphMain.WS_RECONNECT_BASE_DELAY_SEC
        // Catch up on anything that changed while disconnected (including
        // "was never connected before" at Lens start).
        this.wsRefetchEvent.reset(0)
      }

      this.socket.onmessage = () => {
        this.wsRefetchEvent.reset(TraceGraphMain.LIVE_SYNC_DEBOUNCE_SEC)
      }

      this.socket.onclose = (event: WebSocketCloseEvent) => {
        if (this.isDestroyed) return
        if (!event.wasClean) {
          console.log(`[TraceGraphMain] Live-sync WebSocket closed unexpectedly (code ${event.code}) — reconnecting in ${this.wsReconnectDelaySec}s`)
        }
        this.scheduleReconnect()
      }

      this.socket.onerror = () => {
        if (this.isDestroyed) return
        console.log("[TraceGraphMain] Live-sync WebSocket error — will reconnect")
      }
    } catch (e) {
      console.log(`[TraceGraphMain] Failed to open live-sync WebSocket: ${e}`)
      this.scheduleReconnect()
    }
  }

  /** Exponential backoff, capped at WS_RECONNECT_MAX_DELAY_SEC, reset back
   * to the base delay on every successful onopen — a brief backend restart
   * reconnects quickly, while a backend that's genuinely down for a while
   * doesn't spin the socket every 2 seconds forever. */
  private scheduleReconnect(): void {
    this.wsReconnectEvent.reset(this.wsReconnectDelaySec)
    this.wsReconnectDelaySec = Math.min(this.wsReconnectDelaySec * 2, TraceGraphMain.WS_RECONNECT_MAX_DELAY_SEC)
  }

  /** Debounced handler for both the WS's onopen catch-up fetch and every
   * subsequent change message — see this class's doc comment for why this
   * always re-fetches the FULL set rather than applying a pushed payload
   * directly. Mirrors the old poll tick's signature-compare logic so an
   * unrelated push (or a catch-up fetch that finds nothing new) never
   * triggers a spurious rebuild. A fetch failure is logged at debug volume
   * (console.log, not warn) and otherwise ignored — the next change message
   * (or the next reconnect's catch-up fetch) will retry naturally. */
  private async refetchFromBackend(): Promise<void> {
    if (!this.internetModule) return
    try {
      const result = await loadRequirementsFromBackend(this.internetModule)
      this.backendProjectId = result.projectId
      const signature = computeRequirementsSignature(result.requirements)
      if (signature !== this.lastKnownSignature) {
        console.log(`[TraceGraphMain] Backend data changed — refreshing graph (${result.requirements.length} requirements)`)
        this.lastKnownSignature = signature
        this.applyLiveUpdate(result.requirements)
      }
    } catch (e) {
      console.log(`[TraceGraphMain] Live-sync refetch failed (will retry on next change): ${e}`)
    }
  }

  /** Rebuilds the graph from a freshly-changed backend dataset. A full
   * renderer.buildGraph() rather than an incremental diff — the live data
   * can add/remove requirements, not just edit fields, and buildGraph()
   * already handles that uniformly (it destroys and recreates every node),
   * unlike renderer.reorganize() which assumes a stable node-id set (see
   * its own call site in runDeferredTypeChangeRefresh, which only ever
   * changes one existing node's type, never the SET of nodes). Preserves the
   * open detail panel across the rebuild if its requirement still exists in
   * the new data (re-highlights and refreshes its content); closes it
   * cleanly if the selected requirement was removed remotely, since
   * renderer.buildGraph() always resets highlight/selection internally. */
  private applyLiveUpdate(requirements: Requirement[]): void {
    this.state = new TraceGraphState(requirements)
    this.renderer.buildGraph(this.state.getAll())
    this.legendPanel.setCounts(this.state.getCounts())

    if (this.selectedId && this.state.getById(this.selectedId)) {
      this.renderer.highlightSelection(this.selectedId)
      this.showDetailFor(this.selectedId)
    } else if (this.selectedId) {
      this.selectedId = null
      this.addTraceArmed = false
      this.detailPanel.hideDetail()
    }
  }

  private onNodeSelected(id: string): void {
    if (this.addTraceArmed) {
      // Spatial pick mode: the node just tapped becomes the new "traces to"
      // target for the ALREADY-selected node, instead of opening its own
      // detail panel. The renderer's own tap handler already re-highlighted
      // the tapped node (it self-applies highlighting before invoking this
      // event) — restore the highlight to the node whose panel stays open.
      if (this.selectedId && id !== this.selectedId) {
        this.tryAddLink(this.selectedId, id)
      }
      if (this.selectedId) this.renderer.highlightSelection(this.selectedId)
      return
    }

    this.selectedId = id
    if (this.nodeSelectAudio) this.nodeSelectAudio.play(1)
    this.showDetailFor(id)
  }

  /**
   * Root cause (round 1 investigation, still accurate as a mechanism):
   * TraceGraphDetailUI.rebuildLinksList(), invoked synchronously from
   * showDetailFor()->showDetail() below, used to RESIZE the trace-links list
   * container to fit its actual row count. Via SIK FlexLayout's parent-
   * bubbling, that resize reflowed EVERY sibling row below it in the same
   * call: the "Change Type" icon label, the 4 type-selector buttons, and
   * Close — including relocating Close's own collider by as much as ~7.85cm
   * (measured: an orphaned node's list collapses ~10.3cm -> ~2.45cm). A tap
   * whose own resulting reflow relocates Close's collider under the
   * still-active interactor produces a stray hideDetail() call even though
   * the tap never targeted Close.
   *
   * Round 2 fix (INSUFFICIENT — kept below for the reason that matters, see
   * round 3): deferred the geometry-affecting refresh (reorganize / legend
   * counts / showDetailFor->rebuildLinksList) to the NEXT frame via a
   * 0-duration DelayedCallbackEvent, reasoning that pushing the reflow past
   * the triggering tap's own dispatch would land it after SIK stopped
   * resolving that gesture. Live-verified round 3, with PreviewInteractTool
   * actually driving a real Pinch (not just direct code invocation): this
   * did NOT fix the symptom — DetailPanel.enabled read false immediately
   * after tapping a type-selector button, identical to before. Cause: a
   * held Pinch (PreviewInteractTool defaults to durationMs: 300, i.e. many
   * frames) keeps SIK re-resolving hover/target EVERY FRAME the gesture is
   * held, not just once at trigger-start — a 1-frame defer cannot outlast a
   * multi-frame hold, and no fixed defer duration reliably can, since real
   * hand pinches don't have a fixed duration either.
   *
   * Round 3 fix (the actual fix — see TraceGraphDetailUI.rebuildLinksList()'s
   * doc comment for the full reasoning): the trace-links list container's
   * height is now a FIXED CONSTANT (LINKS_LIST_FIXED_HEIGHT), sized for the
   * worst-case row count, and is never derived from the actual rows built.
   * rebuildLinksList() re-asserts that same constant defensively instead of
   * summing row heights. Because the container's footprint can no longer
   * change, nothing below it — including Close's collider — can ever move as
   * a side effect of a link-count change, regardless of whether this runs
   * synchronously in a tap handler or deferred N frames later. This removes
   * the hazard at its source; it does not depend on out-timing a gesture.
   *
   * The 1-frame defer below is KEPT, but is no longer load-bearing for the
   * collider-relocation bug — it now only smooths renderer.reorganize()
   * (repositions every node in the 3D graph) and legendPanel.setCounts()
   * (HUD count refresh) so those don't visibually pop mid-gesture. Both are
   * independent of the fixed-height fix and were never implicated in this
   * bug's root cause.
   */
  private onTypeChangeRequested(newType: RequirementTypeCode): void {
    if (!this.selectedId) return
    const req = this.state.getById(this.selectedId)
    if (!req) return
    const oldType = req.type
    const changed = this.state.setType(this.selectedId, newType)
    if (!changed) return

    if (this.typeChangeAudio) this.typeChangeAudio.play(1)
    this.pendingRefreshId = this.selectedId
    this.pendingRefreshEvent.reset(0)
    this.persistTypeChange(this.selectedId, oldType)
  }

  /** Writes a just-applied local type change back to the backend — see this
   * class's doc comment ("Type-change persistence") for why this matters.
   * Fire-and-forget from onTypeChangeRequested's point of view: the local
   * edit is already visible before this settles either way. Re-reads the id
   * from state rather than taking the requirement as a parameter, since by
   * the time this async call resolves, state may have moved on (further
   * edits, or a live-sync rebuild) — if the id no longer resolves, there's
   * nothing left to persist. */
  private async persistTypeChange(id: string, oldType: RequirementTypeCode): Promise<void> {
    if (!this.internetModule || !this.backendProjectId) return
    const req = this.state.getById(id)
    if (!req) return
    try {
      await persistTypeChangeToBackend(this.internetModule, this.backendProjectId, oldType, req)
      console.log(`[TraceGraphMain] Persisted type change for ${req.name} (${oldType} -> ${req.type}) to the backend`)
      // Our own write will echo back over the live-sync WebSocket shortly;
      // pre-empt the resulting re-fetch from causing a redundant rebuild by
      // updating the signature to match what we just wrote.
      this.lastKnownSignature = computeRequirementsSignature(this.state.getAll())
    } catch (e) {
      console.warn(`[TraceGraphMain] Failed to persist type change for ${req.name} to the backend — local graph still shows it, but a future live-sync refresh may revert it: ${e}`)
    }
  }

  /** Deferred consequence of onTypeChangeRequested — see its doc comment.
   * Runs one frame after the type-change tap, once the triggering gesture
   * has fully finished dispatching. Guards against selection having moved
   * on (closed / different node) in the interim before re-opening the
   * panel; the graph layout and legend counts always apply regardless,
   * since those reflect state, not the panel's own open/closed status. */
  private runDeferredTypeChangeRefresh(): void {
    const id = this.pendingRefreshId
    this.pendingRefreshId = null
    if (!id) return
    this.renderer.reorganize(this.state.getAll())
    this.legendPanel.setCounts(this.state.getCounts())
    // Refresh the open panel so the type label, accent color, renamed display
    // name, and highlighted selector button all reflect the change.
    if (this.selectedId === id) this.showDetailFor(id)
  }

  /** Attempt to add childId -> parentId (parentId is pushed onto childId's
   * own traceLinks — childId's "Traces to" list gains parentId). On
   * success: plays the confirmation cue, disarms the Add-Trace toggle, syncs
   * the renderer's edge set, and refreshes the open panel so the new link
   * shows up immediately. On rejection (self-link, duplicate, cycle, unknown
   * id, or a pairing the strict top-down hierarchy doesn't allow — e.g. a
   * selected DIR/SWR can never gain an outgoing link, they're the bottom of
   * the hierarchy): logs why and leaves the toggle armed so the user can pick
   * a different target without re-arming. */
  private tryAddLink(childId: string, parentId: string): void {
    const result = this.state.addTraceLink(childId, parentId)
    if (!result.ok) {
      console.warn(`[TraceGraphMain] addTraceLink(${childId} -> ${parentId}) rejected: ${result.error}`)
      return
    }
    this.addTraceArmed = false
    this.detailPanel.setAddTraceArmed(false)
    if (this.linkAddedAudio) this.linkAddedAudio.play(1)
    this.renderer.syncEdges(this.state.getAll())
    this.showDetailFor(childId)
    this.persistTraceLinkAdd(childId, parentId)
  }

  /** A link row's remove button was tapped — req is already expressed as
   * (childId, parentId) regardless of which list ("Traces to" / "Traced by")
   * it came from, so removal is a single direct call. */
  private onRemoveLinkRequested(req: TraceLinkRemoveRequest): void {
    const removed = this.state.removeTraceLink(req.childId, req.parentId)
    if (!removed) return

    if (this.linkRemovedAudio) this.linkRemovedAudio.play(1)
    this.renderer.syncEdges(this.state.getAll())
    if (this.selectedId) this.showDetailFor(this.selectedId)
    this.persistTraceLinkRemove(req.childId, req.parentId)
  }

  /** Writes a just-applied local trace-link ADD back to the backend — see
   * this class's doc comment and TraceGraphBackendData.ts's
   * persistTraceLinkAddToBackend() for why this touches both endpoints'
   * raw records. Fire-and-forget, same tolerance policy as
   * persistTypeChange(): a failure is logged but never rolls back the
   * already-visible local edit. Re-reads both ids from state (rather than
   * taking Requirement objects as parameters) so a slow persist racing a
   * later edit/live-sync rebuild degrades to "nothing left to persist"
   * instead of writing stale data. */
  private async persistTraceLinkAdd(childId: string, parentId: string): Promise<void> {
    if (!this.internetModule || !this.backendProjectId) return
    const child = this.state.getById(childId)
    const parent = this.state.getById(parentId)
    if (!child || !parent) return
    try {
      await persistTraceLinkAddToBackend(this.internetModule, this.backendProjectId, child, parent)
      console.log(`[TraceGraphMain] Persisted trace link ${child.name} -> ${parent.name} to the backend`)
      this.lastKnownSignature = computeRequirementsSignature(this.state.getAll())
    } catch (e) {
      console.warn(`[TraceGraphMain] Failed to persist trace link ${child.name} -> ${parent.name} to the backend — local graph still shows it, but a future live-sync refresh may revert it: ${e}`)
    }
  }

  /** Inverse of persistTraceLinkAdd — see its doc comment. */
  private async persistTraceLinkRemove(childId: string, parentId: string): Promise<void> {
    if (!this.internetModule || !this.backendProjectId) return
    const child = this.state.getById(childId)
    const parent = this.state.getById(parentId)
    if (!child || !parent) return
    try {
      await persistTraceLinkRemoveToBackend(this.internetModule, this.backendProjectId, child, parent)
      console.log(`[TraceGraphMain] Persisted trace link removal ${child.name} -> ${parent.name} to the backend`)
      this.lastKnownSignature = computeRequirementsSignature(this.state.getAll())
    } catch (e) {
      console.warn(`[TraceGraphMain] Failed to persist trace link removal ${child.name} -> ${parent.name} to the backend — local graph still shows it, but a future live-sync refresh may revert it: ${e}`)
    }
  }

  private showDetailFor(id: string): void {
    const req = this.state.getById(id)
    if (!req) return
    const parents = this.state.getParents(id)
    const children = this.state.getChildren(id)

    const data: TraceGraphDetailData = {
      id: req.id,
      name: req.name,
      title: req.title,
      description: req.description,
      type: req.type,
      typeLabel: TYPE_INFO[req.type].label,
      parents: this.toLinkItems(parents),
      children: this.toLinkItems(children),
    }
    this.detailPanel.showDetail(data)
  }

  private toLinkItems(reqs: Requirement[]): TraceLinkItem[] {
    return reqs.map(r => ({ id: r.id, type: r.type, label: TraceGraphState.formatLinkLabel(r) }))
  }

  private setupAudio(): void {
    const nodeSelectObj = global.scene.createSceneObject("NodeSelectAudio")
    nodeSelectObj.setParent(this.sceneObject)
    this.nodeSelectAudio = nodeSelectObj.createComponent("Component.AudioComponent") as AudioComponent
    this.nodeSelectAudio.audioTrack = requireAsset("../GeneratedSFX/NodeSelect.wav") as AudioTrackAsset
    this.nodeSelectAudio.playbackMode = Audio.PlaybackMode.LowLatency
    this.nodeSelectAudio.volume = TraceGraphMain.SFX_VOLUME

    const typeChangeObj = global.scene.createSceneObject("TypeChangeAudio")
    typeChangeObj.setParent(this.sceneObject)
    this.typeChangeAudio = typeChangeObj.createComponent("Component.AudioComponent") as AudioComponent
    this.typeChangeAudio.audioTrack = requireAsset("../GeneratedSFX/TypeChange.wav") as AudioTrackAsset
    this.typeChangeAudio.playbackMode = Audio.PlaybackMode.LowLatency
    this.typeChangeAudio.volume = TraceGraphMain.SFX_VOLUME

    const linkAddedObj = global.scene.createSceneObject("LinkAddedAudio")
    linkAddedObj.setParent(this.sceneObject)
    this.linkAddedAudio = linkAddedObj.createComponent("Component.AudioComponent") as AudioComponent
    this.linkAddedAudio.audioTrack = requireAsset("../GeneratedSFX/LinkAdded.wav") as AudioTrackAsset
    this.linkAddedAudio.playbackMode = Audio.PlaybackMode.LowLatency
    this.linkAddedAudio.volume = TraceGraphMain.SFX_VOLUME

    const linkRemovedObj = global.scene.createSceneObject("LinkRemovedAudio")
    linkRemovedObj.setParent(this.sceneObject)
    this.linkRemovedAudio = linkRemovedObj.createComponent("Component.AudioComponent") as AudioComponent
    this.linkRemovedAudio.audioTrack = requireAsset("../GeneratedSFX/LinkRemoved.wav") as AudioTrackAsset
    this.linkRemovedAudio.playbackMode = Audio.PlaybackMode.LowLatency
    this.linkRemovedAudio.volume = TraceGraphMain.SFX_VOLUME
  }
}
