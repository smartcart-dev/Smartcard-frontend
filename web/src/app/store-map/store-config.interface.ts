// ── Section Presets ─────────────────────────────────────────────────────────
export interface SectionPreset {
  type: string; name: string; color: string; icon: string;
  defaultW: number; defaultH: number;
}

export const SECTION_PRESETS: SectionPreset[] = [
  { type: 'entrance',    name: 'Entrance',       color: '#10b981', icon: '🚪', defaultW: 30, defaultH: 12 },
  { type: 'grocery',    name: 'Grocery',         color: '#f59e0b', icon: '🛒', defaultW: 22, defaultH: 20 },
  { type: 'clothing',   name: 'Clothing',        color: '#8b5cf6', icon: '👕', defaultW: 20, defaultH: 18 },
  { type: 'footwear',   name: 'Footwear',        color: '#ec4899', icon: '👟', defaultW: 18, defaultH: 16 },
  { type: 'electronics',name: 'Electronics',     color: '#3b82f6', icon: '💻', defaultW: 20, defaultH: 18 },
  { type: 'home',       name: 'Home & Kitchen',  color: '#06b6d4', icon: '🏠', defaultW: 20, defaultH: 18 },
  { type: 'billing',    name: 'Billing',         color: '#ef4444', icon: '🏧', defaultW: 22, defaultH: 14 },
  { type: 'offers',     name: 'Offers Zone',     color: '#f97316', icon: '🏷️', defaultW: 16, defaultH: 14 },
  { type: 'bakery',     name: 'Bakery',          color: '#d97706', icon: '🥐', defaultW: 16, defaultH: 14 },
  { type: 'dairy',      name: 'Dairy',           color: '#2563eb', icon: '🥛', defaultW: 14, defaultH: 16 },
  { type: 'pharmacy',   name: 'Pharmacy',        color: '#16a34a', icon: '💊', defaultW: 14, defaultH: 14 },
  { type: 'sports',     name: 'Sports',          color: '#dc2626', icon: '⚽', defaultW: 18, defaultH: 16 },
];

// ── Section ──────────────────────────────────────────────────────────────────
export interface MapSection {
  id: string; type: string; name: string; color: string; icon: string;
  aisle: string; badge?: string;
  x: number; y: number; w: number; h: number; // percentage (0‑100) of canvas
}

// ── Floor ────────────────────────────────────────────────────────────────────
export interface MapFloor {
  id: string; name: string; level: number; sections: MapSection[];
}

// ── Store Settings ────────────────────────────────────────────────────────────
export interface StoreMapSettings {
  primaryColor: string;
  accentColor:  string;
  logoUrl:      string;
  currency:     string;
  timezone:     string;
}

// ── Full Config (= what is saved to / loaded from the DB) ────────────────────
export interface StoreMapConfig {
  schemaVersion: string;            // '1.0'
  storeId:       string;            // unique per store branch
  tenantId:      string;            // your client's org ID (multi-tenant)
  storeName:     string;
  updatedAt?:    string;            // ISO timestamp (set by backend)
  updatedBy?:    string;            // email / userId
  version?:      number;            // auto-incremented by backend
  settings:      StoreMapSettings;
  floors:        MapFloor[];
}

// ── Save/Load API response shapes ────────────────────────────────────────────
export interface SaveMapResponse {
  success:  boolean;
  storeId?: string;
  savedAt?: string;
  version?: number;
  message?: string;
  error?:   { code: string; message: string; status: number };
}

export interface LoadMapResponse {
  success: boolean;
  data?:   StoreMapConfig;
  meta?:   { storeId: string; tenantId: string; savedAt: string; version: number };
  error?:  { code: string; message: string; status: number };
}

// ── Wizard helper ────────────────────────────────────────────────────────────
export interface WizardFloorSetup {
  name: string;
  selectedTypes: Set<string>;
}

// ── Default settings factory ──────────────────────────────────────────────────
export function defaultSettings(): StoreMapSettings {
  return { primaryColor:'#22c55e', accentColor:'#3b82f6', logoUrl:'', currency:'INR', timezone:'Asia/Kolkata' };
}
