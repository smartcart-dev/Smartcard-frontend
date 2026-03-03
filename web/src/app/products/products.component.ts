import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product, FloorGroup, SectionGroup, MOCK_PRODUCTS, UNITS, SECTION_ICONS } from './product.interface';

const STORAGE_KEY = 'smartcart_products';

function genId(): string { return 'p_' + Math.random().toString(36).substr(2, 9); }

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
})
export class ProductsComponent implements OnInit {
  private cdr = inject(ChangeDetectorRef);

  // ── Data ────────────────────────────────────────────────────────────────────
  products: Product[] = [];
  floors: FloorGroup[] = [];
  units = UNITS;

  // ── UI State ────────────────────────────────────────────────────────────────
  searchQuery = '';
  viewMode: 'grid' | 'list' = 'grid';
  sortBy: 'name' | 'price' | 'qty' = 'name';
  filterFloorId = 'all';
  showAddDrawer = false;
  editingProduct: Product | null = null;   // set when editing existing
  toast = '';
  toastType: 'success' | 'error' = 'success';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Sections available for form (derived from map or hardcoded) ─────────────
  availableSections: { floorId: string; floorName: string; sectionId: string; sectionName: string; sectionColor: string }[] = [];

  // ── New Product Form ────────────────────────────────────────────────────────
  form = this.blankForm();

  // ── Stats ──────────────────────────────────────────────────────────────────
  get totalProducts(): number { return this.products.length; }
  get totalValue(): number { return this.products.reduce((s, p) => s + p.price * p.quantity, 0); }
  get lowStockCount(): number { return this.products.filter(p => p.quantity <= p.lowStockThreshold).length; }
  get outOfStock(): number { return this.products.filter(p => p.quantity === 0).length; }

  // ── Floor tabs ──────────────────────────────────────────────────────────────
  get floorTabs(): { id: string; name: string }[] {
    const ids = new Map<string, string>();
    this.products.forEach(p => ids.set(p.floorId, p.floorName));
    return [{ id: 'all', name: 'All Floors' }, ...Array.from(ids.entries()).map(([id, name]) => ({ id, name }))];
  }

  // ── Filtered + grouped floors ────────────────────────────────────────────────
  get filteredFloors(): FloorGroup[] {
    const q = this.searchQuery.toLowerCase();
    return this.floors.map(floor => ({
      ...floor,
      sections: floor.sections.map(sec => ({
        ...sec,
        products: sec.products.filter(p =>
          (this.filterFloorId === 'all' || p.floorId === this.filterFloorId) &&
          (p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q))
        ).sort((a, b) => {
          if (this.sortBy === 'price') return b.price - a.price;
          if (this.sortBy === 'qty')   return a.quantity - b.quantity;
          return a.name.localeCompare(b.name);
        }),
      })).filter(sec => sec.products.length > 0),
    })).filter(floor =>
      floor.sections.length > 0 &&
      (this.filterFloorId === 'all' || floor.floorId === this.filterFloorId)
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    const saved = localStorage.getItem(STORAGE_KEY);
    this.products = saved ? JSON.parse(saved) : [...MOCK_PRODUCTS];
    this.buildGroups();
    this.buildAvailableSections();
  }

  // ── Build groups (reuses existing objects to prevent animation flicker) ──────
  private buildGroups(): void {
    // Build an index of existing floors/sections so we can mutate in-place
    const existingFloors = new Map<string, FloorGroup>(this.floors.map(f => [f.floorId, f]));
    const floorMap = new Map<string, FloorGroup>();

    for (const p of this.products) {
      if (!floorMap.has(p.floorId)) {
        // Reuse existing floor object to preserve identity + open state
        const existing = existingFloors.get(p.floorId);
        const floor: FloorGroup = existing
          ? { ...existing, sections: [] }
          : { floorId: p.floorId, floorName: p.floorName, sections: [], open: true };
        floorMap.set(p.floorId, floor);
      }
      const floor = floorMap.get(p.floorId)!;
      let sec = floor.sections.find(s => s.sectionId === p.sectionId);
      if (!sec) {
        const sectionType = p.sectionName.toLowerCase().replace(/[^a-z]/g, '');
        sec = { sectionId: p.sectionId, sectionName: p.sectionName, sectionColor: p.sectionColor,
                sectionIcon: SECTION_ICONS[sectionType] ?? '📦', products: [], open: true };
        floor.sections.push(sec);
      }
      sec.products.push(p);
    }
    this.floors = Array.from(floorMap.values());
  }

