// src/app/pages/enlace/pacientes/enlace-pacientes.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EnlaceService, EnfermeraResumen } from '../../../services/enlace.service';
import { PageHeaderNavComponent } from '../../../components/page-header-nav/page-header-nav';

@Component({
  selector: 'app-enlace-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, PageHeaderNavComponent],
  templateUrl: './enlace-pacientes.component.html',
  styleUrls: ['./enlace-pacientes.component.scss']
})
export class EnlacePacientesComponent implements OnInit {
  enfermeras: EnfermeraResumen[] = [];
  idEnfermeraSeleccionada: number = 1;
  enfermeraActual: EnfermeraResumen | null = null;

  todosLosPacientes: any[] = [];
  pacientesFiltrados: any[] = [];
  loading: boolean = true;

  // Paginación
  paginaActual: number = 1;
  pageSize: number = 12;
  pageSizes: number[] = [12, 24, 48];
  Math = Math;

  // Filtros
  searchTerm: string = '';
  filtroPrograma: string = 'todos'; // todos | PAM | PCD
  filtroEstatus: string = 'todos'; // todos | VISITADO | PENDIENTE | INCIDENCIA | RECHAZO | CAMBIO DE DOMICILIO | FINADO

  // Modal de detalle de paciente
  pacienteSeleccionado: any = null;
  mostrarModalPaciente: boolean = false;

  constructor(
    private enlaceService: EnlaceService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.enlaceService.getEnfermeras().subscribe(enfs => {
      this.enfermeras = enfs || [];

      this.route.queryParams.subscribe(params => {
        const enfParam = params['enfermera'];
        if (enfParam) {
          this.idEnfermeraSeleccionada = Number(enfParam);
        } else if (this.enfermeras.length > 0) {
          this.idEnfermeraSeleccionada = this.enfermeras[0].id;
        }
        this.cargarPacientes();
      });
    });
  }

  cargarDatos(): void {
    this.cargarPacientes();
  }

  cargarPacientes(): void {
    this.loading = true;
    const id = Number(this.idEnfermeraSeleccionada) || 1;
    this.enfermeraActual = this.enfermeras.find(e => e.id === id) || null;

    this.enlaceService.getPacientesPorEnfermera(id).subscribe({
      next: (pacs) => {
        this.todosLosPacientes = pacs;
        this.aplicarFiltros();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  seleccionarEnfermera(id: number): void {
    this.idEnfermeraSeleccionada = id;
    this.searchTerm = '';
    this.filtroPrograma = 'todos';
    this.filtroEstatus = 'todos';
    this.cargarPacientes();
  }

  verEnMapa(): void {
    sessionStorage.setItem('enlace_enfermera_mapa', String(this.idEnfermeraSeleccionada));
    this.router.navigate(['/dashboard']);
  }

  onEnfermeraChange(): void {
    this.cargarPacientes();
  }

  aplicarFiltros(): void {
    this.paginaActual = 1;
    const term = (this.searchTerm || '').trim().toLowerCase();

    this.pacientesFiltrados = this.todosLosPacientes.filter(p => {
      // Búsqueda textual
      const matchText = !term ||
        (p.nombreCompleto && p.nombreCompleto.toLowerCase().includes(term)) ||
        (p.curp && p.curp.toLowerCase().includes(term)) ||
        (p.direccion && p.direccion.toLowerCase().includes(term)) ||
        (p.colonia && p.colonia.toLowerCase().includes(term)) ||
        (p.telefono && p.telefono.includes(term));

      // Filtro de programa
      const prog = (p.programa || '').toUpperCase();
      const matchProg = this.filtroPrograma === 'todos' || prog === this.filtroPrograma;

      // Filtro de estatus
      const est = (p.estatus || '').toUpperCase();
      let matchEst = true;
      if (this.filtroEstatus !== 'todos') {
        matchEst = est.includes(this.filtroEstatus);
      }

      return matchText && matchProg && matchEst;
    });
  }

  get totalPaginas(): number {
    return Math.ceil(this.pacientesFiltrados.length / this.pageSize) || 1;
  }

  get pacientesPaginados(): any[] {
    const start = (this.paginaActual - 1) * this.pageSize;
    return this.pacientesFiltrados.slice(start, start + this.pageSize);
  }

  cambiarPageSize(size: any): void {
    this.pageSize = Number(size);
    this.paginaActual = 1;
  }

  cambiarPagina(pag: number): void {
    if (pag >= 1 && pag <= this.totalPaginas) {
      this.paginaActual = pag;
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }

  get paginasVisibles(): number[] {
    const maxVisible = 5;
    let start = Math.max(1, this.paginaActual - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPaginas, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    const arr = [];
    for (let i = start; i <= end; i++) {
      arr.push(i);
    }
    return arr;
  }

  get totalPam(): number {
    return this.pacientesFiltrados.filter(p => (p.programa || '').toUpperCase() === 'PAM').length;
  }

  get totalPcd(): number {
    return this.pacientesFiltrados.filter(p => (p.programa || '').toUpperCase() === 'PCD').length;
  }

  verDetallePaciente(p: any): void {
    this.pacienteSeleccionado = p;
    this.mostrarModalPaciente = true;
  }

  cerrarModal(): void {
    this.mostrarModalPaciente = false;
    this.pacienteSeleccionado = null;
  }

  navegarA(ruta: string): void {
    this.router.navigate([ruta]);
  }

  getIniciales(nombre: string): string {
    if (!nombre) return 'PA';
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) {
      return (partes[0][0] + partes[1][0]).toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
  }
}

