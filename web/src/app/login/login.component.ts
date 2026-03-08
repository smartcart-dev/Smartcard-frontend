import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, HttpClientModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  brandName: string = environment.brandName || 'Smartcart';
  loginForm!: FormGroup;
  
  // UI States
  isLoading = false;
  errorMessage: string | null = null;

  private fb = inject(FormBuilder);
  private router = inject(Router);
  private authService = inject(AuthService);

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.isLoading = true;
      this.errorMessage = null;
      
      this.authService.login(this.loginForm.value).subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.sessionId) {
            this.authService.saveSession(response.sessionId);
            this.router.navigate(['/app/dashboard']);
          } else {
             this.errorMessage = 'Login failed. Invalid response from server.';
          }
        },
        error: (err) => {
          this.isLoading = false;
          this.errorMessage = err.error?.message || 'Failed to connect to the server. Please try again later.';
          console.error('Login error:', err);
        }
      });
    } else {
       // Mark all fields as touched to trigger validation messages if any
       Object.keys(this.loginForm.controls).forEach(key => {
         this.loginForm.get(key)?.markAsTouched();
       });
    }
  }
}

