import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../services/apiService.service';

@Component({
    selector: 'app-add-user',
    standalone: true,
    imports: [CommonModule, FormsModule, ReactiveFormsModule],
    templateUrl: './add-user.component.html',
    styleUrl: './add-user.component.scss'
})
export class AddUserComponent {
    private fb = inject(FormBuilder);
    private apiService = inject(ApiService);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);

    userForm = this.fb.group({
        username: ['', [Validators.required, Validators.minLength(2)]],
        email: ['', [Validators.required, Validators.email]]
    });

    loading = false;
    error = '';

    onSubmit(): void {
        if (this.userForm.valid) {
            this.loading = true;
            this.error = '';

            const payload = {
                username: this.userForm.value.username,
                email: this.userForm.value.email
            };

            this.apiService.post<any>('/v1/signup', payload).subscribe({
                next: () => {
                    this.loading = false;
                    this.goBack();
                },
                error: (err) => {
                    this.loading = false;
                    this.error = 'Failed to create user. Please try again.';
                    this.cdr.detectChanges();
                }
            });
        }
    }

    goBack(): void {
        this.router.navigate(['/app/users']);
    }
}
