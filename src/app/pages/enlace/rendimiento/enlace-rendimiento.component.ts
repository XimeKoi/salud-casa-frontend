// src/app/pages/enlace/rendimiento/enlace-rendimiento.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { EnlaceService, EnfermeraResumen, ResumenGlobalEnlace } from '../../../services/enlace.service';
import { PageHeaderNavComponent } from '../../../components/page-header-nav/page-header-nav';
import Swal from 'sweetalert2';

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
  periodoSeleccionado: string = 'hoy';

  // Filtros, búsqueda y orden
  busqueda: string = '';
  filtroEstado: 'todos' | 'cumplida' | 'progreso' | 'bajos' | 'incidencias' = 'todos';
  ordenCampo: 'nombre' | 'visitasHoy' | 'cumplimiento' | 'padron' | 'incidencias' = 'visitasHoy';
  ordenAsc: boolean = false;

  // Paginación
  paginaActual: number = 1;
  pageSize: number = 6;
  pageSizeOptions: number[] = [4, 6, 10, 20];
  Math = Math;

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
    this.paginaActual = 1;
  }

  private actualizarEnfermeraSeleccionada(): void {
    if (this.idEnfermeraSeleccionada === 'todas') {
      this.enfermeraDetalle = null;
    } else {
      this.enfermeraDetalle = this.enfermeras.find(e => e.id === Number(this.idEnfermeraSeleccionada)) || null;
    }
  }

  // Getters para filtros y paginación
  get enfermerasFiltradas(): EnfermeraResumen[] {
    let list = [...this.enfermeras];

    if (this.idEnfermeraSeleccionada !== 'todas') {
      const e = list.find(item => item.id === Number(this.idEnfermeraSeleccionada));
      return e ? [e] : [];
    }

    if (this.busqueda && this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase().trim();
      list = list.filter(e =>
        e.nombre_completo.toLowerCase().includes(q) ||
        e.zona.toLowerCase().includes(q) ||
        (e.id_interno && e.id_interno.toLowerCase().includes(q))
      );
    }

    if (this.filtroEstado === 'cumplida') {
      list = list.filter(e => e.visitasHoy >= e.metaDiaria);
    } else if (this.filtroEstado === 'progreso') {
      list = list.filter(e => e.visitasHoy < e.metaDiaria && e.progresoPct >= 50);
    } else if (this.filtroEstado === 'bajos') {
      list = list.filter(e => e.progresoPct < 50);
    } else if (this.filtroEstado === 'incidencias') {
      list = list.filter(e => (e.incidencias || 0) > 0);
    }

    list.sort((a, b) => {
      let valA: any = a.visitasHoy;
      let valB: any = b.visitasHoy;

      if (this.ordenCampo === 'nombre') {
        valA = a.nombre_completo;
        valB = b.nombre_completo;
        return this.ordenAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (this.ordenCampo === 'cumplimiento') {
        valA = a.metaDiaria ? (a.visitasHoy / a.metaDiaria) : 0;
        valB = b.metaDiaria ? (b.visitasHoy / b.metaDiaria) : 0;
      } else if (this.ordenCampo === 'padron') {
        valA = a.totalPacientes || 0;
        valB = b.totalPacientes || 0;
      } else if (this.ordenCampo === 'incidencias') {
        valA = a.incidencias || 0;
        valB = b.incidencias || 0;
      }

      if (valA < valB) return this.ordenAsc ? -1 : 1;
      if (valA > valB) return this.ordenAsc ? 1 : -1;
      return 0;
    });

    return list;
  }

  get totalPaginas(): number {
    return Math.ceil(this.enfermerasFiltradas.length / this.pageSize) || 1;
  }

  get enfermerasPaginadas(): EnfermeraResumen[] {
    const start = (this.paginaActual - 1) * this.pageSize;
    return this.enfermerasFiltradas.slice(start, start + this.pageSize);
  }

  get paginasArray(): number[] {
    const total = this.totalPaginas;
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  get totalCumplidas(): number {
    return this.enfermeras.filter(e => e.visitasHoy >= e.metaDiaria).length;
  }

  get totalEnProgreso(): number {
    return this.enfermeras.filter(e => e.visitasHoy < e.metaDiaria).length;
  }

  get totalConIncidencias(): number {
    return this.enfermeras.filter(e => (e.incidencias || 0) > 0).length;
  }

  get totalBajoRendimiento(): number {
    return this.enfermeras.filter(e => e.progresoPct < 50).length;
  }

  get enfermerasBajoRendimiento(): EnfermeraResumen[] {
    return [...this.enfermeras]
      .sort((a, b) => a.progresoPct - b.progresoPct)
      .slice(0, 3);
  }

  get porcentajeCumplimientoGlobal(): number {
    const metaTotal = (this.resumenGlobal?.metaTotalDiaria) || (this.enfermeras.length * 15);
    const visitasHoy = (this.resumenGlobal?.visitasHoyTotal) || 0;
    return metaTotal > 0 ? Math.round((visitasHoy / metaTotal) * 100) : 0;
  }

  cambiarPagina(pag: number): void {
    if (pag >= 1 && pag <= this.totalPaginas) {
      this.paginaActual = pag;
    }
  }

  cambiarPageSize(size: number): void {
    this.pageSize = size;
    this.paginaActual = 1;
  }

  cambiarOrden(campo: 'nombre' | 'visitasHoy' | 'cumplimiento' | 'padron' | 'incidencias'): void {
    if (this.ordenCampo === campo) {
      this.ordenAsc = !this.ordenAsc;
    } else {
      this.ordenCampo = campo;
      this.ordenAsc = false;
    }
  }

  setFiltroEstado(estado: 'todos' | 'cumplida' | 'progreso' | 'bajos' | 'incidencias'): void {
    this.filtroEstado = estado;
    this.paginaActual = 1;
  }

  onBusquedaChange(): void {
    this.paginaActual = 1;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroEstado = 'todos';
    this.idEnfermeraSeleccionada = 'todas';
    this.actualizarEnfermeraSeleccionada();
    this.paginaActual = 1;
  }

  contactarEnfermera(enf: EnfermeraResumen): void {
    const tel = enf.telefono || '4771596959';
    Swal.fire({
      title: `Supervisión: ${enf.nombre_completo}`,
      html: `
        <div style="text-align: left; font-size: 13.5px; color: #1e293b; line-height: 1.6;">
          <p style="margin-bottom: 8px;"><strong>Zona:</strong> ${enf.zona} (ZS ${enf.zs})</p>
          <p style="margin-bottom: 8px;"><strong>Teléfono:</strong> ${tel}</p>
          <p style="margin-bottom: 8px;"><strong>Avance Hoy:</strong> ${enf.visitasHoy} / ${enf.metaDiaria} visitas (${Math.round((enf.visitasHoy/enf.metaDiaria)*100)}%)</p>
          <p style="margin-bottom: 12px;"><strong>Incidencias reportadas:</strong> ${enf.incidencias}</p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: '<i class="fab fa-whatsapp"></i> Enviar WhatsApp',
      cancelButtonText: '<i class="fas fa-phone"></i> Llamar',
      confirmButtonColor: '#25D366',
      cancelButtonColor: '#7A192B'
    }).then(result => {
      if (result.isConfirmed) {
        const url = `https://wa.me/52${tel.replace(/\D/g, '')}?text=${encodeURIComponent('Hola ' + enf.nombre_completo + ', me comunico desde la supervisión de Enlace Salud Casa por Casa.')}`;
        window.open(url, '_blank');
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        window.location.href = `tel:${tel.replace(/\D/g, '')}`;
      }
    });
  }

  verPacientesDeEnfermera(idEnfermera: number): void {
    this.router.navigate(['/enlace/pacientes'], { queryParams: { enfermera: idEnfermera } });
  }

  verIncidenciasDeEnfermera(idEnfermera: number): void {
    this.router.navigate(['/enlace/incidencias'], { queryParams: { enfermera: idEnfermera } });
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
