import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import * as THREE from 'three';
import { StoreConfig, MOCK_STORE_CONFIG } from './store-config.interface';

@Component({
  selector: 'app-store-map',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './store-map.component.html',
  styleUrl: './store-map.component.scss',
})
export class StoreMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) canvasContainer!: ElementRef<HTMLDivElement>;

  // Form & UI State
  setupForm: FormGroup;
  showSetupModal = false;
  isProcessing = false;
  editMode = false;
  selectedMeshDetails: any = null;

  private config: StoreConfig = MOCK_STORE_CONFIG;

  // Three.js instances
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animationId: number | null = null;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private meshes: THREE.Mesh[] = [];

  constructor(private fb: FormBuilder) {
    this.setupForm = this.fb.group({
      numFloors: [1, [Validators.required, Validators.min(1), Validators.max(5)]],
      hasBasement: [false],
      stairsLocation: ['center'],
      floorSections: this.fb.array([this.fb.control(3, [Validators.required, Validators.min(1), Validators.max(10)])])
    });

    // Listen to changes in the number of floors to adjust the sections array
    this.setupForm.get('numFloors')?.valueChanges.subscribe((changes: any) => {
      this.updateSectionsControls();
    });
    this.setupForm.get('hasBasement')?.valueChanges.subscribe(() => {
      this.updateSectionsControls();
    });
  }

  get sectionsArray(): FormArray {
    return this.setupForm.get('floorSections') as FormArray;
  }

  getLevelLabel(index: number): string {
    const hasBasement = this.setupForm.value.hasBasement;
    if (hasBasement && index === 0) return 'Basement';
    return `Floor ${hasBasement ? index : index + 1}`;
  }

  private updateSectionsControls(): void {
    const numFloors = this.setupForm.get('numFloors')?.value || 1;
    const hasBasement = this.setupForm.get('hasBasement')?.value || false;
    const totalLevels = hasBasement ? numFloors + 1 : numFloors;
    
    const sArray = this.sectionsArray;
    if (totalLevels > sArray.length) {
      for (let i = sArray.length; i < totalLevels; i++) {
        sArray.push(this.fb.control(3, [Validators.required, Validators.min(1), Validators.max(10)]));
      }
    } else if (totalLevels < sArray.length) {
      for (let i = sArray.length - 1; i >= totalLevels; i--) {
        sArray.removeAt(i);
      }
    }
  }

  openSetupModal(): void {
    this.showSetupModal = true;
    this.editMode = false; // Turn off normal edit mode
    this.selectedMeshDetails = null;
  }

  closeSetupModal(): void {
    if (!this.isProcessing) {
      this.showSetupModal = false;
    }
  }

  submitSetup(): void {
    if (this.setupForm.invalid) return;

    this.isProcessing = true;

    // Simulate Processing time
    setTimeout(() => {
      this.generateDynamicStoreLayout();
      this.isProcessing = false;
      this.closeSetupModal();
    }, 1500);
  }

  private generateDynamicStoreLayout(): void {
    const values = this.setupForm.value;
    const newConfig: StoreConfig = {
      floors: [],
      activeFloorId: 'level-0'
    };

    const totalLevels = values.hasBasement ? values.numFloors + 1 : values.numFloors;
    const sectionsConfig: number[] = values.floorSections;

    for (let i = 0; i < totalLevels; i++) {
       const isBasement = values.hasBasement && i === 0;
       const levelNumber = isBasement ? -1 : (values.hasBasement ? i : i + 1);
       const levelMultiplier = 35; // height offset between floors
       const yOffset = levelNumber * levelMultiplier;

       const sections = [];
       const numSecs = sectionsConfig[i] || 3;
       
       // Algorithm to scatter sections roughly in a grid
       let rowCount = Math.ceil(Math.sqrt(numSecs));
       let colCount = Math.ceil(numSecs / rowCount);
       
       const secWidth = 100 / colCount - 5;
       const secDepth = 100 / rowCount - 5;
       
       let secIndex = 0;
       for (let r = 0; r < rowCount; r++) {
         for (let c = 0; c < colCount; c++) {
           if (secIndex >= numSecs) break;
           
           const xPos = -50 + (c * (secWidth + 5)) + (secWidth / 2);
           const zPos = -50 + (r * (secDepth + 5)) + (secDepth / 2);
           
           // Generate random items inside this section
           const numItems = Math.floor(Math.random() * 3) + 1;
           const items = [];
           for(let j=0; j < numItems; j++) {
              items.push({
                 id: `item-${i}-${secIndex}-${j}`,
                 name: `Product Group ${j+1}`,
                 position: { x: xPos, y: yOffset + 5, z: zPos + (j * 5) - 5 },
                 color: this.getRandomColor()
              });
           }

           sections.push({
             id: `sec-${i}-${secIndex}`,
             name: `Section ${secIndex+1} (${isBasement ? 'Basement' : 'Floor '+levelNumber})`,
             position: { x: xPos, y: yOffset, z: zPos },
             size: { width: secWidth, height: 10, depth: secDepth },
             color: this.getRandomSectionColor(),
             items: items
           });
           secIndex++;
         }
       }

       newConfig.floors.push({
          id: `level-${i}`,
          level: levelNumber,
          name: isBasement ? 'Basement' : `Floor ${levelNumber}`,
          size: { width: 120, depth: 120 },
          sections: sections
       });
    }

    this.config = newConfig;
    
    // Clear Existing Meshes
    this.meshes.forEach(mesh => {
      this.scene.remove(mesh);
    });
    this.meshes = [];
    
    // Clear Floor Planes
    const oldFloors = this.scene.children.filter(child => child.userData['type'] === 'Floor' || child.userData['type'] === 'Stairs');
    oldFloors.forEach(f => this.scene.remove(f));

    // Render new map
    this.renderDynamicMap(values.stairsLocation);
  }

  private getRandomSectionColor(): string {
     const colors = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#2dd4bf', '#38bdf8', '#818cf8', '#a78bfa', '#e879f9', '#f472b6'];
     return colors[Math.floor(Math.random() * colors.length)];
  }

  private getRandomColor(): string {
     return '#' + Math.floor(Math.random()*16777215).toString(16);
  }

  ngAfterViewInit(): void {
    this.initThreeJs();
    this.renderDynamicMap('center');
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  ngOnDestroy(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.onWindowResize.bind(this));
    
    // Clean up Three.js resources
    this.renderer?.dispose();
    this.scene?.clear();
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (!this.editMode) {
      this.closeEditPanel();
    }
  }

  closeEditPanel(): void {
    this.selectedMeshDetails = null;
  }

  private initThreeJs(): void {
    const container = this.canvasContainer.nativeElement;
    
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a'); // Cool dark slate background

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    // Position camera diagonally elevated looking down at the store
    this.camera.position.set(120, 150, 120);
    this.camera.lookAt(0, 0, 0);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    container.appendChild(this.renderer.domElement);

    // 4. Lighting (Enhanced for "Cool" look)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 150, 50);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.bias = -0.001;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);

    const spotLight = new THREE.SpotLight(0x3b82f6, 1.5); // Blue highlight
    spotLight.position.set(-50, 100, -50);
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 0.5;
    this.scene.add(spotLight);

    // 5. Interaction
    this.renderer.domElement.addEventListener('click', this.onMouseClick.bind(this));

    // Start render loop
    this.animate();
  }

  private renderDynamicMap(stairsLocation: string): void {
    // Determine overall height to center the camera
    let minY = 0;
    let maxY = 0;

    this.config.floors.forEach((floorConfig, index) => {
      // Find the yOffset calculated during config generation
      const yOffsetOffset = floorConfig.sections.length > 0 ? floorConfig.sections[0].position.y : (floorConfig.level * 35);
      
      if (yOffsetOffset < minY) minY = yOffsetOffset;
      if (yOffsetOffset > maxY) maxY = yOffsetOffset;

      // A. Draw the floor base (Glassy/Tech material)
      const floorGeometry = new THREE.PlaneGeometry(floorConfig.size.width, floorConfig.size.depth);
      const floorMaterial = new THREE.MeshPhysicalMaterial({ 
         color: '#cbd5e1', 
         metalness: 0.1, 
         roughness: 0.2, 
         transmission: 0.5, // glass like
         transparent: true,
         opacity: 0.8,
         side: THREE.DoubleSide
      });
      const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
      
      floorMesh.rotation.x = -Math.PI / 2; // Lay flat
      floorMesh.position.y = yOffsetOffset;
      floorMesh.receiveShadow = true;
      
      // Add user data for interactability
      floorMesh.userData = { type: 'Floor', name: floorConfig.name };
      this.scene.add(floorMesh);

      // B. Draw Sections based on configuration
      floorConfig.sections.forEach(section => {
        const secGeometry = new THREE.BoxGeometry(section.size.width, section.size.height, section.size.depth);
        const secMaterial = new THREE.MeshPhysicalMaterial({ 
          color: section.color,
          metalness: 0.3,
          roughness: 0.4,
          transparent: true,
          opacity: 0.9,
          envMapIntensity: 1.0
        });
        const secMesh = new THREE.Mesh(secGeometry, secMaterial);
        
        // Position the box such that its bottom rests on the floor
        secMesh.position.set(
          section.position.x, 
          section.position.y + (section.size.height / 2), 
          section.position.z
        );
        secMesh.castShadow = true;
        secMesh.receiveShadow = true;
        secMesh.userData = { type: 'Section', name: section.name, id: section.id, floor: floorConfig.name };
        
        this.scene.add(secMesh);
        this.meshes.push(secMesh);

        // C. Draw Items within the section
        section.items.forEach(item => {
          const itemGeometry = new THREE.CylinderGeometry(2, 2, 6, 16);
          const itemMaterial = new THREE.MeshStandardMaterial({ 
             color: item.color,
             emissive: item.color,
             emissiveIntensity: 0.5
          });
          const itemMesh = new THREE.Mesh(itemGeometry, itemMaterial);
          
          itemMesh.position.set(item.position.x, item.position.y, item.position.z);
          itemMesh.castShadow = true;
          itemMesh.userData = { type: 'Item', name: item.name, id: item.id };
          
          this.scene.add(itemMesh);
          this.meshes.push(itemMesh);
        });
      });
    });

    // Draw Stairs (Connection block between lowest and highest floor)
    if (this.config.floors.length > 1) {
       const stairHeight = (maxY - minY) + 35; // Cover all floors + slightly above
       const stairGeom = new THREE.BoxGeometry(15, stairHeight, 15);
       const stairMat = new THREE.MeshStandardMaterial({ 
          color: '#475569', 
          wireframe: true // Makes it look architectural/cool
       });
       const stairMesh = new THREE.Mesh(stairGeom, stairMat);
       
       let sX = 0; let sZ = 0;
       switch(stairsLocation) {
         case 'front': sZ = 50; break;
         case 'back': sZ = -50; break;
         case 'left': sX = -50; break;
         case 'right': sX = 50; break;
         case 'center': default: break;
       }
       
       stairMesh.position.set(sX, minY + (stairHeight/2) - 17.5, sZ);
       stairMesh.userData = { type: 'Stairs', name: 'Main Stairwell' };
       this.scene.add(stairMesh);
       this.meshes.push(stairMesh);
    }
    
    // Adjust Camera based on center
    const centerHeight = (maxY + minY) / 2;
    this.camera.lookAt(0, centerHeight, 0);
  }

  private onMouseClick(event: MouseEvent): void {
    if (!this.editMode) return;

    // Calculate mouse position in normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast to find intersected objects
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.meshes);

    if (intersects.length > 0) {
      // Pick the first object clicked
      const object = intersects[0].object;
      this.selectedMeshDetails = object.userData;
      console.log('Selected:', this.selectedMeshDetails);
    } else {
      this.selectedMeshDetails = null;
    }
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
    
    // Add a simple slow rotation for viewing
    if (!this.editMode && this.scene) {
      this.scene.rotation.y += 0.001; 
    }

    this.renderer.render(this.scene, this.camera);
  }
}
