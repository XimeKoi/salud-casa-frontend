// src/app/services/notificaciones.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Notificacion {
    id: number;
    titulo: string;
    mensaje: string;
    tipo: string;
    prioridad: string;
    leida: boolean;
    metadata: any;
    url?: string;
    createdAt: string;
    tiempo?: string;
}

@Injectable({
    providedIn: 'root'
})
export class NotificacionesService {
    private notificacionesSubject = new BehaviorSubject<Notificacion[]>([]);
    private contadorSubject = new BehaviorSubject<any>({ total: 0, noLeidas: 0, urgentes: 0 });

    // ⭐⭐⭐ USAR ENVIRONMENT ⭐⭐⭐
    private apiUrl = environment.apiUrl;

    private usuarioId: number = 1;
    private allNotificaciones: Notificacion[] = [];
    private pageSize: number = 10;
    private currentPage: number = 1;
    private hasMore: boolean = true;
    private totalItems: number = 0;

    constructor(private http: HttpClient) {
        console.log('🌍 [NotificacionesService] API URL:', this.apiUrl);
        this.cargarNotificaciones();
        interval(30000).subscribe(() => this.cargarNotificaciones());
    }

    getNotificacionesSnapshot(): Notificacion[] {
        return this.notificacionesSubject.getValue();
    }

    cargarNotificaciones() {
        console.log('📡 Servicio: Cargando notificaciones...');
        this.currentPage = 1;
        this.allNotificaciones = [];
        this.hasMore = true;
        this.totalItems = 0;

        this.obtenerNotificaciones().subscribe({
            next: (response: any) => {
                let data: Notificacion[] = [];
                let total: number = 0;

                if (response && response.data && Array.isArray(response.data)) {
                    data = response.data;
                    total = response.total || response.data.length;
                } else if (Array.isArray(response)) {
                    data = response;
                    total = response.length;
                }

                this.allNotificaciones = data;
                this.totalItems = total;
                this.hasMore = data.length > this.pageSize;
                this.mostrarPagina(1);

                if (data.length > 0) {
                    localStorage.setItem('notificacionesCache', JSON.stringify(data));
                }
            },
            error: (error) => {
                console.error('❌ Servicio: Error cargando notificaciones:', error);
                const cached = localStorage.getItem('notificacionesCache');
                if (cached) {
                    try {
                        const data = JSON.parse(cached);
                        this.allNotificaciones = data;
                        this.totalItems = data.length;
                        this.hasMore = data.length > this.pageSize;
                        this.mostrarPagina(1);
                    } catch (e) {
                        console.error('Error al cargar caché:', e);
                    }
                }
            }
        });

        this.obtenerContador().subscribe({
            next: (data) => {
                if (data) {
                    this.contadorSubject.next(data);
                }
            },
            error: (error) => {
                console.error('Error cargando contador:', error);
            }
        });
    }

    mostrarPagina(page: number) {
        const start = (page - 1) * this.pageSize;
        const end = Math.min(start + this.pageSize, this.allNotificaciones.length);
        const pageData = this.allNotificaciones.slice(start, end);
        this.notificacionesSubject.next(pageData);
        this.currentPage = page;
        this.hasMore = end < this.allNotificaciones.length;
    }

    cargarMasNotificaciones() {
        if (!this.hasMore) return;
        this.currentPage++;
        this.mostrarPagina(this.currentPage);
    }

    obtenerContador(): Observable<any> {
        return this.http.get(`${this.apiUrl}/notificaciones/contador/${this.usuarioId}`);
    }

    obtenerNotificaciones(): Observable<any> {
        return this.http.get(`${this.apiUrl}/notificaciones/usuario/${this.usuarioId}`);
    }

    getNotificaciones(): Observable<Notificacion[]> {
        return this.notificacionesSubject.asObservable();
    }

    getContador(): Observable<any> {
        return this.contadorSubject.asObservable();
    }

    marcarLeida(id: number): Observable<any> {
        return this.http.patch(`${this.apiUrl}/notificaciones/${id}/leida`, {
            usuarioId: this.usuarioId
        });
    }

    marcarTodasLeidas(): Observable<any> {
        return this.http.patch(`${this.apiUrl}/notificaciones/usuario/${this.usuarioId}/leidas`, {});
    }

    eliminarNotificacion(id: number): Observable<any> {
        return this.http.delete(`${this.apiUrl}/notificaciones/${id}`, {
            body: { usuarioId: this.usuarioId }
        });
    }

    cambiarEstado(id: number, leida: boolean): Observable<any> {
        return this.http.patch(`${this.apiUrl}/notificaciones/${id}/estado`, {
            leida,
            usuarioId: this.usuarioId
        });
    }

    setUsuarioId(id: number) {
        this.usuarioId = id;
        this.cargarNotificaciones();
    }

    resetPagination() {
        this.currentPage = 1;
        this.hasMore = true;
    }

    getHasMore(): boolean {
        return this.hasMore;
    }

    getTotalItems(): number {
        return this.totalItems;
    }
}