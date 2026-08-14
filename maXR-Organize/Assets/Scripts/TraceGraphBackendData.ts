/**
 * TraceGraphBackendData — fetches requirements from the local maXR
 * requirements backend (http://localhost:3000) and maps its schema onto
 * this app's Requirement model. This module's own job is only to succeed
 * cleanly or throw — it never silently substitutes mock data itself; the
 * caller (TraceGraphMain) is responsible for catching a failure and falling
 * back to the bundled demo dataset (see TraceGraphMockData.ts).
 *
 * Backend data model (see http://localhost:3000/api-docs) differs from this
 * app's in one important way: a backend requirement's `traceLinks` array is
 * an UNDIRECTED adjacency list — it lists BOTH the requirement's parent AND
 * its children together (confirmed against live data: e.g. an SR's
 * traceLinks contains its parent UR's id alongside its own DIR/SWR
 * children's ids, all in one flat array). This app's own
 * Requirement.traceLinks is strictly DOWNWARD-only (see TraceGraphTypes.ts).
 * mapBackendRequirement() below converts one to the other by keeping only
 * the linked ids whose type is a valid downward target per
 * ALLOWED_TRACE_TARGET_TYPES for the SOURCE requirement's own type — which
 * simultaneously (a) drops the upward parent reference, since a parent's
 * type is never a valid downward target for its child, and (b) enforces
 * this app's strict top-down hierarchy against any hierarchy-violating
 * links present in the live backend data (observed on the demo backend,
 * which has evidently been hand-edited/tested against: a "system" file
 * entry typed SWR instead of SR, and a UR with a direct link to that
 * misfiled SWR item, skipping the SR layer entirely).
 *
 * The REST API organizes requirements into 4 per-type "files" (fileType
 * enum: user/system/design_input/software), but a requirement's OWN `type`
 * field is what this module trusts for UR/SR/DIR/SWR classification, not
 * which file it was fetched from — the two can disagree in the live data
 * (see above), and `type` is what actually governs this app's rendering/
 * clustering/hierarchy logic everywhere else.
 *
 * Writes: loadRequirementsFromBackend() is read-only. The write paths are
 * persistTypeChangeToBackend() and persistTraceLinkAddToBackend()/
 * persistTraceLinkRemoveToBackend() — together they're what let
 * TraceGraphMain's local edits (TraceGraphState.setType/addTraceLink/
 * removeTraceLink) survive the next live-sync refresh instead of being
 * silently overwritten by stale backend data.
 *
 * The trace-link writes are the trickier of the two, precisely because of
 * the undirected-adjacency-list quirk above: this app's local
 * Requirement.traceLinks is already filtered down to "downward links only,
 * hierarchy-valid only" (see mapBackendRequirement), so it can never be
 * pushed back to the backend wholesale as one endpoint's new traceLinks
 * array — that would silently delete every upward reference and every
 * hierarchy-violating link the backend legitimately still holds for that
 * record (real backend data has both, see above). Instead
 * persistTraceLinkAddToBackend()/persistTraceLinkRemoveToBackend() fetch
 * each endpoint's CURRENT raw record fresh immediately before writing, and
 * only add/remove the single id being (dis)connected, leaving every other
 * entry in that raw array untouched.
 */
import { Requirement, RequirementTypeCode, ALLOWED_TRACE_TARGET_TYPES } from "./TraceGraphTypes"

const BACKEND_BASE_URL = "http://localhost:3000"
const FETCH_TIMEOUT_MS = 4000

/** Push endpoint for live sync (see TraceGraphMain.connectLiveSync()).
 * Confirmed live (ws_probe5, 2026-08-13) to broadcast a
 * {"type":"REQUIREMENT_CREATED"|"REQUIREMENT_UPDATED"|"REQUIREMENT_DELETED",
 * "projectId","fileType","data"} message to every connected client on each
 * REST mutation — an EARLIER probe wrongly concluded this socket never
 * broadcasts anything, but that probe's "create" request used the file-
 * upload endpoint's (multipart) shape against the single-requirement JSON
 * endpoint and got HTTP 400 for every mutation, so nothing ever actually
 * changed for the socket to report. This app doesn't parse the payload
 * type/shape at all — any message on this socket is treated as "something
 * changed, re-fetch" (see TraceGraphMain), so it stays correct even if the
 * backend adds new event types later. */
export const BACKEND_WS_URL = "ws://localhost:3000"

/** REST fileType path segment -> this app's RequirementTypeCode. A project's
 * full requirement set is the union of all 4 files. */
const FILE_TYPES: { path: string; app: RequirementTypeCode }[] = [
  { path: "user", app: "UR" },
  { path: "system", app: "SR" },
  { path: "design_input", app: "DIR" },
  { path: "software", app: "SWR" },
]

/** RequirementTypeCode -> REST fileType path segment. A requirement's type
 * determines exactly which file it lives in (see FILE_TYPES above), so a
 * type change is a MOVE between files, not an in-place field update — see
 * persistTypeChangeToBackend(). */
function fileTypePathFor(type: RequirementTypeCode): string {
  const entry = FILE_TYPES.find((ft) => ft.app === type)
  if (!entry) throw new Error(`No backend fileType mapped for requirement type "${type}"`)
  return entry.path
}

