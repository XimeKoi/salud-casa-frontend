// src/app/services/data.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class DataService {
    private apiUrl = 'http://localhost:3000';

    constructor(private http: HttpClient) { }

    // ============================================
    // MÉTODOS PARA GEOJSON
    // ============================================

    getSeccionesGeoJSON(distrito: string, municipio: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/secciones/geojson?distrito=${distrito}&municipio=${municipio}`);
    }

    getManzanasGeoJSON(distrito: string, municipio: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/manzanas/geojson?distrito=${distrito}&municipio=${municipio}`);
    }

    // ============================================
    // MÉTODOS AGREGADOS PARA GEOCODING
    // ============================================

    // ⭐ AGREGAR ESTE MÉTODO
    getRawSeccionesGeoJSON(): Observable<any> {
        return this.http.get(`${this.apiUrl}/secciones/geojson`);
    }

    // ⭐ AGREGAR ESTE MÉTODO
    getPermisos(): any {
        const userData = localStorage.getItem('userData');
        if (userData) {
            try {
                const data = JSON.parse(userData);
                return {
                    distrito: data.distrito || null,
                    municipios: data.municipios || [],
                    secciones: data.secciones || []
                };
            } catch (e) {
                console.error('Error al cargar permisos:', e);
                return null;
            }
        }
        return null;
    }

    getManzanasGeoJSONBySeccion(distrito: string, municipio: string, seccion: string): Observable<any> {
        return this.http.get(`${this.apiUrl}/manzanas/geojson?distrito=${distrito}&municipio=${municipio}&seccion=${seccion}`);
    }

    // ============================================
    // MÉTODOS PARA LISTAS
    // ============================================

    getMunicipiosPorDistrito(distrito: string): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/municipios/${distrito}`);
    }

    getSecciones(distrito: string, municipio: string): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/secciones/${distrito}/${municipio}`);
    }

    getManzanas(distrito: string, municipio: string, seccion: string): Observable<any[]> {
        return this.http.get<any[]>(`${this.apiUrl}/manzanas/${distrito}/${municipio}/${seccion}`);
    }
}