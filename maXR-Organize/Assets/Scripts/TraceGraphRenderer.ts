/**
 * TraceGraphRenderer — builds and animates the procedural 3D requirements
 * graph: one sphere per requirement clustered into a 3-layer top-down radial
 * hierarchy (UR primary ring on top; each UR's SR children in a small
 * circle directly beneath it; each SR's DIR/SWR children in a small circle
 * directly beneath that — see TraceGraphLayout.ts), one thin "line" box per
 * trace link, one persistent small name label per node. Reacts to type
 * reassignment by smoothly re-laying-out and recoloring affected nodes and
 * their edges.
 *
 * @input contract: nodesRoot (authored anchor, wired by bootstrap), the
 * shared sphere/box meshes + base materials (asset slots, human-swappable),
 * and the tunable layout/visual/label parameters below.
 *
 * Identity: every internal Map/array below is keyed by each requirement's
 * globally unique `id` (see TraceGraphTypes.ts), never by the renamable
 * `name` display string — so a type-change rename (TraceGraphState.setType)
 * never invalidates a node/edge lookup. reorganize() refreshes each node's
 * label text from the live `name` on every call, which is how a rename
 * becomes visible on the node itself.
 *
 * Must not: read UI state, make requirement-type decisions, or decide which
 * trace links exist — TraceGraphMain calls buildGraph()/reorganize()/
 * syncEdges() and subscribes to onNodeSelected. Selection highlighting
 * (highlightSelection()/clearHighlight()) is pure graph-topology rendering —
 * this renderer self-applies it from its own tap events (neighbor set derived
 * from its own edge list) and only relies on TraceGraphMain to call
 * clearHighlight() when the detail panel closes. syncEdges() is called by
 * TraceGraphMain after every trace-link add/remove so the rendered edge set
 * never drifts from TraceGraphState's data.
 *
 * No hover relay: an earlier version relayed each node's tap.onHoverStart/
 * onHoverEnd here for a tooltip feature that has since been removed (see
 * TraceGraphMain's class doc comment) — nodes still receive hover events
 * from SIK internally (TraceGraphTapInteraction.onHoverStart/onHoverEnd),
 * this renderer just no longer listens to or forwards them.
 */
import { Requirement, RequirementTypeCode } from "./TraceGraphTypes"
import { computeLayout, LayoutConfig } from "./TraceGraphLayout"
import { createNode, createEdge, updateEdgeTransform, positionLabel, NodeHandle, EdgeHandle, NodeViewParams } from "./TraceGraphNodeView"
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event"

