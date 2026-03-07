import {
  Component, ElementRef, ViewChild, AfterViewInit,
  OnDestroy, ChangeDetectorRef, inject, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { Subscription, firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  MapSection, MapFloor, StoreMapConfig, StoreMapSettings,
  SectionPreset, SECTION_PRESETS, WizardFloorSetup,
  SaveMapResponse, defaultSettings
} from './store-config.interface';
import { environment } from '../../environments/environment';
import { ApiService } from '../services/apiService.service';
import { loadStoreMap, saveStoreMapSuccess } from './state/store-map.actions';
import { selectStoreMapConfig, selectStoreMapLoaded } from './state/store-map.selectors';

// ── Mock products per section type ────────────────────────────────────────────
const MOCK_PRODUCTS: Record<string, string[]> = {
  grocery:     ['🍎 Fresh Apples','🥕 Carrots','🥛 Full-Cream Milk','🍞 Bread','🥚 Farm Eggs','🍌 Bananas'],
  clothing:    ['👕 Cotton T-Shirts','👖 Slim Jeans','🧥 Winter Jackets','👗 Summer Dresses'],
  electronics: ['📱 Smartphones','💻 Laptops','📷 DSLRs','🎧 ANC Headphones','📺 Smart TVs'],
  billing:     ['💳 Card / UPI','💵 Cash Counter','🧾 Self-Checkout'],
  footwear:    ['👟 Sports Shoes','👞 Formal Shoes','👡 Heels','🥿 Flats'],
  home:        ['🍳 Non-Stick Cookware','🏠 Home Décor','🛋️ Furniture'],
  offers:      ['🏷️ Flash Deals','🎁 Gift Cards','🔖 Seasonal Offers'],
  bakery:      ['🥐 Croissants','🎂 Custom Cakes','🥖 Sourdough','🍪 Cookies'],
  dairy:       ['🧀 Cheese Varieties','🥛 Fresh Milk','🧈 Butter','🍦 Ice Cream'],
  pharmacy:    ['💊 Medicines','🩺 First-Aid','💆 Vitamins'],
  sports:      ['⚽ Football','🏏 Cricket Gear','🎾 Tennis','🏋️ Fitness'],
  entrance:    ['🛒 Shopping Carts','🗺️ Store Map','ℹ️ Info Desk'],
  stairs:      ['⬆️ Up to Floor 1','⬇️ Down to Ground','♿ Accessible Route'],
};

// ── Save Status ───────────────────────────────────────────────────────────────
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

@Component({
  selector: 'app-store-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './store-map.component.html',
  styleUrl: './store-map.component.scss',
})
export class StoreMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapCanvas')    canvasRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') wrapperRef!: ElementRef<HTMLDivElement>;

  private cdr    = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private apiService = inject(ApiService);
  private store  = inject(Store);
  private storeSub?: Subscription;
  /** storeId + tenantId come from the JWT decoded at login. Fallback to env. */
  private get storeId():  string { return this.getFromJwt('storeId')  ?? (environment as any).storeId  ?? 'store_default'; }
  private get tenantId(): string { return this.getFromJwt('tenantId') ?? (environment as any).tenantId ?? 'tenant_default'; }
  private get userEmail():string { return this.getFromJwt('email')    ?? 'user@example.com'; }

  // ── Wizard ────────────────────────────────────────────────────────────────
  wizardActive = true; wizardStep: 1|2 = 1; currentWizardFloor = 0;
  storeName = 'Smart Bazaar'; numFloors = 2; allPresets = SECTION_PRESETS;
  wizardFloors: WizardFloorSetup[] = [
    { name: 'Ground Floor', selectedTypes: new Set(['entrance','grocery','clothing','billing','offers']) },
    { name: 'Floor 1',      selectedTypes: new Set(['footwear','electronics','home','pharmacy']) },
  ];

  // ── Map State ────────────────────────────────────────────────────────────
  config: StoreMapConfig | null = null;
  activeFloorIndex = 0; selectedSectionId: string|null = null;
  hoveredSectionId: string|null = null; editMode = false; showAddSectionPanel = false;
  saveStatus: SaveStatus = 'idle'; saveMessage = '';

  // ── Zoom / Pan ───────────────────────────────────────────────────────────
  zoom = 1.0; private panX = 0; private panY = 0;
  private isPanning = false; private panStartX = 0; private panStartY = 0;

  // ── Navigation ───────────────────────────────────────────────────────────
  searchQuery = ''; searchResult: MapSection|null = null; navigationActive = false;

  // ── Canvas ───────────────────────────────────────────────────────────────
  private canvas!: HTMLCanvasElement; private ctx!: CanvasRenderingContext2D;
  private animFrame: number|null = null; private dpr = 1;
  private canvasW = 800; private canvasH = 550;
  private pathOffset = 0; private pulsePhase = 0; private lastTime = 0;
  private boundResize!: ()=>void;

  // ── Drag ─────────────────────────────────────────────────────────────────
  private isDragging = false; private dragSectionId: string|null = null;
  private dragStartX = 0; private dragStartY = 0;
  private dragOrigX = 0; private dragOrigY = 0;
  private mouseDownX = 0; private mouseDownY = 0;

  // ── Resize ───────────────────────────────────────────────────────────────
  private isResizing = false; private resizeEdge: string|null = null;
  private resizeOrigX = 0; private resizeOrigY = 0;
  private resizeOrigW = 0; private resizeOrigH = 0;
  private readonly HANDLE_HIT_PX = 10; // pixels

  // ── Accessors ─────────────────────────────────────────────────────────────
  get activeFloor():    MapFloor|null   { return this.config?.floors[this.activeFloorIndex] ?? null; }
  get activeSections(): MapSection[]    { return this.activeFloor?.sections ?? []; }
  get selectedSection():MapSection|null { return this.activeSections.find(s=>s.id===this.selectedSectionId) ?? null; }
  get cwfs():           WizardFloorSetup{ return this.wizardFloors[this.currentWizardFloor]; }
  get mockProducts():   string[]        { return MOCK_PRODUCTS[this.selectedSection?.type ?? ''] ?? []; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngAfterViewInit(): void {
    this.boundResize = ()=>this.resizeCanvas();
    window.addEventListener('resize', this.boundResize);

    // Subscribe to NgRx store for map config
    this.storeSub = this.store.select(selectStoreMapConfig).subscribe((cfg) => {
      if (cfg) {
        this.ngZone.run(() => {
          this.config = cfg;
          this.activeFloorIndex = 0;
          this.wizardActive = false;
          this.cdr.detectChanges();
          setTimeout(() => this.initCanvas(), 60);
        });
      }
    });

    // Check if already loaded in NgRx store; if not, dispatch load action
    this.store.select(selectStoreMapLoaded).pipe(take(1)).subscribe((loaded) => {
      if (!loaded) {
        this.store.dispatch(loadStoreMap({ tenantId: this.tenantId, storeId: this.storeId }));
      }
    });
  }
  ngOnDestroy(): void {
    this.storeSub?.unsubscribe();
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    window.removeEventListener('resize', this.boundResize);
  }

  // ── JWT Helper ────────────────────────────────────────────────────────────
  private getFromJwt(key: string): string | null {
    try {
      const token = localStorage.getItem('auth_token') ?? '';
      const payload = token.split('.')[1];
      if (!payload) return null;
      const decoded = JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));
      return decoded[key] ?? null;
    } catch { return null; }
  }



  // ── API: Save ─────────────────────────────────────────────────────────────
  async saveMap(): Promise<void> {
    if (!this.config) return;
    this.saveStatus = 'saving'; this.saveMessage = 'Saving…'; this.cdr.detectChanges();

    // Build the full payload (complete, versioned, multi-tenant)
    const payload: StoreMapConfig = {
      ...this.config,
      schemaVersion: '1.0',
      storeId:       this.storeId,
      tenantId:      this.tenantId,
      updatedAt:     new Date().toISOString(),
      updatedBy:     this.userEmail,
    };

    // Persist to localStorage as offline cache regardless of API outcome
    localStorage.setItem(`smartcart_map_${this.storeId}`, JSON.stringify(payload));

    try {
      const body = await firstValueFrom(
        this.apiService.post<SaveMapResponse>('/v1/masters/store_map', payload)
      );

      if (body.success) {
        if (body.version) this.config.version = body.version;
        // Update NgRx store with latest config
        this.store.dispatch(saveStoreMapSuccess({ config: { ...this.config } }));
        this.showToast('saved', `✅ Saved — v${body.version ?? '?'}`);
      } else {
        this.showToast('error', `❌ ${body.error?.message ?? 'Save failed'}`);
      }
    } catch {
      // Offline: already saved to localStorage — show offline notice
      this.showToast('saved', '💾 Saved locally (offline)');
    }
  }

  private showToast(status: 'saved'|'error', msg: string): void {
    this.ngZone.run(()=>{
      this.saveStatus  = status; this.saveMessage = msg; this.cdr.detectChanges();
      setTimeout(()=>{ this.saveStatus='idle'; this.saveMessage=''; this.cdr.detectChanges(); }, 3500);
    });
  }

  // ── Export as JSON ────────────────────────────────────────────────────────
  exportJson(): void {
    if (!this.config) return;
    const blob = new Blob([JSON.stringify(this.config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `store_map_${this.storeId}_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Wizard Logic ─────────────────────────────────────────────────────────
  updateFloorCount(): void {
    const n = Math.max(1,Math.min(5,this.numFloors));
    while (this.wizardFloors.length < n) {
      const l=this.wizardFloors.length;
      this.wizardFloors.push({ name:l===0?'Ground Floor':`Floor ${l}`, selectedTypes:new Set(['grocery','clothing']) });
    }
    this.wizardFloors=this.wizardFloors.slice(0,n);
  }
  goToStep2():  void { if(!this.storeName.trim())return; this.updateFloorCount(); this.currentWizardFloor=0; this.wizardStep=2; }
  togglePreset(t:string): void { const s=this.cwfs.selectedTypes; if(s.has(t)){if(s.size>1)s.delete(t);}else{s.add(t);} }
  isPresetSelected(t:string): boolean { return this.cwfs.selectedTypes.has(t); }
  wizardPrev(): void { if(this.currentWizardFloor>0)this.currentWizardFloor--;else this.wizardStep=1; }
  wizardNext(): void { if(this.currentWizardFloor<this.wizardFloors.length-1)this.currentWizardFloor++;else this.generateMap(); }
  isLastWizardFloor(): boolean { return this.currentWizardFloor===this.wizardFloors.length-1; }

  generateMap(): void {
    const floors: MapFloor[] = this.wizardFloors.map((setup,idx)=>({
      id:`floor-${idx}`, name:setup.name, level:idx,
      sections:this.autoLayout(SECTION_PRESETS.filter(p=>setup.selectedTypes.has(p.type))),
    }));
    this.config = {
      schemaVersion:'1.0',
      storeId:      this.storeId,
      tenantId:     this.tenantId,
      storeName:    this.storeName,
      settings:     defaultSettings(),
      floors,
    };
    this.activeFloorIndex=0; this.wizardActive=false;
    setTimeout(()=>this.initCanvas(), 60);
  }

  // ── Auto Layout ──────────────────────────────────────────────────────────
  private autoLayout(presets: SectionPreset[]): MapSection[] {
    const sections: MapSection[] = [];
    const entrance=presets.find(p=>p.type==='entrance');
    const billing =presets.find(p=>p.type==='billing');
    const others  =presets.filter(p=>p.type!=='entrance'&&p.type!=='billing');
    const PAD=2, areaW=billing?67:96, areaH=entrance?70:94;
    const cols=others.length<=2?2:others.length<=6?3:4;
    const cW=areaW/cols, cH=areaH/Math.ceil(others.length/cols);
    const badges=['30% OFF','HOT','NEW','50% OFF','','',''];
    others.forEach((p,i)=>{
      sections.push({ id:this.genId(),type:p.type,name:p.name,color:p.color,icon:p.icon,
        aisle:`Aisle ${i+1}`,badge:badges[i%badges.length]||undefined,
        x:2+(i%cols)*cW+PAD,y:3+Math.floor(i/cols)*cH+PAD,w:cW-PAD*2,h:cH-PAD*2 });
    });
    if(billing) sections.unshift({ id:this.genId(),type:billing.type,name:billing.name,color:billing.color,icon:billing.icon,aisle:'Counter',badge:'Open',x:72,y:3,w:24,h:16 });
    if(entrance) sections.push({ id:this.genId(),type:entrance.type,name:entrance.name,color:entrance.color,icon:entrance.icon,aisle:'Main Entry',x:25,y:79,w:50,h:18 });
    return sections;
  }
  private genId(): string { return Math.random().toString(36).substr(2,9); }

  // ── Canvas Setup ─────────────────────────────────────────────────────────
  private initCanvas(): void {
    if(!this.canvasRef||!this.wrapperRef)return;
    this.canvas=this.canvasRef.nativeElement; this.ctx=this.canvas.getContext('2d')!;
    this.dpr=window.devicePixelRatio||1; this.resizeCanvas();
    this.canvas.addEventListener('mousemove', e=>this.onMouseMove(e));
    this.canvas.addEventListener('mousedown', e=>this.onMouseDown(e));
    this.canvas.addEventListener('mouseup',   e=>this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave',  ()=>this.onMouseLeave());
    this.canvas.addEventListener('wheel',    e=>this.onWheel(e),{passive:false});
    this.ngZone.runOutsideAngular(()=>this.startRenderLoop());
  }
  private resizeCanvas(): void {
    if(!this.canvas||!this.wrapperRef)return;
    const r=this.wrapperRef.nativeElement.getBoundingClientRect();
    this.canvasW=r.width||800; this.canvasH=r.height||550;
    this.canvas.width=this.canvasW*this.dpr; this.canvas.height=this.canvasH*this.dpr;
    this.canvas.style.width=`${this.canvasW}px`; this.canvas.style.height=`${this.canvasH}px`;
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
  }

  // ── Zoom / Pan ───────────────────────────────────────────────────────────
  zoomIn():    void { this.zoom=Math.min(4,this.zoom*1.25); }
  zoomOut():   void { this.zoom=Math.max(0.35,this.zoom/1.25); }
  resetZoom(): void { this.zoom=1; this.panX=0; this.panY=0; }
  private onWheel(e:WheelEvent): void {
    e.preventDefault();
    this.zoom=Math.max(0.35,Math.min(4,this.zoom*(e.deltaY<0?1.1:0.92)));
  }
  private screenToMap(sx:number,sy:number):{mx:number,my:number} {
    const cx=this.canvasW/2,cy=this.canvasH/2;
    return {mx:(sx-cx-this.panX)/this.zoom+cx, my:(sy-cy-this.panY)/this.zoom+cy};
  }

  // ── Render Loop ──────────────────────────────────────────────────────────
  private startRenderLoop(): void {
    const loop=(t:number)=>{
      const dt=t-this.lastTime; this.lastTime=t;
      this.pathOffset=(this.pathOffset+dt*0.028)%28;
      this.pulsePhase=(this.pulsePhase+dt*0.003)%(Math.PI*2);
      this.drawMap(); this.animFrame=requestAnimationFrame(loop);
    };
    this.animFrame=requestAnimationFrame(loop);
  }

  private drawMap(): void {
    const ctx=this.ctx,W=this.canvasW,H=this.canvasH;
    ctx.clearRect(0,0,W,H);
    ctx.save();
    ctx.translate(W/2+this.panX,H/2+this.panY);
    ctx.scale(this.zoom,this.zoom);
    ctx.translate(-W/2,-H/2);
    this.drawFloorTiles(ctx,W,H);
    this.drawCeilingLights(ctx,W,H);
    this.drawCorridors(ctx,W,H);
    const secs=this.activeSections;
    secs.filter(s=>s.id!==this.selectedSectionId).forEach(s=>this.drawSection(ctx,s,W,H,false));
    const sel=secs.find(s=>s.id===this.selectedSectionId);
    if(sel)this.drawSection(ctx,sel,W,H,true);
    if(this.navigationActive&&this.searchResult){
      const ent=secs.find(s=>s.type==='entrance');
      if(ent)this.drawNavPath(ctx,ent,this.searchResult,W,H);
    }
    const entrance=secs.find(s=>s.type==='entrance');
    if(entrance)this.drawYouAreHere(ctx,this.pct(entrance.x+entrance.w/2,W),this.pct(entrance.y+entrance.h/2,H));
    ctx.restore();
  }

  // ── Floor Tiles (marble + grout + EXIT + pillars) ──────────────────────────
  private drawFloorTiles(ctx:CanvasRenderingContext2D,W:number,H:number): void {
    ctx.fillStyle='#e8edf3'; ctx.fillRect(0,0,W,H);
    const ts=52;
    for(let xi=0;xi*ts<=W;xi++)for(let yi=0;yi*ts<=H;yi++){
      const x=xi*ts,y=yi*ts,isL=(xi+yi)%2===0;
      const tg=ctx.createLinearGradient(x,y,x+ts,y+ts);
      if(isL){tg.addColorStop(0,'rgba(255,255,255,.82)');tg.addColorStop(.5,'rgba(248,250,252,.72)');tg.addColorStop(1,'rgba(240,245,250,.78)');}
      else{tg.addColorStop(0,'rgba(226,234,242,.78)');tg.addColorStop(.5,'rgba(219,228,238,.68)');tg.addColorStop(1,'rgba(212,222,234,.74)');}
      ctx.fillStyle=tg; ctx.fillRect(x,y,ts,ts);
      ctx.save(); ctx.beginPath(); ctx.rect(x,y,ts,ts); ctx.clip();
      ctx.strokeStyle=isL?'rgba(180,200,220,.15)':'rgba(160,180,200,.11)'; ctx.lineWidth=.6;
      ctx.beginPath(); ctx.moveTo(x+ts*.2,y); ctx.lineTo(x+ts*.8,y+ts); ctx.stroke(); ctx.restore();
      ctx.strokeStyle='rgba(160,180,200,.5)'; ctx.lineWidth=.8; ctx.strokeRect(x+.4,y+.4,ts-.8,ts-.8);
    }
    ctx.strokeStyle='#475569'; ctx.lineWidth=8; this.roundRect(ctx,4,4,W-8,H-8,16); ctx.stroke();
    ctx.strokeStyle='#94a3b8'; ctx.lineWidth=2; this.roundRect(ctx,12,12,W-24,H-24,10); ctx.stroke();
    ctx.fillStyle='#dc2626'; this.roundRect(ctx,16,H-26,38,14,3); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 9px Inter,sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle';
    ctx.fillText('EXIT →',20,H-19);
    ([[.13,.2],[.5,.2],[.87,.2],[.13,.6],[.5,.6],[.87,.6]] as [number,number][]).forEach(([px,py])=>{
      const cx=W*px,cy=H*py,sz=14;
      const pg=ctx.createRadialGradient(cx,cy,0,cx,cy,sz); pg.addColorStop(0,'#dde3ea'); pg.addColorStop(1,'#94a3b8');
      ctx.fillStyle=pg; this.roundRect(ctx,cx-sz/2,cy-sz/2,sz,sz,3); ctx.fill();
      ctx.strokeStyle='#64748b'; ctx.lineWidth=1; this.roundRect(ctx,cx-sz/2,cy-sz/2,sz,sz,3); ctx.stroke();
      ctx.fillStyle='rgba(0,0,0,.1)'; this.roundRect(ctx,cx-sz/2+2,cy+sz/2,sz-2,5,1); ctx.fill();
    });
  }

  private drawCeilingLights(ctx:CanvasRenderingContext2D,W:number,H:number): void {
    for(let c=0;c<4;c++)for(let r=0;r<3;r++){
      const cx=(c+.5)*W/4,cy=(r+.5)*H/3;
      const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,W/4*.7);
      glow.addColorStop(0,'rgba(255,255,235,.22)'); glow.addColorStop(1,'rgba(255,255,235,0)');
      ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(cx,cy,W/4*.7,0,Math.PI*2); ctx.fill();
      // LED panel rect
      ctx.fillStyle='#f1f5f9'; ctx.fillRect(cx-15,cy-5,30,10);
      ctx.fillStyle='rgba(254,249,195,.9)'; ctx.fillRect(cx-13,cy-3,26,6);
      ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=.7; ctx.strokeRect(cx-15,cy-5,30,10);
      for(let d=0;d<4;d++){ctx.fillStyle='rgba(253,224,71,.9)'; ctx.beginPath(); ctx.arc(cx-13+d*9,cy,1.5,0,Math.PI*2); ctx.fill();}
    }
  }

  private drawCorridors(ctx:CanvasRenderingContext2D,W:number,H:number): void {
    const aY=H*.74,aH=H*.065;
    const cg=ctx.createLinearGradient(0,aY,0,aY+aH);
    cg.addColorStop(0,'rgba(248,250,252,.9)'); cg.addColorStop(.5,'rgba(241,245,249,.75)'); cg.addColorStop(1,'rgba(226,232,240,.85)');
    ctx.fillStyle=cg; ctx.fillRect(W*.01,aY,W*.98,aH);
    // Centre dashed lane line
    ctx.strokeStyle='rgba(148,163,184,.5)'; ctx.lineWidth=1; ctx.setLineDash([12,10]);
    ctx.beginPath(); ctx.moveTo(W*.01,aY+aH/2); ctx.lineTo(W*.99,aY+aH/2); ctx.stroke(); ctx.setLineDash([]);
    // Aisle labels + arrows
    ctx.font='bold 10px Inter,sans-serif'; ctx.fillStyle='#94a3b8'; ctx.textAlign='center'; ctx.textBaseline='middle';
    for(let i=1;i<=4;i++){
      const ax=W*(i/5); ctx.fillText(`${i}`,ax,aY+aH*.78);
      ctx.strokeStyle='rgba(148,163,184,.4)'; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(ax-10,aY+aH*.28); ctx.lineTo(ax+10,aY+aH*.28);
      ctx.moveTo(ax+6,aY+aH*.28-4); ctx.lineTo(ax+10,aY+aH*.28); ctx.lineTo(ax+6,aY+aH*.28+4); ctx.stroke();
    }
  }

  // ── Section Drawing ───────────────────────────────────────────────────────
  private drawSection(ctx:CanvasRenderingContext2D,s:MapSection,W:number,H:number,isSel:boolean): void {
    const x=this.pct(s.x,W),y=this.pct(s.y,H),w=this.pct(s.w,W),h=this.pct(s.h,H),r=10;
    const cx=x+w/2,cy=y+h/2,rot=((s.rotation??0)*Math.PI)/180;
    ctx.save();
    if(rot!==0){ctx.translate(cx,cy);ctx.rotate(rot);ctx.translate(-cx,-cy);}
    ctx.shadowColor=isSel?`${s.color}66`:'rgba(0,0,0,.13)';
    ctx.shadowBlur=isSel?28:14; ctx.shadowOffsetY=isSel?7:4;
    const bg=ctx.createLinearGradient(x,y,x,y+h);
    bg.addColorStop(0,this.ha(s.color,.14)); bg.addColorStop(1,this.ha(s.color,.06));
    ctx.fillStyle=bg; this.roundRect(ctx,x,y,w,h,r); ctx.fill();
    ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    ctx.strokeStyle=isSel?s.color:this.ha(s.color,.55);
    ctx.lineWidth=isSel?2.5:1.5; this.roundRect(ctx,x,y,w,h,r); ctx.stroke();
    const sH=Math.min(h*.2,28);
    const sg=ctx.createLinearGradient(x,y,x+w,y);
    sg.addColorStop(0,s.color); sg.addColorStop(1,this.lighten(s.color,30));
    ctx.fillStyle=sg; this.roundRectTop(ctx,x,y,w,sH,r); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(x+4,y,w-8,sH); ctx.clip();
    ctx.font=`bold ${Math.max(8,Math.min(12,w*.08))}px Inter,sans-serif`;
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(s.name.toUpperCase(),x+w/2,y+sH/2); ctx.restore();
    this.drawSectionInterior(ctx,s.type,x,y+sH,w,h-sH,s.color);
    ctx.font=`${Math.max(16,Math.min(26,Math.min(w,h)*.2))}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(s.icon,x+w/2,y+sH+(h-sH)*.78);
    if(h>80){ ctx.font=`${Math.max(8,Math.min(10,w*.065))}px Inter,sans-serif`; ctx.fillStyle='#64748b'; ctx.fillText(s.aisle,x+w/2,y+sH+(h-sH)*.93); }
    if(s.badge){
      const bw=Math.max(44,s.badge.length*7+10),bh=16;
      ctx.fillStyle='#ef4444'; this.roundRect(ctx,x+w-bw-4,y+4,bw,bh,8); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='bold 9px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(s.badge,x+w-4-bw/2,y+4+bh/2);
    }
    if(isSel){
      ctx.strokeStyle=s.color; ctx.lineWidth=2; ctx.setLineDash([6,4]);
      this.roundRect(ctx,x-5,y-5,w+10,h+10,r+4); ctx.stroke(); ctx.setLineDash([]);
      if(this.editMode)this.drawHandles(ctx,x,y,w,h,s.color);
    }
    if(this.hoveredSectionId===s.id&&!isSel){
      ctx.strokeStyle=this.ha(s.color,.9); ctx.lineWidth=2.5;
      this.roundRect(ctx,x-3,y-3,w+6,h+6,r+3); ctx.stroke();
    }
    ctx.restore();
  }

  // ── Section Interiors ─────────────────────────────────────────────────────
  private drawSectionInterior(ctx:CanvasRenderingContext2D,type:string,x:number,y:number,w:number,h:number,color:string): void {
    const iH=h*.62,iY=y+2;
    if(['grocery','dairy','bakery','pharmacy'].includes(type)) this.drawShelves(ctx,x,iY,w,iH,color);
    else if(['clothing','footwear','sports'].includes(type))   this.drawRacks(ctx,x,iY,w,iH,color);
    else if(['electronics','home'].includes(type))             this.drawDisplayTables(ctx,x,iY,w,iH,color);
    else if(type==='billing')                                  this.drawBillingCounters(ctx,x,iY,w,iH,color);
    else if(type==='entrance')                                 this.drawEntranceDoors(ctx,x,iY,w,iH,color);
    else if(type==='offers')                                   this.drawOfferShelf(ctx,x,iY,w,iH,color);
    else if(type==='stairs')                                   this.drawStairs(ctx,x,iY,w,iH,color);
  }

  private drawShelves(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string): void {
    const rows=3,rH=h/rows,pC=['#ef4444','#22c55e','#3b82f6','#f59e0b','#8b5cf6','#ec4899'];
    for(let r=0;r<rows;r++){
      const sy=y+r*rH;
      ctx.fillStyle=this.ha(color,.14); ctx.fillRect(x+6,sy+1,w-12,rH*.55);
      ctx.fillStyle=this.ha(color,.3); ctx.fillRect(x+6,sy+rH*.55,w-12,rH*.08);
      const dots=Math.floor((w-20)/11);
      for(let d=0;d<dots;d++){ ctx.fillStyle=pC[d%pC.length]+'bb'; ctx.beginPath(); ctx.arc(x+12+d*((w-20)/dots),sy+rH*.3,3,0,Math.PI*2); ctx.fill(); }
    }
  }

  private drawRacks(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string): void {
    const racks=2,rS=h/racks,gC=[color,this.lighten(color,40),'#94a3b8'];
    for(let r=0;r<racks;r++){
      const ry=y+r*rS+rS*.2;
      ctx.strokeStyle=this.ha(color,.5); ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x+8,ry); ctx.lineTo(x+w-8,ry); ctx.stroke();
      const items=Math.floor((w-20)/16);
      for(let i=0;i<items;i++){
        const ix=x+12+i*((w-20)/items);
        ctx.fillStyle=gC[i%gC.length]; ctx.globalAlpha=.55;
        ctx.beginPath(); ctx.rect(ix,ry+2,10,rS*.35); ctx.fill();
        ctx.globalAlpha=1; ctx.strokeStyle=this.ha(color,.3); ctx.lineWidth=.8; ctx.stroke();
      }
    }
  }

  private drawDisplayTables(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string): void {
    const cols=3,rows=2,tw=(w-20)/cols,th=h/rows;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const tx=x+10+c*tw,ty=y+r*th+2;
      ctx.fillStyle=this.ha(color,.22); ctx.fillRect(tx,ty,tw-4,th*.65);
      ctx.fillStyle='rgba(59,130,246,.3)'; ctx.fillRect(tx+3,ty+3,tw-10,th*.45);
      ctx.fillStyle='rgba(255,255,255,.25)'; ctx.fillRect(tx+3,ty+3,(tw-10)*.35,th*.14);
    }
  }

  private drawBillingCounters(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string): void {
    const lanes=Math.min(3,Math.floor(h/22)),lH=h/lanes;
    for(let l=0;l<lanes;l++){
      const ly=y+l*lH+2;
      ctx.fillStyle=this.ha(color,.18); ctx.fillRect(x+6,ly,w*.6,lH*.5);
      ctx.fillStyle=this.ha(color,.4);  ctx.fillRect(x+6+w*.6,ly,w*.25,lH*.55);
      ctx.strokeStyle=this.ha(color,.2); ctx.lineWidth=1; ctx.setLineDash([5,4]);
      for(let s=0;s<3;s++){ ctx.beginPath(); ctx.moveTo(x+8+s*((w*.6-8)/3),ly); ctx.lineTo(x+8+s*((w*.6-8)/3),ly+lH*.5); ctx.stroke(); }
      ctx.setLineDash([]);
    }
  }

  private drawEntranceDoors(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string): void {
    [[x+w*.22,y,w*.22,h*.7],[x+w*.56,y,w*.22,h*.7]].forEach(([dx,dy,dw,dh])=>{
      const g=ctx.createLinearGradient(dx as number,dy as number,(dx as number)+(dw as number),dy as number);
      g.addColorStop(0,'rgba(186,230,253,.5)'); g.addColorStop(1,'rgba(147,210,255,.25)');
      ctx.fillStyle=g; ctx.fillRect(dx as number,dy as number,dw as number,dh as number);
      ctx.strokeStyle=this.ha(color,.6); ctx.lineWidth=1.5;
      ctx.strokeRect(dx as number,dy as number,dw as number,dh as number);
      ctx.fillStyle='rgba(255,255,255,.3)'; ctx.fillRect((dx as number)+2,(dy as number)+2,(dw as number)*.3,(dh as number)*.6);
    });
    this.drawCart(ctx,x+w*.08,y+h*.35,color); this.drawCart(ctx,x+w*.82,y+h*.35,color);
  }

  private drawOfferShelf(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string): void {
    ['50%','30%','2+1','HOT'].forEach((t,i)=>{
      const tw=(w-16)/4,tx=x+8+i*tw,ty=y+h*.1;
      ctx.fillStyle=this.ha(color,.22); this.roundRect(ctx,tx,ty,tw-4,h*.6,5); ctx.fill();
      ctx.fillStyle=color; ctx.font=`bold ${Math.max(9,Math.min(13,tw*.3))}px Inter,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(t,tx+tw/2-2,ty+h*.3);
    });
  }

  private drawStairs(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string): void {
    const steps=5,sH=h*.55/steps,sW=w*.75;
    ctx.strokeStyle=this.ha(color,.7); ctx.lineWidth=1.4;
    for(let i=0;i<steps;i++){
      const sy=y+i*sH,sx=x+w*.12+i*(sW/steps)*.08;
      ctx.fillStyle=this.ha(color,i%2===0?.2:.12); ctx.fillRect(sx,sy,sW-i*3,sH*.7);
      ctx.strokeStyle=this.ha(color,.5); ctx.lineWidth=1; ctx.strokeRect(sx,sy,sW-i*3,sH*.7);
    }
    // Handrail lines
    ctx.strokeStyle=this.ha(color,.8); ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x+w*.12,y); ctx.lineTo(x+w*.85,y+h*.55); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+w*.12,y+sH*.7); ctx.lineTo(x+w*.85,y+h*.55+sH*.7); ctx.stroke();
    // Up/Down arrows
    ctx.fillStyle=color; ctx.font=`${Math.max(9,Math.min(12,w*.12))}px serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('⬆',x+w/2-6,y+h*.72); ctx.fillText('⬇',x+w/2+6,y+h*.72);
  }

  private drawHandles(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string): void {
    // 8 handles: 4 corners (square, for resize) + 4 edge midpoints (circle, for info)
    const corners:Array<[number,number,string]> = [
      [x,y,'nw'],[x+w,y,'ne'],[x,y+h,'sw'],[x+w,y+h,'se']
    ];
    const edges:Array<[number,number]> = [[x+w/2,y],[x,y+h/2],[x+w,y+h/2],[x+w/2,y+h]];
    corners.forEach(([hx,hy])=>{
      ctx.fillStyle='#fff'; ctx.strokeStyle=color; ctx.lineWidth=1.8;
      ctx.fillRect(hx-5,hy-5,10,10); ctx.strokeRect(hx-5,hy-5,10,10);
    });
    edges.forEach(([hx,hy])=>{
      ctx.fillStyle='#fff'; ctx.strokeStyle=color; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(hx,hy,4,0,Math.PI*2); ctx.fill(); ctx.stroke();
    });
  }

  private drawCart(ctx:CanvasRenderingContext2D,x:number,y:number,color:string): void {
    const sc=7; ctx.strokeStyle=this.ha(color,.7); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.rect(x,y,sc*1.5,sc); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x-sc*.4,y); ctx.lineTo(x-sc*.4,y-sc*.4); ctx.lineTo(x+sc*.3,y-sc*.4); ctx.stroke();
    ctx.fillStyle=this.ha(color,.8);
    [x+sc*.3,x+sc*1.2].forEach(wx=>{ ctx.beginPath(); ctx.arc(wx,y+sc+2,2.5,0,Math.PI*2); ctx.fill(); });
  }

  // ── Nav Path ─────────────────────────────────────────────────────────────
  private drawNavPath(ctx:CanvasRenderingContext2D,from:MapSection,to:MapSection,W:number,H:number): void {
    const fx=this.pct(from.x+from.w/2,W),fy=this.pct(from.y+from.h/2,H);
    const tx=this.pct(to.x+to.w/2,W),ty=this.pct(to.y+to.h/2,H);
    ctx.shadowColor='rgba(59,130,246,.3)'; ctx.shadowBlur=10;
    ctx.strokeStyle='#3b82f6'; ctx.lineWidth=4; ctx.setLineDash([14,8]);
    ctx.lineDashOffset=-this.pathOffset; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(fx,fy); ctx.bezierCurveTo(fx+(tx-fx)*.1,fy,tx-(tx-fx)*.1,ty,tx,ty);
    ctx.stroke(); ctx.setLineDash([]); ctx.shadowColor='transparent'; ctx.shadowBlur=0;
    [[fx,fy,true],[tx,ty,false]].forEach(([px,py,isFrom])=>{
      ctx.fillStyle=isFrom?'#10b981':'#ef4444'; ctx.beginPath(); ctx.arc(px as number,py as number,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(px as number,py as number,3.5,0,Math.PI*2); ctx.fill();
    });
    const angle=Math.atan2(ty-fy,tx-fx),ar=14,ax=tx-Math.cos(angle)*ar,ay=ty-Math.sin(angle)*ar;
    ctx.fillStyle='#2563eb'; ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(ax-Math.sin(angle)*8,ay+Math.cos(angle)*8); ctx.lineTo(ax+Math.sin(angle)*8,ay-Math.cos(angle)*8); ctx.closePath(); ctx.fill();
  }

  private drawYouAreHere(ctx:CanvasRenderingContext2D,x:number,y:number): void {
    const p=Math.sin(this.pulsePhase);
    [.3+p*.2,.15+p*.1].forEach((a,i)=>{ ctx.strokeStyle=`rgba(16,185,129,${a})`; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(x,y,24+(i+1)*8+p*5,0,Math.PI*2); ctx.stroke(); });
    const pinH=28; ctx.fillStyle='#10b981'; ctx.beginPath(); ctx.arc(x,y-pinH+8,12,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x-12,y-pinH+8); ctx.lineTo(x,y); ctx.lineTo(x+12,y-pinH+8); ctx.fill();
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y-pinH+8,5,0,Math.PI*2); ctx.fill();
    const label='You Are Here'; ctx.font='bold 11px Inter,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const bw=ctx.measureText(label).width+22,bh=22,bx=x-bw/2,by=y-pinH-28;
    ctx.fillStyle='#0f172a'; this.roundRect(ctx,bx,by,bw,bh,7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x-5,by+bh); ctx.lineTo(x,by+bh+7); ctx.lineTo(x+5,by+bh); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#fff'; ctx.fillText(label,x,by+bh/2);
  }

  // ── Mouse Events ─────────────────────────────────────────────────────────
  /** Returns which resize edge ('nw','n','ne','w','e','sw','s','se') the mouse is near, or null */
  private hitHandle(mx:number,my:number,s:MapSection): string|null {
    const x=this.pct(s.x,this.canvasW),y=this.pct(s.y,this.canvasH);
    const w=this.pct(s.w,this.canvasW),h=this.pct(s.h,this.canvasH);
    const d=this.HANDLE_HIT_PX/this.zoom;
    const onL=Math.abs(mx-x)<d, onR=Math.abs(mx-(x+w))<d;
    const onT=Math.abs(my-y)<d, onB=Math.abs(my-(y+h))<d;
    if(onL&&onT)return 'nw'; if(onR&&onT)return 'ne';
    if(onL&&onB)return 'sw'; if(onR&&onB)return 'se';
    if(onT&&mx>x&&mx<x+w)return 'n'; if(onB&&mx>x&&mx<x+w)return 's';
    if(onL&&my>y&&my<y+h)return 'w'; if(onR&&my>y&&my<y+h)return 'e';
    return null;
  }
  private static readonly RESIZE_CURSORS: Record<string,string> = {
    'nw':'nw-resize','n':'n-resize','ne':'ne-resize','w':'w-resize',
    'e':'e-resize','sw':'sw-resize','s':'s-resize','se':'se-resize'
  };
  private onMouseDown(e:MouseEvent): void {
    if(e.button===1||(e.button===0&&e.altKey)){ this.isPanning=true; this.panStartX=e.clientX-this.panX; this.panStartY=e.clientY-this.panY; this.canvas.style.cursor='grab'; return; }
    const r=this.canvas.getBoundingClientRect(),{mx,my}=this.screenToMap(e.clientX-r.left,e.clientY-r.top);
    this.mouseDownX=mx; this.mouseDownY=my;
    // Check resize handle first (only when editMode and section selected)
    if(this.editMode&&this.selectedSectionId){
      const sel=this.activeSections.find(s=>s.id===this.selectedSectionId);
      if(sel){
        const edge=this.hitHandle(mx,my,sel);
        if(edge){
          this.isResizing=true; this.resizeEdge=edge;
          this.dragStartX=mx; this.dragStartY=my;
          this.resizeOrigX=sel.x; this.resizeOrigY=sel.y;
          this.resizeOrigW=sel.w; this.resizeOrigH=sel.h;
          return;
        }
      }
    }
    const hit=this.hitTest(mx,my);
    this.ngZone.run(()=>{ this.showAddSectionPanel=false; if(hit){ this.selectedSectionId=hit.id; if(this.editMode){ this.dragSectionId=hit.id; this.dragStartX=mx; this.dragStartY=my; this.dragOrigX=hit.x; this.dragOrigY=hit.y; } }else this.selectedSectionId=null; this.cdr.detectChanges(); });
  }
  private onMouseMove(e:MouseEvent): void {
    if(this.isPanning){ this.panX=e.clientX-this.panStartX; this.panY=e.clientY-this.panStartY; this.canvas.style.cursor='grabbing'; return; }
    const r=this.canvas.getBoundingClientRect(),{mx,my}=this.screenToMap(e.clientX-r.left,e.clientY-r.top);
    // Resize drag
    if(this.editMode&&this.isResizing&&this.resizeEdge&&this.selectedSectionId){
      const s=this.activeSections.find(s=>s.id===this.selectedSectionId);
      if(s){
        const dx=(mx-this.dragStartX)/this.canvasW*100;
        const dy=(my-this.dragStartY)/this.canvasH*100;
        const edge=this.resizeEdge;
        const MIN=5;
        if(edge.includes('e')){ s.w=Math.max(MIN,this.resizeOrigW+dx); }
        if(edge.includes('s')){ s.h=Math.max(MIN,this.resizeOrigH+dy); }
        if(edge.includes('w')){ const newW=Math.max(MIN,this.resizeOrigW-dx); s.x=this.resizeOrigX+(this.resizeOrigW-newW); s.w=newW; }
        if(edge.includes('n')){ const newH=Math.max(MIN,this.resizeOrigH-dy); s.y=this.resizeOrigY+(this.resizeOrigH-newH); s.h=newH; }
      }
      this.canvas.style.cursor=StoreMapComponent.RESIZE_CURSORS[this.resizeEdge]??'crosshair';
      return;
    }
    // Move drag
    if(this.editMode&&this.dragSectionId){
      if(Math.hypot(mx-this.mouseDownX,my-this.mouseDownY)>4){
        this.isDragging=true;
        const s=this.activeSections.find(s=>s.id===this.dragSectionId);
        if(s){ s.x=Math.max(0,Math.min(100-s.w,this.dragOrigX+(mx-this.dragStartX)/this.canvasW*100)); s.y=Math.max(0,Math.min(100-s.h,this.dragOrigY+(my-this.dragStartY)/this.canvasH*100)); }
      }
    } else {
      // Hover: update cursor based on handle proximity
      if(this.editMode&&this.selectedSectionId){
        const sel=this.activeSections.find(s=>s.id===this.selectedSectionId);
        if(sel){
          const edge=this.hitHandle(mx,my,sel);
          if(edge){ this.canvas.style.cursor=StoreMapComponent.RESIZE_CURSORS[edge]; return; }
        }
      }
      const hit=this.hitTest(mx,my),id=hit?.id??null;
      if(id!==this.hoveredSectionId){ this.hoveredSectionId=id; this.canvas.style.cursor=id?(this.editMode?'grab':'pointer'):'default'; }
    }
  }
  private onMouseUp(_e:MouseEvent): void {
    if(this.isPanning){this.isPanning=false;this.canvas.style.cursor='default';return;}
    if(this.isResizing){this.isResizing=false;this.resizeEdge=null;this.canvas.style.cursor='default';return;}
    this.isDragging=false; this.dragSectionId=null;
  }
  private onMouseLeave(): void { this.hoveredSectionId=null; this.dragSectionId=null; this.isDragging=false; this.isPanning=false; this.isResizing=false; this.resizeEdge=null; if(this.canvas)this.canvas.style.cursor='default'; }
  private hitTest(mx:number,my:number): MapSection|null {
    for(const s of [...this.activeSections].reverse()){
      const x=this.pct(s.x,this.canvasW),y=this.pct(s.y,this.canvasH),w=this.pct(s.w,this.canvasW),h=this.pct(s.h,this.canvasH);
      if(mx>=x&&mx<=x+w&&my>=y&&my<=y+h)return s;
    }
    return null;
  }

  // ── Section CRUD & UI ─────────────────────────────────────────────────────
  addSection(p:SectionPreset): void {
    if(!this.activeFloor)return;
    this.activeFloor.sections.push({ id:this.genId(),type:p.type,name:p.name,color:p.color,icon:p.icon,aisle:`Aisle ${this.activeSections.length+1}`,x:35,y:35,w:p.defaultW,h:p.defaultH });
    this.showAddSectionPanel=false;
  }
  deleteSelectedSection(): void { if(!this.activeFloor||!this.selectedSectionId)return; this.activeFloor.sections=this.activeFloor.sections.filter(s=>s.id!==this.selectedSectionId); this.selectedSectionId=null; }
  rotateSection(delta:number): void { const s=this.selectedSection; if(!s)return; s.rotation=((s.rotation??0)+delta+360)%360; }
  resizeSection(dw:number,dh:number): void { const s=this.selectedSection; if(!s)return; s.w=Math.max(5,Math.min(60,s.w+dw)); s.h=Math.max(5,Math.min(60,s.h+dh)); }
  switchFloor(i:number): void { this.activeFloorIndex=i; this.selectedSectionId=null; this.searchResult=null; this.navigationActive=false; }
  toggleEditMode(): void { this.editMode=!this.editMode; if(!this.editMode)this.selectedSectionId=null; }
  selectSection(id:string): void { this.selectedSectionId=id===this.selectedSectionId?null:id; }
  navigateTo(s:MapSection): void { this.searchResult=s; this.navigationActive=true; this.selectedSectionId=s.id; }
  searchProduct(): void {
    if(!this.searchQuery.trim()){this.searchResult=null;this.navigationActive=false;return;}
    const q=this.searchQuery.toLowerCase();
    const r=this.activeSections.find(s=>s.name.toLowerCase().includes(q)||s.type.includes(q))??null;
    this.searchResult=r; this.navigationActive=!!r; if(r)this.selectedSectionId=r.id;
  }

  // ── Canvas Helpers ────────────────────────────────────────────────────────
  private pct(v:number,total:number): number { return (v/100)*total; }
  private ha(hex:string,a:number): string { const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return m?`rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`:`rgba(128,128,128,${a})`; }
  private lighten(hex:string,amt:number): string { const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return m?`rgb(${Math.min(255,parseInt(m[1],16)+amt)},${Math.min(255,parseInt(m[2],16)+amt)},${Math.min(255,parseInt(m[3],16)+amt)})`:hex; }
  private roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number): void { const R=Math.min(r,w/2,h/2); ctx.beginPath(); ctx.moveTo(x+R,y); ctx.lineTo(x+w-R,y); ctx.quadraticCurveTo(x+w,y,x+w,y+R); ctx.lineTo(x+w,y+h-R); ctx.quadraticCurveTo(x+w,y+h,x+w-R,y+h); ctx.lineTo(x+R,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-R); ctx.lineTo(x,y+R); ctx.quadraticCurveTo(x,y,x+R,y); ctx.closePath(); }
  private roundRectTop(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number): void { const R=Math.min(r,w/2,h); ctx.beginPath(); ctx.moveTo(x+R,y); ctx.lineTo(x+w-R,y); ctx.quadraticCurveTo(x+w,y,x+w,y+R); ctx.lineTo(x+w,y+h); ctx.lineTo(x,y+h); ctx.lineTo(x,y+R); ctx.quadraticCurveTo(x,y,x+R,y); ctx.closePath(); }
}
