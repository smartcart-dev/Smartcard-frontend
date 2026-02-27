export interface StoreItem {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  color?: string; // Hex color for the 3D representation
}

export interface StoreSection {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  size: { width: number; height: number; depth: number };
  color?: string;
  items: StoreItem[];
}

export interface StoreFloor {
  id: string;
  level: number;
  name: string;
  size: { width: number; depth: number };
  sections: StoreSection[];
}

export interface StoreConfig {
  floors: StoreFloor[];
  activeFloorId?: string;
}

// A mock layout to start with
export const MOCK_STORE_CONFIG: StoreConfig = {
  floors: [
    {
      id: 'floor-1',
      level: 1,
      name: 'Ground Floor',
      size: { width: 100, depth: 100 },
      sections: [
        {
          id: 'sec-produce',
          name: 'Produce',
          position: { x: -20, y: 0, z: -20 },
          size: { width: 20, height: 5, depth: 30 },
          color: '#22c55e', // Green
          items: [
            { id: 'item-apples', name: 'Apples', position: { x: -20, y: 5, z: -25 }, color: '#ef4444' },
            { id: 'item-bananas', name: 'Bananas', position: { x: -20, y: 5, z: -15 }, color: '#eab308' },
          ]
        },
        {
          id: 'sec-dairy',
          name: 'Dairy',
          position: { x: 30, y: 0, z: -20 },
          size: { width: 15, height: 10, depth: 40 },
          color: '#3b82f6', // Blue
          items: [
            { id: 'item-milk', name: 'Milk', position: { x: 30, y: 10, z: -30 }, color: '#ffffff' },
          ]
        },
        {
          id: 'sec-bakery',
          name: 'Bakery',
          position: { x: 0, y: 0, z: 25 },
          size: { width: 30, height: 8, depth: 15 },
          color: '#f97316', // Orange
          items: []
        }
      ]
    }
  ],
  activeFloorId: 'floor-1'
};
