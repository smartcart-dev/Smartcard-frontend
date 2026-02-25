import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { featureCartRoutes } from './lib.routes';

@NgModule({
  imports: [CommonModule, RouterModule.forChild(featureCartRoutes)],
})
export class FeatureCartModule {}
