import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { featureStoreMapRoutes } from './lib.routes';

@NgModule({
  imports: [CommonModule, RouterModule.forChild(featureStoreMapRoutes)],
})
export class FeatureStoreMapModule {}
