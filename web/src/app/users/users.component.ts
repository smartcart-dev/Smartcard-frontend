import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../services/apiService.service';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef, ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { Router } from '@angular/router';

ModuleRegistry.registerModules([AllCommunityModule]);

@Component({
    selector: 'app-users',
    standalone: true,
    imports: [CommonModule, AgGridAngular],
    templateUrl: './users.component.html',
    styleUrl: './users.component.scss',
})
export class UsersComponent implements OnInit {
    private apiService = inject(ApiService);
    private cdr = inject(ChangeDetectorRef);
    private router = inject(Router);

    users: any[] = [];
    loading = true;
    error = '';

    // ag-Grid Column Definitions
    columnDefs: ColDef[] = [
        {
            field: 'username',
            headerName: 'User',
            filter: true,
            sortable: true,
            flex: 1,
            cellRenderer: (params: any) => {
                const char = params.value ? params.value.charAt(0).toUpperCase() : '?';
                return `
                    <div style="display: flex; align-items: center; gap: 12px; height: 100%;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; background: #e0e7ff; color: #4338ca; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px;">
                            ${char}
                        </div>
                        <span style="font-weight: 500; color: #111827;">${params.value}</span>
                    </div>
                `;
            }
        },
        {
            field: 'email',
            headerName: 'Email Address',
            filter: true,
            sortable: true,
            flex: 1.5,
            cellStyle: { color: '#6b7280' }
        },
        {
            headerName: 'Actions',
            field: 'id',
            cellRenderer: (params: any) => {
                return `
                    <div class="actions-cell">
                        <button class="action-btn view">View Details</button>
                        <button class="action-btn edit">Edit</button>
                    </div>
                `;
            },
            width: 200,
            sortable: false,
            filter: false
        }
    ];

    // ag-Grid Options
    public defaultColDef: ColDef = {
        resizable: true,
        sortable: true,
        filter: true
    };
    public paginationPageSize = 10;
    public paginationPageSizeSelector = [10, 25, 50];

    ngOnInit(): void {
        this.fetchUsers();
    }

    fetchUsers(): void {
        this.loading = true;
        this.apiService.get<any>('/users', { page: 1, limit: 100 }).subscribe({
            next: (response) => {
                this.users = response.data || [];
                this.loading = false;
                this.cdr.detectChanges();
            },
            error: (err) => {
                this.error = 'Failed to load users. Please try again later.';
                this.loading = false;
                this.cdr.detectChanges();
            }
        });
    }

    navigateToAddUser(): void {
        this.router.navigate(['/app/users/add']);
    }
}

