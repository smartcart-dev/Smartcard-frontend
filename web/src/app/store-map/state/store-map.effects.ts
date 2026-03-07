import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ApiService } from '../../services/apiService.service';
import { LoadMapResponse } from '../store-config.interface';
import * as StoreMapActions from './store-map.actions';

@Injectable()
export class StoreMapEffects {
  private readonly actions$ = inject(Actions);
  private readonly api      = inject(ApiService);

  /** Fetch store map from API and dispatch success/failure */
  loadStoreMap$ = createEffect(() =>
    this.actions$.pipe(
      ofType(StoreMapActions.loadStoreMap),
      switchMap(({ tenantId, storeId }) =>
        this.api.get<LoadMapResponse>('/v1/masters/store_map', undefined, {
          'x-tenant-id': tenantId,
          'x-store-id':  storeId,
        }).pipe(
          map((res) => {
            if (res.success && res.data) {
              return StoreMapActions.loadStoreMapSuccess({ config: res.data });
            }
            return StoreMapActions.loadStoreMapFailure({ error: 'No map data found' });
          }),
          catchError((err) =>
            of(StoreMapActions.loadStoreMapFailure({ error: err?.message ?? 'API error' }))
          ),
        )
      ),
    )
  );
}
