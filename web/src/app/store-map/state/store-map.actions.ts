import { createAction, props } from '@ngrx/store';
import { StoreMapConfig } from '../store-config.interface';

// ── Load ──────────────────────────────────────────────────────────────────────
export const loadStoreMap = createAction(
  '[StoreMap] Load Store Map',
  props<{ tenantId: string; storeId: string }>()
);

export const loadStoreMapSuccess = createAction(
  '[StoreMap] Load Store Map Success',
  props<{ config: StoreMapConfig }>()
);

export const loadStoreMapFailure = createAction(
  '[StoreMap] Load Store Map Failure',
  props<{ error: string }>()
);

// ── Save (update store after API save) ────────────────────────────────────────
export const saveStoreMapSuccess = createAction(
  '[StoreMap] Save Store Map Success',
  props<{ config: StoreMapConfig }>()
);

// ── Clear ─────────────────────────────────────────────────────────────────────
export const clearStoreMap = createAction('[StoreMap] Clear Store Map');