interface BackendProject {
  id: string
  name: string
  createdAt?: string
}

interface BackendRequirement {
  id: string
  name: string
  title: string
  description: string
  /** Not narrowed to RequirementTypeCode — this is untrusted external data;
   * asRequirementType() validates it before use. */
  type: string
  traceLinks: string[]
}

/**
 * Produces a stable, order-independent signature of a requirement set —
 * used by TraceGraphMain's live-sync poll to detect whether the backend's
 * data actually changed since the last successful fetch, without needing a
 * real diff. Two calls return the same string iff every requirement's id,
 * name, title, description, type, and (order-independent) traceLinks set
 * are identical, regardless of array order — the REST endpoints don't
 * guarantee a stable fetch order, so a naive JSON.stringify(requirements)
 * would false-positive on every poll even when nothing changed.
 */
export function computeRequirementsSignature(requirements: Requirement[]): string {
  const normalized = requirements
    .map((r) => [r.id, r.name, r.title, r.description, r.type, [...r.traceLinks].sort()] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  return JSON.stringify(normalized)
}

export interface BackendRequirementsResult {
  projectId: string
  requirements: Requirement[]
}

/**
 * Fetches every requirement across all 4 file types for a project (auto-
 * detected as the first project the backend reports — this app has no
 * project-picker UI, and the backend currently only ever seeds one) and
 * maps them onto this app's Requirement[] model. Throws on ANY failure: no
 * projects, a network error, a non-OK HTTP status, an unparsable body, or
 * an unrecognized `type` value. Callers must catch and decide a fallback.
 * Also returns the resolved projectId — TraceGraphMain caches it so
 * persistTypeChangeToBackend() doesn't need to re-resolve it on every edit.
 */
export async function loadRequirementsFromBackend(internetModule: InternetModule): Promise<BackendRequirementsResult> {
  const projects = await fetchJson<BackendProject[]>(internetModule, `${BACKEND_BASE_URL}/api/projects`)
  if (!Array.isArray(projects) || projects.length === 0) {
    throw new Error("Backend returned no projects")
  }
  const projectId = projects[0].id

  const fileResults = await Promise.all(
    FILE_TYPES.map((ft) =>
      fetchJson<BackendRequirement[]>(internetModule, `${BACKEND_BASE_URL}/api/projects/${projectId}/files/${ft.path}`)
    )
  )
  const raw: BackendRequirement[] = ([] as BackendRequirement[]).concat(...fileResults)
  if (raw.length === 0) {
    throw new Error(`Backend project "${projectId}" has no requirements`)
  }

  const byId = new Map<string, BackendRequirement>()
  for (const r of raw) byId.set(r.id, r)

  return { projectId, requirements: raw.map((r) => mapBackendRequirement(r, byId)) }
}

/**
 * Persists a type change to the backend by MOVING the requirement between
 * its old and new fileType files — a type change isn't an in-place field
 * update from the REST API's point of view, since fileType and
 * RequirementTypeCode are 1:1 (see fileTypePathFor). Order matters: this
 * creates the requirement in its NEW file first, and only deletes the OLD
 * file's copy once that create succeeds — so a failure partway through
 * leaves the requirement duplicated (visible in both files) rather than
 * silently dropped. Callers should treat a thrown error as "the backend
 * still has the pre-change data (or, rarely, a duplicate)" and are free to
 * retry; the local edit itself is never rolled back by this failing (see
 * TraceGraphMain.onTypeChangeRequested).
 */
export async function persistTypeChangeToBackend(
  internetModule: InternetModule,
  projectId: string,
  oldType: RequirementTypeCode,
  requirement: Requirement
): Promise<void> {
  const oldFileType = fileTypePathFor(oldType)
  const newFileType = fileTypePathFor(requirement.type)

  const createUrl = `${BACKEND_BASE_URL}/api/projects/${projectId}/files/${newFileType}/requirements`
  const createRes = await withTimeout(
    internetModule.fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: requirement.id,
        name: requirement.name,
        title: requirement.title,
        description: requirement.description,
        type: requirement.type,
        traceLinks: requirement.traceLinks,
      }),
    }),
    FETCH_TIMEOUT_MS,
    createUrl
  )
  if (!createRes.ok) {
    throw new Error(`Failed to create moved requirement in "${newFileType}": HTTP ${createRes.status}`)
  }

  const deleteUrl = `${BACKEND_BASE_URL}/api/projects/${projectId}/files/${oldFileType}/requirements/${requirement.id}`
  const deleteRes = await withTimeout(internetModule.fetch(deleteUrl, { method: "DELETE" }), FETCH_TIMEOUT_MS, deleteUrl)
  if (!deleteRes.ok) {
    throw new Error(
      `Requirement moved to "${newFileType}", but failed to delete its old "${oldFileType}" copy: HTTP ${deleteRes.status} (now duplicated on the backend)`
    )
  }
}

