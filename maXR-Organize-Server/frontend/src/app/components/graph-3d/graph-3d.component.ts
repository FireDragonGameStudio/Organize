import { Component, OnInit, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { forkJoin } from 'rxjs';
import { ProjectService } from '../../services/project.service';
import { WebsocketService } from '../../services/websocket.service';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { XRButton } from 'three/examples/jsm/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { OculusHandModel } from 'three/examples/jsm/webxr/OculusHandModel.js';
import { OculusHandPointerModel } from 'three/examples/jsm/webxr/OculusHandPointerModel.js';

interface GraphNode {
  id: string;
  req: any;
  type: string;
  x: number;
  y: number;
  z: number;
  mesh?: THREE.Mesh;
}

@Component({
  selector: 'app-graph-3d',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="graph-container">
      <header class="header">
        <button mat-icon-button (click)="goBack()" class="back-btn">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <h1>3D Traceability Graph (WebXR Mode)</h1>
      </header>

      <div class="canvas-wrapper">
        <div *ngIf="loading" class="loading-overlay">
          <div class="loading-text">Generating 3D Graph...</div>
        </div>
        <canvas #graphCanvas class="graph-canvas"></canvas>

        <!-- Desktop Side Panel -->
        <div *ngIf="selectedNode && !isVrMode" class="side-panel">
          <button mat-icon-button (click)="selectedNode = null" class="close-btn">
            <mat-icon>close</mat-icon>
          </button>
          <h2>{{ selectedNode.req.title || 'Untitled' }}</h2>
          <div class="meta-data">
            <span class="badge">{{ selectedNode.req.name }}</span>
            <span class="badge type">{{ selectedNode.type }}</span>
          </div>
          <p class="description">{{ selectedNode.req.description }}</p>
          <div class="trace-links" *ngIf="selectedNode.req.traceLinks?.length || getTracedByNames(selectedNode).length">
            <ng-container *ngIf="getTracedByNames(selectedNode).length">
              <h3>Traced By:</h3>
              <div class="meta-data">
                <span class="badge link traced-by" *ngFor="let linkName of getTracedByNames(selectedNode)">{{ linkName }}</span>
              </div>
            </ng-container>
            <ng-container *ngIf="selectedNode.req.traceLinks?.length">
              <h3>Traces To:</h3>
              <div class="meta-data">
                <span class="badge link" *ngFor="let linkName of getTraceLinkNames(selectedNode)">{{ linkName }}</span>
              </div>
            </ng-container>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .graph-container {
      padding: 0;
      margin: 0;
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      background-color: #0f172a;
    }
    .header {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      display: flex;
      align-items: center;
      padding: 1rem 1.5rem;
      z-index: 100;
      pointer-events: none;
    }
    .back-btn {
      color: white;
      pointer-events: auto;
      background: rgba(255, 255, 255, 0.1);
      margin-right: 1rem;
    }
    h1 { margin: 0; color: white; font-weight: 500; font-size: 1.2rem; }
    
    .canvas-wrapper {
      position: relative;
      flex-grow: 1;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .graph-canvas {
      display: block;
      width: 100%;
      height: 100%;
      outline: none;
    }
    .loading-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }
    .loading-text {
      color: white;
      font-size: 1.5rem;
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1; }
      100% { opacity: 0.6; }
    }
    .side-panel {
      position: absolute;
      top: 80px;
      right: 20px;
      width: 350px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 1.5rem;
      color: white;
      z-index: 50;
      display: flex;
      flex-direction: column;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .side-panel h2 {
      margin: 0 0 1rem 0;
      font-size: 1.25rem;
      font-weight: 600;
      padding-right: 2rem;
    }
    .side-panel .close-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      color: white;
    }
    .meta-data {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .badge {
      background: rgba(255, 255, 255, 0.1);
      padding: 0.25rem 0.75rem;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .badge.type {
      background: rgba(96, 165, 250, 0.2);
      color: #93c5fd;
    }
    .description {
      font-size: 0.95rem;
      line-height: 1.5;
      color: #cbd5e1;
      margin: 0;
      max-height: 400px;
      overflow-y: auto;
    }
    .trace-links {
      margin-top: 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 1rem;
    }
    .trace-links h3 {
      font-size: 0.9rem;
      margin: 0 0 0.5rem 0;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge.link {
      background: rgba(167, 139, 250, 0.2);
      color: #c4b5fd;
    }
    .badge.link.traced-by {
      background: rgba(110, 231, 183, 0.2);
      color: #6ee7b7;
    }
  `]
})
export class Graph3dComponent implements OnInit, AfterViewInit, OnDestroy {
  projectId: string = '';
  loading = true;

  @ViewChild('graphCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  // Three.js instances
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  
  // Graph Data
  private nodes: Map<string, GraphNode> = new Map();
  private meshes: THREE.Mesh[] = [];
  private edges: THREE.Line[] = [];
  
  // Graph Layers
  private yLevels = { ur: 80, sr: 0, dir_swr: -80 };

  private xrButtonEl: HTMLElement | null = null;

  // XR Interactions
  private handPointers: { hp: any, controller: THREE.Group }[] = [];
  private leftHand: THREE.Group | null = null;
  private hoveredNode: GraphNode | null = null;
  public selectedNode: GraphNode | null = null;
  private vrUi!: VrUi;

  // Desktop Interactions
  private mouse = new THREE.Vector2(-1, -1);
  private raycaster = new THREE.Raycaster();
  public isVrMode = false;
  
  // Flight Controls
  private keysPressed: { [key: string]: boolean } = {};
  private moveSpeed = 2.0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private projectService: ProjectService,
    private wsService: WebsocketService
  ) {}

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('id') || '';
    
    this.wsService.connect(this.projectId);
    this.wsService.getMessages().subscribe(() => {
      this.loadData();
    });
  }

  ngAfterViewInit() {
    this.initThreeJs();
    this.loadData();
  }

  ngOnDestroy() {
    if (this.renderer) {
      this.renderer.dispose();
    }
    if (this.controls) {
      this.controls.dispose();
    }
    if (this.xrButtonEl) {
      this.xrButtonEl.remove();
    }
    this.wsService.disconnect();
  }

  goBack() {
    this.router.navigate(['/projects', this.projectId]);
  }

  private initThreeJs() {
    const canvas = this.canvasRef.nativeElement;
    const parent = canvas.parentElement!;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a');

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 50);
    this.scene.add(directionalLight);

    this.camera = new THREE.PerspectiveCamera(50, parent.clientWidth / parent.clientHeight, 0.1, 2000);
    this.camera.position.set(0, 150, 400);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(parent.clientWidth, parent.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.xr.enabled = true;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    const sessionInit = {
      optionalFeatures: ['hand-tracking']
    };
    this.xrButtonEl = XRButton.createButton(this.renderer, sessionInit);
    parent.appendChild(this.xrButtonEl);

    // Setup VR UI
    this.vrUi = new VrUi();
    this.vrUi.mesh.visible = false;
    this.scene.add(this.vrUi.mesh);

    this.initControllers();

    // Reset desktop camera when exiting VR
    this.renderer.xr.addEventListener('sessionend', () => {
      this.camera.position.set(0, 150, 400);
      this.camera.quaternion.identity();
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    });

    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      
      this.isVrMode = this.renderer.xr.isPresenting;
      
      if (this.isVrMode) {
        this.updateXrInteractions();
      } else {
        this.updateDesktopInteractions();
      }
      
      this.renderer.render(this.scene, this.camera);
    });
  }

  private initControllers() {
    const controllerModelFactory = new XRControllerModelFactory();

    for (let i = 0; i < 2; i++) {
      // Base Controller
      const controller = this.renderer.xr.getController(i);
      
      // Add visible ray
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.8 }));
      line.name = 'line';
      line.scale.z = 150;
      controller.add(line);
      
      this.scene.add(controller);

      // Grip Models (Controllers)
      const controllerGrip = this.renderer.xr.getControllerGrip(i);
      controllerGrip.add(controllerModelFactory.createControllerModel(controllerGrip));
      this.scene.add(controllerGrip);

      // Hand Tracking Models (Point and Pinch)
      const hand = this.renderer.xr.getHand(i);
      hand.add(new OculusHandModel(hand));
      
      const handPointer = new (OculusHandPointerModel as any)(hand, controller);
      hand.add(handPointer);
      this.scene.add(hand);

      this.handPointers.push({ hp: handPointer, controller });
      
      // Dynamically detect handedness when the controller connects
      controller.addEventListener('connected', (event: any) => {
        if (event.data.handedness === 'left') {
          this.leftHand = controller;
        }
      });
      controller.addEventListener('disconnected', (event: any) => {
        if (event.data.handedness === 'left' && this.leftHand === controller) {
          this.leftHand = null;
        }
      });
    }
  }

  private updateXrInteractions() {
    let hovered: GraphNode | null = null;

    this.handPointers.forEach(({ hp, controller }) => {
      let distance: number | null = null;
      let intersectingMesh: THREE.Mesh | null = null;

      const intersections: any[] = hp.intersectObject(this.scene, true) || [];
      const nodeIntersections = intersections.filter((ix: any) => (ix.object as THREE.Mesh).userData && (ix.object as THREE.Mesh).userData['id']);

      if (nodeIntersections.length > 0) {
        distance = nodeIntersections[0].distance;
        intersectingMesh = nodeIntersections[0].object as THREE.Mesh;
      }

      const line = controller.getObjectByName('line');

      if (distance !== null && intersectingMesh) {
        hp.setCursor(distance);
        if (line) line.scale.z = distance;
        
        const nodeId = intersectingMesh.userData['id'];
        hovered = this.nodes.get(nodeId) || null;

        const currentlyPinched = hp.isPinched();
        const wasPinched = hp.userData['wasPinched'] || false;

        if (currentlyPinched && !wasPinched) {
          if (hovered && this.selectedNode !== hovered) {
            this.selectedNode = hovered;
            this.vrUi.update(this.selectedNode, this.nodes);
            this.vrUi.mesh.visible = true;
          }
        }
        hp.userData['wasPinched'] = currentlyPinched;
      } else {
        hp.setCursor(1.5);
        if (line) line.scale.z = 150;
        hp.userData['wasPinched'] = hp.isPinched();
      }
    });

    this.hoveredNode = hovered;
    this.highlightNodes();

    // Position UI hovering above the left hand
    if (this.vrUi.mesh.visible && this.leftHand) {
       const handPos = new THREE.Vector3();
       this.leftHand.getWorldPosition(handPos);
       
       // Offset UI 20cm above the wrist in world space
       this.vrUi.mesh.position.copy(handPos).add(new THREE.Vector3(0, 0.2, 0));
       
       // UI looks towards the camera
       const cameraPos = new THREE.Vector3();
       this.camera.getWorldPosition(cameraPos);
       this.vrUi.mesh.lookAt(cameraPos);
    }
  }

  private updateDesktopInteractions() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersections = this.raycaster.intersectObject(this.scene, true);
    const nodeIntersections = intersections.filter((ix: any) => (ix.object as THREE.Mesh).userData && (ix.object as THREE.Mesh).userData['id']);
    
    let hovered: GraphNode | null = null;
    if (nodeIntersections.length > 0) {
      const nodeId = nodeIntersections[0].object.userData['id'];
      hovered = this.nodes.get(nodeId) || null;
    }
    
    this.hoveredNode = hovered;
    this.highlightNodes();

    // Flight controls
    const moveVector = new THREE.Vector3(0, 0, 0);
    
    if (this.keysPressed['w']) moveVector.z -= 1;
    if (this.keysPressed['s']) moveVector.z += 1;
    if (this.keysPressed['a']) moveVector.x -= 1;
    if (this.keysPressed['d']) moveVector.x += 1;
    if (this.keysPressed['q']) moveVector.y -= 1;
    if (this.keysPressed['e']) moveVector.y += 1;

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(this.moveSpeed);
      moveVector.applyQuaternion(this.camera.quaternion);
      
      this.camera.position.add(moveVector);
      this.controls.target.add(moveVector);
    }
  }

  public getTraceLinkNames(node: GraphNode): string[] {
    if (!node || !node.req.traceLinks) return [];
    return node.req.traceLinks.map((id: string) => {
      const linkedNode = this.nodes.get(id);
      return linkedNode ? linkedNode.req.name : 'Unknown';
    });
  }

  public getTracedByNames(targetNode: GraphNode): string[] {
    if (!targetNode) return [];
    const tracedBy: string[] = [];
    this.nodes.forEach((node) => {
      if (node.req.traceLinks && node.req.traceLinks.includes(targetNode.id)) {
        tracedBy.push(node.req.name || 'Unknown');
      }
    });
    return tracedBy;
  }

  private highlightNodes() {
    const focalNode = this.selectedNode || this.hoveredNode;
    
    if (focalNode) {
      const connectedIds = new Set<string>();
      connectedIds.add(focalNode.id);
      
      if (focalNode.req.traceLinks) {
        focalNode.req.traceLinks.forEach((id: string) => connectedIds.add(id));
      }
      
      this.nodes.forEach((node) => {
        if (node.req.traceLinks && node.req.traceLinks.includes(focalNode.id)) {
          connectedIds.add(node.id);
        }
      });

      this.meshes.forEach(m => {
        const mId = m.userData['id'];
        const origColor = m.userData['color'];
        const mat = m.material as THREE.MeshStandardMaterial;
        const labelSprite = m.getObjectByName('labelSprite') as THREE.Sprite;
        
        if (mId === this.hoveredNode?.id || mId === this.selectedNode?.id) {
          mat.color.setHex(origColor);
          mat.opacity = 1;
          mat.emissive.setHex(0xffffff);
          mat.emissiveIntensity = 0.5;
          if (labelSprite) labelSprite.material.opacity = 1;
        } else if (connectedIds.has(mId)) {
          mat.color.setHex(origColor);
          mat.opacity = 1;
          mat.emissive.setHex(0x000000);
          if (labelSprite) labelSprite.material.opacity = 1;
        } else {
          // Dimmed
          mat.color.setHex(0x334155);
          mat.opacity = 0.15;
          mat.emissive.setHex(0x000000);
          if (labelSprite) labelSprite.material.opacity = 0.15;
        }
      });
      
      this.edges.forEach(line => {
        const sourceId = line.userData['sourceId'];
        const targetId = line.userData['targetId'];
        const lineMat = line.material as THREE.LineBasicMaterial;
        
        if (sourceId === focalNode.id || targetId === focalNode.id) {
          lineMat.opacity = 0.8;
        } else {
          lineMat.opacity = 0.05;
        }
      });
      
    } else {
      this.meshes.forEach(m => {
        const origColor = m.userData['color'];
        const mat = m.material as THREE.MeshStandardMaterial;
        const labelSprite = m.getObjectByName('labelSprite') as THREE.Sprite;
        
        if (origColor !== undefined) mat.color.setHex(origColor);
        mat.opacity = 1;
        mat.emissive.setHex(0x000000);
        if (labelSprite) labelSprite.material.opacity = 1;
      });
      
      this.edges.forEach(line => {
        const lineMat = line.material as THREE.LineBasicMaterial;
        lineMat.opacity = 0.2;
      });
    }
  }

  private loadData() {
    forkJoin({
      ur: this.projectService.getFiles(this.projectId, 'user'),
      sr: this.projectService.getFiles(this.projectId, 'system'),
      dir: this.projectService.getFiles(this.projectId, 'design_input'),
      swr: this.projectService.getFiles(this.projectId, 'software')
    }).subscribe(results => {
      this.buildGraph(results.ur, results.sr, results.dir, results.swr);
      this.loading = false;
    });
  }

  private buildGraph(urs: any[], srs: any[], dirs: any[], swrs: any[]) {
    this.meshes.forEach(m => {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.edges.forEach(line => {
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    });
    this.meshes = [];
    this.edges = [];
    this.nodes.clear();

    const colors = {
      'user': 0x06b6d4, // Cyan
      'system': 0xd946ef, // Magenta
      'design_input': 0x84cc16, // Lime Green
      'software': 0xeab308 // Yellow
    };

    const getTypeAndColor = (req: any): { type: string, color: number } => {
      const name = req.name || '';
      if (name.startsWith('UR')) return { type: 'user', color: colors.user };
      if (name.startsWith('SR')) return { type: 'system', color: colors.system };
      if (name.startsWith('DIR')) return { type: 'design_input', color: colors.design_input };
      if (name.startsWith('SWR')) return { type: 'software', color: colors.software };
      return { type: 'unknown', color: 0xffffff };
    };

    const createMesh = (req: any, type: string, x: number, y: number, z: number, color: number) => {
      const geometry = new THREE.SphereGeometry(6, 32, 32);
      const material = new THREE.MeshStandardMaterial({ 
        color: color,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 1
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.userData = { id: req.id, color: color }; // Vital for raycasting!
      
      // Add text label sprite above node
      const label = this.createSpriteLabel(req.name || 'Unknown', 4); 
      label.position.set(0, 9, 0); // 9 units up is slightly above the radius of 6
      label.name = 'labelSprite';
      mesh.add(label);
      
      // Add invisible hitbox (much larger radius) to make raycasting easier in VR
      const hitBoxGeo = new THREE.SphereGeometry(15, 16, 16);
      const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
      hitBox.userData = { id: req.id }; 
      mesh.add(hitBox);

      this.scene.add(mesh);
      this.meshes.push(mesh);
      this.nodes.set(req.id, { id: req.id, req, type, x, y, z, mesh });
    };

    const placedNodes = new Set<string>();

    const arrangeInCircle = (children: any[], centerX: number, centerZ: number, y: number) => {
      const count = children.length;
      if (count === 0) return;
      if (count === 1) {
        const { type, color } = getTypeAndColor(children[0]);
        createMesh(children[0], type, centerX, y, centerZ, color);
        placedNodes.add(children[0].id);
        return;
      }
      
      const radius = Math.max(40, count * 15); 
      children.forEach((child, index) => {
        const { type, color } = getTypeAndColor(child);
        const angle = (index / count) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const z = centerZ + Math.sin(angle) * radius;
        createMesh(child, type, x, y, z, color);
        placedNodes.add(child.id);
      });
    };

    const getChildren = (parentId: string, childrenPool: any[]) => {
      const parentNode = this.nodes.get(parentId);
      if (!parentNode) return [];
      const traceLinks = parentNode.req.traceLinks || [];
      return childrenPool.filter(c => traceLinks.includes(c.id));
    };

    const urCount = urs.length;
    const urRadius = Math.max(120, urCount * 20); 
    urs.forEach((ur, index) => {
      const angle = (index / Math.max(1, urCount)) * Math.PI * 2;
      const x = Math.cos(angle) * urRadius;
      const z = Math.sin(angle) * urRadius;
      createMesh(ur, 'user', x, this.yLevels.ur, z, colors.user);
      placedNodes.add(ur.id);
    });

    let remainingSRs = [...srs];
    urs.forEach(ur => {
      const childSRs = getChildren(ur.id, remainingSRs);
      const parentNode = this.nodes.get(ur.id)!;
      arrangeInCircle(childSRs, parentNode.x, parentNode.z, this.yLevels.sr);
      remainingSRs = remainingSRs.filter(sr => !placedNodes.has(sr.id));
    });
    arrangeInCircle(remainingSRs, 0, 0, this.yLevels.sr);

    let remainingBottom = [...dirs, ...swrs];
    srs.forEach(sr => {
      const childReqs = getChildren(sr.id, remainingBottom);
      const parentNode = this.nodes.get(sr.id)!;
      arrangeInCircle(childReqs, parentNode.x, parentNode.z, this.yLevels.dir_swr);
      remainingBottom = remainingBottom.filter(req => !placedNodes.has(req.id));
    });
    arrangeInCircle(remainingBottom, 0, 0, this.yLevels.dir_swr);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    
    this.nodes.forEach(node => {
      const traceLinks: string[] = node.req.traceLinks || [];
      traceLinks.forEach(targetId => {
        const targetNode = this.nodes.get(targetId);
        if (targetNode) {
          const points = [];
          points.push(new THREE.Vector3(node.x, node.y, node.z));
          points.push(new THREE.Vector3(targetNode.x, targetNode.y, targetNode.z));
          const geometry = new THREE.BufferGeometry().setFromPoints(points);
          const line = new THREE.Line(geometry, lineMaterial.clone());
          line.userData = { sourceId: node.id, targetId: targetNode.id };
          this.scene.add(line);
          this.edges.push(line);
        }
      });
    });
  }

  private createSpriteLabel(message: string, height: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    const textHeight = 100;
    context.font = 'bold ' + textHeight + 'px Arial';
    const metrics = context.measureText(message);
    const textWidth = metrics.width;
    
    // Add some padding
    canvas.width = textWidth + 20;
    canvas.height = textHeight + 20;
    
    context.font = 'bold ' + textHeight + 'px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Draw text with a subtle shadow for readability against graph lines
    context.shadowColor = 'rgba(0, 0, 0, 0.8)';
    context.shadowBlur = 10;
    context.shadowOffsetX = 2;
    context.shadowOffsetY = 2;
    context.fillStyle = '#ffffff';
    context.fillText(message, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
    
    // Disable raycasting for the label so it doesn't throw camera errors or block clicks
    sprite.raycast = () => {};
    
    return sprite;
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (this.isVrMode || !this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.isVrMode) return;
    if (this.hoveredNode) {
      this.selectedNode = this.hoveredNode;
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (this.isVrMode) return;
    this.keysPressed[event.key.toLowerCase()] = true;
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent) {
    if (this.isVrMode) return;
    this.keysPressed[event.key.toLowerCase()] = false;
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (!this.camera || !this.renderer) return;
    const parent = this.canvasRef.nativeElement.parentElement!;
    this.camera.aspect = parent.clientWidth / parent.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(parent.clientWidth, parent.clientHeight);
  }
}

class VrUi {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = 512;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    
    const material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(0.6, 0.3); // 60cm wide, 30cm tall
    this.mesh = new THREE.Mesh(geometry, material);
  }

  update(node: GraphNode, nodesMap: Map<string, GraphNode>) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
    ctx.beginPath();
    ctx.roundRect(0, 0, this.canvas.width, this.canvas.height, 30);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText(node.req.title || 'Untitled', 40, 80);

    ctx.fillStyle = '#60a5fa';
    ctx.font = '36px sans-serif';
    ctx.fillText(`ID: ${node.req.name} (${node.type})`, 40, 140);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '32px sans-serif';
    let yOffset = this.wrapText(ctx, node.req.description || '', 40, 200, 940, 40) + 40;

    // Find Traced By
    const tracedBy: string[] = [];
    nodesMap.forEach((n) => {
      if (n.req.traceLinks && n.req.traceLinks.includes(node.id)) {
        tracedBy.push(n.req.name || 'Unknown');
      }
    });

    if (tracedBy.length > 0) {
      ctx.fillStyle = '#6ee7b7';
      ctx.font = '28px sans-serif';
      yOffset = this.wrapText(ctx, `Traced By: ${tracedBy.join(', ')}`, 40, yOffset, 940, 36) + 30;
    }

    const traceLinks = node.req.traceLinks || [];
    if (traceLinks.length > 0) {
      const linkNames = traceLinks.map((id: string) => {
        const linkedNode = nodesMap.get(id);
        return linkedNode ? linkedNode.req.name : 'Unknown';
      });
      
      ctx.fillStyle = '#c4b5fd';
      ctx.font = '28px sans-serif';
      this.wrapText(ctx, `Traces To: ${linkNames.join(', ')}`, 40, yOffset, 940, 36);
    }

    this.texture.needsUpdate = true;
  }

  wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      if (ctx.measureText(testLine).width > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
    return y;
  }
}
