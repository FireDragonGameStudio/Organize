/**
 * TraceGraphState — single source of truth for the requirement data model.
 * Plain class (not a @component) — pure logic, no scene access. Owns the
 * mutable in-memory copy of the mock dataset; mutation entry points are
 * setType(), addTraceLink(), removeTraceLink(), and deleteRequirement().
 * TraceGraphMain is the sole owner/caller of this class.
 *
 * Identity vs display (read this before touching lookups below): every
 * method that takes/returns a requirement identifier deals in `id` — the
 * globally unique UUID assigned once at creation (TraceGraphMockData) and
 * never reassigned. The Map below is keyed by `id`, and every traceLinks
 * entry is an `id` (UUID) reference. `name` is a separate, renamable DISPLAY
 * string that setType() regenerates whenever a requirement's type changes —
 * it is never used as a lookup key anywhere in this class. This split is
 * what lets a type change rename a requirement's `name` without invalidating
 * any Map key, traceLinks entry, or caller-held identifier — see
 * TraceGraphTypes.ts for the full rationale.
 */
import { Requirement, RequirementTypeCode, RequirementCounts, ALLOWED_TRACE_TARGET_TYPES } from "./TraceGraphTypes"

export interface TraceLinkMutationResult {
  ok: boolean
  /** Present when ok === false — human-readable reason the mutation was rejected. */
  error?: string
}

export class TraceGraphState {
  /** Keyed by id (globally unique UUID) — NEVER by the renamable `name` display string. */
  private requirements: Map<string, Requirement> = new Map()

  constructor(initial: Requirement[]) {
    for (const r of initial) {
      this.requirements.set(r.id, { ...r, traceLinks: [...r.traceLinks] })
    }
  }

  getAll(): Requirement[] {
    return Array.from(this.requirements.values())
  }

  getById(id: string): Requirement | undefined {
    return this.requirements.get(id)
  }

  /** Requirements THIS one traces to (resolved from its own traceLinks) —
   * rendered as the "Traces to" section. Under the strict top-down hierarchy
   * (see ALLOWED_TRACE_TARGET_TYPES) these are the LOWER-level requirement(s)
   * this one decomposes into (e.g. a UR's "parents" here are its SR targets),
   * not parents in the traditional higher-level sense — the method keeps its
   * original name for call-site stability, but see TraceGraphTypes.ts for the
   * direction this array actually stores. */
  getParents(id: string): Requirement[] {
    const req = this.requirements.get(id)
    if (!req) return []
    const result: Requirement[] = []
    for (const parentId of req.traceLinks) {
      const parent = this.requirements.get(parentId)
      if (parent) result.push(parent)
    }
    return result
  }

  /** Requirements that trace to THIS one (reverse lookup over every other
   * requirement's traceLinks) — rendered as the "Traced by" section. Under
   * the top-down hierarchy these are the UPPER-level requirement(s) this one
   * was decomposed from (e.g. a DIR's "children" here are the SR(s) that
   * reference it). Calculated dynamically at runtime by scanning every
   * requirement's traceLinks for `id` — upward traces are never stored. */
  getChildren(id: string): Requirement[] {
    const result: Requirement[] = []
    for (const r of this.requirements.values()) {
      if (r.traceLinks.indexOf(id) !== -1) result.push(r)
    }
    return result
  }

  /**
   * Reassign a requirement's type. Returns true if the type actually changed.
   * On an actual change, also regenerates the requirement's DISPLAY `name` to
   * match the new type — next available zero-padded number for that type
   * (current max + 1, never a reused/gap-filled number, so uniqueness is
   * guaranteed even across repeated back-and-forth type changes within one
   * session). The requirement's `id` — and therefore every Map key, every
   * traceLinks reference to/from it, and any caller-held identifier — is
   * untouched by this rename; only the display string changes. Because
   * traceability relies purely on the immutable `id`, no updates to any
   * OTHER requirement's traceLinks are required by a type change itself
   * (only the hierarchy-validity prune below can drop links, which is a
   * separate concern from the identity being stable).
   *
   * A type change can also make some of this requirement's existing trace
   * links violate the hierarchy (ALLOWED_TRACE_TARGET_TYPES) — in either
   * direction. Per project policy this is the user's responsibility to have
   * anticipated: broken links are silently pruned (see
   * pruneInvalidTraceLinks), not blocked or flagged.
   */
  setType(id: string, newType: RequirementTypeCode): boolean {
    const req = this.requirements.get(id)
    if (!req || req.type === newType) return false
    req.type = newType
    req.name = this.nextNameForType(newType)
    this.pruneInvalidTraceLinks(id)
    return true
  }

