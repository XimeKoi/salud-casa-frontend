// src/app/services/geocoding.service.ts

import { Injectable } from '@angular/core';

export interface GeocodingResult {
    lat: number;
    lon: number;
    display_name: string;
    road: string;
    entreCalle1: string;
    entreCalle2: string;
    distrito: string;
    municipio: string;
    seccion: string;
    manzana: string;
    isAllowed: boolean;
    status: 'SUCCESS' | 'NO_RESULTS';
}

@Injectable({
    providedIn: 'root'
})
export class GeocodingService {
    private cache: Map<string, any> = new Map();

    // ⭐ TIMEOUT PARA FETCH (10 segundos)
    private fetchWithTimeout(url: string, options: any, timeout: number = 10000): Promise<any> {
        return Promise.race([
            fetch(url, options),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout en la petición')), timeout)
            )
        ]);
    }

    private normalizeQuery(query: string): string {
        let fullQuery = query.trim();
        const lowerQuery = fullQuery.toLowerCase();
        if (!lowerQuery.includes('guanajuato')) {
            fullQuery += ', Guanajuato';
        }
        if (!lowerQuery.includes('méxico') && !lowerQuery.includes('mexico')) {
            fullQuery += ', México';
        }
        return fullQuery;
    }

    private normalizeStreetName(s: string): string {
        if (!s) return '';
        return s.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/^(calle|avenida|av\.|boulevard|blvd\.|calzada|privada|priv\.|pasaje|andador)\s+/i, '')
            .trim();
    }

    async searchAddress(query: string, fetchEntrecalles: boolean = false): Promise<GeocodingResult | null> {
        if (!query || !query.trim()) {
            console.warn('⚠️ Query vacío');
            return null;
        }

        const fullQuery = this.normalizeQuery(query);
        const cacheKey = fullQuery + (fetchEntrecalles ? '_entrecalles' : '');

        // ⭐ VERIFICAR CACHÉ
        if (this.cache.has(cacheKey)) {
            console.log('📦 Usando caché para:', query);
            return this.cache.get(cacheKey);
        }

        const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullQuery)}&format=json&limit=1&addressdetails=1`;
        console.log('🔍 Buscando:', fullQuery);

        try {
            // ⭐ FETCH CON TIMEOUT
            const response = await this.fetchWithTimeout(searchUrl, {
                headers: {
                    'Accept-Language': 'es',
                    'User-Agent': 'SaludCasaApp/1.0'
                }
            }, 10000);

            const results = await response.json();

            if (!results || results.length === 0) {
                console.warn('📭 Sin resultados para:', query);
                return null;
            }

            const result = results[0];
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            const road = result.address?.road || result.address?.pedestrian || result.address?.footway || result.address?.path || '';

            let entreCalle1 = '';
            let entreCalle2 = '';
            if (fetchEntrecalles) {
                const ec = await this.findEntrecalles(lat, lon, road);
                entreCalle1 = ec.entreCalle1;
                entreCalle2 = ec.entreCalle2;
            }

            const geocodingResult: GeocodingResult = {
                lat,
                lon,
                display_name: result.display_name,
                road: road,
                entreCalle1,
                entreCalle2,
                distrito: '',
                municipio: '',
                seccion: '',
                manzana: '',
                isAllowed: true,
                status: 'SUCCESS'
            };

            // ⭐ GUARDAR EN CACHÉ
            this.cache.set(cacheKey, geocodingResult);
            console.log('✅ Búsqueda exitosa:', geocodingResult.display_name);
            return geocodingResult;

        } catch (error: any) {
            console.error('❌ Error en searchAddress:', error.message || error);
            return null;
        }
    }

    private async findEntrecalles(lat: number, lon: number, mainRoad: string): Promise<{ entreCalle1: string, entreCalle2: string }> {
        let entreCalle1 = '';
        let entreCalle2 = '';

        try {
            const offset = 0.0006;
            const directions = [
                { lat: lat + offset, lon: lon },
                { lat: lat - offset, lon: lon },
                { lat: lat, lon: lon + offset },
                { lat: lat, lon: lon - offset }
            ];

            const mainRoadNorm = this.normalizeStreetName(mainRoad);
            const uniqueStreets = new Set<string>();

            // ⭐ FETCH CON TIMEOUT PARA CADA DIRECCIÓN
            const promises = directions.map(async (dir) => {
                try {
                    const url = `https://nominatim.openstreetmap.org/reverse?lat=${dir.lat}&lon=${dir.lon}&format=json&addressdetails=1`;
                    const response = await this.fetchWithTimeout(url, {
                        headers: {
                            'Accept-Language': 'es',
                            'User-Agent': 'SaludCasaApp/1.0'
                        }
                    }, 5000);

                    const data = await response.json();
                    if (data && data.address) {
                        const road = data.address.road || data.address.pedestrian || data.address.footway || data.address.path || data.address.suburb || '';
                        if (road) {
                            const normRoad = this.normalizeStreetName(road);
                            if (normRoad !== mainRoadNorm && normRoad.length > 0) {
                                uniqueStreets.add(road);
                            }
                        }
                    }
                } catch (e: any) {
                    console.warn('⚠️ Error en findEntrecalles:', e.message);
                }
            });

            await Promise.all(promises);
            const arrStreets = Array.from(uniqueStreets);
            if (arrStreets[0]) entreCalle1 = arrStreets[0];
            if (arrStreets[1]) entreCalle2 = arrStreets[1];
        } catch (err: any) {
            console.warn('⚠️ Error en findEntrecalles:', err.message);
        }

        return { entreCalle1, entreCalle2 };
    }

    // ⭐ MÉTODO PARA LIMPIAR CACHÉ
    clearCache(): void {
        this.cache.clear();
        console.log('🗑️ Caché de geocoding limpiado');
    }
}