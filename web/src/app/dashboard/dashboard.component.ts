import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  activeUsersCount = 0;

  ngOnInit(): void {
    this.fetchActiveUsers();
  }

  private fetchActiveUsers(): void {
    this.apiService.get<any>('/v1/users/count').subscribe({
      next: (response) => {
        this.activeUsersCount = response.totalUsers || 0;
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('[DashboardComponent] Error fetching active users count:', error);
      }
    });
  }
}

