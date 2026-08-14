// Adapted from ls-clad:specs-interaction-recipes §4 TapInteraction.ts (>=70% match — CONFIG
// tweaked, class renamed per experience-prefix convention). See SKILL.md §11.
//
// TraceGraphTapInteraction — drop-in @component for a single graph node's pinch-tap.
// Wraps SIK's Interactable so TraceGraphNodeView doesn't have to wire it by hand for
// every one of the ~33 procedurally created node objects.
//
// Attach AFTER creating a ColliderComponent on the same SceneObject if the caller wants
// a specific shape (e.g. SphereShape sized to the node) — ensureCollider() only creates
// a box collider when none exists yet, so a pre-existing collider is left untouched.
//
// Hover fix, round 2 (see class-level comment on ensureIndirectSphereCastForSmallTargets
// AND the CONFIG.targetingMode comment below for the two independent root causes found
// across two debugging passes):
//
// Round 1 (WRONG theory, kept only because it's harmless — see below): theorized the
// cause was SIK's *indirect* (ray) hover targeting missing small colliders and enabled
// HandInteractor.sphereCastEnabled. Live-retested: no change. Root cause was elsewhere.
//
// Round 2 (confirmed by full static trace against SIK source — PreviewInteractTool was
// NOT available in the session that made this fix; see the fix-pass report for the
// verification gap and how to close it):
// PhysicalInteractionProvider.ts (SIK's Direct/Poke touch-proximity provider — the path
// that actually drives PreviewInteractTool's "Hover" simulated approach-and-cross motion,
// per Cache/.../AiPreviewAgentInteract.lspkg/interactor/HandInteractor.ts hoverInteractable())
// gates a Direct-only Interactable's hover behind TWO independent detection systems both
// passing (see PhysicalInteractionProvider.currentInteractableSet): (1) an index-finger
// spherecast ("indexFingerTouchedInteractables" — the same system tap already relies on,
// and it DOES register our ~1.2cm SphereShape reliably) AND (2) a "hand nearby" proximity
// check ("nearbyInteractables") using a SEPARATE sphere positioned at the MIDPOINT of
// index-tip and thumb-tip, radius HandInteractor.directColliderEnterRadius/ExitRadius
// (defaults 1cm / 1.5cm — see HandInteractor.ts). While NOT pinching (i.e. during a real
// hover), the thumb sits away from the index finger, so that midpoint never lands close
// enough to a small node for check (2) to pass — hover never fires. Tap kept working
// because pinching brings thumb and index together AT the target, incidentally
// satisfying check (2) too.
//
// A Poke-capable Interactable skips check (2) entirely (see checkForNewInteraction's
// `if (supportsPoke)` branch, which only needs indexFingerTouchedInteractables) — this is
// exactly how SpectaclesUIKit.lspkg/Scripts/Components/Element.ts (Button's base class)
// gets reliable hover: it sets `targetingMode = TargetingMode.All` (Direct|Indirect|Poke),
// not Direct|Indirect. Matching that targetingMode below is the actual fix — see
// ensureInteractable()/CONFIG.targetingMode.
import { Interactable } from "SpectaclesInteractionKit.lspkg/Components/Interaction/Interactable/Interactable";
import { InteractorEvent } from "SpectaclesInteractionKit.lspkg/Core/Interactor/InteractorEvent";
import { InteractionManager } from "SpectaclesInteractionKit.lspkg/Core/InteractionManager/InteractionManager";
import { InteractorInputType, TargetingMode } from "SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor";
import { HandInteractor } from "SpectaclesInteractionKit.lspkg/Core/HandInteractor/HandInteractor";
import Event from "SpectaclesInteractionKit.lspkg/Utils/Event";

// Module-level (not per-instance) guard — HandInteractor.sphereCastEnabled is an
// interactor-level setting (one flag per hand, not per-Interactable), so it only needs
// to be flipped once for the whole Lens, not once per node (~33 TraceGraphTapInteraction
// instances get created per graph build).
let indirectSphereCastEnabledForSmallTargets = false;

@component
export class TraceGraphTapInteraction extends BaseScriptComponent {

    private CONFIG = {
        autoCreateCollider: true,           // Create a box collider if the object doesn't have one
        colliderSize: new vec3(4, 4, 4),    // cm — only used when autoCreateCollider (nodes pre-create a SphereShape instead)
        debugCollider: false,               // Show wireframe while prototyping
        // TargetingMode bitflag: Direct=1, Indirect=2, Poke=4, All=7.
        // MUST include Poke (TargetingMode.All, not just Direct|Indirect=3) — see the
        // "Hover fix, round 2" class-header comment above. Direct|Indirect alone forces
        // PhysicalInteractionProvider through its dual-validation "nearbyInteractables"
        // gate, which a non-pinching hover essentially never satisfies on a small node.
        // TargetingMode.All matches SpectaclesUIKit.lspkg's Element.ts (Button's base
        // class), which is exactly why UIKit buttons hover reliably and these nodes didn't.
        targetingMode: TargetingMode.All,
    };

