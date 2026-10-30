// src/app/pages/enlace/rendimiento/enlace-rendimiento.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EnlaceService, EnfermeraResumen, ResumenGlobalEnlace } from '../../../services/enlace.service';
import { PageHeaderNavComponent } from '../../../components/page-header-nav/page-header-nav';

@Component({
  selector: 'app-enlace-rendimiento',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderNavComponent],
  templateUrl: './enlace-rendimiento.component.html',
  styleUrls: ['./enlace-rendimiento.component.scss']
})
export class EnlaceRendimientoComponent implements OnInit {
  enfermeras: EnfermeraResumen[] = [];
  resumenGlobal: ResumenGlobalEnlace | null = null;
  idEnfermeraSeleccionada: number | 'todas' = 'todas';
  enfermeraDetalle: EnfermeraResumen | null = null;
  loading: boolean = true;
  periodoSeleccionado: string = 'quincenal';

  constructor(
    private enlaceService: EnlaceService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const enfParam = params['enfermera'];
      if (enfParam) {
        this.idEnfermeraSeleccionada = Number(enfParam);
      }
      this.cargarDatos();
    });
  }

  cargarDatos(): void {
    this.loading = true;

    this.enlaceService.getResumenGlobal().subscribe(res => {
      this.resumenGlobal = res;
    });

    this.enlaceService.getEnfermeras().subscribe({
      next: (data) => {
        this.enfermeras = data;
        this.actualizarEnfermeraSeleccionada();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  onEnfermeraChange(): void {
    this.actualizarEnfermeraSeleccionada();
  }

  private actualizarEnfermeraSeleccionada(): void {
    if (this.idEnfermeraSeleccionada === 'todas') {
      this.enfermeraDetalle = null;
    } else {
      this.enfermeraDetalle = this.enfermeras.find(e => e.id === Number(this.idEnfermeraSeleccionada)) || null;
    }
  }

  verPacientesDeEnfermera(idEnfermera: number): void {
    this.router.navigate(['/enlace/pacientes'], { queryParams: { enfermera: idEnfermera } });
  }

  navegarA(ruta: string): void {
    this.router.navigate([ruta]);
  }

  getPorcentajeBarra(valor: number, max: number): number {
    if (!max || max <= 0) return 0;
    return Math.min(100, Math.round((valor / max) * 100));
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
