import { createFeatureSelector, createSelector } from '@ngrx/store';
import { StoreMapState } from './store-map.reducer';

export const selectStoreMapState = createFeatureSelector<StoreMapState>('storeMap');

export const selectStoreMapConfig  = createSelector(selectStoreMapState, (s) => s.config);
export const selectStoreMapLoaded  = createSelector(selectStoreMapState, (s) => s.loaded);
export const selectStoreMapLoading = createSelector(selectStoreMapState, (s) => s.loading);
export const selectStoreMapError   = createSelector(selectStoreMapState, (s) => s.error);
