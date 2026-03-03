// ── Product unit options ─────────────────────────────────────────────────────
export const UNITS = ['pcs', 'kg', 'g', 'litre', 'ml', 'pack', 'box', 'pair', 'set', 'dozen'];

// ── Core Product model ────────────────────────────────────────────────────────
export interface Product {
  id:                string;
  name:              string;
  description?:      string;
  price:             number;       // MRP per unit
  quantity:          number;       // current stock
  unit:              string;       // 'kg', 'pcs', 'litre' …
  icon:              string;       // emoji
  sku?:              string;
  floorId:           string;
  floorName:         string;
  sectionId:         string;
  sectionName:       string;
  sectionColor:      string;
  lowStockThreshold: number;
  createdAt:         string;       // ISO date
}

// ── Grouping helpers ──────────────────────────────────────────────────────────
export interface SectionGroup {
  sectionId:    string;
  sectionName:  string;
  sectionColor: string;
  sectionIcon:  string;
  products:     Product[];
  open:         boolean;
}

export interface FloorGroup {
  floorId:   string;
  floorName: string;
  sections:  SectionGroup[];
  open:      boolean;
}

// ── Comprehensive mock products ───────────────────────────────────────────────
export const MOCK_PRODUCTS: Product[] = [
  // ── Ground Floor → Grocery ─────────────────────────────────────────────────
  { id:'p01', name:'Amul Full Cream Milk', price:68,  quantity:120, unit:'litre', icon:'🥛', sku:'DAI001', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-grocery', sectionName:'Grocery', sectionColor:'#f59e0b', lowStockThreshold:20, createdAt:'2026-01-10' },
  { id:'p02', name:'Fortune Sunflower Oil', price:185, quantity:80,  unit:'litre', icon:'🫙', sku:'GRC002', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-grocery', sectionName:'Grocery', sectionColor:'#f59e0b', lowStockThreshold:15, createdAt:'2026-01-12' },
  { id:'p03', name:'Aashirvaad Atta 10kg', price:340, quantity:18,  unit:'pcs',   icon:'🌾', sku:'GRC003', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-grocery', sectionName:'Grocery', sectionColor:'#f59e0b', lowStockThreshold:20, createdAt:'2026-01-15' },
  { id:'p04', name:'Tata Salt 1kg',         price:28,  quantity:200, unit:'pcs',   icon:'🧂', sku:'GRC004', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-grocery', sectionName:'Grocery', sectionColor:'#f59e0b', lowStockThreshold:30, createdAt:'2026-02-01' },
  { id:'p05', name:'Maggi Noodles 12pk',    price:132, quantity:60,  unit:'pack',  icon:'🍜', sku:'GRC005', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-grocery', sectionName:'Grocery', sectionColor:'#f59e0b', lowStockThreshold:10, createdAt:'2026-02-03' },
  { id:'p06', name:'Basmati Rice 5kg',      price:399, quantity:45,  unit:'pcs',   icon:'🍚', sku:'GRC006', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-grocery', sectionName:'Grocery', sectionColor:'#f59e0b', lowStockThreshold:10, createdAt:'2026-02-10' },
  // ── Ground Floor → Bakery ──────────────────────────────────────────────────
  { id:'p07', name:'Britannia Bread 400g',  price:52,  quantity:35,  unit:'pcs',   icon:'🍞', sku:'BAK001', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-bakery', sectionName:'Bakery', sectionColor:'#d97706', lowStockThreshold:10, createdAt:'2026-02-05' },
  { id:'p08', name:'Croissant Butter Pack', price:90,  quantity:8,   unit:'pack',  icon:'🥐', sku:'BAK002', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-bakery', sectionName:'Bakery', sectionColor:'#d97706', lowStockThreshold:10, createdAt:'2026-02-08' },
  { id:'p09', name:'Chocolate Cake Slice',  price:75,  quantity:22,  unit:'pcs',   icon:'🎂', sku:'BAK003', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-bakery', sectionName:'Bakery', sectionColor:'#d97706', lowStockThreshold:5,  createdAt:'2026-02-09' },
  // ── Ground Floor → Offers Zone ─────────────────────────────────────────────
  { id:'p10', name:'Gift Card ₹500',        price:500, quantity:50,  unit:'pcs',   icon:'🎁', sku:'OFF001', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-offers', sectionName:'Offers Zone', sectionColor:'#f97316', lowStockThreshold:10, createdAt:'2026-01-20' },
  { id:'p11', name:'Combo Snack Bundle',    price:249, quantity:30,  unit:'pack',  icon:'🏷️',  sku:'OFF002', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-offers', sectionName:'Offers Zone', sectionColor:'#f97316', lowStockThreshold:5,  createdAt:'2026-02-14' },
  // ── Ground Floor → Billing ─────────────────────────────────────────────────
  { id:'p12', name:'Carry Bags - Large',    price:5,   quantity:500, unit:'pcs',   icon:'🛍️',  sku:'BIL001', floorId:'floor-0', floorName:'Ground Floor', sectionId:'sec-billing', sectionName:'Billing', sectionColor:'#ef4444', lowStockThreshold:100, createdAt:'2026-01-05' },
  // ── Floor 1 → Clothing ─────────────────────────────────────────────────────
  { id:'p13', name:'Cotton T-Shirt (M)',    price:399, quantity:40,  unit:'pcs',   icon:'👕', sku:'CLT001', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-clothing', sectionName:'Clothing', sectionColor:'#8b5cf6', lowStockThreshold:10, createdAt:'2026-01-18' },
  { id:'p14', name:'Slim Fit Jeans (32)',   price:1299,quantity:25,  unit:'pcs',   icon:'👖', sku:'CLT002', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-clothing', sectionName:'Clothing', sectionColor:'#8b5cf6', lowStockThreshold:5,  createdAt:'2026-01-20' },
  { id:'p15', name:'Winter Jacket XL',      price:2499,quantity:7,   unit:'pcs',   icon:'🧥', sku:'CLT003', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-clothing', sectionName:'Clothing', sectionColor:'#8b5cf6', lowStockThreshold:5,  createdAt:'2026-01-22' },
  { id:'p16', name:'Summer Dress (S)',       price:899, quantity:18,  unit:'pcs',   icon:'👗', sku:'CLT004', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-clothing', sectionName:'Clothing', sectionColor:'#8b5cf6', lowStockThreshold:5,  createdAt:'2026-02-01' },
  // ── Floor 1 → Electronics ──────────────────────────────────────────────────
  { id:'p17', name:'Samsung Galaxy A55',    price:35999,quantity:12, unit:'pcs',   icon:'📱', sku:'ELC001', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-electronics', sectionName:'Electronics', sectionColor:'#3b82f6', lowStockThreshold:5,  createdAt:'2026-01-10' },
  { id:'p18', name:'Lenovo IdeaPad 15"',   price:55000,quantity:5,  unit:'pcs',   icon:'💻', sku:'ELC002', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-electronics', sectionName:'Electronics', sectionColor:'#3b82f6', lowStockThreshold:5,  createdAt:'2026-01-12' },
  { id:'p19', name:'Sony WH-1000XM5',       price:24990,quantity:8,  unit:'pcs',   icon:'🎧', sku:'ELC003', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-electronics', sectionName:'Electronics', sectionColor:'#3b82f6', lowStockThreshold:3,  createdAt:'2026-02-02' },
  { id:'p20', name:'55" LG OLED TV',        price:89999,quantity:4,  unit:'pcs',   icon:'📺', sku:'ELC004', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-electronics', sectionName:'Electronics', sectionColor:'#3b82f6', lowStockThreshold:3,  createdAt:'2026-02-05' },
  // ── Floor 1 → Footwear ─────────────────────────────────────────────────────
  { id:'p21', name:'Nike Air Max (UK8)',     price:8999, quantity:14, unit:'pcs',   icon:'👟', sku:'FTW001', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-footwear', sectionName:'Footwear', sectionColor:'#ec4899', lowStockThreshold:5,  createdAt:'2026-01-25' },
  { id:'p22', name:'Formal Derby (UK9)',     price:3499, quantity:9,  unit:'pcs',   icon:'👞', sku:'FTW002', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-footwear', sectionName:'Footwear', sectionColor:'#ec4899', lowStockThreshold:5,  createdAt:'2026-01-28' },
  { id:'p23', name:'Stiletto Heels (UK5)',   price:2199, quantity:6,  unit:'pcs',   icon:'👡', sku:'FTW003', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-footwear', sectionName:'Footwear', sectionColor:'#ec4899', lowStockThreshold:3,  createdAt:'2026-02-10' },
  // ── Floor 1 → Home & Kitchen ───────────────────────────────────────────────
  { id:'p24', name:'Prestige Kadai 3L',     price:1299, quantity:20, unit:'pcs',   icon:'🍳', sku:'HMK001', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-home', sectionName:'Home & Kitchen', sectionColor:'#06b6d4', lowStockThreshold:5,  createdAt:'2026-01-30' },
  { id:'p25', name:'Wall Photo Frame Set',  price:649,  quantity:35, unit:'set',   icon:'🖼️',  sku:'HMK002', floorId:'floor-1', floorName:'Floor 1', sectionId:'sec-home', sectionName:'Home & Kitchen', sectionColor:'#06b6d4', lowStockThreshold:8,  createdAt:'2026-02-08' },
];

// ── Section icon map ──────────────────────────────────────────────────────────
export const SECTION_ICONS: Record<string, string> = {
  grocery:'🛒', dairy:'🥛', bakery:'🥐', clothing:'👕', electronics:'💻',
  footwear:'👟', home:'🏠', billing:'🏧', offers:'🏷️', pharmacy:'💊',
  sports:'⚽', entrance:'🚪',
};
