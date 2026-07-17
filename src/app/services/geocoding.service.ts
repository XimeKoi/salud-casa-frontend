import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GeocodingResult {
    lat: number;
    lon: number;
    display_name: string;
    road?: string;
    status?: string;
    success?: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class GeocodingService {
    private cache: Map<string, GeocodingResult> = new Map();

    constructor(private http: HttpClient) { }

    async searchAddress(query: string, useAdvanced: boolean = false): Promise<GeocodingResult | null> {
        if (!query || query.trim().length === 0) {
            return null;
        }

        const cleanQuery = query.trim();
        const cacheKey = `${cleanQuery}_${useAdvanced}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) || null;
        }

        try {
            const url = `${environment.apiUrl}/geocode?direccion=${encodeURIComponent(cleanQuery)}`;
            const response: any = await firstValueFrom(
                this.http.get(url)
            );

            if (response && response.success && response.lat && response.lng) {
                const result: GeocodingResult = {
                    lat: response.lat,
                    lon: response.lng,
                    display_name: response.display_name || cleanQuery,
                    road: response.road || cleanQuery,
                    success: true
                };
                this.cache.set(cacheKey, result);
                return result;
            }

            return null;
        } catch (error) {
            console.error('Error en geocoding:', error);
            return null;
        }
    }

    clearCache() {
        this.cache.clear();
    }
}