import {
  Component, ElementRef, ViewChild, AfterViewInit,
  OnDestroy, ChangeDetectorRef, inject, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MapSection, MapFloor, StoreMapConfig, SectionPreset, SECTION_PRESETS, WizardFloorSetup } from './store-config.interface';

const BADGES = ['', '', '', '30% OFF', '', 'HOT', '', '', 'NEW', '50% OFF', '', ''];
const MOCK_PRODUCTS: Record<string, string[]> = {
  grocery:     ['🍎 Fresh Apples','🥕 Carrots','🥛 Full-Cream Milk','🍞 Whole-Wheat Bread','🥚 Farm Eggs','🍌 Bananas'],
  clothing:    ['👕 Cotton T-Shirts','👖 Slim Jeans','🧥 Winter Jackets','👗 Summer Dresses','🧣 Scarves'],
  electronics: ['📱 Smartphones','💻 Laptops','📷 DSLRs','🎧 ANC Headphones','📺 Smart TVs'],
  billing:     ['💳 Card / UPI','💵 Cash Counter','🧾 Self-Checkout'],
  footwear:    ['👟 Sports Shoes','👞 Formal Shoes','👡 Heels','🥿 Flats','🥾 Boots'],
  home:        ['🍳 Non-Stick Cookware','🏠 Home Décor','🪑 Furniture','🛁 Bathroom Accessories'],
  offers:      ['🏷️ Flash Deals','🎁 Gift Cards','🔖 Seasonal Offers','🎯 Bundle Packs'],
  bakery:      ['🥐 Croissants','🎂 Custom Cakes','🥖 Sourdough','🍪 Cookies','🧁 Cupcakes'],
  dairy:       ['🧀 Cheese Varieties','🥛 Fresh Milk','🧈 Butter','🍦 Ice Cream'],
  pharmacy:    ['💊 Medicines','🩺 First-Aid','💆 Vitamins & Supplements'],
  sports:      ['⚽ Football','🏏 Cricket Gear','🎾 Tennis','🏊 Swimming','🏋️ Fitness'],
  entrance:    ['🛒 Shopping Carts','🗺️ Store Map','ℹ️ Information Desk','🎫 Loyalty Cards'],
};

