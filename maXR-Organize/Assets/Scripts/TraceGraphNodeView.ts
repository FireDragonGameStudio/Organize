/**
 * TraceGraphNodeView — helper functions for creating and updating the
 * procedural node (sphere + persistent name label) and edge (thin box
 * "line") visuals that make up the 3D graph. High-cardinality runtime
 * content per Hard Rule 5 — built from shared mesh/material assets passed in
 * by TraceGraphRenderer, not generated per-instance. No @component here;
 * plain helper functions.
 */
import { Requirement, RequirementTypeCode } from "./TraceGraphTypes"
import { TraceGraphTapInteraction } from "./TraceGraphTapInteraction"
import { Billboard } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Billboard/Billboard"

/** Per Text's documented world-space size formula: em-square height (cm) =
 * size / 43.886. Used to convert a human "how tall in cm" @input into the
 * raw Text.size unit. */
const TEXT_SIZE_PER_CM = 43.886

export interface NodeHandle {
  /** Globally unique UUID (Requirement.id) — see TraceGraphTypes.ts. Never
   * changes even when the requirement's display `name` is renamed by a type
   * change, so this handle stays validly keyed in TraceGraphRenderer's node
   * map for the node's entire lifetime. */
  id: string
  root: SceneObject
  material: Material
  collider: ColliderComponent
  tap: TraceGraphTapInteraction
  /** The node's "true" (non-highlighted) display color for its current requirement
   * type. TraceGraphRenderer's selection-highlight pass reads/restores from this
   * rather than re-deriving it, so tinting/dimming is always cleanly reversible. */
  baseColor: vec4
  /** Child of `root` carrying the persistent name label's Billboard + Text.
   * Its local scale/position are recomputed by positionLabel() whenever the
   * node's own scale changes, so the label stays a constant world-space size
   * and constant world-space gap above the sphere regardless of selection
   * scaling. */
  labelRoot: SceneObject
  /** The label's Text component — TraceGraphRenderer writes `.text` directly
   * when a requirement's display name changes (type reassignment). */
  labelText: Text
}

export interface EdgeHandle {
  /** Globally unique UUIDs (Requirement.id values) of the edge's endpoints —
   * NOT display names, so an endpoint's rename never invalidates this edge. */
  fromId: string
  toId: string
  root: SceneObject
  rmv: RenderMeshVisual
  /** True while this edge directly connects the selected node to a neighbor —
   * set by TraceGraphRenderer's highlight pass, consumed by its per-frame edge
   * transform update to apply the highlighted-edge thickness boost. */
  highlighted: boolean
}

export interface NodeViewParams {
  nodeSizeCm: number
  /** Native diameter (cm, at localScale 1,1,1) of the shared sphere mesh preset — calibration constant. */
  nodeMeshNativeDiameterCm: number
  debugColliders: boolean
  colorForType: (t: RequirementTypeCode) => vec4
  /** World-space text height (cm) of the persistent node name label. */
  labelHeightCm: number
  /** World-space gap (cm) between the sphere's surface and the label. */
  labelGapCm: number
  /** Color of the persistent node name label text. */
  labelColor: vec4
}

export function createNode(
  parent: SceneObject,
  req: Requirement,
  position: vec3,
  sphereMesh: RenderMesh,
  baseMaterial: Material,
  params: NodeViewParams,
): NodeHandle {
  // Scene Hierarchy debug name uses the human-readable display `name`
  // ("Node-SR-02"), never the identity `id` — a raw UUID here would make the
  // hierarchy unusable for debugging.
  const root = global.scene.createSceneObject(`Node-${req.name}`)
  root.setParent(parent)
  root.getTransform().setLocalPosition(position)

  const scale = params.nodeSizeCm / params.nodeMeshNativeDiameterCm
  root.getTransform().setLocalScale(new vec3(scale, scale, scale))

  const rmv = root.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  rmv.mesh = sphereMesh
  const material = baseMaterial.clone()
  const initialColor = params.colorForType(req.type)
  material.mainPass.baseColor = initialColor
  rmv.clearMaterials()
  rmv.addMaterial(material)

  // SphereShape sized in the SAME native units as the mesh — the object's uniform
  // scale above converts both the visual and the collider to nodeSizeCm consistently.
  const collider = root.createComponent("Physics.ColliderComponent") as ColliderComponent
  const shape = Shape.createSphereShape()
  shape.radius = params.nodeMeshNativeDiameterCm / 2
  collider.shape = shape

  // TraceGraphTapInteraction.ensureCollider() only auto-creates a collider when none
  // exists — since we pre-created a SphereShape above, it is left untouched. Its
  // ensureCollider() DOES unconditionally reset debugDrawEnabled to its own CONFIG
  // default (false), so we set the caller's debugColliders value AFTER creation.
  const tap = root.createComponent(TraceGraphTapInteraction.getTypeName()) as TraceGraphTapInteraction
  collider.debugDrawEnabled = params.debugColliders

  const { labelRoot, labelText } = createLabel(root, req.name, params)
  positionLabel({ labelRoot }, scale, params.nodeSizeCm, params.labelGapCm)

  return { id: req.id, root, material, collider, tap, baseColor: initialColor, labelRoot, labelText }
}

