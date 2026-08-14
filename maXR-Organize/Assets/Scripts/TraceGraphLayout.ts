/**
 * TraceGraphLayout — pure top-down radial clustering algorithm. Computes a
 * world-space position for every requirement across 3 Y layers (UR top, SR
 * middle, DIR+SWR sharing the bottom layer), where each level's positions
 * are clustered directly beneath their cluster PARENT's own (X,Z) — i.e.
 * position computation for a lower level depends on the already-computed
 * position of its cluster parent. Regular/parametric content per Hard Rule
 * 5 — no scene access, deterministic given the same input.
 *
 * Pass order (must run in this exact order — each level's positions depend
 * on the previous level's already-computed positions):
 *
 *   1. URs — arranged on a primary circle around (centerX, centerZ) at the
 *      top layer, same "n nodes evenly spaced on a circle, radius grows with
 *      count" logic the previous flat-ring algorithm used for one layer.
 *   2. SRs — for each UR (in stable name order), resolve its OWN traceLinks
 *      to child SR requirements. An SR already claimed by an earlier UR in
 *      that iteration (a multi-parent SR — this DOES occur in the mock
 *      dataset, e.g. SR-02 is referenced by both UR-01 and UR-06) is
 *      clustered under whichever UR claims it FIRST, never duplicated into
 *      multiple positions. Each UR's claimed children are arranged on a
 *      small circle centered at that UR's own (X,Z), at the middle layer.
 *      Any SR claimed by no UR (orphaned — e.g. after a trace-link removal
 *      via the existing trace-editing UI, or a type change's cascading
 *      prune) is placed at the middle layer's center (centerX, centerZ) —
 *      real runtime behavior, not just a mock-data edge case.
 *   3. DIRs/SWRs — same claim-by-first-parent + small-circle-under-parent +
 *      orphan-at-center pattern, one level down: each SR (in stable name
 *      order) resolves its own traceLinks to its DIR/SWR children, clustered
 *      at the bottom layer under that SR's own (X,Z); DIR/SWR claimed by no
 *      SR go to the bottom layer's center.
 */
import { Requirement } from "./TraceGraphTypes"

export interface LayoutConfig {
  /** Vertical distance (cm) between adjacent Y layers — 3 layers total (UR top, SR middle, DIR/SWR bottom). */
  layerGapCm: number
  /** Minimum radius (cm) of the primary UR ring, even with very few URs. */
  primaryRingRadiusMinCm: number
  /** Minimum circumferential spacing (cm) between adjacent URs on the primary ring. */
  primaryRingSpacingCm: number
  /** Minimum radius (cm) of a satellite cluster circle — an SR cluster under its claiming UR, or a DIR/SWR cluster under its claiming SR — even with very few children. */
  clusterRadiusMinCm: number
  /** Minimum circumferential spacing (cm) between adjacent children on a satellite cluster circle. */
  clusterSpacingCm: number
  /** World-space center of the whole graph structure. */
  centerX: number
  centerY: number
  centerZ: number
}

/** Returned Map is keyed by each requirement's globally unique `id` (never
 * its renamable `name`) — callers (TraceGraphRenderer) look up positions by
 * id so a type-change rename never invalidates a lookup mid-tween. */
