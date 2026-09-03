// src/app/pages/dashboard-salud/dashboard-salud.component.ts

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardService } from '../../services/dashboard.service';

@Component({
    selector: 'app-dashboard-salud',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './dashboard-salud.component.html',
    styleUrls: ['./dashboard-salud.component.scss']
})
export class DashboardSaludComponent implements OnInit, OnDestroy {

    resumenGeneral = {
        visitasHoy: 0,
        metaDiaria: 15,
        coberturaTotal: 0,
        metaTotal: 300,
        porcentajeCobertura: 0
    };

    visitasDiarias: any[] = [];
    rendimientoZonas: any[] = [];
    historicoQuincenal: any[] = [];
    horariosZonas: any[] = [];
    zonasMayorAceptacion: any[] = [];
    zonasMayorRechazo: any[] = [];

    filtroZona: string = 'todas';
    zonasDisponibles: string[] = ['Los Manantiales', 'Los Naranjos', 'Santa Rosa', 'Real San José', 'Misión San José'];

    loading: boolean = false;
    error: string | null = null;
    ultimaActualizacion: Date = new Date();

    private intervalId: any = null;

    constructor(
        private dashboardService: DashboardService,
        private cdr: ChangeDetectorRef
    ) {
        console.log('📊 [DashboardSalud] Inicializando...');
    }

    ngOnInit() {
        this.cargarTodosLosDatos();
        this.intervalId = setInterval(() => this.cargarTodosLosDatos(), 300000);
    }

    ngOnDestroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    cargarTodosLosDatos() {
        this.loading = true;
        this.error = null;

        Promise.all([
            this.cargarResumenGeneral(),
            this.cargarVisitasDiarias(),
            this.cargarRendimientoZonas(),
            this.cargarHistoricoQuincenal(),
            this.cargarHorariosZonas(),
            this.cargarZonasAceptacionRechazo()
        ]).then(() => {
            this.loading = false;
            this.ultimaActualizacion = new Date();
            this.cdr.detectChanges();
        }).catch((err) => {
            console.error('❌ Error cargando datos del dashboard:', err);
            this.error = 'Error al cargar los datos. Intenta nuevamente.';
            this.loading = false;
            this.cdr.detectChanges();
        });
    }

    private async cargarResumenGeneral() {
        try {
            const data = await this.dashboardService.getResumenGeneral().toPromise();
            if (data) {
                this.resumenGeneral = {
                    ...data,
                    porcentajeCobertura: data.metaTotal ? ((data.coberturaTotal / data.metaTotal) * 100) : 0
                };
            }
        } catch (error) {
            console.warn('⚠️ Usando datos de respaldo para resumen general');
            this.resumenGeneral = this.dashboardService.getResumenGeneralFallback();
        }
    }

    private async cargarVisitasDiarias() {
        try {
            const data = await this.dashboardService.getVisitasDiarias().toPromise();
            this.visitasDiarias = data || this.dashboardService.getVisitasDiariasFallback();
        } catch (error) {
            console.warn('⚠️ Usando datos de respaldo para visitas diarias');
            this.visitasDiarias = this.dashboardService.getVisitasDiariasFallback();
        }
    }

    private async cargarRendimientoZonas() {
        try {
            const data = await this.dashboardService.getRendimientoZonas().toPromise();
            this.rendimientoZonas = data || [];
            if (this.rendimientoZonas.length > 0) {
                this.zonasDisponibles = this.rendimientoZonas.map(z => z.zona);
            }
        } catch (error) {
            console.warn('⚠️ Usando datos de respaldo para rendimiento por zona');
            this.rendimientoZonas = this.dashboardService.getRendimientoZonasFallback();
        }
    }

    private async cargarHistoricoQuincenal() {
        try {
            const data = await this.dashboardService.getHistoricoQuincenal().toPromise();
            this.historicoQuincenal = data || this.dashboardService.getHistoricoQuincenalFallback();
        } catch (error) {
            console.warn('⚠️ Usando datos de respaldo para histórico quincenal');
            this.historicoQuincenal = this.dashboardService.getHistoricoQuincenalFallback();
        }
    }

    private async cargarHorariosZonas() {
        try {
            const data = await this.dashboardService.getHorariosZonas().toPromise();
            this.horariosZonas = data || this.dashboardService.getHorariosZonasFallback();
        } catch (error) {
            console.warn('⚠️ Usando datos de respaldo para horarios por zona');
            this.horariosZonas = this.dashboardService.getHorariosZonasFallback();
        }
    }

    private async cargarZonasAceptacionRechazo() {
        try {
            const data = await this.dashboardService.getZonasAceptacionRechazo().toPromise();
            if (data) {
                this.zonasMayorAceptacion = data.mayorAceptacion || [];
                this.zonasMayorRechazo = data.mayorRechazo || [];
            }
        } catch (error) {
            console.warn('⚠️ Usando datos de respaldo para aceptación/rechazo');
            const fallback = this.dashboardService.getZonasAceptacionRechazoFallback();
            this.zonasMayorAceptacion = fallback.mayorAceptacion;
            this.zonasMayorRechazo = fallback.mayorRechazo;
        }
    }

    getColorPorcentaje(porcentaje: number): string {
        if (porcentaje >= 90) return '#2e7d32';
        if (porcentaje >= 70) return '#f57c00';
        return '#c62828';
    }

    getBgPorcentaje(porcentaje: number): string {
        if (porcentaje >= 90) return 'rgba(46, 125, 50, 0.12)';
        if (porcentaje >= 70) return 'rgba(245, 124, 0, 0.12)';
        return 'rgba(198, 40, 40, 0.12)';
    }

    getPorcentajeBarra(realizadas: number, meta: number): number {
        if (!meta || meta <= 0) return 0;
        const pct = (realizadas / meta) * 100;
        return Math.min(100, Math.max(4, Math.round(pct)));
    }

    calcularTotalVisitas(): number {
        return this.visitasDiarias.reduce((sum, d) => sum + d.realizadas, 0);
    }

    calcularPromedioDiario(): number {
        if (this.visitasDiarias.length === 0) return 0;
        return Math.round(this.calcularTotalVisitas() / this.visitasDiarias.length);
    }

    calcularCumplimientoPromedio(): number {
        if (this.visitasDiarias.length === 0) return 0;
        const total = this.visitasDiarias.reduce((sum, d) => sum + d.cumplimiento, 0);
        return Math.round(total / this.visitasDiarias.length);
    }

    getMejorDia(): string {
        if (this.visitasDiarias.length === 0) return '--';
        const mejor = this.visitasDiarias.reduce((a, b) => a.realizadas > b.realizadas ? a : b);
        return `${mejor.fecha} (${mejor.realizadas} visitas)`;
    }

    actualizarDatos() {
        this.cargarTodosLosDatos();
    }

    cambiarFiltroZona(zona: string) {
        this.filtroZona = zona;
        this.cdr.detectChanges();
    }

    getZonasFiltradas(): any[] {
        if (!this.filtroZona || this.filtroZona === 'todas') {
            return this.rendimientoZonas;
        }
        const buscada = this.filtroZona.trim().toLowerCase();
        return this.rendimientoZonas.filter(z => {
            const zn = (z.zona || '').trim().toLowerCase();
            return zn === buscada || zn.includes(buscada) || buscada.includes(zn);
        });
    }
}