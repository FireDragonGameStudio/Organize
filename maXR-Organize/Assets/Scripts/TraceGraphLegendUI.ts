/**
 * TraceGraphLegendUI — small fixed HUD panel above the requirements trace graph.
 *
 * Owns: title header + a 4-cell legend (icon, class code, live count) for
 * User / System / Design Input / Software requirements. Display-only —
 * no interactive elements, no domain state. TraceGraphMain pushes counts in
 * via setCounts() whenever the requirement set changes (initial build or a
 * type reassignment).
 *
 * Must not: read requirement data directly, make graph/layout decisions.
 */
import { BackPlate } from "SpectaclesUIKit.lspkg/Scripts/BackPlate"
import { FlexLayout } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexLayout"
import { FlexItem } from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexItem"
import {
  FlexAlign, FlexDirection, FlexJustify,
} from "SpectaclesUIKit.lspkg/Scripts/Components/Layout2D/Flex/FlexTypes"

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
const ICON_ACCOUNT_TREE: Texture = requireAsset("../Icons/account_tree.png") as Texture
const ICON_PERSON: Texture = requireAsset("../Icons/person.png") as Texture
const ICON_HUB: Texture = requireAsset("../Icons/hub.png") as Texture
const ICON_ARCHITECTURE: Texture = requireAsset("../Icons/architecture.png") as Texture
const ICON_CODE: Texture = requireAsset("../Icons/code.png") as Texture

const imageMaterial = requireAsset("../Materials/ImageMaterial.mat") as Material

const PAD = 0.8
const HEADER_H = 3.0
const GAP = 0.4

export interface TraceGraphCounts {
  UR: number
  SR: number
  DIR: number
  SWR: number
}

@component
export class TraceGraphLegendUI extends BaseScriptComponent {
  @ui.label('<span style="color: #60A5FA;">TraceGraphLegendUI – Title + 4-class legend HUD</span>')
  @ui.separator

  @ui.label('<span style="color: #60A5FA;">Settings</span>')
  @ui.group_start("Settings")
  @input
  @hint("Panel width in centimeters")
  @widget(new SliderWidget(20, 50, 0.5))
  panelWidth: number = 30

  @input
  @hint("Panel height in centimeters")
  @widget(new SliderWidget(6, 16, 0.5))
  panelHeight: number = 9

  @input
  @hint("Header title text")
  titleText: string = "Requirements Trace Graph"

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

  @input
  @hint("Log layout diagnostics to the console")
  debugLayout: boolean = false
  @ui.group_end

  private urCountText!: Text
  private srCountText!: Text
  private dirCountText!: Text
  private swrCountText!: Text

  onAwake(): void {
    this.sceneObject.createComponent("Component.Canvas")

    const backPlate = this.sceneObject.createComponent(BackPlate.getTypeName()) as BackPlate
    backPlate.size = new vec2(this.panelWidth, this.panelHeight)

    // This panel is display-only (see class doc comment) but BackPlate always
    // creates a live Interactable + InteractionPlane regardless — left
    // enabled, this HUD (which sits directly above the UR node layer, only
    // 5cm away in Y) becomes a real interaction target competing with node
    // hover. See TraceGraphTooltipUI's onInitialized block for the full
    // reasoning on why all three lines below are required: disabling
    // `interactable` and `interactionPlane` alone leaves InteractionPlane's
    // own physics collider live (it's created after Interactable's collider
    // auto-discovery already ran, so `interactable.enabled = false` never
    // reaches it) — must disable that collider directly too.
    backPlate.onInitialized.add(() => {
      backPlate.interactable.enabled = false
      backPlate.interactionPlane.enabled = false
      // See TraceGraphTooltipUI's onInitialized block for why this is a
      // `.destroy()` rather than trusting `.enabled = false` alone — a live
      // raycast was observed still resolving a hit against this exact
      // collider after disabling it. Safe to destroy: this panel never
      // resizes itself after initial setup.
      if (backPlate.interactionPlane.collider) backPlate.interactionPlane.collider.destroy()
    })

    const content = global.scene.createSceneObject("Content")
    content.setParent(this.sceneObject)
    content.getTransform().setLocalPosition(new vec3(0, 0, 0.6))

    const col = content.createComponent(FlexLayout.getTypeName()) as FlexLayout
    col.width = this.panelWidth
    col.height = this.panelHeight
    col.direction = FlexDirection.Column
    col.alignItems = FlexAlign.Center
    col.justifyContent = FlexJustify.Start
    col.rowGap = GAP
    col.paddingTop = PAD
    col.paddingBottom = PAD
    col.paddingLeft = PAD
    col.paddingRight = PAD

    if (this.debugLayout) {
      col.onLayoutComplete.add((r) => {
        console.log(`[TraceGraphLegendUI] layout complete: ${r.containerWidth} x ${r.containerHeight}`)
      })
    }

    this.addHeaderRow(content)
    this.addLegendRow(content)
  }

