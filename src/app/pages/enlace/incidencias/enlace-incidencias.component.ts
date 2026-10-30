// src/app/pages/enlace/incidencias/enlace-incidencias.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { EnlaceService, EnfermeraResumen, IncidenciaEnlace } from '../../../services/enlace.service';
import { PageHeaderNavComponent } from '../../../components/page-header-nav/page-header-nav';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-enlace-incidencias',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderNavComponent],
  templateUrl: './enlace-incidencias.component.html',
  styleUrls: ['./enlace-incidencias.component.scss']
})
export class EnlaceIncidenciasComponent implements OnInit {
  incidencias: IncidenciaEnlace[] = [];
  incidenciasFiltradas: IncidenciaEnlace[] = [];
  enfermeras: EnfermeraResumen[] = [];
  loading: boolean = true;

  // Filtros
  searchTerm: string = '';
  filtroEnfermera: string = 'todas';
  filtroTipo: string = 'todos';
  filtroEstado: string = 'todos'; // todos | pendiente | resuelta

  // Modal Lightbox de Foto
  fotoSeleccionada: string | null = null;
  mostrarModalFoto: boolean = false;

  // Modal Detalle de Incidencia
  incidenciaDetalle: IncidenciaEnlace | null = null;
  mostrarModalDetalle: boolean = false;

  constructor(
    private enlaceService: EnlaceService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.cargarDatos();
  }

  cargarDatos(): void {
    this.loading = true;

    this.enlaceService.getEnfermeras().subscribe(enfs => {
      this.enfermeras = enfs;
    });

    this.enlaceService.getIncidencias().subscribe({
      next: (data) => {
        this.incidencias = data;
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

    this.incidenciasFiltradas = this.incidencias.filter(inc => {
      // Texto
      const matchText = !term ||
        (inc.descripcion && inc.descripcion.toLowerCase().includes(term)) ||
        (inc.direccion && inc.direccion.toLowerCase().includes(term)) ||
        (inc.datosPaciente?.nombre && inc.datosPaciente.nombre.toLowerCase().includes(term)) ||
        (inc.enfermeraNombre && inc.enfermeraNombre.toLowerCase().includes(term));

      // Enfermera
      const matchEnf = this.filtroEnfermera === 'todas' ||
        String(inc.enfermeraId) === this.filtroEnfermera;

      // Tipo
      const matchTipo = this.filtroTipo === 'todos' ||
        (inc.tipo && inc.tipo.toLowerCase() === this.filtroTipo.toLowerCase());

      // Estado
      const matchEstado = this.filtroEstado === 'todos' ||
        (inc.estado && inc.estado.toLowerCase() === this.filtroEstado.toLowerCase());

      return matchText && matchEnf && matchTipo && matchEstado;
    });
  }

  abrirFoto(fotoUrl: string): void {
    this.fotoSeleccionada = fotoUrl;
    this.mostrarModalFoto = true;
  }

  cerrarModalFoto(): void {
    this.mostrarModalFoto = false;
    this.fotoSeleccionada = null;
  }

  abrirDetalle(inc: IncidenciaEnlace): void {
    this.incidenciaDetalle = inc;
    this.mostrarModalDetalle = true;
  }

  cerrarModalDetalle(): void {
    this.mostrarModalDetalle = false;
    this.incidenciaDetalle = null;
  }

  marcarAtendida(inc: IncidenciaEnlace): void {
    inc.resuelta = true;
    inc.estado = 'resuelta';
    this.aplicarFiltros();
    Swal.fire({
      icon: 'success',
      title: 'Incidencia Actualizada',
      text: 'Se ha registrado la revisión y seguimiento de supervisión.',
      timer: 2000,
      showConfirmButton: false
    });
  }

  abrirEnGoogleMaps(direccion: string): void {
    if (!direccion) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
    window.open(url, '_blank');
  }

  navegarA(ruta: string): void {
    this.router.navigate([ruta]);
  }

  getTipoLabel(tipo: string): string {
    switch (tipo?.toLowerCase()) {
      case 'no_localizado': return 'No Localizado';
      case 'rechazo': return 'Rechazo de Visita';
      case 'cambio_domicilio': return 'Cambio de Domicilio';
      case 'finado': return 'Defunción / Finado';
      case 'zona_insegura': return 'Zona de Difícil Acceso';
      default: return 'Incidencia Operativa';
    }
  }
}
