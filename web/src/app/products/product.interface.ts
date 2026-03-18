// ── Product unit options ─────────────────────────────────────────────────────
export const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'pack', 'box', 'pair', 'set', 'dozen'];

// ── Core Product model ────────────────────────────────────────────────────────
export interface Product {
  _id: string;
  name: string;
  imageUrl?: string;
  description?: string;
  price: number;
  quantity: number;
  category: string;
  section: string;
  createdAt: string;
}

// ── Grouping helpers ──────────────────────────────────────────────────────────
export interface CategoryGroup {
  categoryName: string;
  products: Product[];
  open: boolean;
}

export interface SectionGroup {
  sectionName: string;
  categories: CategoryGroup[];
  open: boolean;
}

// ── Section icon map ──────────────────────────────────────────────────────────
export const SECTION_ICONS: Record<string, string> = {
  grocery: '🛒', dairy: '🥛', bakery: '🥐', clothing: '👕', electronics: '💻',
  footwear: '👟', home: '🏠', billing: '🏧', offers: '🏷️', pharmacy: '💊',
  sports: '⚽', entrance: '🚪',
};
