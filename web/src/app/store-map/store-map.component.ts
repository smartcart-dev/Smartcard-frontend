import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, ChangeDetectorRef, inject, NgZone, HostListener } from '@angular/core';
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
  selectedObject: THREE.Mesh | null = null;
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
  private isEditingTransform = false;
  private modularObjects: THREE.Object3D[] = [];
  private floorMeshes: THREE.Mesh[] = [];

  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  ngAfterViewInit(): void {
    this.initThreeJs();
    // Pre-render a pool of 11 floors (1 basement + 10 above ground) instantly on load
    this.preRenderFloorPool();
    window.addEventListener('resize', this.onWindowResize.bind(this));
    
    // Build initial default floor
    this.assembleFloors(1, false);
  }

  ngOnDestroy(): void {
    if (this.animationId !== null) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onWindowResize.bind(this));
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
    
    // Clear dynamic floor data
    this.floorsData = [];
    this.totalLevels = this.hasBasement ? this.numFloors + 1 : this.numFloors;
    this.activeFloorIndex = this.hasBasement ? 1 : 0; // Default to Ground Phase

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
     
     // Base Floor Size
     const floorSize = 150;
     const wallHeight = 40; // Height matches the yOffset per floor
     const wallThickness = 2;

     const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
     const floorMat = new THREE.MeshStandardMaterial({ 
       color: type === 'basement' ? '#94a3b8' : '#cbd5e1', 
       roughness: 0.3,
       metalness: 0.1,
       side: THREE.DoubleSide
     });
     
     const floorMesh = new THREE.Mesh(floorGeo, floorMat);
     floorMesh.rotation.x = -Math.PI / 2;
     floorMesh.receiveShadow = true;
     group.add(floorMesh);
     
     const gridColor = type === 'basement' ? '#475569' : '#94a3b8';
     const grid = new THREE.GridHelper(floorSize, 30, gridColor, gridColor);
     grid.position.y = 0.1;
     group.add(grid);

     // --- Wall Generation ---
     const solidWallMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.8 });
     const glassWallMat = new THREE.MeshPhysicalMaterial({ 
        color: '#e0f2fe', metalness: 0.1, roughness: 0.05,
        transmission: 0.9, transparent: true, opacity: 0.5 
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

     // Front Wall (Glass for ground floor, solid for others)
     const frontWall = new THREE.Mesh(wallGeoX, type === 'ground' ? glassWallMat : solidWallMat);
     frontWall.position.set(0, wallHeight / 2, floorSize / 2);
     if (type !== 'ground') { frontWall.receiveShadow = true; frontWall.castShadow = true; }

     group.add(backWall, leftWall, rightWall, frontWall);

     if (type === 'ground') {
        // Add decorative entry door frames / gate handles to the glass
        const metalMat = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.8, roughness: 0.2 });
        
        // Door frame left
        const dL = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 3), metalMat);
        dL.position.set(-15, 10, floorSize / 2);
        
        // Door frame right
        const dR = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 3), metalMat);
        dR.position.set(15, 10, floorSize / 2);

        // Door header
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
    // This is just mapping out the data bounds for navigation, not rendering.
    this.floorsData = [];
    this.totalLevels = basement ? floors + 1 : floors;
    this.activeFloorIndex = basement ? 1 : 0; // Default to Ground Phase

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
    } else if ((activeFloor.level === 0 || activeFloor.level === 1) && this.prefabs.ground) { // Assuming 0 or 1 is ground floor based on math
       this.prefabs.ground.visible = true;
    } else if (this.prefabs.upper) {
       this.prefabs.upper.visible = true;
    }
    
    // Filter visible modular objects based on floor height
    const activeFloorId = activeFloor.id;
    this.modularObjects.forEach(obj => {
       obj.visible = obj.userData['floorId'] === activeFloorId;
    });
    
    // Camera is fixed
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
  }

  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.transformMode = mode;
    if (this.transformControl) {
      this.transformControl.setMode(mode);
      
      if (mode === 'translate') {
         this.transformControl.showY = false; // Lock Y-axis to keep items on the floor
         this.transformControl.showX = true;
         this.transformControl.showZ = true;
      } else if (mode === 'rotate') {
         this.transformControl.showY = true;  // Only allow spinning around the Y-axis (vertical pole)
         this.transformControl.showX = false;
         this.transformControl.showZ = false;
      } else {
         this.transformControl.showY = true;
         this.transformControl.showX = true;
         this.transformControl.showZ = true;
      }
    }
  }

  spawnObject(type: string): void {
     const activeFloor = this.floorsData[this.activeFloorIndex];
     if (!activeFloor) return;
     const activeFloorId = activeFloor.id;
     
     const yLevel = activeFloor.level * 40;
     let newMesh: THREE.Object3D | null = null;
     
     const defaultMat = new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.5 });

     switch (type) {
        case 'block': {
          newMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 8, 10), defaultMat);
          
          // Add a glowing top to make it look premium
          const glowTopMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#38bdf8', emissiveIntensity: 0.5 });
          const topGlow = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.5, 10.2), glowTopMat);
          topGlow.position.y = 4.25;
          newMesh.add(topGlow);

          newMesh.userData = { type: 'block', name: 'New Section', color: '#38bdf8', lockedY: yLevel + 4 };
          newMesh.position.set(0, yLevel + 4, 0);
          break;
        }case 'wall':
          newMesh = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 2), defaultMat);
          newMesh.userData = { type: 'wall', name: 'Partition Wall', color: '#38bdf8', lockedY: yLevel + 10 };
          newMesh.position.set(0, yLevel + 10, 0);
          break;
        case 'stairs': {
          const stairMat = new THREE.MeshStandardMaterial({ color: '#64748b' });
          newMesh = new THREE.Mesh(new THREE.BoxGeometry(15, 40, 30), stairMat); // simplified placeholder 
          newMesh.userData = { type: 'stairs', name: 'Staircase', color: '#64748b', lockedY: yLevel + 20 };
          newMesh.position.set(0, yLevel + 20, 0);
          break;
        }
        case 'plant': {
          const stem = new THREE.MeshStandardMaterial({ color: '#84cc16' });
          newMesh = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 16), stem);
          newMesh.userData = { type: 'plant', name: 'Decorative Plant', color: '#84cc16', lockedY: yLevel + 4 };
          newMesh.position.set(0, yLevel + 4, 0);
          break;
        }
        case 'machine': {
          const machMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8 });
          newMesh = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 12, 32), machMat);
          newMesh.userData = { type: 'machine', name: 'Vending/Machine', color: '#94a3b8', lockedY: yLevel + 6 };
          newMesh.position.set(0, yLevel + 6, 0);
          break;
        }
     }

     if (newMesh) {
        newMesh.castShadow = true;
        newMesh.receiveShadow = true;
        newMesh.userData['floorId'] = activeFloorId;
        
        this.scene.add(newMesh);
        this.modularObjects.push(newMesh);
        this.refreshObjectLabel(newMesh);
        
        // Fix: Wait a tick for Scene addition, then force selection into Angular Zone
        setTimeout(() => {
           this.selectObject(newMesh!);
        }, 0);
     }
  }

  @HostListener('pointerdown', ['$event'])
  onMouseClick(event: PointerEvent): void {
     if (!this.editMode || this.isEditingTransform) return;
     
     // Calculate mouse pos in normalized device coords
     const rect = this.renderer.domElement.getBoundingClientRect();
     this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
     this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

     this.raycaster.setFromCamera(this.mouse, this.camera);
     
     // Only allow selecting user-spawned objects, not the base floor
     const visibleModular = this.modularObjects.filter(o => o.visible);
     const intersects = this.raycaster.intersectObjects(visibleModular, true);

     // Wrap the Raycaster result handling tightly in NgZone
     this.ngZone.run(() => {
        if (intersects.length > 0) {
           // Filter out Sprite objects that are just labels so we can click the actual mesh behind them
           const validIntersects = intersects.filter(i => !(i.object instanceof THREE.Sprite));
         
           if (validIntersects.length > 0) {
             let object = validIntersects[0].object as THREE.Object3D;
             // Ascend to parent if clicked on a child part of a group (like the glowing top of a block)
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

        // Force Angular to check the whole component tree immediately
        setTimeout(() => this.cdr.detectChanges(), 0);
     });
  }

  selectObject(object: THREE.Object3D): void {
     this.ngZone.run(() => {
        this.selectedObject = object as THREE.Mesh;
        this.hasSelection = true;
        console.log('Angular Selection State Set To:', this.hasSelection, this.selectedObjectName);
        this.selectedObjectName = object.userData['name'] || 'Item';
        this.selectedObjectColor = object.userData['color'] || '#ffffff';
        this.selectedObjectType = object.userData['type'] || 'unknown';
        
        this.transformControl.attach(object);
        this.setTransformMode(this.transformMode);
        this.cdr.detectChanges(); // Force panel open
     });
  }

  deselectObject(): void {
     this.ngZone.run(() => {
        this.selectedObject = null;
        this.hasSelection = false;
        if (this.transformControl) this.transformControl.detach();
        this.cdr.detectChanges(); // Force panel close
     });
  }

  updateObjectName(): void {
      if (this.selectedObject) {
         this.selectedObject.userData['name'] = this.selectedObjectName;
         this.refreshObjectLabel(this.selectedObject);
      }
  }

  updateObjectColor(): void {
      if (this.selectedObject && (this.selectedObjectType === 'block' || this.selectedObjectType === 'wall')) {
         this.selectedObject.userData['color'] = this.selectedObjectColor;
         
         // Only change color of main mesh, not the glow/label children
         if ((this.selectedObject as THREE.Mesh).material) {
            const mat = (this.selectedObject as THREE.Mesh).material as THREE.MeshStandardMaterial;
            mat.color.set(this.selectedObjectColor);
         }
         
         this.refreshObjectLabel(this.selectedObject);
      }
  }

  private refreshObjectLabel(object: THREE.Object3D): void {
      const oldLabel = object.children.find(c => c.userData['isLabel']);
      if (oldLabel) {
         object.remove(oldLabel);
      }
      const label = this.createTextSprite(object.userData['name'], object.userData['color'] || '#38bdf8');
      
      // Calculate dynamic height for label placement based on object's bounding box
      const bbox = new THREE.Box3().setFromObject(object);
      const height = bbox.max.y - bbox.min.y;
      
      label.position.set(0, height / 2 + 3, 0); // Position above the object
      label.userData['isLabel'] = true;
      object.add(label);
  }

  private createTextSprite(message: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
       context.shadowColor = color;
       context.shadowBlur = 20; // Glow effect
       context.fillStyle = color;
       context.font = 'bold 60px Inter, sans-serif';
       context.textAlign = 'center';
       context.textBaseline = 'middle';
       context.fillText(message.toUpperCase(), 256, 128);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(15, 7.5, 1);
    return sprite;
  }

  duplicateSelected(): void {
      if (!this.selectedObject) return;
      const clone = this.selectedObject.clone();
      
      // Clone the material so colors don't share ref
      if ((clone as THREE.Mesh).material) {
         (clone as THREE.Mesh).material = ((this.selectedObject as THREE.Mesh).material as THREE.Material).clone();
      }

      clone.position.x += 10; // offset slightly
      this.scene.add(clone);
      this.modularObjects.push(clone);
      this.selectObject(clone);
      this.cdr.detectChanges();
  }

  deleteSelected(): void {
      if (!this.selectedObject) return;
      this.scene.remove(this.selectedObject);
      this.modularObjects = this.modularObjects.filter(o => o !== this.selectedObject);
      this.deselectObject();
      this.cdr.detectChanges();
  }

  // --- THREE JS SETUP --- //

  private initThreeJs(): void {
    const container = this.canvasContainer.nativeElement;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a'); 
    this.scene.fog = new THREE.FogExp2('#0f172a', 0.002);

    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.camera.position.set(120, 120, 120);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Minimal bright lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(50, 200, 50);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    this.scene.add(dirLight);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Allow going slightly below floor level

    // Add Transform Controls
    this.transformControl = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControl.setTranslationSnap(5); // Snap to a 5-unit grid to easily align rows/columns
    this.transformControl.setRotationSnap(THREE.MathUtils.degToRad(45));    // Listen to transform events to lock axes and set editing flag
    this.transformControl.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !(event.value as boolean);
      this.isEditingTransform = event.value as boolean;
    });
    
    // Strict physics overrides to ensure snapping planes
    this.transformControl.addEventListener('change', () => {
       if (this.selectedObject) {
          if (this.transformMode === 'translate') {
             // Force lock to its spawning Y level so dragging works purely in 2D
             if (this.selectedObject.userData['lockedY'] !== undefined) {
                 this.selectedObject.position.y = this.selectedObject.userData['lockedY'];
             }
          } else if (this.transformMode === 'rotate') {
             // Force lock pitch and roll, only allowing yaw (Y-axis spinning)
             this.selectedObject.rotation.x = 0;
             this.selectedObject.rotation.z = 0;
          }
       }
    });

    this.scene.add(this.transformControl.getHelper());

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
    
    // Slow cinematic rotation 
    if (this.scene && !this.showSetupModal) {
      this.scene.rotation.y += 0.001; 
    }

    if (this.controls) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
