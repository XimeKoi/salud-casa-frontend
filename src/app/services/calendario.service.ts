// src/app/services/calendario.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface VisitaData {
    pacienteId: number;
    nombre: string;
    telefono: string;
    direccion: string;
    curp: string;
    colonia?: string;
    fecha?: string;
    hora?: string;
    prioridad?: 'alta' | 'media' | 'baja';
    notas?: string;
}

@Injectable({
    providedIn: 'root'
})
export class CalendarioService {
    private visitaDataSubject = new BehaviorSubject<VisitaData | null>(null);
    visitaData$ = this.visitaDataSubject.asObservable();

    private storageKey = 'visitas_programadas';
    private visitasProgramadas: any[] = [];

    constructor() {
        this.cargarVisitas();
    }

    setVisitaData(data: VisitaData) {
        this.visitaDataSubject.next(data);
    }

    getVisitaData(): VisitaData | null {
        return this.visitaDataSubject.getValue();
    }

    clearVisitaData() {
        this.visitaDataSubject.next(null);
    }

    hasVisitaData(): boolean {
        return this.visitaDataSubject.getValue() !== null;
    }

    // ⭐ MÉTODO SEGURO PARA OBTENER DATOS
    private obtenerStorage(): any {
        try {
            // @ts-ignore - Ignorar error de TypeScript para localStorage
            return localStorage;
        } catch (e) {
            return null;
        }
    }

    private cargarVisitas() {
        try {
            const storage = this.obtenerStorage();
            if (storage) {
                const datos = storage.getItem(this.storageKey);
                if (datos) {
                    this.visitasProgramadas = JSON.parse(datos);
                } else {
                    this.visitasProgramadas = this.obtenerVisitasEjemplo();
                    this.guardarVisitas();
                }
            } else {
                this.visitasProgramadas = this.obtenerVisitasEjemplo();
            }
        } catch (e) {
            this.visitasProgramadas = this.obtenerVisitasEjemplo();
        }
    }

    private obtenerVisitasEjemplo(): any[] {
        const hoy = new Date();
        const hoyStr = hoy.toISOString().split('T')[0];
        const manana = new Date(hoy);
        manana.setDate(manana.getDate() + 1);
        const mananaStr = manana.toISOString().split('T')[0];

        return [
            {
                id: Date.now() + 1,
                pacienteId: 30,
                pacienteNombre: 'SOLIS SOLIS ELOY',
                pacienteCurp: 'SOSE470605HGTLLL01',
                pacienteDireccion: 'SAN JOSE #208, COL. SANTA ROSA DE LIMA, LEON, GTO',
                pacienteTelefono: '4773975192',
                fecha: hoyStr,
                hora: '10:00',
                estado: 'pendiente',
                notas: 'Primera visita',
                prioridad: 'media'
            },
            {
                id: Date.now() + 2,
                pacienteId: 148,
                pacienteNombre: 'ADOLFO',
                pacienteCurp: '',
                pacienteDireccion: 'FRAY BERNARDO QUINTAVALLE 131. COL FRANCCIONAMIENTO REAL DE SAN JOSE',
                pacienteTelefono: '4773300505',
                fecha: mananaStr,
                hora: '14:30',
                estado: 'pendiente',
                notas: 'Visita de seguimiento',
                prioridad: 'alta'
            }
        ];
    }

    private guardarVisitas() {
        try {
            const storage = this.obtenerStorage();
            if (storage) {
                storage.setItem(this.storageKey, JSON.stringify(this.visitasProgramadas));
            }
        } catch (e) {
            // Error al guardar
        }
    }

    getVisitasProgramadas(): any[] {
        return this.visitasProgramadas;
    }

    setVisitasProgramadas(visitas: any[]) {
        this.visitasProgramadas = visitas;
        this.guardarVisitas();
    }

    agregarVisita(visita: any) {
        this.visitasProgramadas.push(visita);
        this.guardarVisitas();
    }

    eliminarVisita(id: number) {
        this.visitasProgramadas = this.visitasProgramadas.filter(v => v.id !== id);
        this.guardarVisitas();
    }

    actualizarVisita(id: number, datos: any) {
        const index = this.visitasProgramadas.findIndex(v => v.id === id);
        if (index !== -1) {
            this.visitasProgramadas[index] = { ...this.visitasProgramadas[index], ...datos };
            this.guardarVisitas();
        }
    }

    limpiarTodasLasVisitas() {
        this.visitasProgramadas = [];
        this.guardarVisitas();
        try {
            const storage = this.obtenerStorage();
            if (storage) {
                storage.removeItem(this.storageKey);
            }
        } catch (e) {
            // Error
        }
    }
}