@Component({
  selector: 'app-store-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './store-map.component.html',
  styleUrl: './store-map.component.scss',
})
export class StoreMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapCanvas')   canvasRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') wrapperRef!: ElementRef<HTMLDivElement>;

  private cdr     = inject(ChangeDetectorRef);
  private ngZone  = inject(NgZone);

  // ── Wizard ──────────────────────────────────────────────
  wizardActive = true; wizardStep: 1|2 = 1; currentWizardFloor = 0;
  storeName = 'Smart Bazaar'; numFloors = 2; allPresets = SECTION_PRESETS;
  wizardFloors: WizardFloorSetup[] = [
    { name: 'Ground Floor', selectedTypes: new Set(['entrance','grocery','clothing','billing','offers']) },
    { name: 'Floor 1',      selectedTypes: new Set(['footwear','electronics','home','pharmacy']) },
  ];

  // ── Map State ────────────────────────────────────────────
  config: StoreMapConfig | null = null;
  activeFloorIndex = 0; selectedSectionId: string|null = null;
  hoveredSectionId: string|null = null; editMode = false; showAddSectionPanel = false;

  // ── Zoom / Pan ───────────────────────────────────────────
  zoom = 1.0; private panX = 0; private panY = 0;
  private isPanning = false; private panStartX = 0; private panStartY = 0;

  // ── Navigation ───────────────────────────────────────────
  searchQuery = ''; searchResult: MapSection|null = null; navigationActive = false;

  // ── Canvas internals ────────────────────────────────────
  private canvas!: HTMLCanvasElement; private ctx!: CanvasRenderingContext2D;
  private animFrame: number|null = null; private dpr = 1; private canvasW = 800; private canvasH = 550;
  private pathOffset = 0; private pulsePhase = 0; private lastTime = 0; private boundResize!: ()=>void;

  // ── Drag ─────────────────────────────────────────────────
  private isDragging = false; private dragSectionId: string|null = null;
  private dragStartX = 0; private dragStartY = 0; private dragOrigX = 0; private dragOrigY = 0;
  private mouseDownX = 0; private mouseDownY = 0;

  // ── Accessors ────────────────────────────────────────────
  get activeFloor():    MapFloor|null   { return this.config?.floors[this.activeFloorIndex] ?? null; }
  get activeSections(): MapSection[]    { return this.activeFloor?.sections ?? []; }
  get selectedSection():MapSection|null { return this.activeSections.find(s=>s.id===this.selectedSectionId)??null; }
  get cwfs():           WizardFloorSetup{ return this.wizardFloors[this.currentWizardFloor]; }
  get mockProducts():   string[]        { return this.selectedSection ? (MOCK_PRODUCTS[this.selectedSection.type]??[]) : []; }

  // ── Lifecycle ─────────────────────────────────────────────
  ngAfterViewInit(): void {
    this.boundResize = ()=>this.resizeCanvas();
    window.addEventListener('resize', this.boundResize);
  }
  ngOnDestroy(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    window.removeEventListener('resize', this.boundResize);
  }

  // ── Wizard Logic ─────────────────────────────────────────
  updateFloorCount(): void {
    const n = Math.max(1,Math.min(5, this.numFloors));
    while (this.wizardFloors.length < n) {
      const l = this.wizardFloors.length;
      this.wizardFloors.push({ name: l===0?'Ground Floor':`Floor ${l}`, selectedTypes: new Set(['grocery','clothing']) });
    }
    this.wizardFloors = this.wizardFloors.slice(0, n);
  }
  goToStep2():  void { if (!this.storeName.trim()) return; this.updateFloorCount(); this.currentWizardFloor=0; this.wizardStep=2; }
  togglePreset(t: string): void { const s=this.cwfs.selectedTypes; if(s.has(t)){if(s.size>1)s.delete(t);}else{s.add(t);} }
  isPresetSelected(t: string): boolean { return this.cwfs.selectedTypes.has(t); }
  wizardPrev(): void { if(this.currentWizardFloor>0) this.currentWizardFloor--; else this.wizardStep=1; }
  wizardNext(): void { if(this.currentWizardFloor<this.wizardFloors.length-1) this.currentWizardFloor++; else this.generateMap(); }
  isLastWizardFloor(): boolean { return this.currentWizardFloor===this.wizardFloors.length-1; }

  generateMap(): void {
    const floors: MapFloor[] = this.wizardFloors.map((setup,idx)=>({
      id:`floor-${idx}`, name:setup.name, level:idx,
      sections: this.autoLayout(SECTION_PRESETS.filter(p=>setup.selectedTypes.has(p.type))),
    }));
    this.config = { storeName: this.storeName, floors };
    this.activeFloorIndex = 0; this.wizardActive = false;
    setTimeout(()=>this.initCanvas(), 60);
  }

  // ── Auto Layout ──────────────────────────────────────────
  private autoLayout(presets: SectionPreset[]): MapSection[] {
    const sections: MapSection[] = [];
    const entrance = presets.find(p=>p.type==='entrance');
    const billing   = presets.find(p=>p.type==='billing');
    const others    = presets.filter(p=>p.type!=='entrance'&&p.type!=='billing');
    const PAD=2, startX=2, startY=3, areaW=billing?67:96, areaH=entrance?70:94;
    const cols = others.length<=2?2:others.length<=6?3:4;
    const rows = Math.ceil(others.length/cols);
    const cW=areaW/cols, cH=areaH/rows;
    const badges = ['30% OFF','HOT','NEW','50% OFF','','','','',''];
    others.forEach((p,i)=>{
      sections.push({
        id:this.genId(), type:p.type, name:p.name, color:p.color, icon:p.icon, aisle:`Aisle ${i+1}`,
        badge: badges[i % badges.length] || undefined,
        x:startX+(i%cols)*cW+PAD, y:startY+Math.floor(i/cols)*cH+PAD, w:cW-PAD*2, h:cH-PAD*2,
      });
    });
    if (billing) sections.unshift({ id:this.genId(), type:billing.type, name:billing.name, color:billing.color, icon:billing.icon, aisle:'Counter', badge:'Open', x:72, y:3, w:24, h:16 });
    if (entrance) sections.push({ id:this.genId(), type:entrance.type, name:entrance.name, color:entrance.color, icon:entrance.icon, aisle:'Main Entry', x:25, y:79, w:50, h:18 });
    return sections;
  }
  private genId(): string { return Math.random().toString(36).substr(2,9); }

  // ── Canvas Setup ─────────────────────────────────────────
  private initCanvas(): void {
    if (!this.canvasRef || !this.wrapperRef) return;
    this.canvas = this.canvasRef.nativeElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
    this.resizeCanvas();
    this.canvas.addEventListener('mousemove',  e=>this.onMouseMove(e));
    this.canvas.addEventListener('mousedown',  e=>this.onMouseDown(e));
    this.canvas.addEventListener('mouseup',    e=>this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', ()=>this.onMouseLeave());
    this.canvas.addEventListener('wheel',      e=>this.onWheel(e), { passive:false });
    this.ngZone.runOutsideAngular(()=>this.startRenderLoop());
  }
  private resizeCanvas(): void {
    if (!this.canvas||!this.wrapperRef) return;
    const r = this.wrapperRef.nativeElement.getBoundingClientRect();
    this.canvasW = r.width||800; this.canvasH = r.height||550;
    this.canvas.width = this.canvasW*this.dpr; this.canvas.height = this.canvasH*this.dpr;
    this.canvas.style.width = `${this.canvasW}px`; this.canvas.style.height = `${this.canvasH}px`;
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  }

  // ── Zoom / Pan ───────────────────────────────────────────
  zoomIn():    void { this.zoom = Math.min(4, this.zoom*1.25); }
  zoomOut():   void { this.zoom = Math.max(0.35, this.zoom/1.25); }
  resetZoom(): void { this.zoom=1; this.panX=0; this.panY=0; }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.92;
    this.zoom = Math.max(0.35, Math.min(4, this.zoom*factor));
  }

  // Map ↔ screen coordinate conversion (accounts for zoom+pan)
  private screenToMap(sx: number, sy: number): {mx:number,my:number} {
    const cx = this.canvasW/2, cy = this.canvasH/2;
    return { mx:(sx-cx-this.panX)/this.zoom+cx, my:(sy-cy-this.panY)/this.zoom+cy };
  }

  // ── Render Loop ──────────────────────────────────────────
  private startRenderLoop(): void {
    const loop = (t:number)=>{
      const dt=t-this.lastTime; this.lastTime=t;
      this.pathOffset = (this.pathOffset+dt*0.028)%28;
      this.pulsePhase = (this.pulsePhase+dt*0.003)%(Math.PI*2);
      this.drawMap();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  private drawMap(): void {
    const ctx=this.ctx, W=this.canvasW, H=this.canvasH;
    ctx.clearRect(0,0,W,H);

    // Apply zoom + pan transform
    ctx.save();
    ctx.translate(W/2+this.panX, H/2+this.panY);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-W/2, -H/2);

    this.drawFloorTiles(ctx,W,H);
    this.drawCeilingLights(ctx,W,H);
    this.drawCorridors(ctx,W,H);

    const secs = this.activeSections;
    secs.filter(s=>s.id!==this.selectedSectionId).forEach(s=>this.drawSection(ctx,s,W,H,false));
    const sel = secs.find(s=>s.id===this.selectedSectionId);
    if (sel) this.drawSection(ctx,sel,W,H,true);

    if (this.navigationActive && this.searchResult) {
      const ent = secs.find(s=>s.type==='entrance');
      if (ent) this.drawNavPath(ctx,ent,this.searchResult,W,H);
    }
    const entrance = secs.find(s=>s.type==='entrance');
    if (entrance) {
      this.drawYouAreHere(ctx, this.pct(entrance.x+entrance.w/2,W), this.pct(entrance.y+entrance.h/2,H));
    }
    ctx.restore();
  }

  // ── Floor Tiles ─────────────────────────────────────────
  private drawFloorTiles(ctx: CanvasRenderingContext2D, W:number, H:number): void {
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0,0,W,H);
    const ts = 44;
    for (let x=0; x<=W; x+=ts) for (let y=0; y<=H; y+=ts) {
      const even = (Math.floor(x/ts)+Math.floor(y/ts))%2===0;
      ctx.fillStyle = even ? 'rgba(255,255,255,0.65)' : 'rgba(240,240,245,0.65)';
      ctx.fillRect(x,y,ts,ts);
      ctx.strokeStyle = 'rgba(200,210,220,0.5)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x,y,ts,ts);
    }
    // Outer wall
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3;
    this.roundRect(ctx,6,6,W-12,H-12,18); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    this.roundRect(ctx,6,6,W-12,H-12,18); ctx.fill();
  }

  // ── Ceiling Spotlights ──────────────────────────────────
  private drawCeilingLights(ctx: CanvasRenderingContext2D, W:number, H:number): void {
    const cols=4, rows=3;
    for (let c=0; c<cols; c++) for (let r=0; r<rows; r++) {
      const lx=(c+0.5)*W/cols, ly=(r+0.5)*H/rows;
      const g = ctx.createRadialGradient(lx,ly,0,lx,ly,W/cols*0.65);
      g.addColorStop(0,'rgba(255,255,240,0.18)');
      g.addColorStop(1,'rgba(255,255,240,0)');
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(lx,ly,W/cols*0.65,0,Math.PI*2); ctx.fill();
    }
  }

  // ── Corridors / Aisles ───────────────────────────────────
  private drawCorridors(ctx: CanvasRenderingContext2D, W:number, H:number): void {
    ctx.fillStyle = 'rgba(241,245,249,0.6)';
    ctx.fillRect(W*0.01, H*0.74, W*0.98, H*0.07); // horizontal main aisle
    // aisle numbering
    ctx.font = 'bold 11px Inter,sans-serif'; ctx.fillStyle='#94a3b8';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    for (let i=1; i<=4; i++) ctx.fillText(`${i}`, W*(i/5), H*0.775);
  }

  // ── Section Drawing ─────────────────────────────────────
  private drawSection(ctx: CanvasRenderingContext2D, s:MapSection, W:number, H:number, isSelected:boolean): void {
    const x=this.pct(s.x,W), y=this.pct(s.y,H), w=this.pct(s.w,W), h=this.pct(s.h,H), r=10;

    // Shadow
    ctx.shadowColor   = isSelected ? `${s.color}66` : 'rgba(0,0,0,0.14)';
    ctx.shadowBlur    = isSelected ? 26 : 12; ctx.shadowOffsetY = isSelected?7:4;

    // Background
    const bg = ctx.createLinearGradient(x,y,x,y+h);
    bg.addColorStop(0, this.ha(s.color,.12)); bg.addColorStop(1, this.ha(s.color,.05));
    ctx.fillStyle=bg; this.roundRect(ctx,x,y,w,h,r); ctx.fill();
    ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;

    // Border
    ctx.strokeStyle = isSelected ? s.color : this.ha(s.color,.55);
    ctx.lineWidth   = isSelected ? 2.5 : 1.5;
    this.roundRect(ctx,x,y,w,h,r); ctx.stroke();

    // Header strip
    const sH = Math.min(h*0.2, 28);
    const sg = ctx.createLinearGradient(x,y,x+w,y);
    sg.addColorStop(0,s.color); sg.addColorStop(1,this.lighten(s.color,30));
    ctx.fillStyle=sg; this.roundRectTop(ctx,x,y,w,sH,r); ctx.fill();

    // Name on strip
    ctx.save(); ctx.beginPath(); ctx.rect(x+4,y,w-8,sH); ctx.clip();
    ctx.font = `bold ${Math.max(8,Math.min(12,w*.08))}px Inter,sans-serif`;
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(s.name.toUpperCase(), x+w/2, y+sH/2);
    ctx.restore();

    // Interior furniture
    this.drawSectionInterior(ctx, s.type, x, y+sH, w, h-sH, s.color);

    // Icon
    const iconSz = Math.max(16,Math.min(26,Math.min(w,h)*.2));
    ctx.font=`${iconSz}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(s.icon, x+w/2, y+sH+(h-sH)*.78);

    // Aisle label
    if (h>80) {
      ctx.font=`${Math.max(8,Math.min(10,w*.065))}px Inter,sans-serif`;
      ctx.fillStyle='#64748b'; ctx.textBaseline='middle';
      ctx.fillText(s.aisle, x+w/2, y+sH+(h-sH)*.92);
    }

    // Sale badge
    if (s.badge) {
      const bw=Math.max(44,s.badge.length*7+10), bh=16;
      ctx.fillStyle='#ef4444';
      this.roundRect(ctx, x+w-bw-4, y+4, bw, bh, 8); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='bold 9px Inter,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(s.badge, x+w-4-bw/2, y+4+bh/2);
    }

    // Selected ring + handles
    if (isSelected) {
      ctx.strokeStyle=s.color; ctx.lineWidth=2; ctx.setLineDash([6,4]);
      this.roundRect(ctx,x-5,y-5,w+10,h+10,r+4); ctx.stroke(); ctx.setLineDash([]);
      if (this.editMode) this.drawHandles(ctx,x,y,w,h,s.color);
    }
    if (this.hoveredSectionId===s.id&&!isSelected) {
      ctx.strokeStyle=this.ha(s.color,.9); ctx.lineWidth=2.5;
      this.roundRect(ctx,x-3,y-3,w+6,h+6,r+3); ctx.stroke();
    }
  }

  // ── Section Interiors ──────────────────────────────────
  private drawSectionInterior(ctx: CanvasRenderingContext2D, type:string, x:number, y:number, w:number, h:number, color:string): void {
    const innerH = h*0.6, innerY = y+2;
    switch(type) {
      case 'grocery': case 'dairy': case 'bakery': case 'pharmacy':
        this.drawShelves(ctx,x,innerY,w,innerH,color); break;
      case 'clothing': case 'footwear': case 'sports':
        this.drawRacks(ctx,x,innerY,w,innerH,color); break;
      case 'electronics': case 'home':
        this.drawDisplayTables(ctx,x,innerY,w,innerH,color); break;
      case 'billing':
        this.drawBillingCounters(ctx,x,innerY,w,innerH,color); break;
      case 'entrance':
        this.drawEntranceDoors(ctx,x,innerY,w,innerH,color); break;
      case 'offers':
        this.drawOfferShelf(ctx,x,innerY,w,innerH,color); break;
    }
  }

  private drawShelves(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, color:string): void {
    const rows=3, rH=h/rows;
    const pColors=['#ef4444','#22c55e','#3b82f6','#f59e0b','#8b5cf6','#ec4899'];
    for (let r=0; r<rows; r++) {
      const sy=y+r*rH;
      ctx.fillStyle=this.ha(color,.13); ctx.fillRect(x+6,sy+1,w-12,rH*.55);
      ctx.fillStyle=this.ha(color,.28); ctx.fillRect(x+6,sy+rH*.55,w-12,rH*.08); // shelf edge
      const dots=Math.floor((w-20)/12);
      for (let d=0; d<dots; d++) {
        ctx.fillStyle=pColors[d%pColors.length]+'bb';
        ctx.beginPath(); ctx.arc(x+12+d*((w-20)/dots),sy+rH*.3,3,0,Math.PI*2); ctx.fill();
      }
    }
  }

  private drawRacks(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, color:string): void {
    const racks=2, rSpacing=h/racks;
    const gColors=[color,this.lighten(color,40),'#94a3b8',this.ha(color,.5)+'ff'];
    for (let r=0; r<racks; r++) {
      const ry=y+r*rSpacing+rSpacing*.2;
      ctx.strokeStyle=this.ha(color,.5); ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(x+8,ry); ctx.lineTo(x+w-8,ry); ctx.stroke();
      const items=Math.floor((w-20)/16);
      for (let i=0; i<items; i++) {
        const ix=x+12+i*((w-20)/items);
        ctx.fillStyle=gColors[i%gColors.length]; ctx.globalAlpha=.55;
        ctx.beginPath(); ctx.rect(ix,ry+2,10,rSpacing*.35); ctx.fill();
        ctx.globalAlpha=1;
        ctx.strokeStyle=this.ha(color,.3); ctx.lineWidth=.8;
        ctx.stroke();
      }
    }
  }

  private drawDisplayTables(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, color:string): void {
    const cols=3, tableRows=2, tw=(w-20)/cols, th=h/tableRows;
    for (let r=0; r<tableRows; r++) for (let c=0; c<cols; c++) {
      const tx=x+10+c*tw, ty=y+r*th+2;
      ctx.fillStyle=this.ha(color,.2); ctx.fillRect(tx,ty,tw-4,th*.65);
      // Screen glow
      ctx.fillStyle='rgba(59,130,246,.28)'; ctx.fillRect(tx+3,ty+3,tw-10,th*.45);
      // Glint
      ctx.fillStyle='rgba(255,255,255,.25)'; ctx.fillRect(tx+3,ty+3,(tw-10)*.35,th*.13);
    }
  }

  private drawBillingCounters(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, color:string): void {
    const lanes=Math.min(3, Math.floor(h/22));
    const lH=h/lanes;
    for (let l=0; l<lanes; l++) {
      const ly=y+l*lH+2;
      ctx.fillStyle=this.ha(color,.18); ctx.fillRect(x+6,ly,w*0.6,lH*.5);
      ctx.fillStyle=this.ha(color,.4);  ctx.fillRect(x+6+w*0.6,ly,w*0.25,lH*.55);
      // Belt stripes
      ctx.strokeStyle=this.ha(color,.2); ctx.lineWidth=1; ctx.setLineDash([5,4]);
      for (let s=0; s<3; s++) {
        const sx=x+8+s*((w*0.6-8)/3);
        ctx.beginPath(); ctx.moveTo(sx,ly); ctx.lineTo(sx,ly+lH*.5); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  private drawEntranceDoors(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, color:string): void {
    // Glass door panels
    [[x+w*.22,y,w*.22,h*.7],[x+w*.56,y,w*.22,h*.7]].forEach(([dx,dy,dw,dh])=>{
      const g=ctx.createLinearGradient(dx as number,dy as number,dx as number+dw as number,dy as number);
      g.addColorStop(0,'rgba(186,230,253,.45)'); g.addColorStop(1,'rgba(147,210,255,.2)');
      ctx.fillStyle=g; ctx.fillRect(dx as number,dy as number,dw as number,dh as number);
      ctx.strokeStyle=this.ha(color,.6); ctx.lineWidth=1.5;
      ctx.strokeRect(dx as number,dy as number,dw as number,dh as number);
      ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fillRect(dx as number+2,dy as number+2,dw as number*.3,dh as number*.6);
    });
    // Shopping carts
    this.drawCart(ctx, x+w*.08, y+h*.35, color);
    this.drawCart(ctx, x+w*.82, y+h*.35, color);
  }

  private drawOfferShelf(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, color:string): void {
    const tags=['50%','30%','2+1','HOT'];
    const tw=(w-16)/tags.length;
    tags.forEach((t,i)=>{
      const tx=x+8+i*tw, ty=y+h*.1;
      ctx.fillStyle=this.ha(color,.2); this.roundRect(ctx,tx,ty,tw-4,h*.6,5); ctx.fill();
      ctx.fillStyle=color; ctx.font=`bold ${Math.max(9,Math.min(13,tw*.3))}px Inter,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(t,tx+tw/2-2,ty+h*.3);
    });
  }

  private drawCart(ctx: CanvasRenderingContext2D, x:number, y:number, color:string): void {
    const sc=7;
    ctx.strokeStyle=this.ha(color,.7); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.rect(x,y,sc*1.5,sc); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-sc*.4,y); ctx.lineTo(x-sc*.4,y-sc*.4); ctx.lineTo(x+sc*.3,y-sc*.4); ctx.stroke();
    ctx.fillStyle=this.ha(color,.8);
    [x+sc*.3,x+sc*1.2].forEach(wx=>{ ctx.beginPath(); ctx.arc(wx,y+sc+2,2.5,0,Math.PI*2); ctx.fill(); });
  }

  private drawHandles(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, color:string): void {
    [[x,y],[x+w/2,y],[x+w,y],[x,y+h/2],[x+w,y+h/2],[x,y+h],[x+w/2,y+h],[x+w,y+h]].forEach(([hx,hy])=>{
      ctx.fillStyle='#fff'; ctx.strokeStyle=color; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(hx,hy,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
    });
  }

  // ── Navigation Path ──────────────────────────────────────
  private drawNavPath(ctx: CanvasRenderingContext2D, from:MapSection, to:MapSection, W:number, H:number): void {
    const fx=this.pct(from.x+from.w/2,W), fy=this.pct(from.y+from.h/2,H);
    const tx=this.pct(to.x+to.w/2,W),   ty=this.pct(to.y+to.h/2,H);
    // Shadow
    ctx.shadowColor='rgba(59,130,246,.3)'; ctx.shadowBlur=10;
    // Animated dashes
    ctx.strokeStyle='#3b82f6'; ctx.lineWidth=4; ctx.setLineDash([14,8]);
    ctx.lineDashOffset=-this.pathOffset; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(fx,fy);
    ctx.bezierCurveTo(fx+(tx-fx)*.1,fy, tx-(tx-fx)*.1,ty, tx,ty);
    ctx.stroke(); ctx.setLineDash([]); ctx.shadowColor='transparent'; ctx.shadowBlur=0;
    // Waypoint circles
    [[fx,fy,true],[tx,ty,false]].forEach(([px,py,isFrom])=>{
      ctx.fillStyle=isFrom?'#10b981':'#ef4444';
      ctx.beginPath(); ctx.arc(px as number,py as number,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(px as number,py as number,3.5,0,Math.PI*2); ctx.fill();
    });
    // Arrow tip
    const angle=Math.atan2(ty-fy,tx-fx);
    const ar=14, ax=tx-Math.cos(angle)*ar, ay=ty-Math.sin(angle)*ar;
    ctx.fillStyle='#2563eb';
    ctx.beginPath();
    ctx.moveTo(tx,ty);
    ctx.lineTo(ax-Math.sin(angle)*8, ay+Math.cos(angle)*8);
    ctx.lineTo(ax+Math.sin(angle)*8, ay-Math.cos(angle)*8);
    ctx.closePath(); ctx.fill();
  }

  private drawYouAreHere(ctx: CanvasRenderingContext2D, x:number, y:number): void {
    const p=Math.sin(this.pulsePhase);
    // Pulse rings
    [.3+p*.2, .15+p*.1].forEach((alpha,i)=>{
      ctx.strokeStyle=`rgba(16,185,129,${alpha})`; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x,y,24+(i+1)*8+p*5,0,Math.PI*2); ctx.stroke();
    });
    // Pin body
    const pinH=28;
    ctx.fillStyle='#10b981';
    ctx.beginPath(); ctx.arc(x,y-pinH+8,12,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x-12,y-pinH+8); ctx.lineTo(x,y); ctx.lineTo(x+12,y-pinH+8); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y-pinH+8,5,0,Math.PI*2); ctx.fill();
    // Label bubble
    const label='You Are Here', lw=ctx.measureText(label).width+0;
    ctx.font='bold 11px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const bw=lw+22, bh=22, bx=x-bw/2, by=y-pinH-28;
    ctx.fillStyle='#0f172a'; this.roundRect(ctx,bx,by,bw,bh,7); ctx.fill();
    // Tail
    ctx.beginPath(); ctx.moveTo(x-5,by+bh); ctx.lineTo(x,by+bh+7); ctx.lineTo(x+5,by+bh); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#fff'; ctx.fillText(label,x,by+bh/2);
  }

  // ── Mouse Events ─────────────────────────────────────────
  private onMouseDown(e: MouseEvent): void {
    if (e.button===1 || (e.button===0 && e.altKey)) {
      this.isPanning=true; this.panStartX=e.clientX-this.panX; this.panStartY=e.clientY-this.panY;
      this.canvas.style.cursor='grab'; return;
    }
    const r=this.canvas.getBoundingClientRect();
    const {mx,my}=this.screenToMap(e.clientX-r.left, e.clientY-r.top);
    this.mouseDownX=mx; this.mouseDownY=my;
    const hit=this.hitTest(mx,my);
    this.ngZone.run(()=>{
      this.showAddSectionPanel=false;
      if (hit) {
        this.selectedSectionId=hit.id;
        if (this.editMode) {
          this.dragSectionId=hit.id; this.dragStartX=mx; this.dragStartY=my;
          this.dragOrigX=hit.x; this.dragOrigY=hit.y;
        }
      } else { this.selectedSectionId=null; }
      this.cdr.detectChanges();
    });
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.isPanning) {
      this.panX=e.clientX-this.panStartX; this.panY=e.clientY-this.panStartY;
      this.canvas.style.cursor='grabbing'; return;
    }
    const r=this.canvas.getBoundingClientRect();
    const {mx,my}=this.screenToMap(e.clientX-r.left, e.clientY-r.top);
    if (this.editMode&&this.dragSectionId) {
      if (Math.hypot(mx-this.mouseDownX,my-this.mouseDownY)>4) {
        this.isDragging=true;
        const s=this.activeSections.find(s=>s.id===this.dragSectionId);
        if (s) {
          s.x=Math.max(0,Math.min(100-s.w, this.dragOrigX+(mx-this.dragStartX)/this.canvasW*100));
          s.y=Math.max(0,Math.min(100-s.h, this.dragOrigY+(my-this.dragStartY)/this.canvasH*100));
        }
      }
    } else {
      const hit=this.hitTest(mx,my); const id=hit?.id??null;
      if (id!==this.hoveredSectionId) {
        this.hoveredSectionId=id;
        this.canvas.style.cursor=id?(this.editMode?'grab':'pointer'):'default';
      }
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (this.isPanning) { this.isPanning=false; this.canvas.style.cursor='default'; return; }
    this.isDragging=false; this.dragSectionId=null;
  }
  private onMouseLeave(): void {
    this.hoveredSectionId=null; this.dragSectionId=null; this.isDragging=false;
    this.isPanning=false; if(this.canvas) this.canvas.style.cursor='default';
  }

  private hitTest(mx:number, my:number): MapSection|null {
    const secs=[...this.activeSections].reverse();
    for (const s of secs) {
      const x=this.pct(s.x,this.canvasW),y=this.pct(s.y,this.canvasH),w=this.pct(s.w,this.canvasW),h=this.pct(s.h,this.canvasH);
      if (mx>=x&&mx<=x+w&&my>=y&&my<=y+h) return s;
    }
    return null;
  }

  // ── Section CRUD & UI ────────────────────────────────────
  addSection(p: SectionPreset): void {
    if (!this.activeFloor) return;
    this.activeFloor.sections.push({ id:this.genId(), type:p.type, name:p.name, color:p.color, icon:p.icon, aisle:`Aisle ${this.activeSections.length+1}`, x:35,y:35,w:p.defaultW,h:p.defaultH });
    this.showAddSectionPanel=false;
  }
  deleteSelectedSection(): void {
    if (!this.activeFloor||!this.selectedSectionId) return;
    this.activeFloor.sections=this.activeFloor.sections.filter(s=>s.id!==this.selectedSectionId);
    this.selectedSectionId=null;
  }
  switchFloor(i:number): void { this.activeFloorIndex=i; this.selectedSectionId=null; this.searchResult=null; this.navigationActive=false; }
  toggleEditMode(): void { this.editMode=!this.editMode; if(!this.editMode) this.selectedSectionId=null; }
  selectSection(id:string): void { this.selectedSectionId=id===this.selectedSectionId?null:id; }
  navigateTo(s: MapSection): void { this.searchResult=s; this.navigationActive=true; this.selectedSectionId=s.id; }
  searchProduct(): void {
    if (!this.searchQuery.trim()) { this.searchResult=null; this.navigationActive=false; return; }
    const q=this.searchQuery.toLowerCase();
    const r=this.activeSections.find(s=>s.name.toLowerCase().includes(q)||s.type.includes(q))??null;
    this.searchResult=r; this.navigationActive=!!r;
    if (r) { this.selectedSectionId=r.id; }
  }
  saveMap(): void { if (this.config) { localStorage.setItem('smartcart_store_map',JSON.stringify(this.config)); } }

  // ── Helpers ──────────────────────────────────────────────
  private pct(v:number,total:number): number { return (v/100)*total; }
  private ha(hex:string,a:number): string {
    const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m?`rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`:`rgba(128,128,128,${a})`;
  }
  private lighten(hex:string,amt:number): string {
    const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m?`rgb(${Math.min(255,parseInt(m[1],16)+amt)},${Math.min(255,parseInt(m[2],16)+amt)},${Math.min(255,parseInt(m[3],16)+amt)})`:hex;
  }
  private roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number): void {
    const R=Math.min(r,w/2,h/2); ctx.beginPath();
    ctx.moveTo(x+R,y); ctx.lineTo(x+w-R,y); ctx.quadraticCurveTo(x+w,y,x+w,y+R);
    ctx.lineTo(x+w,y+h-R); ctx.quadraticCurveTo(x+w,y+h,x+w-R,y+h);
    ctx.lineTo(x+R,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-R);
    ctx.lineTo(x,y+R); ctx.quadraticCurveTo(x,y,x+R,y); ctx.closePath();
  }
  private roundRectTop(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number): void {
    const R=Math.min(r,w/2,h); ctx.beginPath();
    ctx.moveTo(x+R,y); ctx.lineTo(x+w-R,y); ctx.quadraticCurveTo(x+w,y,x+w,y+R);
    ctx.lineTo(x+w,y+h); ctx.lineTo(x,y+h); ctx.lineTo(x,y+R); ctx.quadraticCurveTo(x,y,x+R,y); ctx.closePath();
  }
}
