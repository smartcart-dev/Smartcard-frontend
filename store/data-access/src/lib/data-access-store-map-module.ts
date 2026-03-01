import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StoreModule } from '@ngrx/store';
import { STORE_MAP_FEATURE_KEY, storeMapReducer } from './state';

@NgModule({
  imports: [
    CommonModule,
    StoreModule.forFeature(STORE_MAP_FEATURE_KEY, storeMapReducer)
  ],
})
export class DataAccessStoreMapModule { }
