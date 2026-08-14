/**
 * TraceGraphDetailUI — movable detail panel for a selected requirement node.
 *
 * Owns: displaying one requirement's ID / type / title / description / trace
 * links, the 4-way type-selector control that lets the user reassign the
 * requirement's class, and editing the requirement's trace links. The trace-
 * links section lists every directly connected requirement (parents it
 * traces to, children that trace to it) as individual rows — each row's
 * label is pre-formatted ("[TYPE] ID: Title") and capped/truncated by
 * TraceGraphState.formatLinkLabel() upstream — with a remove button per row,
 * plus an "Add Trace" toggle that arms a spatial pick mode: the next node
 * tapped in the 3D graph becomes a new outgoing trace target (see
 * onAddTraceToggle / setAddTraceArmed). Starts hidden. Passive view — holds
 * no domain state; TraceGraphMain pushes the selected requirement's data in
 * via showDetail() and reacts to onTypeChange / onRemoveLink / onClose to
 * update the model; onAddTraceToggle only reports UI intent (armed/disarmed)
 * — TraceGraphMain decides what a subsequent node tap means.
 *
 * Must not: mutate the requirement data model directly, decide graph layout,
 * decide which node a tap should link to (that's TraceGraphMain's call,
 * informed by the armed/disarmed state this panel reports).
 */
import { Frame } from "SpectaclesUIKit.lspkg/Scripts/Components/Frame/Frame"
import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {
  FlexAlign, FlexAlignSelf, FlexDirection, FlexJustify,
} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"
import { Button } from "SpectaclesUIKit.lspkg/Scripts/Components/Button/Button"
import { ElementContent } from "SpectaclesUIKit.lspkg/Scripts/Components/Content/ElementContent"
import Event, { PublicApi } from "SpectaclesInteractionKit.lspkg/Utils/Event"

// ── Typography: single source of truth for text size + weight ────────────────
const FONT_SIZE_SCALE = 1.0

type TextRole =
  | "Title1" | "Title2" | "HeadlineXL" | "Headline1" | "Headline2"
  | "Subheadline" | "Button" | "Callout" | "Body" | "Caption"

const TYPE_SCALE: Record<TextRole, { size: number; weight: number }> = {
  Title1: { size: 105, weight: 700 },
  Title2: { size: 93, weight: 700 },
  HeadlineXL: { size: 62, weight: 700 },
  Headline1: { size: 54, weight: 700 },
  Headline2: { size: 48, weight: 700 },
  Subheadline: { size: 41, weight: 700 },
  Button: { size: 39, weight: 500 },
  Callout: { size: 39, weight: 700 },
  Body: { size: 39, weight: 500 },
  Caption: { size: 38, weight: 500 },
}

function roleSize(role: TextRole, distanceCm: number = 110): number {
  return TYPE_SCALE[role].size * FONT_SIZE_SCALE * (distanceCm / 110)
}

function applyTextRole(t: Text, role: TextRole, distanceCm: number = 110): void {
  t.size = roleSize(role, distanceCm)
  ;(t as Text & { weight?: number }).weight = TYPE_SCALE[role].weight
}

// ── Icons (Phase 2a manifest entries) ─────────────────────────────────────────
const ICON_PERSON: Texture = requireAsset("../Icons/person.png") as Texture
const ICON_HUB: Texture = requireAsset("../Icons/hub.png") as Texture
const ICON_ARCHITECTURE: Texture = requireAsset("../Icons/architecture.png") as Texture
const ICON_CODE: Texture = requireAsset("../Icons/code.png") as Texture
const ICON_LINK: Texture = requireAsset("../Icons/link.png") as Texture
const ICON_CLOSE: Texture = requireAsset("../Icons/close.png") as Texture
const ICON_SWAP: Texture = requireAsset("../Icons/swap_horiz.png") as Texture
const ICON_ADD_LINK: Texture = requireAsset("../Icons/add_link.png") as Texture

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

const WHITE = new vec4(1, 1, 1, 1)
const MUTED = new vec4(1, 1, 1, 0.6)

export type RequirementTypeCode = "UR" | "SR" | "DIR" | "SWR"

/** One row in the "Traces to" / "Traced by" lists. `label` is pre-formatted
 * ("[TYPE] Name: Title", truncated) by TraceGraphState.formatLinkLabel() —
 * this panel is a passive view and does no requirement-title formatting
 * itself. `id` is the globally unique UUID used to build a remove request —
 * never the renamable display name (which only appears baked into `label`). */