    public onTap: Event<InteractorEvent> = new Event<InteractorEvent>();
    public onHoverStart: Event<InteractorEvent> = new Event<InteractorEvent>();
    public onHoverEnd: Event<InteractorEvent> = new Event<InteractorEvent>();

    private interactable: Interactable;

    onAwake() {
        this.ensureCollider();
        this.ensureInteractable();
        this.ensureIndirectSphereCastForSmallTargets();

        this.createEvent("OnStartEvent").bind(() => {
            this.interactable.onTriggerStart.add((e: InteractorEvent) => this.onTap.invoke(e));
            this.interactable.onHoverEnter.add((e: InteractorEvent) => this.onHoverStart.invoke(e));
            this.interactable.onHoverExit.add((e: InteractorEvent) => this.onHoverEnd.invoke(e));
        });
    }

    private ensureCollider() {
        let collider = this.getSceneObject().getComponent("Physics.ColliderComponent");
        if (!collider && this.CONFIG.autoCreateCollider) {
            collider = this.getSceneObject().createComponent("Physics.ColliderComponent");
            const shape = Shape.createBoxShape();
            shape.size = this.CONFIG.colliderSize;
            collider.shape = shape;
        }
        if (collider) {
            collider.debugDrawEnabled = this.CONFIG.debugCollider;
        }
    }

    private ensureInteractable() {
        this.interactable = this.getSceneObject().getComponent(Interactable.getTypeName());
        if (!this.interactable) {
            this.interactable = this.getSceneObject().createComponent(Interactable.getTypeName());
        }
        this.interactable.targetingMode = this.CONFIG.targetingMode;
    }

    /**
     * NOTE: this is NOT the fix for the onHoverEnter-never-fires bug (see class header
     * "Hover fix, round 2" — that fix is CONFIG.targetingMode = TargetingMode.All, applied
     * in ensureInteractable() above). This method is a real, independent mitigation for a
     * DIFFERENT case: far-field *Indirect* (ray) hover, where the hand points at a node
     * from across the room rather than touching it. Kept because it's harmless and still
     * correct for that case — see scope/safety note below.
     *
     * SIK's indirect-targeting hover (Core/Interactor/IndirectTargetProvider.ts,
     * indirectRayCast()) does a single raw raycast per frame and only falls back to a
     * progressive spherecast — sized exactly for "small or distant objects" per its own
     * doc comment on BaseInteractor.spherecastRadii — when `HandInteractor.sphereCastEnabled`
     * is true. That flag defaults to false and is NOT an `@input` (confirmed against this
     * project's own .virtual-scene.json: LeftHandInteractor/RightHandInteractor's
     * inputNames list has directColliderEnterRadius/ExitRadius, directDragThreshold,
     * indirectDragThreshold, forcePokeOnNonDominantPalmProximity, handType, _drawDebug —
     * no sphereCastEnabled/spherecastRadii/spherecastDistanceThresholds), so it can only be
     * set from code, never from the Inspector or a scene bootstrap property write.
     *
     * A raw raycast aimed exactly at a target's center always hits regardless of distance,
     * but a real hand's (or PreviewInteractTool's synthetic hand's) pointing ray always has
     * some angular slop — which is precisely why SIK ships the spherecast fallback. Against
     * a large flat UIKit Button/Frame collider that slop rarely matters, which is why hover
     * "just worked" there; against this node's ~1-3cm SphereShape collider it reliably
     * misses. Tap kept working throughout because SIK routes it through a *different*
     * provider (PhysicalInteractionProvider — near-touch proximity, not raycasting), which
     * this fix does not touch.
     *
     * Scope/safety: this only enables spherecast as a fallback for when the raw raycast
     * finds nothing (see indirectRayCast's `if (hitInfo) return; ... if sphereCastEnabled`),
     * so it is strictly additive — it cannot change the outcome of any interaction that
     * already succeeds today, including this same node's own tap/selection behavior.
     */
    private ensureIndirectSphereCastForSmallTargets() {
        if (indirectSphereCastEnabledForSmallTargets) return;
        indirectSphereCastEnabledForSmallTargets = true;

        const handInteractors = InteractionManager.getInstance().getInteractorsByType(
            InteractorInputType.BothHands
        ) as HandInteractor[];
        for (const interactor of handInteractors) {
            interactor.sphereCastEnabled = true;
        }
    }
}
