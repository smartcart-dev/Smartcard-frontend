import { Route } from '@angular/router';

export const appRoutes: Route[] = [
    {
        path: 'dashboard',
        loadComponent: () =>
            import('./customer-dashboard/customer-dashboard.component').then(
                (m) => m.CustomerDashboardComponent
            ),
    },
    {
        path: 'cart',
        loadComponent: () =>
            import('./cart/cart.component').then((m) => m.CartComponent),
    },
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
];
