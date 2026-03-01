import { createFeatureSelector, createSelector } from '@ngrx/store';
import { STORE_MAP_FEATURE_KEY, StoreMapState } from './store-map.reducer';

// Lookup the 'StoreMap' feature state managed by NgRx
export const selectStoreMapState = createFeatureSelector<StoreMapState>(STORE_MAP_FEATURE_KEY);

// Feature Selectors
export const selectFloorsData = createSelector(
    selectStoreMapState,
    (state: StoreMapState) => state.floorsData
);

export const selectActiveFloorIndex = createSelector(
    selectStoreMapState,
    (state: StoreMapState) => state.activeFloorIndex
);

export const selectTotalLevels = createSelector(
    selectStoreMapState,
    (state: StoreMapState) => state.totalLevels
);

export const selectActiveFloor = createSelector(
    selectFloorsData,
    selectActiveFloorIndex,
    (floorsData, index) => floorsData[index] || null
);

export const selectActiveFloorName = createSelector(
    selectActiveFloor,
    (activeFloor) => activeFloor ? activeFloor.name : ''
);

// Edit Mode Selectors
export const selectEditMode = createSelector(
    selectStoreMapState,
    (state: StoreMapState) => state.editMode
);

export const selectTransformMode = createSelector(
    selectStoreMapState,
    (state: StoreMapState) => state.transformMode
);

// Selection Selectors
export const selectHasSelection = createSelector(
    selectStoreMapState,
    (state: StoreMapState) => state.hasSelection
);

export const selectObjectName = createSelector(
    selectStoreMapState,
    (state: StoreMapState) => state.selectedObjectName
);

export const selectObjectColor = createSelector(
    selectStoreMapState,
    (state: StoreMapState) => state.selectedObjectColor
);

export const selectObjectType = createSelector(
    selectStoreMapState,
    (state: StoreMapState) => state.selectedObjectType
);
