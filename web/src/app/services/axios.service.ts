import { Injectable } from '@angular/core';
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class AxiosService {
    private axiosInstance: AxiosInstance;

    constructor() {
        this.axiosInstance = axios.create({
            baseURL: environment.apiBaseUrl,
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // Optional: Add Interceptors for auth tokens, global error handling, etc.
        this.axiosInstance.interceptors.request.use(
            (config) => {
                // e.g., const token = localStorage.getItem('token');
                // if (token) config.headers['Authorization'] = `Bearer \${token}`;
                return config;
            },
            (error) => Promise.reject(error)
        );

        this.axiosInstance.interceptors.response.use(
            (response) => response,
            (error) => {
                // Handle global generic errors here (401, 500 etc)
                console.error('API Error:', error);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Performs an HTTP GET request.
     * @param url The endpoint URL (relative to baseURL)
     * @param config Optional Axios request configuration
     * @returns An Observable of the response data T
     */
    get<T>(url: string, config?: AxiosRequestConfig): Observable<T> {
        return from(this.axiosInstance.get<T>(url, config)).pipe(
            map((response: AxiosResponse<T>) => response.data),
            catchError(this.handleError)
        );
    }

    /**
     * Performs an HTTP POST request.
     * @param url The endpoint URL
     * @param data The payload for the POST request
     * @param config Optional Axios request configuration
     * @returns An Observable of the response data T
     */
    post<T>(url: string, data?: any, config?: AxiosRequestConfig): Observable<T> {
        return from(this.axiosInstance.post<T>(url, data, config)).pipe(
            map((response: AxiosResponse<T>) => response.data),
            catchError(this.handleError)
        );
    }

    /**
     * Performs an HTTP PUT request.
     * @param url The endpoint URL
     * @param data The payload for the PUT request
     * @param config Optional Axios request configuration
     * @returns An Observable of the response data T
     */
    put<T>(url: string, data?: any, config?: AxiosRequestConfig): Observable<T> {
        return from(this.axiosInstance.put<T>(url, data, config)).pipe(
            map((response: AxiosResponse<T>) => response.data),
            catchError(this.handleError)
        );
    }

    /**
     * Performs an HTTP DELETE request.
     * @param url The endpoint URL
     * @param config Optional Axios request configuration
     * @returns An Observable of the response data T
     */
    delete<T>(url: string, config?: AxiosRequestConfig): Observable<T> {
        return from(this.axiosInstance.delete<T>(url, config)).pipe(
            map((response: AxiosResponse<T>) => response.data),
            catchError(this.handleError)
        );
    }

    /**
     * Centralized RxJS error handler mapping Axios errors back into the stream
     */
    private handleError(error: AxiosError | any): Observable<never> {
        let errorMessage = 'An unknown error occurred!';
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            errorMessage = `Server returned code: \${error.response.status}, error message is: \${JSON.stringify(error.response.data)}`;
        } else if (error.request) {
            // The request was made but no response was received
            errorMessage = 'No response received from the server. Please check your network connection.';
        } else {
            // Something happened in setting up the request that triggered an Error
            errorMessage = `Error shaping network request: \${error.message}`;
        }
        return throwError(() => new Error(errorMessage));
    }
}
