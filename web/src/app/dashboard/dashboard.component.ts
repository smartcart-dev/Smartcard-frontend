import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../services/apiService.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private apiService = inject(ApiService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  activeUsersCount = 0;

  ngOnInit(): void {
    this.fetchActiveUsers();
  }

  private fetchActiveUsers(): void {
    this.apiService.get<any>('/users/count').subscribe({
      next: (response) => {
        this.activeUsersCount = response.totalUsers || 0;
        this.cdr.detectChanges();
      },
      error: (error) => {
        // Error handled silently
      }
    });
  }

  navigateToUsers(): void {
    this.router.navigate(['/app/users']);
  }
}

