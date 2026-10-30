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
  idEnfermeraSeleccionada: number | 'todas' = 'todas';

  todosLosPacientes: any[] = [];
  pacientesFiltrados: any[] = [];
  loading: boolean = true;

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
      this.enfermeras = enfs;

      this.route.queryParams.subscribe(params => {
        const enfParam = params['enfermera'];
        if (enfParam) {
          this.idEnfermeraSeleccionada = Number(enfParam);
        } else {
          this.idEnfermeraSeleccionada = 1; // Por defecto cargar enfermera 1 para agilidad
        }
        this.cargarPacientes();
      });
    });
  }

  cargarPacientes(): void {
    this.loading = true;

    if (this.idEnfermeraSeleccionada === 'todas') {
      // Cargar primeros pacientes de enfermeras 1, 2, 8 para muestra global inicial
      this.enlaceService.getPacientesPorEnfermera(1).subscribe(p1 => {
        this.enlaceService.getPacientesPorEnfermera(8).subscribe(p8 => {
          this.todosLosPacientes = [...p1, ...p8];
          this.aplicarFiltros();
          this.loading = false;
        });
      });
    } else {
      const id = Number(this.idEnfermeraSeleccionada);
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
  }

  onEnfermeraChange(): void {
    this.cargarPacientes();
  }

  aplicarFiltros(): void {
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
}
