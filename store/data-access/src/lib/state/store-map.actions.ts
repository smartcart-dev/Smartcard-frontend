import { createAction, props } from '@ngrx/store';

// Map Setup
export const generateMap = createAction(
    '[Store Map] Generate Map',
    props<{ numFloors: number; hasBasement: boolean }>()
);

// Navigation
export const moveFloorUp = createAction('[Store Map] Move Floor Up');
export const moveFloorDown = createAction('[Store Map] Move Floor Down');

// Edit Mode
export const toggleEditMode = createAction('[Store Map] Toggle Edit Mode');
export const setTransformMode = createAction(
    '[Store Map] Set Transform Mode',
    props<{ transformMode: 'translate' | 'rotate' | 'scale' }>()
);

// Object Selection
export const selectObject = createAction(
    '[Store Map] Select Object',
    props<{
        objectName: string;
        objectColor: string;
        objectType: string;
    }>()
);
export const deselectObject = createAction('[Store Map] Deselect Object');
export const updateObjectDetails = createAction(
    '[Store Map] Update Object Details',
    props<{ objectName: string; objectColor: string }>()
);