/**
 * Builds the persistent node name label — a small Billboard(Y-axis)-facing
 * Text as a child of the node's root, so it inherits the node's
 * tween/reorganize position moves automatically (see
 * TraceGraphRenderer.reorganize, which only moves `root`, never touches the
 * label directly). Its scale is counter-set by positionLabel() so the
 * label's world-space size/offset stay constant regardless of the parent
 * node's own (possibly selection-boosted) scale.
 */
function createLabel(
  nodeRoot: SceneObject,
  displayName: string,
  params: NodeViewParams,
): { labelRoot: SceneObject; labelText: Text } {
  const labelRoot = global.scene.createSceneObject("Label")
  labelRoot.setParent(nodeRoot)
  labelRoot.createComponent(Billboard.getTypeName())

  const labelText = labelRoot.createComponent("Component.Text") as Text
  labelText.text = displayName
  labelText.depthTest = true
  labelText.size = params.labelHeightCm * TEXT_SIZE_PER_CM
  labelText.textFill.color = params.labelColor
  labelText.horizontalAlignment = HorizontalAlignment.Center
  labelText.verticalAlignment = VerticalAlignment.Center
  labelText.horizontalOverflow = HorizontalOverflow.Overflow
  labelText.verticalOverflow = VerticalOverflow.Overflow
  // Wide enough for the longest realistic display name ("SWR-10", "DIR-09") with margin.
  const halfW = 1.8
  const halfH = Math.max(0.4, params.labelHeightCm * 0.7)
  labelText.layoutRect = Rect.create(-halfW, halfW, -halfH, halfH)

  return { labelRoot, labelText }
}

/**
 * Sets a node's label child to a constant world-space size and constant
 * world-space gap above the sphere surface, regardless of the node's own
 * current uniform `scale` (base or selection-boosted). Called once at
 * creation and again whenever TraceGraphRenderer.applyHighlightAppearance()
 * changes the node's scale. Math: since labelRoot is a child of a
 * uniform-scaled, non-rotated node root, worldOffset = scale * localOffset —
 * setting localScale = 1/scale and localOffset = worldOffset/scale cancels
 * the parent scale exactly, keeping both the label's rendered size and its
 * gap above the sphere visually constant.
 */
export function positionLabel(handle: Pick<NodeHandle, "labelRoot">, scale: number, nodeSizeCm: number, labelGapCm: number): void {
  const inv = scale > 0 ? 1 / scale : 1
  handle.labelRoot.getTransform().setLocalScale(new vec3(inv, inv, inv))
  const worldOffsetY = nodeSizeCm / 2 + labelGapCm
  handle.labelRoot.getTransform().setLocalPosition(new vec3(0, worldOffsetY * inv, 0))
}

export function createEdge(parent: SceneObject, boxMesh: RenderMesh, baseMaterial: Material): EdgeHandle {
  const root = global.scene.createSceneObject("Edge")
  root.setParent(parent)

  const rmv = root.createComponent("Component.RenderMeshVisual") as RenderMeshVisual
  rmv.mesh = boxMesh
  const material = baseMaterial.clone()
  rmv.clearMaterials()
  rmv.addMaterial(material)

  return { fromId: "", toId: "", root, rmv, highlighted: false }
}

/**
 * Orient + scale a shared unit-box edge visual to span from -> to.
 * Pattern per lens-api/references/runtime-geometry-patterns.md "Runtime line drawing".
 */
export function updateEdgeTransform(edge: EdgeHandle, from: vec3, to: vec3, thicknessCm: number, edgeMeshNativeSizeCm: number): void {
  const mid = from.add(to).uniformScale(0.5)
  const length = from.distance(to)
  const dir = to.sub(from).normalize()

  const up = Math.abs(dir.dot(vec3.up())) > 0.999 ? vec3.right() : vec3.up()
  const transform = edge.root.getTransform()
  transform.setWorldPosition(mid)
  transform.setWorldRotation(quat.lookAt(dir, up))

  const thicknessScale = thicknessCm / edgeMeshNativeSizeCm
  const lengthScale = length / edgeMeshNativeSizeCm
  transform.setLocalScale(new vec3(thicknessScale, thicknessScale, lengthScale))
}