export interface TraceLinkItem {
  id: string
  type: RequirementTypeCode
  label: string
}

/** Emitted by a link row's remove button. Always expressed as (childId,
 * parentId) — globally unique UUIDs, regardless of which direction the row
 * was listed under — see TraceGraphState.removeTraceLink for why this shape
 * is direction-agnostic. */
export interface TraceLinkRemoveRequest {
  childId: string
  parentId: string
}

export interface TraceGraphDetailData {
  /** Globally unique UUID — used internally by this panel to build
   * add/remove trace-link requests. Never displayed directly (display uses
   * `name`). */
  id: string
  name: string
  title: string
  description: string
  type: RequirementTypeCode
  typeLabel: string
  parents: TraceLinkItem[]   // this node's own outgoing "traces to" links (full list — panel caps/truncates display)
  children: TraceLinkItem[]  // requirements that trace UP to this one ("traced by", full list)
}

const TYPE_ORDER: RequirementTypeCode[] = ["UR", "SR", "DIR", "SWR"]

const PAD = 1.4
const GAP = 0.6
const ROW_ICON_ID = 2.6
const ROW_TYPE_LABEL = 1.4
const ROW_TITLE = 3.4
const ROW_DESC = 6.0
const ROW_LINKS_HEADER = 2.2
// Trace-link list rows — per-row budgets (subheader + up to MAX_LINK_ITEMS
// item rows + an optional "+N more" row) per direction, used only to build
// each row's own height. The list CONTAINER's height is a fixed constant
// (LINKS_LIST_FIXED_HEIGHT, below) — see rebuildLinksList()'s doc comment
// for why it must never be derived from these per-row budgets at runtime.
const MAX_LINK_ITEMS = 3
const ROW_LINKS_SUBHEADER = 1.1
const ROW_LINK_ITEM = 1.4
const ROW_LINKS_MORE = 1.0
const LINKS_LIST_ROW_GAP = 0.25
// Fixed worst-case reservation for the trace-links list container (fix round
// 3 — see rebuildLinksList()'s doc comment for why this must be a CONSTANT,
// never a content-derived sum). Per direction ("Traces to" / "Traced by"):
// 1 subheader row (always shown, even for "X: none") + up to MAX_LINK_ITEMS
// item rows + 1 "+N more" row. Two directions share the same flex column, so
// the row/gap counts below are doubled.
const LINKS_LIST_ROWS_PER_GROUP = 1 + MAX_LINK_ITEMS + 1 // subheader + items + "+N more"
const LINKS_LIST_FIXED_HEIGHT =
  2 * (ROW_LINKS_SUBHEADER + MAX_LINK_ITEMS * ROW_LINK_ITEM + ROW_LINKS_MORE)
  + (2 * LINKS_LIST_ROWS_PER_GROUP - 1) * LINKS_LIST_ROW_GAP
const ROW_CHANGE_HEADER = 1.6
const ROW_BUTTONS = 3.2
const ROW_CLOSE = 3.2