  /** Public API — TraceGraphMain pushes updated per-class counts. */
  setCounts(counts: TraceGraphCounts): void {
    if (this.urCountText) this.urCountText.text = String(counts.UR)
    if (this.srCountText) this.srCountText.text = String(counts.SR)
    if (this.dirCountText) this.dirCountText.text = String(counts.DIR)
    if (this.swrCountText) this.swrCountText.text = String(counts.SWR)
  }

  private addHeaderRow(parent: SceneObject): void {
    const row = global.scene.createSceneObject("Header")
    row.setParent(parent)
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.alignItems = FlexAlign.Center
    f.justifyContent = FlexJustify.Center
    f.columnGap = 0.6
    f.width = this.panelWidth - PAD * 2
    f.height = HEADER_H
    const item = row.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideHeight = HEADER_H

    this.addIcon(row, ICON_ACCOUNT_TREE, 2.6, new vec4(1, 1, 1, 1))
    this.addColoredText(row, this.titleText, "Headline2", (this.titleText.length * 0.55) + 1, new vec4(1, 1, 1, 1), HEADER_H)
  }

  private addLegendRow(parent: SceneObject): void {
    const legendH = this.panelHeight - PAD * 2 - HEADER_H - GAP
    const row = global.scene.createSceneObject("Legend")
    row.setParent(parent)
    const f = row.createComponent(FlexLayout.getTypeName()) as FlexLayout
    f.direction = FlexDirection.Row
    f.alignItems = FlexAlign.Center
    f.justifyContent = FlexJustify.SpaceBetween
    f.columnGap = 0.4
    f.width = this.panelWidth - PAD * 2
    f.height = legendH
    const item = row.createComponent(FlexItem.getTypeName()) as FlexItem
    item.overrideHeight = legendH

    const cellW = (this.panelWidth - PAD * 2 - 0.4 * 3) / 4

    this.urCountText = this.addLegendCell(row, ICON_PERSON, "UR", this.urColor, cellW, legendH)
    this.srCountText = this.addLegendCell(row, ICON_HUB, "SR", this.srColor, cellW, legendH)
    this.dirCountText = this.addLegendCell(row, ICON_ARCHITECTURE, "DIR", this.dirColor, cellW, legendH)
    this.swrCountText = this.addLegendCell(row, ICON_CODE, "SWR", this.swrColor, cellW, legendH)
  }

  private addLegendCell(parent: SceneObject, icon: Texture, code: string, color: vec4, w: number, h: number): Text {
    const cell = global.scene.createSceneObject(`Cell-${code}`)
    cell.setParent(parent)
    const col = cell.createComponent(FlexLayout.getTypeName()) as FlexLayout
    col.direction = FlexDirection.Column
    col.alignItems = FlexAlign.Center
    col.justifyContent = FlexJustify.Center
    col.rowGap = 0.2
    col.width = w
    col.height = h
    const cellItem = cell.createComponent(FlexItem.getTypeName()) as FlexItem
    cellItem.overrideWidth = w
    cellItem.overrideHeight = h

    this.addIcon(cell, icon, 2.2, color)

    const labelRow = global.scene.createSceneObject(`LabelRow-${code}`)
    labelRow.setParent(cell)
    const lf = labelRow.createComponent(FlexLayout.getTypeName()) as FlexLayout
    lf.direction = FlexDirection.Row
    lf.alignItems = FlexAlign.Center
    lf.justifyContent = FlexJustify.Center
    lf.columnGap = 0.3
    lf.width = w
    lf.height = 1.6
    const lfItem = labelRow.createComponent(FlexItem.getTypeName()) as FlexItem
    lfItem.overrideHeight = 1.6

    this.addColoredText(labelRow, code, "Caption", w * 0.55, color, 1.6)
    return this.addColoredText(labelRow, "0", "Caption", w * 0.4, color, 1.6)
  }

  private addIcon(parent: SceneObject, texture: Texture, sizeCM: number, color: vec4): void {
    const so = global.scene.createSceneObject("Icon")
    so.setParent(parent)
    const img = so.createComponent("Component.Image") as Image
    const mat = imageMaterial.clone()
    mat.mainPass.baseTex = texture
    mat.mainPass.baseColor = color
    mat.mainPass.depthTest = true
    mat.mainPass.depthWrite = false
    img.clearMaterials()
    img.addMaterial(mat)
    so.getTransform().setLocalScale(new vec3(sizeCM, sizeCM, 1))
    so.createComponent(FlexItem.getTypeName())
  }

  private addColoredText(parent: SceneObject, text: string, role: TextRole, widthCM: number, color: vec4, heightCM: number = 1.6): Text {
    const so = global.scene.createSceneObject("Text")
    so.setParent(parent)
    const t = so.createComponent("Component.Text") as Text
    t.text = text
    t.depthTest = true
    applyTextRole(t, role)
    t.textFill.color = color
    t.horizontalAlignment = HorizontalAlignment.Center
    t.verticalAlignment = VerticalAlignment.Center
    t.horizontalOverflow = HorizontalOverflow.Overflow
    t.verticalOverflow = VerticalOverflow.Overflow
    t.layoutRect = Rect.create(-widthCM / 2, widthCM / 2, -heightCM / 2, heightCM / 2)
    so.createComponent(FlexItem.getTypeName())
    return t
  }
}
