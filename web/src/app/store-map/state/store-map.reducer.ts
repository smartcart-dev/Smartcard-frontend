import { createReducer, on } from '@ngrx/store';
import { StoreMapConfig } from '../store-config.interface';
import * as StoreMapActions from './store-map.actions';

// ── State shape ───────────────────────────────────────────────────────────────
export interface StoreMapState {
  config:  StoreMapConfig | null;
  loaded:  boolean;
  loading: boolean;
  error:   string | null;
}

export const initialState: StoreMapState = {
  config:  null,
  loaded:  false,
  loading: false,
  error:   null,
};

// ── Reducer ───────────────────────────────────────────────────────────────────
export const storeMapReducer = createReducer(
  initialState,

  on(StoreMapActions.loadStoreMap, (state) => ({
    ...state,
    loading: true,
    error: null,
  })),

  on(StoreMapActions.loadStoreMapSuccess, (state, { config }) => ({
    ...state,
    config,
    loaded: true,
    loading: false,
    error: null,
  })),

  on(StoreMapActions.loadStoreMapFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  on(StoreMapActions.saveStoreMapSuccess, (state, { config }) => ({
    ...state,
    config,
    loaded: true,
  })),

  on(StoreMapActions.clearStoreMap, () => ({ ...initialState })),
);
