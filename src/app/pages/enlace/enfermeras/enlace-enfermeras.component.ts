// src/app/pages/enlace/enfermeras/enlace-enfermeras.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { EnlaceService, EnfermeraResumen } from '../../../services/enlace.service';
import { PageHeaderNavComponent } from '../../../components/page-header-nav/page-header-nav';

@Component({
  selector: 'app-enlace-enfermeras',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderNavComponent],
  templateUrl: './enlace-enfermeras.component.html',
  styleUrls: ['./enlace-enfermeras.component.scss']
})
export class EnlaceEnfermerasComponent implements OnInit {
  enfermeras: EnfermeraResumen[] = [];
  enfermerasFiltradas: EnfermeraResumen[] = [];
  loading: boolean = true;
  searchTerm: string = '';
  filtroZs: string = 'todas';

  // Modal de Expediente de Enfermera
  enfermeraSeleccionada: EnfermeraResumen | null = null;
  mostrarModalExpediente: boolean = false;

  constructor(
    private enlaceService: EnlaceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.cargarEnfermeras();
  }

  cargarEnfermeras(): void {
    this.loading = true;
    this.enlaceService.getEnfermeras().subscribe({
      next: (data) => {
        this.enfermeras = data;
        this.aplicarFiltros();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  aplicarFiltros(): void {
    const term = (this.searchTerm || '').trim().toLowerCase();
    this.enfermerasFiltradas = this.enfermeras.filter(enf => {
      // Filtro de texto
      const matchText = !term ||
        (enf.nombre_completo && enf.nombre_completo.toLowerCase().includes(term)) ||
        (enf.zona && enf.zona.toLowerCase().includes(term)) ||
        (enf.id_interno && enf.id_interno.toLowerCase().includes(term)) ||
        (enf.telefono && enf.telefono.includes(term));

      // Filtro ZS
      const matchZs = this.filtroZs === 'todas' ||
        String(enf.zs) === this.filtroZs;

      return matchText && matchZs;
    });
  }

  abrirExpediente(enf: EnfermeraResumen): void {
    this.enfermeraSeleccionada = enf;
    this.mostrarModalExpediente = true;
  }

  cerrarModal(): void {
    this.mostrarModalExpediente = false;
    this.enfermeraSeleccionada = null;
  }

  verPacientes(enf: EnfermeraResumen): void {
    this.cerrarModal();
    this.router.navigate(['/enlace/pacientes'], { queryParams: { enfermera: enf.id } });
  }

  verRendimiento(enf: EnfermeraResumen): void {
    this.cerrarModal();
    this.router.navigate(['/enlace/rendimiento'], { queryParams: { enfermera: enf.id } });
  }

  navegarA(ruta: string): void {
    this.router.navigate([ruta]);
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

