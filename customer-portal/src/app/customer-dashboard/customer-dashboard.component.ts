import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
    selector: 'app-customer-dashboard',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './customer-dashboard.component.html',
    styleUrl: './customer-dashboard.component.scss',
})
export class CustomerDashboardComponent {
    private router = inject(Router);

    activeCarts = [
        { id: '1', name: 'My Cart', items: 0, lastActive: 'Active' },
    ];

    openCart(id: string) {
        this.router.navigate(['/cart']);
    }

    createNewCart() {
        this.router.navigate(['/cart']);
    }
}
