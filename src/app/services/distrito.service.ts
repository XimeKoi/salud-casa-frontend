import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Distrito {
    id: number;
    nombre: string;
    lat: number;
    lng: number;
    zoom: number;
    idEnfermera: number;
    secciones?: string[];
}

@Injectable({
    providedIn: 'root'
})
export class DistritoService {
    // ⭐ CAMBIADO: Distrito 11 en lugar de 3
    private distritoActual: Distrito = {
        id: 11,
        nombre: 'Distrito 11',
        lat: 21.1165,
        lng: -101.6865,
        zoom: 15,
        idEnfermera: 1,
        secciones: ['277']
    };

    private distritoSubject = new BehaviorSubject<Distrito>(this.distritoActual);
    distrito$ = this.distritoSubject.asObservable();

    constructor() {
        console.log(`📌 Distrito actual: ${this.distritoActual.nombre}`);
    }

    getDistritoActual(): Distrito {
        return this.distritoActual;
    }

    getDistritos(): Distrito[] {
        return [this.distritoActual];
    }

    setDistrito(id: number): void {
        if (id === 11) {
            this.distritoSubject.next(this.distritoActual);
        }
    }
}