export function computeLayout(requirements: Requirement[], config: LayoutConfig): Map<string, vec3> {
  const positions = new Map<string, vec3>()
  const byId = new Map<string, Requirement>()
  for (const r of requirements) byId.set(r.id, r)

  const urs = requirements.filter((r) => r.type === "UR")
  const srs = requirements.filter((r) => r.type === "SR")
  const dirsAndSwrs = requirements.filter((r) => r.type === "DIR" || r.type === "SWR")

  // 3 Y layers total — DIR and SWR share the bottom layer.
  const topY = config.centerY + config.layerGapCm
  const midY = config.centerY
  const bottomY = config.centerY - config.layerGapCm

  // ── Level 1: URs on the primary ring ────────────────────────────────────
  sortByName(urs)
  const urRing = ringPositions(urs.length, config.primaryRingRadiusMinCm, config.primaryRingSpacingCm, config.centerX, topY, config.centerZ)
  urs.forEach((ur, i) => positions.set(ur.id, urRing[i]))

  // ── Level 2: SRs clustered under whichever UR claims them first ─────────
  const claimedSrIds = new Set<string>()
  for (const ur of urs) {
    const center = positions.get(ur.id)!
    const children = ur.traceLinks
      .map((id) => byId.get(id))
      .filter((r): r is Requirement => !!r && r.type === "SR" && !claimedSrIds.has(r.id))
    sortByName(children)
    for (const c of children) claimedSrIds.add(c.id)
    const clusterPositions = ringPositions(children.length, config.clusterRadiusMinCm, config.clusterSpacingCm, center.x, midY, center.z)
    children.forEach((c, i) => positions.set(c.id, clusterPositions[i]))
  }
  const orphanSrs = srs.filter((r) => !claimedSrIds.has(r.id))
  sortByName(orphanSrs)
  orphanSrs.forEach((r) => positions.set(r.id, new vec3(config.centerX, midY, config.centerZ)))

  // ── Level 3: DIRs/SWRs clustered under whichever SR claims them first ───
  const claimedLeafIds = new Set<string>()
  const srsInClaimOrder = srs.slice()
  sortByName(srsInClaimOrder)
  for (const sr of srsInClaimOrder) {
    const center = positions.get(sr.id)
    if (!center) continue // defensive — every SR was given a position in Level 2 above
    const children = sr.traceLinks
      .map((id) => byId.get(id))
      .filter((r): r is Requirement => !!r && (r.type === "DIR" || r.type === "SWR") && !claimedLeafIds.has(r.id))
    sortByName(children)
    for (const c of children) claimedLeafIds.add(c.id)
    const clusterPositions = ringPositions(children.length, config.clusterRadiusMinCm, config.clusterSpacingCm, center.x, bottomY, center.z)
    children.forEach((c, i) => positions.set(c.id, clusterPositions[i]))
  }
  const orphanLeaves = dirsAndSwrs.filter((r) => !claimedLeafIds.has(r.id))
  sortByName(orphanLeaves)
  orphanLeaves.forEach((r) => positions.set(r.id, new vec3(config.centerX, bottomY, config.centerZ)))

  // ── Same-layer collision relaxation ─────────────────────────────────────
  // The clustering above only guarantees spacing WITHIN one cluster (siblings
  // under the same parent) — it says nothing about two DIFFERENT clusters
  // (e.g. two single-child SRs whose parent URs happen to land close together
  // on the primary ring, or two sibling SRs under the same UR whose own
  // DIR/SWR clusters are big enough to reach into each other's territory).
  // Those cross-cluster collisions are real and observed: e.g. DIR-06 and
  // SWR-05 (children of different SRs, under different URs) can land under
  // 5cm apart. That distance matters beyond visual overlap — SIK's hand
  // near-field detection (PhysicalInteractionProvider's colliderExitRadius,
  // ~1.5cm beyond each node's own ~1.2cm radius) means two node centers
  // closer than ~5.4cm can BOTH register as "nearby" to the same hand
  // position simultaneously, which is exactly what caused the reported hover
  // flicker on densely-packed nodes. Run a cheap iterative separation pass
  // per Y layer (cross-layer pairs are already ≥layerGapCm apart, no
  // relaxation needed there) so no two same-layer nodes can ever end up
  // closer than MIN_SAME_LAYER_SEPARATION_CM, regardless of which cluster
  // placed them — this is a safety net on top of the clustering, not a
  // replacement for it, so it runs last and only nudges pairs that actually
  // violate the minimum.
  relaxSameLayer(urs.map((r) => r.id), positions, MIN_SAME_LAYER_SEPARATION_CM)
  relaxSameLayer(srs.map((r) => r.id), positions, MIN_SAME_LAYER_SEPARATION_CM)
  relaxSameLayer(dirsAndSwrs.map((r) => r.id), positions, MIN_SAME_LAYER_SEPARATION_CM)

  return positions
}