@component
export class TraceGraphRenderer extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TraceGraphRenderer – Procedural graph nodes + edges</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">References</span>')
  @ui.group_start("References")
  @input
  @hint("Authored anchor SceneObject that owns all node/edge visuals — its transform sets where the whole graph appears in the scene")
  nodesRoot: SceneObject

  @input
  @hint("Shared sphere mesh used for every requirement node")
  sphereMesh: RenderMesh

  @input
  @hint("Shared unit box mesh used (scaled + oriented) for every trace-link edge")
  edgeMesh: RenderMesh

  @input
  @hint("Base material cloned per node, then tinted per requirement type")
  nodeMaterial: Material

  @input
  @hint("Base material cloned per trace-link edge")
  edgeMaterial: Material
  @ui.group_end

  @ui.separator
  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Diameter of each node sphere, in centimeters")
  @widget(new SliderWidget(0.5, 8, 0.1))
  nodeSizeCm: number = 2.4

  @input
  @hint("Calibration: native diameter (cm) of sphereMesh at scale (1,1,1). Adjust if nodes render the wrong size. Verified empirically via orthographic capture against the 30cm LegendPanel.")
  @widget(new SliderWidget(0.1, 20, 0.1))
  nodeMeshNativeDiameterCm: number = 1

  @input
  @hint("Thickness of each edge line, in centimeters")
  @widget(new SliderWidget(0.02, 1, 0.01))
  edgeThicknessCm: number = 0.15

  @input
  @hint("Calibration: native size (cm) of edgeMesh at scale (1,1,1). Adjust if edges render the wrong thickness/length.")
  @widget(new SliderWidget(0.1, 20, 0.1))
  edgeMeshNativeSizeCm: number = 1

  @input('vec4', '{0.75, 0.75, 0.8, 1.0}')
  @hint("Color of trace-link edges")
  @widget(new ColorWidget())
  edgeColor: vec4

  @input
  @hint("Vertical distance (cm) between adjacent Y layers — 3 layers total: UR (top), SR (middle), DIR+SWR (bottom, shared)")
  @widget(new SliderWidget(8, 40, 1))
  layerGapCm: number = 20

  @input
  @hint("Minimum radius (cm) of the primary UR ring, even with very few URs")
  @widget(new SliderWidget(3, 25, 0.5))
  primaryRingRadiusMinCm: number = 8

  @input
  @hint("Minimum circumferential spacing (cm) between adjacent URs on the primary ring")
  @widget(new SliderWidget(3, 15, 0.5))
  primaryRingSpacingCm: number = 7

  @input
  @hint("Minimum radius (cm) of a satellite cluster circle — an SR cluster under its UR, or a DIR/SWR cluster under its SR — even with very few children")
  @widget(new SliderWidget(1, 12, 0.25))
  clusterRadiusMinCm: number = 3.5

  @input
  @hint("Minimum circumferential spacing (cm) between adjacent children on a satellite cluster circle")
  @widget(new SliderWidget(1, 10, 0.25))
  clusterSpacingCm: number = 4

  @input
  @hint("Duration (seconds) of the reorganize animation when a requirement's type changes")
  @widget(new SliderWidget(0.1, 2, 0.05))
  reorgDurationSec: number = 0.6

  @input('vec4', '{1.0, 0.75, 0.2, 1.0}')
  @hint("Accent color for User Requirements (UR)")
  @widget(new ColorWidget())
  urColor: vec4

  @input('vec4', '{0.25, 0.55, 0.95, 1.0}')
  @hint("Accent color for System Requirements (SR)")
  @widget(new ColorWidget())
  srColor: vec4

  @input('vec4', '{0.6, 0.35, 0.9, 1.0}')
  @hint("Accent color for Design Input Requirements (DIR)")
  @widget(new ColorWidget())
  dirColor: vec4

  @input('vec4', '{0.25, 0.8, 0.45, 1.0}')
  @hint("Accent color for Software Requirements (SWR)")
  @widget(new ColorWidget())
  swrColor: vec4

  @input('vec4', '{1.0, 1.0, 1.0, 1.0}')
  @hint("Highlight color applied to the selected node")
  @widget(new ColorWidget())
  selectedNodeColor: vec4

  @input('vec4', '{0.5, 0.9, 1.0, 1.0}')
  @hint("Highlight color applied to the selected node's directly-connected neighbor nodes")
  @widget(new ColorWidget())
  neighborNodeColor: vec4

  @input('vec4', '{1.0, 1.0, 1.0, 1.0}')
  @hint("Color applied to edges directly connecting the selected node to its neighbors")
  @widget(new ColorWidget())
  highlightEdgeColor: vec4

  @input
  @hint("Uniform scale multiplier applied to the selected node's sphere while highlighted")
  @widget(new SliderWidget(1, 2.5, 0.05))
  selectedScaleMultiplier: number = 1.4

  @input
  @hint("Thickness multiplier applied to edges directly connecting the selected node to its neighbors")
  @widget(new SliderWidget(1, 4, 0.1))
  highlightEdgeThicknessMultiplier: number = 2.2

  @input
  @hint("How strongly non-highlighted nodes/edges are dimmed toward neutral gray while a selection is active (0 = no dim, 1 = fully gray)")
  @widget(new SliderWidget(0, 1, 0.05))
  dimAmount: number = 0.75

  @input('vec4', '{1.0, 1.0, 1.0, 0.92}')
  @hint("Color of the persistent node name label shown at all times above each node")
  @widget(new ColorWidget())
  labelColor: vec4

  @input
  @hint("World-space text height (cm) of the persistent node name label — kept small relative to nodeSizeCm so ~33 nodes don't clutter the view")
  @widget(new SliderWidget(0.3, 3, 0.05))
  labelHeightCm: number = 0.9

  @input
  @hint("Gap (cm) between a node sphere's surface and the bottom of its name label")
  @widget(new SliderWidget(0, 3, 0.1))
  labelGapCm: number = 0.6

  @input
  @hint("Wireframe-render every node's collider — diagnostic toggle")
  debugColliders: boolean = false
  @ui.group_end

  private nodes: Map<string, NodeHandle> = new Map()
  private edges: EdgeHandle[] = []

  /** id of the currently selection-highlighted node, or null when nothing is
   * highlighted. Owned entirely by this renderer — see highlightSelection(). */
  private selectedId: string | null = null

  private tweenActive: boolean = false
  private tweenElapsed: number = 0
  private tweenStart: Map<string, vec3> = new Map()
  private tweenTarget: Map<string, vec3> = new Map()

  private _onNodeSelected = new Event<string>()
  get onNodeSelected(): PublicApi<string> { return this._onNodeSelected.publicApi() }

  onAwake(): void {
    this.createEvent("UpdateEvent").bind(() => this.onUpdate())
  }

  /** Public API — TraceGraphMain calls this once at startup with the initial dataset. */
  buildGraph(requirements: Requirement[]): void {
    if (!this.nodesRoot || !this.sphereMesh || !this.edgeMesh || !this.nodeMaterial || !this.edgeMaterial) {
      console.error("[TraceGraphRenderer] ERROR: required @input not assigned — cannot build graph")
      return
    }
    this.clearAll()

    const positions = computeLayout(requirements, this.layoutConfig())
    for (const req of requirements) {
      const pos = positions.get(req.id) ?? new vec3(0, 0, 0)
      const params = this.nodeViewParams()
      const handle = createNode(this.nodesRoot, req, pos, this.sphereMesh, this.nodeMaterial, params)
      const id = req.id
      handle.tap.onTap.add(() => {
        // This renderer owns the node/edge topology already, so it self-applies
        // the selection highlight here rather than waiting on TraceGraphMain to
        // call back in — that keeps "which nodes/edges are highlighted" a pure
        // rendering concern, never a UI/model decision.
        this.highlightSelection(id)
        this._onNodeSelected.invoke(id)
      })
      this.nodes.set(req.id, handle)
    }

    for (const req of requirements) {
      for (const parentId of req.traceLinks) {
        if (!this.nodes.has(parentId)) continue
        this.edges.push(this.createAndColorEdge(req.id, parentId))
      }
    }
  }

  /** Public API — TraceGraphMain calls this after any requirement's type changes. */
  reorganize(requirements: Requirement[]): void {
    const positions = computeLayout(requirements, this.layoutConfig())
    this.tweenStart.clear()
    this.tweenTarget.clear()

    for (const req of requirements) {
      const handle = this.nodes.get(req.id)
      if (!handle) continue
      const current = handle.root.getTransform().getLocalPosition()
      const target = positions.get(req.id) ?? current
      this.tweenStart.set(req.id, current)
      this.tweenTarget.set(req.id, target)
      handle.baseColor = this.colorForType(req.type)
      handle.material.mainPass.baseColor = handle.baseColor
      // Refresh the persistent label text from the live (possibly just-renamed)
      // display name — reorganize() is the only path a type change flows
      // through, so this is where a rename becomes visible on the node itself.
      handle.labelText.text = req.name
    }

    this.tweenElapsed = 0
    this.tweenActive = true

    // Trace links (and therefore the highlighted subgraph) never change on a type
    // reassignment — only positions/colors do. Reapply so the current selection's
    // highlight tracks the freshly recolored nodes and their edges.
    if (this.selectedId !== null) this.applyHighlightAppearance()
  }

  /**
   * Public API — TraceGraphMain calls this after every trace-link add or
   * remove. Diffs the renderer's live edge list against the current data
   * model and creates/destroys EdgeHandles to match — no full graph rebuild,
   * no position/color changes (that stays reorganize()'s job; node positions
   * don't move when a link is added/removed, only the edge set does). The
   * existing per-frame edge-transform update in onUpdate() already keeps any
   * surviving/new edge attached to its live endpoints, so no tween is needed
   * here. Reapplies the active highlight afterward so the neighbor set
   * immediately reflects the new topology.
   */
  syncEdges(requirements: Requirement[]): void {
    const desired = new Set<string>()
    for (const req of requirements) {
      for (const parentId of req.traceLinks) {
        if (!this.nodes.has(parentId)) continue
        desired.add(this.edgeKey(req.id, parentId))
      }
    }

    const kept: EdgeHandle[] = []
    for (const edge of this.edges) {
      if (desired.has(this.edgeKey(edge.fromId, edge.toId))) {
        kept.push(edge)
      } else {
        edge.root.destroy()
      }
    }
    this.edges = kept

    const existing = new Set(this.edges.map(e => this.edgeKey(e.fromId, e.toId)))
    for (const req of requirements) {
      for (const parentId of req.traceLinks) {
        if (!this.nodes.has(parentId)) continue
        const key = this.edgeKey(req.id, parentId)
        if (existing.has(key)) continue
        this.edges.push(this.createAndColorEdge(req.id, parentId))
        existing.add(key)
      }
    }

    if (this.selectedId !== null) this.applyHighlightAppearance()
  }

  private edgeKey(fromId: string, toId: string): string {
    return `${fromId}->${toId}`
  }

  private createAndColorEdge(fromId: string, toId: string): EdgeHandle {
    const edge = createEdge(this.nodesRoot, this.edgeMesh, this.edgeMaterial)
    edge.fromId = fromId
    edge.toId = toId
    edge.rmv.getMaterial(0).mainPass.baseColor = this.edgeColor
    return edge
  }

  private onUpdate(): void {
    if (this.tweenActive) {
      this.tweenElapsed += getDeltaTime()
      const t = Math.min(1, this.tweenElapsed / Math.max(0.001, this.reorgDurationSec))
      const eased = t * t * (3 - 2 * t) // smoothstep

      this.tweenStart.forEach((startPos, id) => {
        const target = this.tweenTarget.get(id)
        const handle = this.nodes.get(id)
        if (!handle || !target) return
        const pos = new vec3(
          startPos.x + (target.x - startPos.x) * eased,
          startPos.y + (target.y - startPos.y) * eased,
          startPos.z + (target.z - startPos.z) * eased,
        )
        handle.root.getTransform().setLocalPosition(pos)
      })

      if (t >= 1) this.tweenActive = false
    }

    // Keep every edge attached to its live endpoints — cheap at this node/edge count
    // and avoids a separate "dirty" bookkeeping pass during and after a reorganize tween.
    for (const edge of this.edges) {
      const fromHandle = this.nodes.get(edge.fromId)
      const toHandle = this.nodes.get(edge.toId)
      if (!fromHandle || !toHandle) continue
      const fromPos = fromHandle.root.getTransform().getWorldPosition()
      const toPos = toHandle.root.getTransform().getWorldPosition()
      const thickness = edge.highlighted
        ? this.edgeThicknessCm * this.highlightEdgeThicknessMultiplier
        : this.edgeThicknessCm
      updateEdgeTransform(edge, fromPos, toPos, thickness, this.edgeMeshNativeSizeCm)
    }
  }

  /** Public API — called by this renderer's own tap handler when a node is tapped.
   * Recomputes the full highlight/dim appearance for every node and edge from
   * scratch each time, so re-selecting a different node always starts from a
   * clean slate — no separate "clear before select" step is required. */
  highlightSelection(selectedId: string): void {
    this.selectedId = selectedId
    this.applyHighlightAppearance()
  }

  /** Public API — TraceGraphMain calls this when the detail panel closes, restoring
   * every node/edge to its normal (non-highlighted) appearance. */
  clearHighlight(): void {
    if (this.selectedId === null) return
    this.selectedId = null
    this.applyHighlightAppearance()
  }

  /**
   * Applies (or, with no selection active, clears) the selected/neighbor/dimmed
   * appearance across every node, edge, and label. The neighbor set is derived
   * directly from this.edges — pure trace-link topology this renderer already
   * owns — so no UI/model state needs to cross into the renderer to compute it.
   */
  private applyHighlightAppearance(): void {
    const hasSelection = this.selectedId !== null
    const baseScale = this.nodeSizeCm / this.nodeMeshNativeDiameterCm

    const neighborIds = new Set<string>()
    if (hasSelection) {
      for (const edge of this.edges) {
        if (edge.fromId === this.selectedId) neighborIds.add(edge.toId)
        else if (edge.toId === this.selectedId) neighborIds.add(edge.fromId)
      }
    }
    this.nodes.forEach((handle, id) => {
      const isSelected = hasSelection && id === this.selectedId
      const scale = isSelected ? baseScale * this.selectedScaleMultiplier : baseScale
      handle.root.getTransform().setLocalScale(new vec3(scale, scale, scale))
      positionLabel(handle, scale, this.nodeSizeCm, this.labelGapCm)

      let color = handle.baseColor
      let labelAlpha = this.labelColor.w
      if (hasSelection) {
        if (isSelected) {
          color = this.selectedNodeColor
        } else if (neighborIds.has(id)) {
          color = this.neighborNodeColor
        } else {
          color = this.dimColor(handle.baseColor, this.dimAmount)
          labelAlpha = this.labelColor.w * (1 - this.dimAmount * 0.7)
        }
      }
      handle.material.mainPass.baseColor = color
      handle.labelText.textFill.color = new vec4(this.labelColor.x, this.labelColor.y, this.labelColor.z, labelAlpha)
    })

    for (const edge of this.edges) {
      const isDirect = hasSelection && (edge.fromId === this.selectedId || edge.toId === this.selectedId)
      edge.highlighted = isDirect
      const mat = edge.rmv.getMaterial(0)
      mat.mainPass.baseColor = !hasSelection
        ? this.edgeColor
        : isDirect
          ? this.highlightEdgeColor
          : this.dimColor(this.edgeColor, this.dimAmount)
    }
  }

  /** Blend a color toward a neutral gray by `amount` (0 = unchanged, 1 = fully gray). */
  private dimColor(c: vec4, amount: number): vec4 {
    const neutral = 0.35
    return new vec4(
      c.x + (neutral - c.x) * amount,
      c.y + (neutral - c.y) * amount,
      c.z + (neutral - c.z) * amount,
      c.w,
    )
  }

  private clearAll(): void {
    for (const handle of this.nodes.values()) handle.root.destroy()
    this.nodes.clear()
    for (const edge of this.edges) edge.root.destroy()
    this.edges = []
    this.selectedId = null
  }

  private colorForType(t: RequirementTypeCode): vec4 {
    switch (t) {
      case "UR": return this.urColor
      case "SR": return this.srColor
      case "DIR": return this.dirColor
      case "SWR": return this.swrColor
    }
  }

  private nodeViewParams(): NodeViewParams {
    return {
      nodeSizeCm: this.nodeSizeCm,
      nodeMeshNativeDiameterCm: this.nodeMeshNativeDiameterCm,
      debugColliders: this.debugColliders,
      colorForType: (t: RequirementTypeCode) => this.colorForType(t),
      labelHeightCm: this.labelHeightCm,
      labelGapCm: this.labelGapCm,
      labelColor: this.labelColor,
    }
  }

  private layoutConfig(): LayoutConfig {
    return {
      layerGapCm: this.layerGapCm,
      primaryRingRadiusMinCm: this.primaryRingRadiusMinCm,
      primaryRingSpacingCm: this.primaryRingSpacingCm,
      clusterRadiusMinCm: this.clusterRadiusMinCm,
      clusterSpacingCm: this.clusterSpacingCm,
      centerX: 0,
      centerY: 0,
      centerZ: 0,
    }
  }
}