  /**
   * Drops every trace link touching `id` that ALLOWED_TRACE_TARGET_TYPES no
   * longer permits, now that its type has changed. Two directions:
   *
   * - Outgoing: `id`'s own traceLinks ("Traces to" list) — keep only entries
   *   whose type is still a valid target for `id`'s NEW type.
   * - Incoming: every OTHER requirement whose own traceLinks references
   *   `id` (i.e. `id` shows up in their "Traces to" list) — drop that
   *   reference if `id`'s NEW type is no longer a valid target for the
   *   other requirement's type.
   */
  private pruneInvalidTraceLinks(id: string): void {
    const req = this.requirements.get(id)
    if (!req) return

    req.traceLinks = req.traceLinks.filter((targetId) => {
      const target = this.requirements.get(targetId)
      return !!target && ALLOWED_TRACE_TARGET_TYPES[req.type].indexOf(target.type) !== -1
    })

    for (const other of this.requirements.values()) {
      if (other.id === id) continue
      const idx = other.traceLinks.indexOf(id)
      if (idx === -1) continue
      if (ALLOWED_TRACE_TARGET_TYPES[other.type].indexOf(req.type) === -1) {
        other.traceLinks.splice(idx, 1)
      }
    }
  }

  /**
   * Next available "<TYPE>-NN" display name for `type`, zero-padded to 2
   * digits (matching TraceGraphMockData's convention; grows naturally past 2
   * digits once the count exceeds 99). Starts from (count of requirements
   * currently of that type) + 1 and probes upward past any collision, rather
   * than (max existing numeric suffix) + 1 — real backend data isn't
   * guaranteed to follow the mock dataset's clean "<TYPE>-01, <TYPE>-02, ..."
   * numbering (observed live: a stray "UR-970991" record), and a max-based
   * scheme picks up and permanently propagates any such outlier on every
   * subsequent rename (e.g. "UR-05" -> SR -> back to UR became "UR-970992").
   * A count-based start stays close to the type's actual size regardless of
   * what oddly-numbered names already exist; the collision probe still
   * guarantees uniqueness. Scans live requirements only — a requirement
   * mid-rename (type already flipped to `type`, old name still has the OLD
   * prefix) is naturally excluded from both the count and the collision set
   * since its name doesn't match the new prefix yet.
   */
  private nextNameForType(type: RequirementTypeCode): string {
    const prefix = `${type}-`
    const existingNames = new Set<string>()
    let countOfType = 0
    for (const r of this.requirements.values()) {
      if (r.type !== type) continue
      countOfType++
      existingNames.add(r.name)
    }
    let n = countOfType + 1
    let candidate = `${prefix}${String(n).padStart(2, "0")}`
    while (existingNames.has(candidate)) {
      n++
      candidate = `${prefix}${String(n).padStart(2, "0")}`
    }
    return candidate
  }

  /**
   * Add a new "traces to" link: parentId is pushed onto childId's own
   * traceLinks (childId's "Traces to" list gains parentId; symmetrically,
   * parentId's "Traced by" list gains childId). Validates before mutating:
   * no self-link, both ids must exist, the pairing must be allowed by the
   * strict top-down hierarchy (ALLOWED_TRACE_TARGET_TYPES — e.g. a DIR or SWR
   * can never be `childId` here, since they're the bottom of the hierarchy
   * and traceLinks stores no other direction), no duplicate of an existing
   * link, and no cycle.
   *
   * Cycle policy (design choice — the alternative is an unconstrained DAG-or-not
   * graph): rejected, though the hierarchy check above already makes an actual
   * cycle structurally unreachable (DIR/SWR can never originate a link, so
   * there is no path back up to UR/SR). Kept as a cheap defensive check in
   * case the hierarchy table itself is ever loosened.
   */
  addTraceLink(childId: string, parentId: string): TraceLinkMutationResult {
    if (childId === parentId) return { ok: false, error: "A requirement cannot trace to itself." }
    const child = this.requirements.get(childId)
    const parent = this.requirements.get(parentId)
    if (!child) return { ok: false, error: `Unknown requirement: ${childId}` }
    if (!parent) return { ok: false, error: `Unknown requirement: ${parentId}` }
    if (ALLOWED_TRACE_TARGET_TYPES[child.type].indexOf(parent.type) === -1) {
      return { ok: false, error: `A ${child.type} cannot trace to a ${parent.type}.` }
    }
    if (child.traceLinks.indexOf(parentId) !== -1) {
      return { ok: false, error: "That trace link already exists." }
    }
    if (this.wouldCreateCycle(childId, parentId)) {
      return { ok: false, error: "That link would create a cycle." }
    }
    child.traceLinks.push(parentId)
    return { ok: true }
  }

