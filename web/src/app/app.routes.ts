import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
  {
    path: 'app',
    loadComponent: () => import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'users', loadComponent: () => import('./users/users.component').then(m => m.UsersComponent) },
      { path: 'users/add', loadComponent: () => import('./users/add-user/add-user.component').then(m => m.AddUserComponent) },
      { path: 'store-map', loadComponent: () => import('./store-map/store-map.component').then(m => m.StoreMapComponent) },
      { path: 'products',  loadComponent: () => import('./products/products.component').then(m => m.ProductsComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];
