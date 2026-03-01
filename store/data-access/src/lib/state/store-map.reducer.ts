import { createReducer, on } from '@ngrx/store';
import * as StoreMapActions from './store-map.actions';

export const STORE_MAP_FEATURE_KEY = 'storeMap';

export interface FloorsData {
    id: string;
    name: string;
    level: number;
}

export interface StoreMapState {
    // Map Data
    numFloors: number;
    hasBasement: boolean;
    totalLevels: number;
    floorsData: FloorsData[];
    activeFloorIndex: number;

    // Edit Mode
    editMode: boolean;
    transformMode: 'translate' | 'rotate' | 'scale';

    // Selection
    hasSelection: boolean;
    selectedObjectName: string;
    selectedObjectColor: string;
    selectedObjectType: string;
}

export const initialStoreMapState: StoreMapState = {
    numFloors: 1,
    hasBasement: false,
    totalLevels: 1,
    floorsData: [{ id: 'floor-0', name: 'Ground Floor', level: 0 }],
    activeFloorIndex: 0,

    editMode: false,
    transformMode: 'translate',

    hasSelection: false,
    selectedObjectName: '',
    selectedObjectColor: '#ffffff',
    selectedObjectType: '',
};

export const storeMapReducer = createReducer(
    initialStoreMapState,

    on(StoreMapActions.generateMap, (state, { numFloors, hasBasement }) => {
        const totalLevels = hasBasement ? numFloors + 1 : numFloors;
        const activeFloorIndex = hasBasement ? 1 : 0;
        const floorsData: FloorsData[] = [];

        for (let i = 0; i < totalLevels; i++) {
            const isBasement = hasBasement && i === 0;
            const levelNumber = isBasement ? -1 : (hasBasement ? i : i + 1);
            floorsData.push({
                id: `floor-${levelNumber}`,
                name: isBasement ? 'Basement' : (levelNumber === 0 ? 'Ground Floor' : `Floor ${levelNumber}`),
                level: levelNumber
            });
        }

        return { ...state, numFloors, hasBasement, totalLevels, activeFloorIndex, floorsData };
    }),

    on(StoreMapActions.moveFloorUp, (state) => ({
        ...state,
        activeFloorIndex: state.activeFloorIndex < state.totalLevels - 1 ? state.activeFloorIndex + 1 : state.activeFloorIndex
    })),

    on(StoreMapActions.moveFloorDown, (state) => ({
        ...state,
        activeFloorIndex: state.activeFloorIndex > 0 ? state.activeFloorIndex - 1 : state.activeFloorIndex
    })),

    on(StoreMapActions.toggleEditMode, (state) => ({
        ...state,
        editMode: !state.editMode,
        // Automatically deselect object if exiting edit mode
        hasSelection: !state.editMode ? false : state.hasSelection,
        selectedObjectName: !state.editMode ? '' : state.selectedObjectName,
    })),

    on(StoreMapActions.setTransformMode, (state, { transformMode }) => ({
        ...state,
        transformMode
    })),

    on(StoreMapActions.selectObject, (state, { objectName, objectColor, objectType }) => ({
        ...state,
        hasSelection: true,
        selectedObjectName: objectName,
        selectedObjectColor: objectColor,
        selectedObjectType: objectType
    })),

    on(StoreMapActions.deselectObject, (state) => ({
        ...state,
        hasSelection: false,
        selectedObjectName: '',
        selectedObjectColor: '#ffffff',
        selectedObjectType: ''
    })),

    on(StoreMapActions.updateObjectDetails, (state, { objectName, objectColor }) => ({
        ...state,
        selectedObjectName: objectName,
        selectedObjectColor: objectColor
    }))
);
