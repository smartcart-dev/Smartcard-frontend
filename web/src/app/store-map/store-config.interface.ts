export interface SectionPreset {
  type: string;
  name: string;
  color: string;
  icon: string;
  defaultW: number; // % of canvas width
  defaultH: number; // % of canvas height
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

export interface MapSection {
  id: string;
  type: string;
  name: string;
  color: string;
  icon: string;
  aisle: string;
  // Percentage-based position (0–100) relative to canvas
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapFloor {
  id: string;
  name: string;
  level: number;
  sections: MapSection[];
}

export interface StoreMapConfig {
  storeName: string;
  floors: MapFloor[];
}

export interface WizardFloorSetup {
  name: string;
  selectedTypes: Set<string>;
}
