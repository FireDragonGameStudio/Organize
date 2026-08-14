/**
 * TraceGraphMockData — generates the local mock requirements-traceability
 * dataset for a Telesurgery Robot system.
 *
 * Strict top-down hierarchy (see TraceGraphTypes.ALLOWED_TRACE_TARGET_TYPES):
 * User Requirements (UR) trace to System Requirements (SR); System
 * Requirements trace to BOTH Design Input Requirements (DIR) and Software
 * Requirements (SWR) directly (DIR and SWR are siblings at the bottom of the
 * hierarchy, not chained through each other); DIR and SWR trace to nothing.
 * `traceLinks` therefore lives on the UPPER-level requirement in each pair —
 * a UR's traceLinks holds the SR ids it decomposes into, an SR's holds its
 * DIR/SWR ids, and every DIR/SWR entry below has an empty traceLinks array.
 *
 * Pure module — no scene access, no mutation of module-level state.
 */
import { Requirement } from "./TraceGraphTypes"

/**
 * Requirement content, authored with a human-readable `name` (e.g. "UR-01")
 * and `traceLinks` expressed as NAME references to other entries in this
 * same list — NOT real UUIDs. Authoring 39 entries with hand-written UUIDs
 * and remembering to cross-reference them correctly would be extremely
 * error-prone; instead generateMockRequirements() below generates one real
 * UUID per entry, builds a name -> uuid map, and remaps every traceLinks
 * entry from its authored name-reference to the resolved UUID before
 * returning the final Requirement[]. `id` is intentionally absent here — it
 * does not exist until that assembly step assigns it.
 */
type MockRequirement = Omit<Requirement, "id">

const MOCK_REQUIREMENTS: MockRequirement[] = [
  // ── User Requirements — each traces DOWN to the SR(s) it decomposes into ──
  { name: "UR-01", title: "Stereoscopic 3D Vision", type: "UR", traceLinks: ["SR-01", "SR-22"],
    description: "The surgeon needs a high-definition 3D view of the surgical site to perceive depth accurately." },
  { name: "UR-02", title: "Haptic Tissue Feedback", type: "UR", traceLinks: ["SR-02", "SR-23"],
    description: "The surgeon must feel physical resistance matching the tissue density being manipulated." },
  { name: "UR-03", title: "Sub-20ms Latency", type: "UR", traceLinks: ["SR-03"],
    description: "The system must respond to surgeon inputs instantly to prevent over-correction during delicate cuts." },

  // ── System Requirements — each traces DOWN to its DIR(s) and SWR(s) ───────
  { name: "SR-01", title: "Dual 4K Video Pipeline", type: "SR", traceLinks: ["DIR-30", "SWR-01"],
    description: "The system shall process two 4K video streams at 60fps." },
  { name: "SR-02", title: "Force-Torque Sensing", type: "SR", traceLinks: ["DIR-29", "DIR-44", "SWR-02"],
    description: "The system shall measure forces at the instrument tip up to 10N with 0.1N resolution." },
  { name: "SR-03", title: "End-to-End Latency < 15ms", type: "SR", traceLinks: ["DIR-28", "SWR-03"],
    description: "The system shall achieve < 15ms latency from console input to manipulator movement." },
  { name: "SR-22", title: "Redundant Network Links", type: "SR", traceLinks: ["DIR-09", "DIR-39", "SWR-04"],
    description: "The system shall maintain two parallel network connections between console and cart." },
  { name: "SR-23", title: "Kinematic Tremor Filter", type: "SR", traceLinks: ["DIR-08", "DIR-38", "SWR-05"],
    description: "The system shall filter out human hand tremors above 6Hz." },

  // ── Design Input Requirements — bottom of the hierarchy, trace to nothing ─
  { name: "DIR-08", title: "Specify HL7 network port", type: "DIR", traceLinks: [],
    description: "The hardware engineering team shall specify hl7 network port to meet the physical system constraints." },
  { name: "DIR-09", title: "Design dual-console link cable", type: "DIR", traceLinks: [],
    description: "The hardware engineering team shall design dual-console link cable to meet the physical system constraints." },
  { name: "DIR-28", title: "Select low-latency network cards", type: "DIR", traceLinks: [],
    description: "The hardware engineering team shall select low-latency network cards to meet the physical system constraints." },
  { name: "DIR-29", title: "Specify eye-tracking IR cameras", type: "DIR", traceLinks: [],
    description: "The hardware engineering team shall specify eye-tracking ir cameras to meet the physical system constraints." },
  { name: "DIR-30", title: "Design suture cutting shears", type: "DIR", traceLinks: [],
    description: "The hardware engineering team shall design suture cutting shears to meet the physical system constraints." },
  { name: "DIR-38", title: "Specify medical grade power supply", type: "DIR", traceLinks: [],
    description: "The hardware engineering team shall specify medical grade power supply to meet the physical system constraints." },
  { name: "DIR-39", title: "Design articulating wrist joint", type: "DIR", traceLinks: [],
    description: "The hardware engineering team shall design articulating wrist joint to meet the physical system constraints." },
  { name: "DIR-44", title: "Specify heartbeat watchdog timer", type: "DIR", traceLinks: [],
    description: "The hardware engineering team shall specify heartbeat watchdog timer to meet the physical system constraints." },

  // ── Software Requirements — bottom of the hierarchy, trace to nothing ────
  { name: "SWR-01", title: "Video Stream Synchronization", type: "SWR", traceLinks: [],
    description: "The software shall synchronize the left and right 4K video feeds to within 1 frame of each other." },
  { name: "SWR-02", title: "Force Feedback Kinematics", type: "SWR", traceLinks: [],
    description: "The software shall translate 10N tip forces into proportional haptic resistance on the hand controllers." },
  { name: "SWR-03", title: "Real-time Priority OS Kernel", type: "SWR", traceLinks: [],
    description: "The core motion loop shall run on a real-time OS kernel with guaranteed preemption under 1ms." },
  { name: "SWR-04", title: "Seamless Network Failover", type: "SWR", traceLinks: [],
    description: "The software shall seamlessly failover to the redundant network link if packet loss exceeds 5%." },
  { name: "SWR-05", title: "6Hz Low-Pass Tremor Filter", type: "SWR", traceLinks: [],
    description: "The software shall apply a digital 6Hz low-pass filter to raw controller positional inputs." }
]

/**
 * Non-cryptographic UUID-v4-SHAPED generator (Math.random()-based). This is
 * mock/demo data, not a security context, so a true CSPRNG is unnecessary —
 * this only needs to look like a UUID and be unique within one generated
 * dataset (39 entries).
 */
function generateMockUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Assembles the final Requirement[]: generates one real UUID per authored
 * entry (assigned to `id`), then remaps every traceLinks entry from its
 * authored NAME reference (e.g. "SR-02") to the resolved UUID of the entry
 * with that name. A traceLinks reference to a name not present in
 * MOCK_REQUIREMENTS is dropped (defensive — should not occur with this
 * authored dataset, but a silently-dangling reference would be worse than
 * dropping it).
 */
export function generateMockRequirements(): Requirement[] {
  const idByName = new Map<string, string>()
  for (const r of MOCK_REQUIREMENTS) idByName.set(r.name, generateMockUuid())

  return MOCK_REQUIREMENTS.map((r) => ({
    ...r,
    id: idByName.get(r.name)!,
    traceLinks: r.traceLinks
      .map((name) => idByName.get(name))
      .filter((id): id is string => id !== undefined),
  }))
}
