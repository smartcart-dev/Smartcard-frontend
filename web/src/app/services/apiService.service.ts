import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class ApiService {

    private readonly baseUrl = environment.apiBaseUrl;
    private readonly http = inject(HttpClient);

    private createHeaders(customHeaders?: { [key: string]: string }): HttpHeaders {
        return new HttpHeaders({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...customHeaders,
        });
    }

    get<T>(endpoint: string, params?: Record<string, string | number | boolean>, customHeaders?: { [key: string]: string }): Observable<T> {
        let httpParams = new HttpParams();
        if (params) {
            Object.keys(params).forEach(key => {
                if (params[key] !== null && params[key] !== undefined) {
                    httpParams = httpParams.set(key, params[key]);
                }
            });
        }

        const fullUrl = `${this.baseUrl}${endpoint}`;
        return this.http.get<T>(fullUrl, {
            headers: this.createHeaders(customHeaders),
            params: httpParams
        }).pipe(
            catchError(this.handleError)
        );
    }

    post<T>(endpoint: string, body: object, customHeaders?: { [key: string]: string }): Observable<T> {
        return this.http.post<T>(`${this.baseUrl}${endpoint}`, body, {
            headers: this.createHeaders(customHeaders)
        }).pipe(
            catchError(this.handleError)
        );
    }

    put<T>(endpoint: string, body: object, customHeaders?: { [key: string]: string }): Observable<T> {
        return this.http.put<T>(`${this.baseUrl}${endpoint}`, body, {
            headers: this.createHeaders(customHeaders)
        }).pipe(
            catchError(this.handleError)
        );
    }

    delete<T>(endpoint: string, customHeaders?: { [key: string]: string }): Observable<T> {
        return this.http.delete<T>(`${this.baseUrl}${endpoint}`, {
            headers: this.createHeaders(customHeaders)
        }).pipe(
            catchError(this.handleError)
        );
    }

    private handleError(error: HttpErrorResponse) {
        let message = 'Unexpected error occurred';

        if (error.error instanceof ErrorEvent) {
            message = `Client Error: ${error.error.message}`;
        } else {
            message = `Server Error: ${error.status} - ${JSON.stringify(error.error)}`;
        }

        return throwError(() => new Error(message));
    }
}