  /**
   * Remove an existing "traces to" link: parentId is dropped from childId's
   * own traceLinks. Symmetric with respect to which end is "selected" —
   * callers remove the selected node's own outgoing target link by passing
   * (selectedId, parentId), or remove an incoming reference from a
   * downstream requirement by passing (childId, selectedId). Returns true
   * if a link was actually removed.
   */
  removeTraceLink(childId: string, parentId: string): boolean {
    const child = this.requirements.get(childId)
    if (!child) return false
    const idx = child.traceLinks.indexOf(parentId)
    if (idx === -1) return false
    child.traceLinks.splice(idx, 1)
    return true
  }

  /**
   * Delete a requirement outright, per the data-model spec's "Cascading
   * Deletions" rule: removes it from the Map AND iterates every other
   * requirement, stripping any reference to the deleted `id` out of their
   * traceLinks — so no requirement is left holding a dangling/orphaned link
   * to a requirement that no longer exists. Returns true if a requirement
   * was actually deleted (false if `id` was not found).
   *
   * NOTE: this method is a correct, available API — it is intentionally NOT
   * wired to any UI trigger. No delete button/gesture exists anywhere in
   * this experience today. The spec that motivated this method describes a
   * backend/state-management correctness rule, not a request for a new
   * interactive delete feature; adding an unrequested delete affordance
   * would be scope creep. Call this directly (e.g. from TraceGraphMain, or
   * a future UI action) whenever a delete capability is actually wanted.
   */
  deleteRequirement(id: string): boolean {
    if (!this.requirements.has(id)) return false
    this.requirements.delete(id)
    for (const r of this.requirements.values()) {
      const idx = r.traceLinks.indexOf(id)
      if (idx !== -1) r.traceLinks.splice(idx, 1)
    }
    return true
  }

  /**
   * Would adding childId -> parentId create a cycle? True iff parentId can
   * already (transitively) reach childId by walking traceLinks forward — i.e.
   * parentId already traces to childId, so the new link would close a loop.
   */
  private wouldCreateCycle(childId: string, parentId: string): boolean {
    const visited = new Set<string>()
    const stack: string[] = [parentId]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (cur === childId) return true
      if (visited.has(cur)) continue
      visited.add(cur)
      const req = this.requirements.get(cur)
      if (!req) continue
      for (const pid of req.traceLinks) stack.push(pid)
    }
    return false
  }

  getCounts(): RequirementCounts {
    const counts = { UR: 0, SR: 0, DIR: 0, SWR: 0 } as RequirementCounts
    for (const r of this.requirements.values()) counts[r.type]++
    return counts
  }

  /**
   * Format a single connected requirement as one "[TYPE] Name: Title" line —
   * the per-item label TraceGraphDetailUI renders for each row of its
   * "Traces to" / "Traced by" lists (each row gets its own remove button,
   * so the UI needs one label per requirement rather than a merged block of
   * text). Reads `r.name` fresh at call time, so a requirement's rename is
   * reflected the next time any panel referencing it is (re)shown. Truncates
   * the title so a long one can't blow out a fixed-width row.
   */
  static formatLinkLabel(r: Requirement, maxChars: number = 30): string {
    return `[${r.type}] ${r.name}: ${TraceGraphState.truncateTitle(r.title, maxChars)}`
  }

  private static truncateTitle(title: string, maxChars: number): string {
    return title.length > maxChars ? `${title.slice(0, maxChars - 1)}…` : title
  }
}
