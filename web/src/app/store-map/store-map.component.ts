import {
  Component, ElementRef, ViewChild, AfterViewInit,
  OnDestroy, ChangeDetectorRef, inject, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MapSection, MapFloor, StoreMapConfig,
  SectionPreset, SECTION_PRESETS, WizardFloorSetup
} from './store-config.interface';

@Component({
  selector: 'app-store-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './store-map.component.html',
  styleUrl: './store-map.component.scss',
})
export class StoreMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') wrapperRef!: ElementRef<HTMLDivElement>;

  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  // ── Wizard State ──────────────────────────────────────────
  wizardActive = true;
  wizardStep: 1 | 2 = 1;
  currentWizardFloor = 0;
  storeName = 'Smart Bazaar';
  numFloors = 2;
  allPresets = SECTION_PRESETS;
  wizardFloors: WizardFloorSetup[] = [
    { name: 'Ground Floor', selectedTypes: new Set(['entrance', 'grocery', 'clothing', 'billing']) },
    { name: 'Floor 1',      selectedTypes: new Set(['footwear', 'electronics', 'home']) },
  ];

  // ── Map State ────────────────────────────────────────────
  config: StoreMapConfig | null = null;
  activeFloorIndex = 0;
  selectedSectionId: string | null = null;
  hoveredSectionId: string | null = null;
  editMode = false;
  showAddSectionPanel = false;

  // ── Navigation / Search ─────────────────────────────────
  searchQuery = '';
  searchResult: MapSection | null = null;
  navigationActive = false;

  // ── Canvas internals ─────────────────────────────────────
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private animFrame: number | null = null;
  private dpr = 1;
  private canvasW = 800;
  private canvasH = 550;
  private pathOffset = 0;
  private pulsePhase = 0;
  private lastTime = 0;
  private boundResize!: () => void;

  // ── Drag State ───────────────────────────────────────────
  private isDragging = false;
  private dragSectionId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragOrigX = 0;
  private dragOrigY = 0;
  private mouseDownX = 0;
  private mouseDownY = 0;

  // ── Accessors ────────────────────────────────────────────
  get activeFloor(): MapFloor | null {
    return this.config?.floors[this.activeFloorIndex] ?? null;
  }
  get activeSections(): MapSection[] {
    return this.activeFloor?.sections ?? [];
  }
  get selectedSection(): MapSection | null {
    return this.activeSections.find(s => s.id === this.selectedSectionId) ?? null;
  }
  get currentWizardFloorSetup(): WizardFloorSetup {
    return this.wizardFloors[this.currentWizardFloor];
  }

  // ── Lifecycle ─────────────────────────────────────────────
  ngAfterViewInit(): void {
    this.boundResize = this.onResize.bind(this);
    window.addEventListener('resize', this.boundResize);
  }
  ngOnDestroy(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    window.removeEventListener('resize', this.boundResize);
  }

  // ── Wizard Logic ─────────────────────────────────────────
  updateFloorCount(): void {
    const n = Math.max(1, Math.min(5, this.numFloors));
    while (this.wizardFloors.length < n) {
      const level = this.wizardFloors.length;
      this.wizardFloors.push({
        name: level === 0 ? 'Ground Floor' : `Floor ${level}`,
        selectedTypes: new Set(['grocery', 'clothing']),
      });
    }
    this.wizardFloors = this.wizardFloors.slice(0, n);
  }

  goToStep2(): void {
    if (!this.storeName.trim()) return;
    this.updateFloorCount();
    this.currentWizardFloor = 0;
    this.wizardStep = 2;
  }

  backToStep1(): void {
    this.wizardStep = 1;
  }

  togglePreset(type: string): void {
    const s = this.currentWizardFloorSetup.selectedTypes;
    if (s.has(type)) { if (s.size > 1) s.delete(type); }
    else { s.add(type); }
  }
  isPresetSelected(type: string): boolean {
    return this.currentWizardFloorSetup.selectedTypes.has(type);
  }

  wizardPrev(): void {
    if (this.currentWizardFloor > 0) this.currentWizardFloor--;
    else this.wizardStep = 1;
  }
  wizardNext(): void {
    if (this.currentWizardFloor < this.wizardFloors.length - 1) this.currentWizardFloor++;
    else this.generateMap();
  }
  isLastWizardFloor(): boolean {
    return this.currentWizardFloor === this.wizardFloors.length - 1;
  }

  generateMap(): void {
    const floors: MapFloor[] = this.wizardFloors.map((setup, idx) => {
      const selected = SECTION_PRESETS.filter(p => setup.selectedTypes.has(p.type));
      return {
        id: `floor-${idx}`,
        name: setup.name,
        level: idx,
        sections: this.autoLayout(selected),
      };
    });
    this.config = { storeName: this.storeName, floors };
    this.activeFloorIndex = 0;
    this.wizardActive = false;
    setTimeout(() => this.initCanvas(), 60);
  }

  // ── Auto Layout ──────────────────────────────────────────
  private autoLayout(presets: SectionPreset[]): MapSection[] {
    const sections: MapSection[] = [];
    const entrance = presets.find(p => p.type === 'entrance');
    const billing   = presets.find(p => p.type === 'billing');
    const others    = presets.filter(p => p.type !== 'entrance' && p.type !== 'billing');

    const PAD = 2;
    const startX = 2, startY = 3;
    const areaW = billing ? 68 : 96;
    const areaH = entrance ? 72 : 94;

    const cols = others.length <= 2 ? 2 : others.length <= 6 ? 3 : 4;
    const rows = Math.ceil(others.length / cols);
    const cellW = areaW / cols;
    const cellH = areaH / rows;

    others.forEach((p, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      sections.push({
        id: this.genId(), type: p.type, name: p.name,
        color: p.color, icon: p.icon,
        aisle: `Aisle ${i + 1}`,
        x: startX + col * cellW + PAD,
        y: startY + row * cellH + PAD,
        w: cellW - PAD * 2,
        h: cellH - PAD * 2,
      });
    });

    if (billing) {
      sections.unshift({
        id: this.genId(), type: billing.type, name: billing.name,
        color: billing.color, icon: billing.icon, aisle: 'Counter',
        x: 73, y: 3, w: 24, h: 16,
      });
    }
    if (entrance) {
      sections.push({
        id: this.genId(), type: entrance.type, name: entrance.name,
        color: entrance.color, icon: entrance.icon, aisle: 'Main Entry',
        x: 25, y: 80, w: 50, h: 17,
      });
    }
    return sections;
  }

  private genId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  // ── Canvas Setup ─────────────────────────────────────────
  private initCanvas(): void {
    if (!this.canvasRef || !this.wrapperRef) return;
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
    this.resizeCanvas();

    this.canvas.addEventListener('mousemove',  this.onMouseMove.bind(this));
    this.canvas.addEventListener('mousedown',  this.onMouseDown.bind(this));
    this.canvas.addEventListener('mouseup',    this.onMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onMouseLeave.bind(this));

    this.ngZone.runOutsideAngular(() => this.startRenderLoop());
  }

  private resizeCanvas(): void {
    if (!this.canvas || !this.wrapperRef) return;
    const rect = this.wrapperRef.nativeElement.getBoundingClientRect();
    this.canvasW = rect.width  || 800;
    this.canvasH = rect.height || 550;
    this.canvas.width  = this.canvasW * this.dpr;
    this.canvas.height = this.canvasH * this.dpr;
    this.canvas.style.width  = `${this.canvasW}px`;
    this.canvas.style.height = `${this.canvasH}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private onResize(): void {
    this.resizeCanvas();
  }

  // ── Render Loop ──────────────────────────────────────────
  private startRenderLoop(): void {
    const loop = (t: number) => {
      const dt = t - this.lastTime;
      this.lastTime = t;
      this.pathOffset  = (this.pathOffset  + dt * 0.025) % 24;
      this.pulsePhase  = (this.pulsePhase  + dt * 0.003) % (Math.PI * 2);
      this.drawMap();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  private drawMap(): void {
    const ctx = this.ctx;
    const W = this.canvasW, H = this.canvasH;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, W, H);
    this.drawGrid(ctx, W, H);

    // Floor outline
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 8, 8, W - 16, H - 16, 16);
    ctx.stroke();

    const sections = this.activeSections;

    // Draw aisle corridors between sections
    this.drawCorridors(ctx, sections, W, H);

    // Regular sections
    sections.filter(s => s.id !== this.selectedSectionId)
            .forEach(s => this.drawSection(ctx, s, W, H, false));

    // Selected section on top
    const sel = sections.find(s => s.id === this.selectedSectionId);
    if (sel) this.drawSection(ctx, sel, W, H, true);

    // Navigation path
    if (this.navigationActive && this.searchResult) {
      const ent = sections.find(s => s.type === 'entrance');
      if (ent) this.drawNavPath(ctx, ent, this.searchResult, W, H);
    }

    // "You Are Here" at entrance
    const entrance = sections.find(s => s.type === 'entrance');
    if (entrance) {
      this.drawYouAreHere(ctx,
        this.pct(entrance.x + entrance.w / 2, W),
        this.pct(entrance.y + entrance.h / 2, H));
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    const step = 44;
    for (let x = 0; x <= W; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  private drawCorridors(ctx: CanvasRenderingContext2D, sections: MapSection[], W: number, H: number): void {
    ctx.fillStyle = 'rgba(241, 245, 249, 0.5)';
    // Simple horizontal + vertical corridors at midpoints
    const midY = H / 2;
    ctx.fillRect(8, midY - 14, W - 16, 28);
    const midX = W / 2;
    ctx.fillRect(midX - 14, 8, 28, H - 16);
  }

  private drawSection(
    ctx: CanvasRenderingContext2D,
    s: MapSection, W: number, H: number,
    isSelected: boolean
  ): void {
    const x = this.pct(s.x, W), y = this.pct(s.y, H);
    const w = this.pct(s.w, W), h = this.pct(s.h, H);
    const r = 12;

    // Drop shadow
    ctx.shadowColor   = isSelected ? `${s.color}55` : 'rgba(0,0,0,0.12)';
    ctx.shadowBlur    = isSelected ? 22 : 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = isSelected ? 6 : 3;

    // Background fill gradient
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, this.hexAlpha(s.color, 0.13));
    bg.addColorStop(1, this.hexAlpha(s.color, 0.06));
    ctx.fillStyle = bg;
    this.roundRect(ctx, x, y, w, h, r); ctx.fill();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    // Border
    ctx.strokeStyle = isSelected ? s.color : this.hexAlpha(s.color, 0.65);
    ctx.lineWidth   = isSelected ? 2.5 : 1.5;
    this.roundRect(ctx, x, y, w, h, r); ctx.stroke();

    // Color header strip
    const stripH = Math.min(h * 0.22, 32);
    const sg = ctx.createLinearGradient(x, y, x + w, y);
    sg.addColorStop(0, s.color);
    sg.addColorStop(1, this.lighten(s.color, 25));
    ctx.fillStyle = sg;
    this.roundRectTop(ctx, x, y, w, stripH, r); ctx.fill();

    // Section name on header strip
    const stripFontSize = Math.max(9, Math.min(13, w * 0.085));
    ctx.font = `bold ${stripFontSize}px Inter, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 4, y, w - 8, stripH); ctx.clip();
    ctx.fillText(s.name.toUpperCase(), x + w / 2, y + stripH / 2);
    ctx.restore();

    // Icon
    const iconSize = Math.max(18, Math.min(32, Math.min(w, h) * 0.28));
    ctx.font = `${iconSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.icon, x + w / 2, y + stripH + (h - stripH) * 0.42);

    // Aisle label
    if (h > 70) {
      ctx.font = `${Math.max(9, Math.min(11, w * 0.075))}px Inter, sans-serif`;
      ctx.fillStyle = '#64748b';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.aisle, x + w / 2, y + stripH + (h - stripH) * 0.78);
    }

    // Selected: dashed ring + handles
    if (isSelected) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      this.roundRect(ctx, x - 5, y - 5, w + 10, h + 10, r + 4);
      ctx.stroke();
      ctx.setLineDash([]);
      if (this.editMode) this.drawHandles(ctx, x, y, w, h, s.color);
    }

    // Hovered glow
    if (this.hoveredSectionId === s.id && !isSelected) {
      ctx.strokeStyle = this.hexAlpha(s.color, 0.9);
      ctx.lineWidth = 2.5;
      this.roundRect(ctx, x - 3, y - 3, w + 6, h + 6, r + 3);
      ctx.stroke();
    }
  }

  private drawHandles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    const pts = [
      [x, y], [x + w / 2, y], [x + w, y],
      [x, y + h / 2],          [x + w, y + h / 2],
      [x, y + h], [x + w / 2, y + h], [x + w, y + h],
    ];
    pts.forEach(([hx, hy]) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, 5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
  }

  private drawYouAreHere(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const p = Math.sin(this.pulsePhase);
    ctx.strokeStyle = `rgba(16,185,129,${0.25 + p * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 22 + p * 7, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();

    const label = 'You Are Here';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lw = ctx.measureText(label).width;
    const bw = lw + 18, bh = 22, bx = x - bw / 2, by = y - 42;
    ctx.fillStyle = '#0f172a';
    this.roundRect(ctx, bx, by, bw, bh, 6); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, by + bh / 2);
  }

  private drawNavPath(
    ctx: CanvasRenderingContext2D,
    from: MapSection, to: MapSection,
    W: number, H: number
  ): void {
    const fx = this.pct(from.x + from.w / 2, W), fy = this.pct(from.y + from.h / 2, H);
    const tx = this.pct(to.x   + to.w   / 2, W), ty = this.pct(to.y   + to.h   / 2, H);

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.lineDashOffset = -this.pathOffset;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.bezierCurveTo(fx + (tx - fx) * 0.1, fy, tx - (tx - fx) * 0.1, ty, tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Mouse Events ─────────────────────────────────────────
  private getMousePos(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { mx: e.clientX - r.left, my: e.clientY - r.top };
  }

  private onMouseDown(e: MouseEvent): void {
    const { mx, my } = this.getMousePos(e);
    this.mouseDownX = mx; this.mouseDownY = my;
    const hit = this.hitTest(mx, my);
    this.ngZone.run(() => {
      this.showAddSectionPanel = false;
      if (hit) {
        this.selectedSectionId = hit.id;
        if (this.editMode) {
          this.dragSectionId = hit.id;
          this.dragStartX = mx; this.dragStartY = my;
          this.dragOrigX = hit.x; this.dragOrigY = hit.y;
        }
      } else {
        this.selectedSectionId = null;
      }
      this.cdr.detectChanges();
    });
  }

  private onMouseMove(e: MouseEvent): void {
    const { mx, my } = this.getMousePos(e);
    if (this.editMode && this.dragSectionId) {
      const dist = Math.hypot(mx - this.mouseDownX, my - this.mouseDownY);
      if (dist > 4) {
        this.isDragging = true;
        const hit = this.activeSections.find(s => s.id === this.dragSectionId);
        if (hit) {
          hit.x = Math.max(0, Math.min(100 - hit.w, this.dragOrigX + (mx - this.dragStartX) / this.canvasW * 100));
          hit.y = Math.max(0, Math.min(100 - hit.h, this.dragOrigY + (my - this.dragStartY) / this.canvasH * 100));
        }
      }
    } else {
      const hit = this.hitTest(mx, my);
      const id = hit?.id ?? null;
      if (id !== this.hoveredSectionId) {
        this.hoveredSectionId = id;
        this.canvas.style.cursor = id ? (this.editMode ? 'grab' : 'pointer') : 'default';
      }
    }
  }

  private onMouseUp(e: MouseEvent): void {
    this.isDragging = false;
    this.dragSectionId = null;
  }

  private onMouseLeave(): void {
    this.hoveredSectionId = null;
    this.dragSectionId = null;
    this.isDragging = false;
    if (this.canvas) this.canvas.style.cursor = 'default';
  }

  private hitTest(mx: number, my: number): MapSection | null {
    const secs = [...this.activeSections].reverse();
    for (const s of secs) {
      const x = this.pct(s.x, this.canvasW), y = this.pct(s.y, this.canvasH);
      const w = this.pct(s.w, this.canvasW), h = this.pct(s.h, this.canvasH);
      if (mx >= x && mx <= x + w && my >= y && my <= y + h) return s;
    }
    return null;
  }

  // ── Section CRUD ─────────────────────────────────────────
  addSection(preset: SectionPreset): void {
    if (!this.activeFloor) return;
    this.activeFloor.sections.push({
      id: this.genId(), type: preset.type, name: preset.name,
      color: preset.color, icon: preset.icon,
      aisle: `Aisle ${this.activeSections.length + 1}`,
      x: 35, y: 35, w: preset.defaultW, h: preset.defaultH,
    });
    this.showAddSectionPanel = false;
  }

  deleteSelectedSection(): void {
    if (!this.activeFloor || !this.selectedSectionId) return;
    this.activeFloor.sections = this.activeFloor.sections.filter(s => s.id !== this.selectedSectionId);
    this.selectedSectionId = null;
  }

  // ── Floor / UI Actions ───────────────────────────────────
  switchFloor(i: number): void {
    this.activeFloorIndex = i;
    this.selectedSectionId = null;
    this.searchResult = null;
    this.navigationActive = false;
  }

  toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (!this.editMode) this.selectedSectionId = null;
  }

  selectSection(id: string): void {
    this.selectedSectionId = id === this.selectedSectionId ? null : id;
  }

  searchProduct(): void {
    if (!this.searchQuery.trim()) {
      this.searchResult = null; this.navigationActive = false; return;
    }
    const q = this.searchQuery.toLowerCase();
    const r = this.activeSections.find(s =>
      s.name.toLowerCase().includes(q) || s.type.includes(q)
    ) ?? null;
    this.searchResult = r;
    this.navigationActive = !!r;
    if (r) this.selectedSectionId = r.id;
  }

  saveMap(): void {
    if (this.config) localStorage.setItem('smartcart_store_map', JSON.stringify(this.config));
  }

  // ── Canvas Helpers ───────────────────────────────────────
  private pct(v: number, total: number): number { return (v / 100) * total; }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const R = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + R, y);
    ctx.lineTo(x + w - R, y);       ctx.quadraticCurveTo(x + w, y,     x + w, y + R);
    ctx.lineTo(x + w, y + h - R);   ctx.quadraticCurveTo(x + w, y + h, x + w - R, y + h);
    ctx.lineTo(x + R, y + h);       ctx.quadraticCurveTo(x,     y + h, x,     y + h - R);
    ctx.lineTo(x, y + R);           ctx.quadraticCurveTo(x,     y,     x + R, y);
    ctx.closePath();
  }

  private roundRectTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const R = Math.min(r, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x + R, y);
    ctx.lineTo(x + w - R, y);       ctx.quadraticCurveTo(x + w, y, x + w, y + R);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + R);           ctx.quadraticCurveTo(x, y, x + R, y);
    ctx.closePath();
  }

  private hexAlpha(hex: string, a: number): string {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return `rgba(128,128,128,${a})`;
    return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`;
  }

  private lighten(hex: string, amt: number): string {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    const r = Math.min(255, parseInt(m[1], 16) + amt);
    const g = Math.min(255, parseInt(m[2], 16) + amt);
    const b = Math.min(255, parseInt(m[3], 16) + amt);
    return `rgb(${r},${g},${b})`;
  }
}
