import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root',
})
export class ApiService {

    private readonly baseUrl = environment.apiBaseUrl;

    constructor(private http: HttpClient) { }

    private createHeaders(customHeaders?: { [key: string]: string }): HttpHeaders {
        return new HttpHeaders({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...customHeaders,
        });
    }

    get<T>(endpoint: string, params?: any): Observable<T> {
        let httpParams = new HttpParams();

        if (params) {
            Object.keys(params).forEach(key => {
                if (params[key] !== null && params[key] !== undefined) {
                    httpParams = httpParams.set(key, params[key]);
                }
            });
        }

        return this.http.get<T>(`${this.baseUrl}${endpoint}`, {
            headers: this.createHeaders(),
            params: httpParams
        }).pipe(
            catchError(this.handleError)
        );
    }

    post<T>(endpoint: string, body: any): Observable<T> {
        return this.http.post<T>(`${this.baseUrl}${endpoint}`, body, {
            headers: this.createHeaders()
        }).pipe(
            catchError(this.handleError)
        );
    }

    put<T>(endpoint: string, body: any): Observable<T> {
        return this.http.put<T>(`${this.baseUrl}${endpoint}`, body, {
            headers: this.createHeaders()
        }).pipe(
            catchError(this.handleError)
        );
    }

    delete<T>(endpoint: string): Observable<T> {
        return this.http.delete<T>(`${this.baseUrl}${endpoint}`, {
            headers: this.createHeaders()
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




