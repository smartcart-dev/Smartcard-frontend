import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Product, SectionGroup, CategoryGroup, SECTION_ICONS } from './product.interface';
import { ApiService } from '../services/apiService.service';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './products.component.html',
  styleUrl: './products.component.scss',
})
export class ProductsComponent implements OnInit {
  private apiService = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);

  // ── Data ────────────────────────────────────────────────────────────────────
  sections: SectionGroup[] = [];
  loading = false;
  error = '';

  // ── UI State ────────────────────────────────────────────────────────────────
  showAddDrawer = false;
  toast = '';
  toastType: 'success' | 'error' = 'success';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── New Product Form ────────────────────────────────────────────────────────
  form = this.blankForm();

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.fetchProducts();
  }

  fetchProducts(): void {
    this.loading = true;
    this.apiService.get<any>('/products', { page: 1, limit: 100 }).subscribe({
      next: (response) => {
        const products: Product[] = response.data || [];
        this.groupProducts(products);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.error = 'Failed to load products. Please try again later.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private groupProducts(products: Product[]): void {
    const sectionMap = new Map<string, SectionGroup>();

    products.forEach(p => {
      const sectionName = p.section || 'Uncategorized';
      const categoryName = p.category || 'General';

      if (!sectionMap.has(sectionName)) {
        sectionMap.set(sectionName, { sectionName, categories: [], open: true });
      }

      const sec = sectionMap.get(sectionName)!;
      let cat = sec.categories.find(c => c.categoryName === categoryName);
      if (!cat) {
        cat = { categoryName, products: [], open: true };
        sec.categories.push(cat);
      }
      cat.products.push(p);
    });

    this.sections = Array.from(sectionMap.values());
  }

  // ── Add / Edit ───────────────────────────────────────────────────────────────
  openAdd(): void {
    this.form = this.blankForm();
    this.showAddDrawer = true;
  }

  closeDrawer(): void {
    this.showAddDrawer = false;
  }

  saveProduct(): void {
    if (!this.form.name.trim() || !this.form.section.trim()) return;

    this.loading = true;
    this.apiService.post<any>('/products', this.form).subscribe({
      next: () => {
        this.showToast('✅ Product added successfully!', 'success');
        this.fetchProducts();
        this.closeDrawer();
      },
      error: (err) => {
        this.showToast('❌ Failed to add product', 'error');
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ── UI helpers ────────────────────────────────────────────────────────────────
  toggleSection(s: SectionGroup): void { s.open = !s.open; }
  toggleCategory(c: CategoryGroup): void { c.open = !c.open; }
  
  formatPrice(n: number): string {
    return '₹' + (n || 0).toLocaleString('en-IN');
  }

  getSectionIcon(name: string): string {
    const key = name.toLowerCase().replace(/[^a-z]/g, '');
    return SECTION_ICONS[key] ?? '📦';
  }

  // ── TrackBy functions ──────────────────────────────────────────────────────
  trackBySection(_i: number, s: SectionGroup): string { return s.sectionName; }
  trackByCategory(_i: number, c: CategoryGroup): string { return c.categoryName; }
  trackByProduct(_i: number, p: Product): string { return p._id; }

  private showToast(msg: string, type: 'success'|'error'): void {
    this.toast = msg;
    this.toastType = type;
    this.cdr.detectChanges();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = '';
      this.cdr.detectChanges();
    }, 3000);
  }

  private blankForm(): any {
    return {
      name: '',
      description: '',
      price: 0,
      quantity: 0,
      category: '',
      section: '',
      imageUrl: ''
    };
  }
}