/** Minimum XZ (same-layer) separation enforced between any two nodes,
 * regardless of cluster membership. Derived from SIK's own near-field hand
 * detection radii (see the relaxation call site above): two node centers
 * closer than ~5.4cm can both register as "nearby" to one hand position at
 * once. 7cm gives a comfortable margin above that danger threshold. */
const MIN_SAME_LAYER_SEPARATION_CM = 7

/**
 * Iteratively pushes apart any pair of `ids` (looked up/written back through
 * `positions`) whose XZ distance is below `minSeparationCm`, splitting each
 * violation's deficit evenly between both members and repeating until no
 * violation remains (or a safety iteration cap is hit — dense inputs can
 * need a few passes for a push on one pair to settle against another).
 * Operates on plain {x,y,z} scratch objects rather than allocating a new
 * vec3 on every micro-adjustment inside the O(n^2 * iterations) inner loop;
 * writes real vec3s back into `positions` once at the end. Exactly-coincident
 * pairs (distance 0, e.g. two orphans both defaulting to the layer center)
 * are pushed apart along a direction derived deterministically from their
 * pair index, not randomly, so layout stays reproducible run-to-run.
 */
function relaxSameLayer(ids: string[], positions: Map<string, vec3>, minSeparationCm: number): void {
  if (ids.length < 2 || minSeparationCm <= 0) return

  const pts = ids.map((id) => {
    const p = positions.get(id)!
    return { x: p.x, y: p.y, z: p.z }
  })

  const MAX_ITERATIONS = 50
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let moved = false
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i]
        const b = pts[j]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const dist = Math.sqrt(dx * dx + dz * dz)
        if (dist >= minSeparationCm) continue
        moved = true

        let ux: number
        let uz: number
        if (dist < 1e-6) {
          const angleDeg = ((i * 73856093) ^ (j * 19349663)) % 360
          const angle = (angleDeg * Math.PI) / 180
          ux = Math.cos(angle)
          uz = Math.sin(angle)
        } else {
          ux = dx / dist
          uz = dz / dist
        }

        const push = (minSeparationCm - dist) / 2
        a.x -= ux * push
        a.z -= uz * push
        b.x += ux * push
        b.z += uz * push
      }
    }
    if (!moved) break
  }

  ids.forEach((id, i) => positions.set(id, new vec3(pts[i].x, pts[i].y, pts[i].z)))
}

/** Stable ordering by display name (unique-per-type at any instant) so
 * unrelated nodes don't jitter position across reorganizations, and so
 * multi-parent claim precedence is deterministic run-to-run — same "stable
 * numbered order" reason the original ring algorithm sorted by its display
 * string, extended here to also fix which parent "wins" a shared child. */
function sortByName(list: Requirement[]): void {
  list.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** n nodes evenly spaced on a circle of the given (or larger, if the node
 * count needs more room) radius, centered at (cx, cz) on plane y. Radius
 * grows with node count so a densely-populated ring/cluster doesn't crowd
 * its members together below `spacingCm` apart. A single node is placed
 * exactly at the center (no ring needed for one point); zero nodes returns
 * an empty array. */
function ringPositions(n: number, radiusMinCm: number, spacingCm: number, cx: number, y: number, cz: number): vec3[] {
  if (n === 0) return []
  if (n === 1) return [new vec3(cx, y, cz)]

  const circumferenceNeeded = n * spacingCm
  const radius = Math.max(radiusMinCm, circumferenceNeeded / (2 * Math.PI))

  const result: vec3[] = []
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * 2 * Math.PI
    const x = cx + Math.sin(angle) * radius
    const z = cz - Math.cos(angle) * radius
    result.push(new vec3(x, y, z))
  }
  return result
}
