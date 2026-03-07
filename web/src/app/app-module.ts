import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouterModule } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { StoreModule } from '@ngrx/store';
import { EffectsModule } from '@ngrx/effects';
import { App } from './app';
import { appRoutes } from './app.routes';
import { NxWelcome } from './nx-welcome';
import { storeMapReducer } from './store-map/state/store-map.reducer';
import { StoreMapEffects } from './store-map/state/store-map.effects';

@NgModule({
  declarations: [App, NxWelcome],
  imports: [
    BrowserModule,
    RouterModule.forRoot(appRoutes),
    StoreModule.forRoot({ storeMap: storeMapReducer }),
    EffectsModule.forRoot([StoreMapEffects]),
  ],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
  ],
  bootstrap: [App],
})
export class AppModule { }