@component
export class TraceGraphDetailUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TraceGraphDetailUI – Requirement detail + type-change panel</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Panel width in centimeters")
  @widget(new SliderWidget(18, 34, 0.5))
  panelWidth: number = 24

  @input
  @hint("Panel height in centimeters")
  @widget(new SliderWidget(24, 52, 0.5))
  panelHeight: number = 47

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
  @ui.group_end

  private _onClose = new Event<void>()
  private _onTypeChange = new Event<RequirementTypeCode>()
  private _onRemoveLink = new Event<TraceLinkRemoveRequest>()
  private _onAddTraceToggle = new Event<boolean>()
  get onClose(): PublicApi<void> { return this._onClose.publicApi() }
  get onTypeChange(): PublicApi<RequirementTypeCode> { return this._onTypeChange.publicApi() }
  /** Fires when a link row's remove button is tapped. */
  get onRemoveLink(): PublicApi<TraceLinkRemoveRequest> { return this._onRemoveLink.publicApi() }
  /** Fires when the "Add Trace" toggle is pressed — payload is the NEW armed
   * state (true = armed, next node tap in the 3D graph is the pick target).
   * This panel only reports the toggle; TraceGraphMain owns what "armed"
   * means for node-tap handling and calls setAddTraceArmed() to sync back. */
  get onAddTraceToggle(): PublicApi<boolean> { return this._onAddTraceToggle.publicApi() }

  private wantVisible: boolean = false
  private initialized: boolean = false

  private headerIconImg!: Image
  private headerIconMat!: Material
  private nameText!: Text
  private typeLabelText!: Text
  private titleText!: Text
  private descText!: Text
  private currentType: RequirementTypeCode = "UR"
  /** Globally unique UUID of the requirement currently shown — used to build
   * add/remove trace-link requests. NOT the display name (that's
   * currentType's sibling, read fresh from data.name on every showDetail()
   * call instead of being cached, since it's only ever displayed, never used
   * as a key). */
  private currentId: string = ""

  private typeButtons: Partial<Record<RequirementTypeCode, Button>> = {}

  // ── Trace-links section (rows rebuilt per showDetail() call — row COUNT
  // varies, but the container's own footprint is FIXED, see LINKS_LIST_FIXED_HEIGHT) ──
  private linksListRoot!: SceneObject
  private linksListFlex!: FlexLayout
  private linksListItem!: FlexItem
  private addTraceButton!: Button
  private addTraceContent!: ElementContent
  private armed: boolean = false

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")
    const frame = this.sceneObject.createComponent(Frame.getTypeName()) as Frame
    frame.autoShowHide = false
    frame.autoScaleContent = false
    frame.allowScaling = false

    frame.onInitialized.add(() => {
      frame.innerSize = new vec2(this.panelWidth, this.panelHeight)

      const content = global.scene.createSceneObject("Content")
      content.setParent(frame.contentTransform.getSceneObject())
      content.getTransform().setLocalPosition(new vec3(0, 0, 0.6))

      const col = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
      col.width = this.panelWidth
      col.height = this.panelHeight
      col.direction = FlexDirection.Column
      col.alignItems = FlexAlign.Stretch
      col.justifyContent = FlexJustify.Start
      col.rowGap = GAP
      col.paddingTop = PAD
      col.paddingBottom = PAD
      col.paddingLeft = PAD
      col.paddingRight = PAD

      this.buildHeaderRow(content)
      this.typeLabelText = this.addStretchText(content, "Requirement Type", "Caption", ROW_TYPE_LABEL, MUTED)
      this.titleText = this.addStretchText(content, "Title", "Headline2", ROW_TITLE, WHITE, true)
      this.descText = this.addStretchText(content, "Description", "Body", ROW_DESC, MUTED, true)

      this.buildLinksHeaderRow(content)
      this.buildLinksListContainer(content)

      this.addIconLabel(content, ICON_SWAP, "Change Type", ROW_CHANGE_HEADER)
      this.buildTypeButtonsRow(content)
      this.buildCloseRow(content)

      this.initialized = true
      this.sceneObject.enabled = this.wantVisible
    })
  }

  /** Public API — TraceGraphMain pushes the selected requirement's data and shows the panel. */
  showDetail(data: TraceGraphDetailData): void {
    this.wantVisible = true
    this.currentType = data.type
    this.currentId = data.id

    // A newly shown/refreshed requirement is never mid-pick — always start
    // from a disarmed Add-Trace state so a stale "Tap a node…" prompt can't
    // survive a selection change.
    if (this.armed) { this.armed = false; this.applyAddTraceState() }

    if (!this.initialized) {
      // Frame not initialized yet (extremely early call) — content will render
      // once onInitialized runs; wantVisible is honored at its tail.
      this.sceneObject.enabled = true
      return
    }

    if (this.headerIconImg) this.headerIconImg.mainMaterial = this.materialForType(data.type)
    if (this.nameText) { this.nameText.text = data.name; this.nameText.textFill.color = this.colorForType(data.type) }
    if (this.typeLabelText) { this.typeLabelText.text = data.typeLabel; this.typeLabelText.textFill.color = this.colorForType(data.type) }
    if (this.titleText) this.titleText.text = data.title
    if (this.descText) this.descText.text = data.description
    this.rebuildLinksList(data.parents, data.children)
    this.refreshTypeButtons(data.type)
    this.sceneObject.enabled = true
  }

  /** Public API — hide the panel without changing the underlying data. */
  hideDetail(): void {
    this.wantVisible = false
    this.sceneObject.enabled = false
    if (this.armed) { this.armed = false; this.applyAddTraceState() }
  }

  /** Public API — TraceGraphMain calls this to force the Add-Trace toggle's
   * armed state (e.g. off after a successful add, or on rejection it's left
   * alone — see TraceGraphMain.tryAddLink). Does NOT re-invoke
   * onAddTraceToggle, so this never loops back into the caller. */
  setAddTraceArmed(armed: boolean): void {
    if (this.armed === armed) return
    this.armed = armed
    this.applyAddTraceState()
  }

  private colorForType(t: RequirementTypeCode): vec4 {
    switch (t) {
      case "UR": return this.urColor
      case "SR": return this.srColor
      case "DIR": return this.dirColor
      case "SWR": return this.swrColor
    }
  }

  private iconForType(t: RequirementTypeCode): Texture {
    switch (t) {
      case "UR": return ICON_PERSON
      case "SR": return ICON_HUB
      case "DIR": return ICON_ARCHITECTURE
      case "SWR": return ICON_CODE
    }
  }

  private materialForType(t: RequirementTypeCode): Material {
    this.headerIconMat.mainPass.baseTex = this.iconForType(t)
    this.headerIconMat.mainPass.baseColor = this.colorForType(t)
    return this.headerIconMat
  }

  private refreshTypeButtons(selected: RequirementTypeCode): void {
    for (const code of TYPE_ORDER) {
      const btn = this.typeButtons[code]
      if (!btn) continue
      btn.isOn = code === selected
    }
  }

  private buildHeaderRow(parent: SceneObject): void {
    const row = global.scene.createSceneObject("HeaderRow")
    row.setParent(parent)
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.alignItems = FlexAlign.Center
    f.justifyContent = FlexJustify.Start
    f.columnGap = 0.6
    f.width = this.panelWidth - PAD * 2
    f.height = ROW_ICON_ID
    const item = row.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideHeight = ROW_ICON_ID

    this.headerIconMat = imageMaterial.clone()
    this.headerIconMat.mainPass.depthTest = true
    this.headerIconMat.mainPass.depthWrite = false

    const iconSO = global.scene.createSceneObject("TypeIcon")
    iconSO.setParent(row)
    this.headerIconImg = iconSO.createComponent("Component.Image") as Image
    this.headerIconImg.clearMaterials()
    this.headerIconImg.addMaterial(this.headerIconMat)
    iconSO.getTransform().setLocalScale(new vec3(2.4, 2.4, 1))
    iconSO.createComponent(FlexItem.getTypeName())

    this.nameText = this.addRowText(row, "Name", "Callout", 14, WHITE)
  }

  private buildTypeButtonsRow(parent: SceneObject): void {
    const row = global.scene.createSceneObject("TypeButtonsRow")
    row.setParent(parent)
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.alignItems = FlexAlign.Center
    f.justifyContent = FlexJustify.SpaceBetween
    f.columnGap = 0.4
    f.width = this.panelWidth - PAD * 2
    f.height = ROW_BUTTONS
    const item = row.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideHeight = ROW_BUTTONS

    const btnW = (this.panelWidth - PAD * 2 - 0.4 * 3) / 4

    for (const code of TYPE_ORDER) {
      const so = global.scene.createSceneObject(`TypeBtn-${code}`)
      so.setParent(row)
      const btn = so.createComponent(Button.getTypeName()) as Button
      btn.size = new vec3(btnW, ROW_BUTTONS, 1)
      btn.setIsToggleable(true)
      // Sole content of this button's own face — safe ElementContent use (R1 does not
      // apply: the row siblings are other buttons, not siblings of this ElementContent).
      const ec = so.createComponent(ElementContent.getTypeName()) as ElementContent
      ec.leadingIcon = this.iconForType(code)
      ec.text = code
      ec.textSize = roleSize("Button")
      ec.contentAlignment = "center"
      so.createComponent(FlexItem.getTypeName())
      btn.onTriggerUp.add(() => {
        this.refreshTypeButtons(code)
        this._onTypeChange.invoke(code)
      })
      this.typeButtons[code] = btn
    }
  }

  private buildCloseRow(parent: SceneObject): void {
    const row = global.scene.createSceneObject("CloseRow")
    row.setParent(parent)
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.alignItems = FlexAlign.Center
    f.justifyContent = FlexJustify.Center
    f.width = this.panelWidth - PAD * 2
    f.height = ROW_CLOSE
    const item = row.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideHeight = ROW_CLOSE

    const so = global.scene.createSceneObject("CloseButton")
    so.setParent(row)
    const btn = so.createComponent(Button.getTypeName()) as Button
    btn.size = new vec3(9, 3.2, 1)
    // Sole content of this button's face — safe ElementContent use.
    const ec = so.createComponent(ElementContent.getTypeName()) as ElementContent
    ec.leadingIcon = ICON_CLOSE
    ec.text = "Close"
    ec.textSize = roleSize("Button")
    ec.contentAlignment = "center"
    so.createComponent(FlexItem.getTypeName())
    btn.onTriggerUp.add(() => {
      this.hideDetail()
      this._onClose.invoke()
    })
  }

  // ── Trace-links section ─────────────────────────────────────────────────

  private buildLinksHeaderRow(parent: SceneObject): void {
    const row = global.scene.createSceneObject("LinksHeaderRow")
    row.setParent(parent)
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.alignItems = FlexAlign.Center
    f.justifyContent = FlexJustify.SpaceBetween
    f.columnGap = 0.4
    f.width = this.panelWidth - PAD * 2
    f.height = ROW_LINKS_HEADER
    const item = row.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideHeight = ROW_LINKS_HEADER

    // Left: icon + "Trace Links" label
    const left = global.scene.createSceneObject("LinksLabel")
    left.setParent(row)
    const lf = left.createComponent(FlexLayout.getTypeName()) as FlexLayout
    lf.direction = FlexDirection.Row
    lf.alignItems = FlexAlign.Center
    lf.columnGap = 0.4
    lf.height = ROW_LINKS_HEADER
    const leftItem = left.createComponent(FlexItem.getTypeName()) as FlexItem
    leftItem.overrideHeight = ROW_LINKS_HEADER

    const iconSO = global.scene.createSceneObject("Icon")
    iconSO.setParent(left)
    const img = iconSO.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = ICON_LINK
    mat.mainPass.baseColor = MUTED
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    iconSO.getTransform().setLocalScale(new vec3(1.8, 1.8, 1))
    iconSO.createComponent(FlexItem.getTypeName())

    this.addRowText(left, "Trace Links", "Callout", 10, MUTED)

    // Right: Add Trace toggle — arms a spatial pick mode (see TraceGraphMain).
    const btnSO = global.scene.createSceneObject("AddTraceButton")
    btnSO.setParent(row)
    const btn = btnSO.createComponent(Button.getTypeName()) as Button
    btn.size = new vec3(9.6, ROW_LINKS_HEADER - 0.4, 1)
    btn.setIsToggleable(true)
    const ec = btnSO.createComponent(ElementContent.getTypeName()) as ElementContent
    ec.leadingIcon = ICON_ADD_LINK
    ec.text = "Add Trace"
    ec.textSize = roleSize("Button") * 0.85
    ec.contentAlignment = "center"
    btnSO.createComponent(FlexItem.getTypeName())
    btn.onTriggerUp.add(() => this.toggleAddTrace())

    this.addTraceButton = btn
    this.addTraceContent = ec
  }

  private toggleAddTrace(): void {
    this.armed = !this.armed
    this.applyAddTraceState()
    this._onAddTraceToggle.invoke(this.armed)
  }

  private applyAddTraceState(): void {
    if (this.addTraceButton) this.addTraceButton.isOn = this.armed
    if (this.addTraceContent) this.addTraceContent.text = this.armed ? "Tap a node…" : "Add Trace"
  }

  private buildLinksListContainer(parent: SceneObject): void {
    const container = global.scene.createSceneObject("LinksList")
    container.setParent(parent)
    const f = container.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Column
    // justifyContent Start (main/vertical axis): actual rows populated by
    // rebuildLinksList() stack from the top of this FIXED-height container
    // and leave any unused reserved space blank below them — see
    // LINKS_LIST_FIXED_HEIGHT / rebuildLinksList() for why the container's
    // own footprint must never vary with row count. alignItems Stretch is
    // the unrelated cross/horizontal axis (rows stretch to full width).
    f.alignItems = FlexAlign.Stretch
    f.justifyContent = FlexJustify.Start
    f.rowGap = LINKS_LIST_ROW_GAP
    f.width = this.panelWidth - PAD * 2
    f.height = LINKS_LIST_FIXED_HEIGHT
    const item = container.createComponent(FlexItem.getTypeName()) as FlexItem
    item.alignSelf = FlexAlignSelf.Stretch
    item.overrideHeight = LINKS_LIST_FIXED_HEIGHT

    this.linksListRoot = container
    this.linksListFlex = f
    this.linksListItem = item
  }

  /**
   * Rebuilds the "Traces to" / "Traced by" row lists from scratch — the row
   * count varies per requirement (0 to many links), so this destroys and
   * recreates the container's children rather than trying to diff them.
   *
   * FIX ROUND 3 — root cause of the detail-panel-closes-unexpectedly bug and
   * why this container's height is now a FIXED CONSTANT (LINKS_LIST_FIXED_
   * HEIGHT), never a sum of the actual rows created:
   *
   * This method used to size linksListItem/linksListFlex's height to the sum
   * of the rows it just built. Via SIK FlexLayout's parent-bubbling, THAT
   * resize reflowed every sibling row below it in the SAME call — the
   * "Change Type" header, the 4 type-selector buttons, and Close — including
   * relocating Close's own collider by as much as ~7.85cm (measured: an
   * orphaned node's list collapses ~10.3cm -> ~2.45cm). Round 2's fix
   * deferred the call that triggers this (showDetailFor, from
   * onTypeChangeRequested) by one frame via DelayedCallbackEvent.reset(0),
   * reasoning that pushing the reflow past the triggering tap's own script-
   * event dispatch would land it after SIK had stopped resolving that
   * gesture. Live-verified (round 3) that this did NOT fix the symptom:
   * PreviewInteractTool's Pinch (and, presumably, most real hand pinches)
   * holds the trigger for a duration — SIK's interactor re-evaluates
   * hover/target continuation EVERY FRAME the pinch is held, not just once
   * at trigger-start — so a relocated collider is a live hazard for as long
   * as the gesture stays held, however many frames that is. A 1-frame defer
   * cannot outlast a multi-hundred-ms hold; no fixed defer duration can,
   * since real hands don't have a fixed pinch duration either.
   *
   * The actual fix: stop the container from ever changing size. Its height
   * is set ONCE in buildLinksListContainer() to LINKS_LIST_FIXED_HEIGHT — a
   * worst-case reservation for the max row count this UI can ever produce —
   * and is re-asserted (not recomputed) here defensively. Rows that don't
   * fill the reservation just leave blank space below them (justifyContent
   * Start). Because the container's own footprint never varies, NOTHING
   * below it in the outer content column can ever move as a side effect of
   * a link-count change — regardless of whether this method runs
   * synchronously inside a tap handler or deferred N frames later. This
   * removes the hazard at its source instead of racing its timing.
   *
   * refreshChildren() forces LinksList's own FlexLayout to rediscover its new
   * children (autoDiscoverItemsOnStart only scans once, at first OnStartEvent)
   * for interaction/iteration purposes — it does NOT recompute the
   * container's height from its children (verified against FlexLayout.ts:
   * refreshChildren() = discoverChildren() + markDirty(), no height write).
   */
  private rebuildLinksList(parents: TraceLinkItem[], children: TraceLinkItem[]): void {
    if (!this.linksListRoot || !this.linksListFlex || !this.linksListItem) return

    for (let i = this.linksListRoot.getChildrenCount() - 1; i >= 0; i--) {
      this.linksListRoot.getChild(i).destroy()
    }

    this.buildLinkGroup(this.linksListRoot, "Traces to", parents, true)
    this.buildLinkGroup(this.linksListRoot, "Traced by", children, false)

    // Re-assert the fixed reservation defensively — never derived from the
    // rows just built. See doc comment above.
    this.linksListItem.overrideHeight = LINKS_LIST_FIXED_HEIGHT
    this.linksListFlex.height = LINKS_LIST_FIXED_HEIGHT
    this.linksListFlex.refreshChildren()
  }

  private buildLinkGroup(
    parent: SceneObject,
    label: string,
    items: TraceLinkItem[],
    isOutgoing: boolean,
  ): void {
    const shown = items.slice(0, MAX_LINK_ITEMS)
    const remaining = items.length - shown.length
    const headerText = items.length > 0 ? `${label} (${items.length})` : `${label}: none`

    this.addStretchText(parent, headerText, "Caption", ROW_LINKS_SUBHEADER, MUTED)

    for (const it of shown) {
      this.addLinkItemRow(parent, it, isOutgoing)
    }

    if (remaining > 0) {
      this.addStretchText(parent, `+${remaining} more`, "Caption", ROW_LINKS_MORE, MUTED)
    }
  }

  private addLinkItemRow(parent: SceneObject, it: TraceLinkItem, isOutgoing: boolean): void {
    const row = global.scene.createSceneObject(`LinkRow-${it.id}`)
    row.setParent(parent)
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.alignItems = FlexAlign.Center
    f.justifyContent = FlexJustify.SpaceBetween
    f.columnGap = 0.3
    f.width = this.panelWidth - PAD * 2
    f.height = ROW_LINK_ITEM
    const rowItem = row.createComponent(FlexItem.getTypeName()) as FlexItem
    rowItem.alignSelf = FlexAlignSelf.Stretch
    rowItem.overrideHeight = ROW_LINK_ITEM

    const textSO = global.scene.createSceneObject("LinkText")
    textSO.setParent(row)
    const t = textSO.createComponent("Component.Text") as Text
    t.text = it.label
    t.depthTest = true
    applyTextRole(t, "Caption")
    t.textFill.color = this.colorForType(it.type)
    t.horizontalAlignment = HorizontalAlignment.Left
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    const textWidth = this.panelWidth - PAD * 2 - 2.4 // leave room for the remove button
    t.layoutRect = Rect.create(-textWidth / 2, textWidth / 2, -1.0, 1.0)
    const textItem = textSO.createComponent(FlexItem.getTypeName()) as FlexItem
    textItem.flexGrow = 1
    textItem.flexShrink = 1
    textItem.flexBasis = 0

    const btnSO = global.scene.createSceneObject("RemoveLinkButton")
    btnSO.setParent(row)
    const btn = btnSO.createComponent(Button.getTypeName()) as Button
    btn.size = new vec3(1.8, 1.3, 1)
    const ec = btnSO.createComponent(ElementContent.getTypeName()) as ElementContent
    ec.leadingIcon = ICON_CLOSE
    ec.leadingIconSize = 1.0
    ec.text = ""
    ec.contentAlignment = "center"
    btnSO.createComponent(FlexItem.getTypeName())
    btn.onTriggerUp.add(() => {
      // "Traces to" row (isOutgoing): the selected node is the child, the
      // listed item is the parent being unlinked. "Traced by" row: the listed
      // item is the child that traces to the selected node (the parent).
      const req: TraceLinkRemoveRequest = isOutgoing
        ? { childId: this.currentId, parentId: it.id }
        : { childId: it.id, parentId: this.currentId }
      this._onRemoveLink.invoke(req)
    })
  }

  private addIconLabel(parent: SceneObject, icon: Texture, text: string, heightCM: number): void {
    const row = global.scene.createSceneObject("IconLabel")
    row.setParent(parent)
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.alignItems = FlexAlign.Center
    f.justifyContent = FlexJustify.Start
    f.columnGap = 0.4
    f.width = this.panelWidth - PAD * 2
    f.height = heightCM
    const item = row.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideHeight = heightCM

    const iconSO = global.scene.createSceneObject("Icon")
    iconSO.setParent(row)
    const img = iconSO.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = icon
    mat.mainPass.baseColor = MUTED
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    iconSO.getTransform().setLocalScale(new vec3(1.8, 1.8, 1))
    iconSO.createComponent(FlexItem.getTypeName())

    this.addRowText(row, text, "Callout", (text.length * 0.5) + 1, MUTED)
  }

  private addRowText(parent: SceneObject, text: string, role: TextRole, widthCM: number, color: vec4): Text {
    const so = global.scene.createSceneObject("RowText")
    so.setParent(parent)
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    applyTextRole(t, role)
    t.textFill.color = color
    t.horizontalAlignment = HorizontalAlignment.Left
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-widthCM / 2, widthCM / 2, -1.2, 1.2)
    so.createComponent(FlexItem.getTypeName())
    return t
  }

  private addStretchText(parent: SceneObject, text: string, role: TextRole, heightCM: number, color: vec4, wrap: boolean = false): Text {
    const so = global.scene.createSceneObject("StretchText")
    so.setParent(parent)
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    applyTextRole(t, role)
    t.textFill.color = color
    t.horizontalAlignment = HorizontalAlignment.Left
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = wrap ? HorizontalOverflow.Wrap : HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-0.5, 0.5, -0.5, 0.5)
    const item = so.createComponent(FlexItem.getTypeName()) as FlexItem
    item.alignSelf = FlexAlignSelf.Stretch
    item.overrideHeight = heightCM
    return t
  }
}