  private buildAvailableSections(): void {
    // Load from store map config if available
    try {
      const mapKey = Object.keys(localStorage).find(k => k.startsWith('smartcart_map_'));
      const mapStr = mapKey ? localStorage.getItem(mapKey) : null;
      const mapConfig = mapStr ? JSON.parse(mapStr) : null;
      if (mapConfig?.floors) {
        this.availableSections = (mapConfig.floors as any[]).flatMap((fl: any) =>
          (fl.sections as any[]).map((sec: any) => ({
            floorId: fl.id, floorName: fl.name, sectionId: sec.id,
            sectionName: sec.name, sectionColor: sec.color,
          }))
        );
        if (this.availableSections.length > 0) return;
      }
    } catch { /* fall through to defaults */ }
    // Fallback: derive from existing products
    const seen = new Set<string>();
    this.products.forEach(p => {
      if (!seen.has(p.sectionId)) {
        seen.add(p.sectionId);
        this.availableSections.push({ floorId: p.floorId, floorName: p.floorName, sectionId: p.sectionId, sectionName: p.sectionName, sectionColor: p.sectionColor });
      }
    });
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.products));
    this.buildGroups();
    this.cdr.detectChanges();
  }

  // ── Add / Edit ───────────────────────────────────────────────────────────────
  openAdd(): void { this.form = this.blankForm(); this.editingProduct = null; this.showAddDrawer = true; }

  openEdit(p: Product): void {
    this.form = { ...p, sectionKey: `${p.floorId}|${p.sectionId}` };
    this.editingProduct = p; this.showAddDrawer = true;
  }

  closeDrawer(): void { this.showAddDrawer = false; this.editingProduct = null; }

  saveProduct(): void {
    if (!this.form.name.trim() || !this.form.sectionKey) return;
    const [floorId, sectionId] = this.form.sectionKey.split('|');
    const secMeta = this.availableSections.find(s => s.floorId === floorId && s.sectionId === sectionId);
    if (!secMeta) return;
    const product: Product = {
      id:                this.editingProduct?.id ?? genId(),
      name:              this.form.name.trim(),
      description:       this.form.description,
      price:             Number(this.form.price) || 0,
      quantity:          Number(this.form.quantity) || 0,
      unit:              this.form.unit || 'pcs',
      icon:              this.form.icon || '📦',
      sku:               this.form.sku,
      floorId:           secMeta.floorId,
      floorName:         secMeta.floorName,
      sectionId:         secMeta.sectionId,
      sectionName:       secMeta.sectionName,
      sectionColor:      secMeta.sectionColor,
      lowStockThreshold: Number(this.form.lowStockThreshold) || 10,
      createdAt:         this.editingProduct?.createdAt ?? new Date().toISOString().split('T')[0],
    };
    if (this.editingProduct) {
      const idx = this.products.findIndex(p => p.id === this.editingProduct!.id);
      if (idx > -1) this.products[idx] = product;
      this.showToast('✏️ Product updated!', 'success');
    } else {
      this.products.unshift(product);
      this.showToast('✅ Product added!', 'success');
    }
    this.persist();
    this.closeDrawer();
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  deleteProduct(id: string): void {
    if (!confirm('Delete this product?')) return;
    this.products = this.products.filter(p => p.id !== id);
    this.persist();
    this.showToast('🗑️ Product deleted', 'success');
  }

  // ── Quantity stepper ──────────────────────────────────────────────────────────
  changeQty(p: Product, delta: number): void {
    const actual = this.products.find(pr => pr.id === p.id);
    if (!actual) return;
    actual.quantity = Math.max(0, actual.quantity + delta);
    this.persist();
  }

  // ── Inline qty edit ───────────────────────────────────────────────────────────
  onQtyInput(p: Product, event: Event): void {
    const val = parseInt((event.target as HTMLInputElement).value, 10);
    const actual = this.products.find(pr => pr.id === p.id);
    if (actual && !isNaN(val)) { actual.quantity = Math.max(0, val); this.persist(); }
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────
  toggleFloor(f: FloorGroup): void { f.open = !f.open; }
  toggleSection(s: SectionGroup): void { s.open = !s.open; }
  isLowStock(p: Product): boolean { return p.quantity > 0 && p.quantity <= p.lowStockThreshold; }
  isOutOfStock(p: Product): boolean { return p.quantity === 0; }
  formatPrice(n: number): string { return '₹' + n.toLocaleString('en-IN'); }
  formatValue(n: number): string { return n >= 100000 ? '₹'+( n/100000).toFixed(1)+'L' : n >= 1000 ? '₹'+(n/1000).toFixed(1)+'K' : '₹'+n; }
  sectionCount(floorId: string, sectionId: string): number { return this.products.filter(p=>p.floorId===floorId&&p.sectionId===sectionId).length; }

  // ── TrackBy functions (prevents animation flicker on updates) ──────────────
  trackByFloor(_i: number, f: FloorGroup): string { return f.floorId; }
  trackBySection(_i: number, s: SectionGroup): string { return s.sectionId; }
  trackByProduct(_i: number, p: Product): string { return p.id; }
  getFloorItemCount(floor: FloorGroup): number { return floor.sections.reduce((sum, s) => sum + s.products.length, 0); }

  private showToast(msg: string, type: 'success'|'error'): void {
    this.toast = msg; this.toastType = type; this.cdr.detectChanges();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toast = ''; this.cdr.detectChanges(); }, 3000);
  }

  private blankForm(): any {
    return { name:'', description:'', price:0, quantity:0, unit:'pcs', icon:'📦', sku:'', sectionKey:'', lowStockThreshold:10 };
  }

  // ── Quick emoji icons for form ─────────────────────────────────────────────
  readonly quickIcons = ['📦','🛒','🍎','🥛','🥕','🍞','🧂','🥚','🍌','🫙','👕','👖','🧥','👗','🧣','📱','💻','🎧','📺','📷','👟','👞','👡','🥿','🍳','🏠','💊','⚽','🎁','🏷️','🍜','🌾'];
}
