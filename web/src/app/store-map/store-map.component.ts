import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, ChangeDetectorRef, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

@Component({
  selector: 'app-store-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './store-map.component.html',
  styleUrl: './store-map.component.scss',
})
export class StoreMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef<HTMLDivElement>;

  // UI State
  showSetupModal = false;
  isProcessing = false;
  numFloors = 1;
  hasBasement = false;
  editMode = false;
  transformMode: 'translate' | 'rotate' | 'scale' = 'translate';
  
  // Selection State
  hasSelection = false;
  selectedObject: THREE.Object3D | null = null;
  selectedObjectName = '';
  selectedObjectColor = '#ffffff';
  selectedObjectType = '';

  // Floor Navigation State
  activeFloorIndex = 0;
  totalLevels = 1;
  floorsData: { id: string, name: string, level: number }[] = [];

  // Pre-rendered Floor Cache (3 Types)
  private prefabs: {
     basement: THREE.Group | null,
     ground: THREE.Group | null,
     upper: THREE.Group | null
  } = { basement: null, ground: null, upper: null };
  
  // Three.js instances
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private transformControl!: TransformControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private animationId: number | null = null;
  private isDraggingTransform = false;
  private modularObjects: THREE.Object3D[] = [];
  private floorMeshes: THREE.Mesh[] = [];

  // Pointer tracking for click vs drag detection
  private pointerDownPos = { x: 0, y: 0 };
  private pointerDownTime = 0;

  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  ngAfterViewInit(): void {
    this.initThreeJs();
    this.preRenderFloorPool();
    this.onWindowResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.onWindowResize);
    
    // Build initial default floor
    this.assembleFloors(1, false);
  }

  ngOnDestroy(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer?.dispose();
    this.scene?.clear();
  }

  openSetupModal(): void {
    this.showSetupModal = true;
  }

  closeSetupModal(): void {
    if (!this.isProcessing) {
      this.showSetupModal = false;
    }
  }

  generateMap(): void {
    if (this.numFloors < 1) return;
    
    this.floorsData = [];
    this.totalLevels = this.hasBasement ? this.numFloors + 1 : this.numFloors;
    this.activeFloorIndex = this.hasBasement ? 1 : 0;

    for (let i = 0; i < this.totalLevels; i++) {
       const isBasement = this.hasBasement && i === 0;
       const levelNumber = isBasement ? -1 : (this.hasBasement ? i : i + 1);
       
       this.floorsData.push({
          id: `floor-${levelNumber}`,
          name: isBasement ? 'Basement' : (levelNumber === 0 ? 'Ground Floor' : `Floor ${levelNumber}`),
          level: levelNumber
       });
    }

    this.focusOnActiveFloor();
    this.closeSetupModal();
  }

  private createFloorPrefab(type: 'basement' | 'ground' | 'upper'): THREE.Group {
     const group = new THREE.Group();
     
     const floorSize = 150;
     const wallHeight = 40;
     const wallThickness = 2;

     // Floor surface
     const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
     const floorMat = new THREE.MeshStandardMaterial({ 
       color: type === 'basement' ? '#94a3b8' : '#e2e8f0', 
       roughness: 0.4,
       metalness: 0.05,
       side: THREE.DoubleSide
     });
     
     const floorMesh = new THREE.Mesh(floorGeo, floorMat);
     floorMesh.rotation.x = -Math.PI / 2;
     floorMesh.receiveShadow = true;
     group.add(floorMesh);
     
     // Floor grid
     const gridColor = type === 'basement' ? '#475569' : '#94a3b8';
     const grid = new THREE.GridHelper(floorSize, 30, gridColor, gridColor);
     grid.position.y = 0.05;
     (grid.material as THREE.Material).opacity = 0.4;
     (grid.material as THREE.Material).transparent = true;
     group.add(grid);

     // --- Walls ---
     const solidWallMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.7, metalness: 0.05 });
     const glassWallMat = new THREE.MeshPhysicalMaterial({ 
        color: '#bfdbfe', metalness: 0.1, roughness: 0.05,
        transmission: 0.85, transparent: true, opacity: 0.35,
        thickness: 0.5, ior: 1.5
     });

     const wallGeoX = new THREE.BoxGeometry(floorSize, wallHeight, wallThickness);
     const wallGeoZ = new THREE.BoxGeometry(wallThickness, wallHeight, floorSize);

     // Back Wall
     const backWall = new THREE.Mesh(wallGeoX, solidWallMat);
     backWall.position.set(0, wallHeight / 2, -floorSize / 2);
     backWall.receiveShadow = true; backWall.castShadow = true;

     // Left Wall
     const leftWall = new THREE.Mesh(wallGeoZ, solidWallMat);
     leftWall.position.set(-floorSize / 2, wallHeight / 2, 0);
     leftWall.receiveShadow = true; leftWall.castShadow = true;

     // Right Wall
     const rightWall = new THREE.Mesh(wallGeoZ, solidWallMat);
     rightWall.position.set(floorSize / 2, wallHeight / 2, 0);
     rightWall.receiveShadow = true; rightWall.castShadow = true;

     // Front Wall (Glass for ground floor)
     const frontWall = new THREE.Mesh(wallGeoX, type === 'ground' ? glassWallMat : solidWallMat);
     frontWall.position.set(0, wallHeight / 2, floorSize / 2);
     if (type !== 'ground') { frontWall.receiveShadow = true; frontWall.castShadow = true; }

     group.add(backWall, leftWall, rightWall, frontWall);

     if (type === 'ground') {
        const metalMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.9, roughness: 0.15 });
        
        // Door frame
        const dL = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 3), metalMat);
        dL.position.set(-15, 10, floorSize / 2);
        const dR = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 3), metalMat);
        dR.position.set(15, 10, floorSize / 2);
        const dT = new THREE.Mesh(new THREE.BoxGeometry(30, 2, 3), metalMat);
        dT.position.set(0, 20, floorSize / 2);

        group.add(dL, dR, dT);
     }

     group.visible = false;
     this.scene.add(group);
     return group;
  }

  private preRenderFloorPool(): void {
    this.prefabs.basement = this.createFloorPrefab('basement');
    this.prefabs.ground = this.createFloorPrefab('ground');
    this.prefabs.upper = this.createFloorPrefab('upper');
  }

  private assembleFloors(floors: number, basement: boolean): void {
    this.floorsData = [];
    this.totalLevels = basement ? floors + 1 : floors;
    this.activeFloorIndex = basement ? 1 : 0;

    for (let i = 0; i < this.totalLevels; i++) {
       const isBasement = basement && i === 0;
       const levelNumber = isBasement ? -1 : (basement ? i : i + 1);
       
       this.floorsData.push({
          id: `floor-${levelNumber}`,
          name: isBasement ? 'Basement' : (levelNumber === 0 ? 'Ground Floor' : `Floor ${levelNumber}`),
          level: levelNumber
       });
    }

    this.focusOnActiveFloor();
  }

  // --- NAVIGATION --- //

  getActiveFloorName(): string {
    if (this.floorsData[this.activeFloorIndex]) {
       return this.floorsData[this.activeFloorIndex].name;
    }
    return '';
  }

  moveFloorUp(): void {
    if (this.activeFloorIndex < this.totalLevels - 1) {
      this.activeFloorIndex++;
      this.focusOnActiveFloor();
    }
  }

  moveFloorDown(): void {
    if (this.activeFloorIndex > 0) {
      this.activeFloorIndex--;
      this.focusOnActiveFloor();
    }
  }

  private focusOnActiveFloor(): void {
    if (!this.floorsData[this.activeFloorIndex]) return;
    
    // Hide all prefabs
    if (this.prefabs.basement) this.prefabs.basement.visible = false;
    if (this.prefabs.ground) this.prefabs.ground.visible = false;
    if (this.prefabs.upper) this.prefabs.upper.visible = false;
    
    // Show correct prefab
    const activeFloor = this.floorsData[this.activeFloorIndex];
    
    if (activeFloor.level === -1 && this.prefabs.basement) {
       this.prefabs.basement.visible = true;
    } else if ((activeFloor.level === 0 || activeFloor.level === 1) && this.prefabs.ground) {
       this.prefabs.ground.visible = true;
    } else if (this.prefabs.upper) {
       this.prefabs.upper.visible = true;
    }
    
    // Filter visible modular objects based on floor
    const activeFloorId = activeFloor.id;
    this.modularObjects.forEach(obj => {
       obj.visible = obj.userData['floorId'] === activeFloorId;
    });
    
    // Camera position
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(120, 120, 120);
    this.controls.update();

    this.deselectObject();
  }

  // --- EDIT MODE & SPAWNING --- //

  toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (!this.editMode) {
      this.deselectObject();
    }
    // Auto-rotation only when NOT in edit mode
    if (this.controls) {
      this.controls.autoRotate = !this.editMode;
    }
  }

  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.transformMode = mode;
    if (this.transformControl) {
      this.transformControl.setMode(mode);
      // Show all axes for all modes ΓÇö allow full freedom of movement
      this.transformControl.showX = true;
      this.transformControl.showY = true;
      this.transformControl.showZ = true;
    }
  }

  // --- MINI STORE SECTION BUILDER --- //
  private createMiniStore(width: number, height: number, depth: number, color: string, name: string): THREE.Group {
    const group = new THREE.Group();

    // --- Colored floor slab ---
    const floorMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4, metalness: 0.1 });
    floorMat.userData = { colorable: true };
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.4, depth), floorMat);
    floor.position.y = 0.2;
    floor.receiveShadow = true;
    floor.userData['colorable'] = true;
    group.add(floor);

    // --- Low side walls (half height) ---
    const wallMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.6, metalness: 0.05 });
    const sideWallHeight = height * 0.5;
    
    // Left wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, sideWallHeight, depth), wallMat);
    leftWall.position.set(-width / 2, sideWallHeight / 2 + 0.4, 0);
    leftWall.castShadow = true;
    group.add(leftWall);
    
    // Right wall
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.4, sideWallHeight, depth), wallMat);
    rightWall.position.set(width / 2, sideWallHeight / 2 + 0.4, 0);
    rightWall.castShadow = true;
    group.add(rightWall);

    // --- Back wall (full height) ---
    const backWallMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.5 });
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.4), backWallMat);
    backWall.position.set(0, height / 2 + 0.4, -depth / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);

    // --- Counter / display shelf at front ---
    const counterMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: 0.3 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(width - 1, 2.5, 1.5), counterMat);
    counter.position.set(0, 1.65, depth / 2 - 1);
    counter.castShadow = true;
    group.add(counter);

    // --- SIGNBOARD above the front ---
    const signHeight = 3;
    const signY = height + 0.4;
    
    // Signboard backing (colored)
    const signMat = new THREE.MeshStandardMaterial({ 
      color: color, roughness: 0.3, metalness: 0.2,
      emissive: color, emissiveIntensity: 0.15
    });
    const signboard = new THREE.Mesh(new THREE.BoxGeometry(width + 1, signHeight, 0.5), signMat);
    signboard.position.set(0, signY + signHeight / 2, depth / 2 + 0.3);
    signboard.castShadow = true;
    signboard.userData['colorable'] = true;
    group.add(signboard);

    // Sign support posts
    const postMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.8, roughness: 0.2 });
    const postLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, signHeight + 2, 0.3), postMat);
    postLeft.position.set(-width / 2, signY, depth / 2 + 0.3);
    group.add(postLeft);
    const postRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, signHeight + 2, 0.3), postMat);
    postRight.position.set(width / 2, signY, depth / 2 + 0.3);
    group.add(postRight);

    // --- Small awning above entrance ---
    const awningMat = new THREE.MeshStandardMaterial({ 
      color: color, roughness: 0.5, side: THREE.DoubleSide 
    });
    const awning = new THREE.Mesh(new THREE.BoxGeometry(width + 1, 0.2, 3), awningMat);
    awning.position.set(0, height + 0.3, depth / 2 + 1.5);
    awning.userData['colorable'] = true;
    group.add(awning);

    // --- Interior accent strip on floor (colored line) ---
    const accentMat = new THREE.MeshStandardMaterial({ 
      color: color, emissive: color, emissiveIntensity: 0.4 
    });
    const accent = new THREE.Mesh(new THREE.BoxGeometry(width - 2, 0.05, depth - 2), accentMat);
    accent.position.y = 0.42;
    accent.userData['colorable'] = true;
    group.add(accent);

    return group;
  }

  private createRealisticWall(length: number, height: number): THREE.Group {
    const group = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.6, metalness: 0.05 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, height, 1.5), wallMat);
    wall.position.y = height / 2;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    // Top cap
    const capMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.5, roughness: 0.3 });
    const cap = new THREE.Mesh(new THREE.BoxGeometry(length + 0.5, 0.5, 2), capMat);
    cap.position.y = height;
    group.add(cap);

    return group;
  }

  private createRealisticStairs(): THREE.Group {
    const group = new THREE.Group();
    const stepMat = new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.4, metalness: 0.3 });
    const railMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.8, roughness: 0.2 });

    const numSteps = 10;
    const stepWidth = 12;
    const stepHeight = 2.5;
    const stepDepth = 3;

    for (let i = 0; i < numSteps; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth), stepMat);
      step.position.set(0, i * stepHeight + stepHeight / 2, i * stepDepth);
      step.castShadow = true;
      step.receiveShadow = true;
      group.add(step);
    }

    // Side rails
    const railHeight = numSteps * stepHeight + 5;
    const railGeo = new THREE.BoxGeometry(0.5, railHeight, 0.5);
    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-stepWidth / 2, railHeight / 2, (numSteps * stepDepth) / 2);
    leftRail.castShadow = true;
    group.add(leftRail);
    
    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(stepWidth / 2, railHeight / 2, (numSteps * stepDepth) / 2);
    rightRail.castShadow = true;
    group.add(rightRail);

    // Handrails
    const handrailGeo = new THREE.CylinderGeometry(0.3, 0.3, stepWidth + 1, 8);
    const handrail = new THREE.Mesh(handrailGeo, railMat);
    handrail.rotation.z = Math.PI / 2;
    handrail.position.set(0, railHeight, (numSteps * stepDepth) / 2);
    group.add(handrail);

    return group;
  }

  private createRealisticMachine(): THREE.Group {
    const group = new THREE.Group();
    
    // Body
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.7, roughness: 0.25 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 12, 5), bodyMat);
    body.position.y = 6;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Screen
    const screenMat = new THREE.MeshStandardMaterial({ 
      color: '#0ea5e9', emissive: '#0ea5e9', emissiveIntensity: 0.4 
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), screenMat);
    screen.position.set(0, 7, 2.51);
    group.add(screen);

    // Base
    const baseMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.8, roughness: 0.2 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(7, 1, 6), baseMat);
    base.position.y = 0.5;
    group.add(base);

    return group;
  }

  private createRealisticPlant(): THREE.Group {
    const group = new THREE.Group();

    // Pot
    const potMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.8, metalness: 0.1 });
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2, 4, 16), potMat);
    pot.position.y = 2;
    pot.castShadow = true;
    group.add(pot);

    // Soil
    const soilMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 1.0 });
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.5, 16), soilMat);
    soil.position.y = 4;
    group.add(soil);

    // Leaves (spheres cluster)
    const leafMat = new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.6 });
    const positions = [
      [0, 7, 0], [-1.5, 6.5, 1], [1.5, 6.5, -1], [0, 6, 1.5], [0.5, 7.5, -0.5]
    ];
    positions.forEach(([x, y, z]) => {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.8, 12, 10), leafMat);
      leaf.position.set(x, y, z);
      leaf.castShadow = true;
      group.add(leaf);
    });

    // Trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.8 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3, 8), trunkMat);
    trunk.position.y = 5;
    group.add(trunk);

    return group;
  }

  spawnObject(type: string): void {
     const activeFloor = this.floorsData[this.activeFloorIndex];
     if (!activeFloor) return;
     const activeFloorId = activeFloor.id;
     
     const yLevel = activeFloor.level * 40;
     let newObject: THREE.Object3D | null = null;

     switch (type) {
        case 'block': {
          const room = this.createMiniStore(14, 10, 12, '#38bdf8', 'New Section');
          room.userData = { type: 'block', name: 'New Section', color: '#38bdf8', lockedY: yLevel };
          room.position.set(0, yLevel, 0);
          newObject = room;
          break;
        }
        case 'wall': {
          const wall = this.createRealisticWall(30, 18);
          wall.userData = { type: 'wall', name: 'Partition Wall', color: '#e2e8f0', lockedY: yLevel };
          wall.position.set(0, yLevel, 0);
          newObject = wall;
          break;
        }
        case 'stairs': {
          const stairs = this.createRealisticStairs();
          stairs.userData = { type: 'stairs', name: 'Staircase', color: '#64748b', lockedY: yLevel };
          stairs.position.set(0, yLevel, 0);
          newObject = stairs;
          break;
        }
        case 'plant': {
          const plant = this.createRealisticPlant();
          plant.userData = { type: 'plant', name: 'Decorative Plant', color: '#22c55e', lockedY: yLevel };
          plant.position.set(0, yLevel, 0);
          newObject = plant;
          break;
        }
        case 'machine': {
          const machine = this.createRealisticMachine();
          machine.userData = { type: 'machine', name: 'Vending Machine', color: '#475569', lockedY: yLevel };
          machine.position.set(0, yLevel, 0);
          newObject = machine;
          break;
        }
     }

     if (newObject) {
        newObject.castShadow = true;
        newObject.receiveShadow = true;
        newObject.userData['floorId'] = activeFloorId;
        
        this.scene.add(newObject);
        this.modularObjects.push(newObject);
        this.refreshObjectLabel(newObject);
        
        // Select immediately ΓÇö no setTimeout needed, stays in Angular zone
        this.selectObject(newObject);
     }
  }

  // --- POINTER / SELECTION HANDLING --- //

  onCanvasPointerDown(event: PointerEvent): void {
    this.pointerDownPos.x = event.clientX;
    this.pointerDownPos.y = event.clientY;
    this.pointerDownTime = Date.now();
  }

  onCanvasPointerUp(event: PointerEvent): void {
    if (!this.editMode) return;

    // Only treat as a click if the pointer didn't move much
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 6) return; // It was a drag, not a click

    // Calculate mouse pos in normalized device coords
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Only allow selecting user-spawned objects, not the base floor
    const visibleModular = this.modularObjects.filter(o => o.visible);
    const intersects = this.raycaster.intersectObjects(visibleModular, true);

    if (intersects.length > 0) {
       // Filter out Sprite objects (labels)
       const validIntersects = intersects.filter(i => !(i.object instanceof THREE.Sprite));
     
       if (validIntersects.length > 0) {
         let object = validIntersects[0].object as THREE.Object3D;
         // Ascend to the root spawned object (where userData.type is set)
         while (object.parent && object.parent !== this.scene && !object.userData['type']) {
            object = object.parent;
         }
         if (object.userData['type']) {
            this.selectObject(object);
         } else {
            this.deselectObject();
         }
       } else {
         this.deselectObject();
       }
    } else {
       this.deselectObject();
    }
  }

  selectObject(object: THREE.Object3D): void {
     this.ngZone.run(() => {
       this.selectedObject = object;
       this.hasSelection = true;
       this.selectedObjectName = object.userData['name'] || 'Item';
       this.selectedObjectColor = object.userData['color'] || '#ffffff';
       this.selectedObjectType = object.userData['type'] || 'unknown';
       
       this.transformControl.attach(object);
       this.setTransformMode(this.transformMode);
       this.cdr.detectChanges();
       // Belt-and-suspenders: schedule another detectChanges after microtask
       setTimeout(() => this.cdr.detectChanges(), 10);
     });
  }

  deselectObject(): void {
     this.ngZone.run(() => {
       this.selectedObject = null;
       this.hasSelection = false;
       this.selectedObjectName = '';
       this.selectedObjectColor = '#ffffff';
       this.selectedObjectType = '';
       if (this.transformControl) this.transformControl.detach();
       this.cdr.detectChanges();
       setTimeout(() => this.cdr.detectChanges(), 10);
     });
  }

  updateObjectName(): void {
      if (this.selectedObject) {
         this.selectedObject.userData['name'] = this.selectedObjectName;
         this.refreshObjectLabel(this.selectedObject);
      }
  }

  updateObjectColor(): void {
      if (this.selectedObject) {
         this.selectedObject.userData['color'] = this.selectedObjectColor;
         
         // Update color on all child meshes tagged as colorable
         this.selectedObject.traverse((child) => {
           if (child instanceof THREE.Mesh) {
             if (child.userData['colorable']) {
               const mat = child.material as THREE.MeshStandardMaterial;
               mat.color.set(this.selectedObjectColor);
               if (mat.emissive) {
                 mat.emissive.set(this.selectedObjectColor);
               }
             }
           }
         });
         
         this.refreshObjectLabel(this.selectedObject);
      }
  }

  private refreshObjectLabel(object: THREE.Object3D): void {
      const oldLabel = object.children.find(c => c.userData['isLabel']);
      if (oldLabel) {
         object.remove(oldLabel);
      }
      const label = this.createTextSprite(object.userData['name'], object.userData['color'] || '#38bdf8');
      
      // Calculate label height from bounding box
      const bbox = new THREE.Box3().setFromObject(object);
      const height = bbox.max.y - object.position.y;
      
      label.position.set(0, height + 3, 0);
      label.userData['isLabel'] = true;
      object.add(label);
  }

  private createTextSprite(message: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
       // Background pill
       const textUpper = message.toUpperCase();
       context.font = 'bold 48px Inter, Segoe UI, sans-serif';
       const metrics = context.measureText(textUpper);
       const textW = metrics.width;
       const pillW = Math.min(textW + 40, 500);
       const pillH = 70;
       const pillX = (512 - pillW) / 2;
       const pillY = (256 - pillH) / 2;

       // Rounded rect background
       context.fillStyle = 'rgba(15, 23, 42, 0.85)';
       context.beginPath();
       context.roundRect(pillX, pillY, pillW, pillH, 16);
       context.fill();

       // Border
       context.strokeStyle = color;
       context.lineWidth = 2;
       context.beginPath();
       context.roundRect(pillX, pillY, pillW, pillH, 16);
       context.stroke();

       // Text
       context.fillStyle = '#ffffff';
       context.textAlign = 'center';
       context.textBaseline = 'middle';
       context.fillText(textUpper, 256, 128);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(16, 8, 1);
    sprite.renderOrder = 999;
    return sprite;
  }

  duplicateSelected(): void {
      if (!this.selectedObject) return;
      const clone = this.selectedObject.clone(true);
      
      // Clone all materials recursively so colors don't share references
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          child.material = (child.material as THREE.Material).clone();
        }
      });

      clone.position.x += 15; // offset
      clone.userData = { ...this.selectedObject.userData };
      this.scene.add(clone);
      this.modularObjects.push(clone);
      this.selectObject(clone);
  }

  deleteSelected(): void {
      if (!this.selectedObject) return;
      this.scene.remove(this.selectedObject);
      this.modularObjects = this.modularObjects.filter(o => o !== this.selectedObject);
      this.deselectObject();
  }

  // --- THREE JS SETUP --- //

  private initThreeJs(): void {
    const container = this.canvasContainer.nativeElement;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a'); 
    this.scene.fog = new THREE.FogExp2('#0f172a', 0.0015);

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
    this.camera.position.set(120, 120, 120);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(80, 200, 60);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 120;
    dirLight.shadow.camera.bottom = -120;
    dirLight.shadow.camera.left = -120;
    dirLight.shadow.camera.right = 120;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);

    // Fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.4);
    fillLight.position.set(-60, 80, -40);
    this.scene.add(fillLight);

    // Hemisphere light for ambient color variation
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 0.3);
    this.scene.add(hemiLight);

    // Orbit Controls ΓÇö no angle restrictions for full 360┬░ rotation
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.3;

    // Transform Controls
    this.transformControl = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControl.setTranslationSnap(5);
    this.transformControl.setRotationSnap(THREE.MathUtils.degToRad(45));
    this.transformControl.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !(event.value as boolean);
      this.isDraggingTransform = event.value as boolean;
    });
    
    // No axis locking ΓÇö allow free movement on all axes

    this.scene.add(this.transformControl.getHelper());

    // --- ALSO attach pointer listeners directly to the canvas element ---
    // This ensures events are captured even if they don't bubble to the container div
    const canvasEl = this.renderer.domElement;
    canvasEl.addEventListener('pointerdown', (e: PointerEvent) => {
      this.pointerDownPos.x = e.clientX;
      this.pointerDownPos.y = e.clientY;
      this.pointerDownTime = Date.now();
    });
    canvasEl.addEventListener('pointerup', (e: PointerEvent) => {
      this.ngZone.run(() => this.onCanvasPointerUp(e));
    });

    this.animate();
  }

  private onWindowResize(): void {
    if (!this.camera || !this.renderer || !this.canvasContainer) return;
    const container = this.canvasContainer.nativeElement;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    
    // No scene rotation ΓÇö OrbitControls.autoRotate handles the subtle camera movement
    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