/**
 * Persists a trace-link ADD — this app's local childId -> parentId link
 * (see TraceGraphState.addTraceLink's doc comment for the direction
 * convention) — to the backend. See this module's doc comment for why this
 * updates BOTH endpoints' raw traceLinks arrays via a fresh fetch-patch-PUT
 * rather than pushing either endpoint's already-filtered local
 * Requirement.traceLinks.
 */
export function persistTraceLinkAddToBackend(
  internetModule: InternetModule,
  projectId: string,
  child: Requirement,
  parent: Requirement
): Promise<void> {
  return persistTraceLinkEdgeToBackend(internetModule, projectId, child, parent, true)
}

/** Persists a trace-link REMOVE (the inverse of persistTraceLinkAddToBackend
 * above) — same both-endpoints-raw-patch approach. */
export function persistTraceLinkRemoveToBackend(
  internetModule: InternetModule,
  projectId: string,
  child: Requirement,
  parent: Requirement
): Promise<void> {
  return persistTraceLinkEdgeToBackend(internetModule, projectId, child, parent, false)
}

async function persistTraceLinkEdgeToBackend(
  internetModule: InternetModule,
  projectId: string,
  child: Requirement,
  parent: Requirement,
  add: boolean
): Promise<void> {
  const rawChild = await fetchRawRequirement(internetModule, projectId, child.type, child.id)
  const rawParent = await fetchRawRequirement(internetModule, projectId, parent.type, parent.id)

  await putRawRequirement(internetModule, projectId, child.type, {
    ...rawChild,
    name: child.name,
    title: child.title,
    description: child.description,
    type: child.type,
    traceLinks: applyEdge(rawChild.traceLinks, parent.id, add),
  })
  await putRawRequirement(internetModule, projectId, parent.type, {
    ...rawParent,
    name: parent.name,
    title: parent.title,
    description: parent.description,
    type: parent.type,
    traceLinks: applyEdge(rawParent.traceLinks, child.id, add),
  })
}

/** Adds or removes a single id from a raw traceLinks array, leaving every
 * other entry untouched; a no-op if the array already reflects the desired
 * state (e.g. an ADD when the id is already present). */
function applyEdge(raw: string[], id: string, add: boolean): string[] {
  const has = raw.indexOf(id) !== -1
  if (add === has) return raw
  return add ? [...raw, id] : raw.filter((linkId) => linkId !== id)
}

/** Fetches ONE requirement's current raw (unfiltered) backend record by
 * scanning its fileType's file — there is no single-record GET endpoint, so
 * this re-fetches that whole file. Throws if the id isn't found there
 * (e.g. it was moved to a different file, or deleted, since this app's
 * local state was last synced). */
async function fetchRawRequirement(
  internetModule: InternetModule,
  projectId: string,
  type: RequirementTypeCode,
  id: string
): Promise<BackendRequirement> {
  const path = fileTypePathFor(type)
  const records = await fetchJson<BackendRequirement[]>(internetModule, `${BACKEND_BASE_URL}/api/projects/${projectId}/files/${path}`)
  const found = records.find((r) => r.id === id)
  if (!found) throw new Error(`Requirement ${id} not found in backend file "${path}" (moved or deleted since last sync?)`)
  return found
}

async function putRawRequirement(
  internetModule: InternetModule,
  projectId: string,
  type: RequirementTypeCode,
  body: BackendRequirement
): Promise<void> {
  const url = `${BACKEND_BASE_URL}/api/projects/${projectId}/files/${fileTypePathFor(type)}/requirements/${body.id}`
  const res = await withTimeout(
    internetModule.fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    FETCH_TIMEOUT_MS,
    url
  )
  if (!res.ok) {
    throw new Error(`Failed to update requirement ${body.id} on backend: HTTP ${res.status}`)
  }
}

function mapBackendRequirement(r: BackendRequirement, byId: Map<string, BackendRequirement>): Requirement {
  const type = asRequirementType(r.type)
  const allowedTargets = ALLOWED_TRACE_TARGET_TYPES[type]
  const traceLinks = r.traceLinks.filter((linkId) => {
    const target = byId.get(linkId)
    if (!target) return false // dangling reference — drop rather than propagate
    let targetType: RequirementTypeCode
    try {
      targetType = asRequirementType(target.type)
    } catch {
      return false
    }
    return allowedTargets.indexOf(targetType) !== -1
  })
  return {
    id: r.id,
    name: r.name,
    title: r.title,
    description: r.description,
    type,
    traceLinks,
  }
}

function asRequirementType(raw: string): RequirementTypeCode {
  if (raw === "UR" || raw === "SR" || raw === "DIR" || raw === "SWR") return raw
  throw new Error(`Unknown requirement type from backend: "${raw}"`)
}

async function fetchJson<T>(internetModule: InternetModule, url: string): Promise<T> {
  const response = await withTimeout(internetModule.fetch(url), FETCH_TIMEOUT_MS, url)
  if (!response.ok) {
    throw new Error(`Backend request failed: ${url} -> HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

/** The Fetch API here has no AbortController/signal support (see Lens
 * Studio's documented Fetch compatibility table), so a stalled connection
 * would otherwise hang this Promise forever — race it against a plain
 * setTimeout instead. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Backend request timed out after ${ms}ms: ${label}`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}
