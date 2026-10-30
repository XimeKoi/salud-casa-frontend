// src/app/pages/enlace/dashboard/enlace-dashboard.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { EnlaceService, EnfermeraResumen, ResumenGlobalEnlace, IncidenciaEnlace } from '../../../services/enlace.service';
import { PageHeaderNavComponent } from '../../../components/page-header-nav/page-header-nav';

@Component({
  selector: 'app-enlace-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, PageHeaderNavComponent],
  templateUrl: './enlace-dashboard.component.html',
  styleUrls: ['./enlace-dashboard.component.scss']
})
export class EnlaceDashboardComponent implements OnInit {
  usuarioEnlace: any = null;
  resumen: ResumenGlobalEnlace | null = null;
  enfermeras: EnfermeraResumen[] = [];
  incidenciasRecientes: IncidenciaEnlace[] = [];
  loading: boolean = true;
  ultimaActualizacion: Date = new Date();

  // Tab activo de navegación
  tabActivo: string = 'dashboard';

  constructor(
    private enlaceService: EnlaceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.usuarioEnlace = this.enlaceService.getUsuarioEnlace();
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.loading = true;
    this.enlaceService.limpiarCache();

    this.enlaceService.getResumenGlobal().subscribe({
      next: (res) => {
        this.resumen = res;
      }
    });

    this.enlaceService.getEnfermeras().subscribe({
      next: (data) => {
        this.enfermeras = data;
        this.loading = false;
        this.ultimaActualizacion = new Date();
      },
      error: () => {
        this.loading = false;
      }
    });

    this.enlaceService.getIncidencias().subscribe({
      next: (incs) => {
        this.incidenciasRecientes = incs.slice(0, 4);
      }
    });
  }

  navegarA(ruta: string): void {
    this.router.navigate([ruta]);
  }

  verPacientesDeEnfermera(idEnfermera: number): void {
    this.router.navigate(['/enlace/pacientes'], { queryParams: { enfermera: idEnfermera } });
  }

  verRendimientoDeEnfermera(idEnfermera: number): void {
    this.router.navigate(['/enlace/rendimiento'], { queryParams: { enfermera: idEnfermera } });
  }

  getIniciales(nombre: string): string {
    if (!nombre) return 'EN';
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
  }
}

