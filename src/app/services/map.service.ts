// src/app/services/map.service.ts

import { Injectable } from '@angular/core';
import * as L from 'leaflet';

@Injectable({
    providedIn: 'root'
})
export class MapService {
    private map: L.Map | null = null;

    // ⭐ REGISTRAR EL MAPA
    setMap(map: L.Map): void {
        this.map = map;
        console.log('🗺️ Mapa registrado en MapService');
    }

    // ⭐ OBTENER EL MAPA
    getMap(): L.Map | null {
        return this.map;
    }

    // ⭐ VERIFICAR SI EL MAPA ESTÁ DISPONIBLE
    isMapReady(): boolean {
        return this.map !== null;
    }

    // ⭐ LIMPIAR EL MAPA
    clearMap(): void {
        this.map = null;
        console.log('🗑️ Mapa eliminado del servicio');
    }
}