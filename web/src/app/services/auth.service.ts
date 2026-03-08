import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LoginResponse {
  statusCode: number;
  message: string;
  sessionId: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${(environment as any).apiUrl || (environment as any).apiBaseUrl || 'http://localhost:3000/api/v1'}`;

  constructor(private http: HttpClient) {}

  login(credentials: { email: string; password: string }): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, credentials);
  }

  // Helper method to store session ID (can be expanded later for actual session mgmt)
  saveSession(sessionId: string): void {
    localStorage.setItem('sessionId', sessionId);
  }

  getSession(): string | null {
    return localStorage.getItem('sessionId');
  }

  logout(): void {
    localStorage.removeItem('sessionId');
  }
}
