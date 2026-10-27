// src/app/components/mi-ruta-sheet/mi-ruta-sheet.component.ts

import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { VisitasHoyService, PacientePlanHoy, JornadaHistorial } from '../../services/visitas-hoy.service';
import { PacientesMapService } from '../../services/pacientes-map.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-mi-ruta-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mi-ruta-sheet.component.html',
  styleUrls: ['./mi-ruta-sheet.component.scss']
})
export class MiRutaSheetComponent implements OnInit, OnDestroy {
  sheetAbierto: boolean = false;
  planHoy: PacientePlanHoy[] = [];
  historialJornadas: JornadaHistorial[] = [];
  fechaHoyTexto: string = '';

  // Pestañas del modal: 'ruta' | 'buscar' | 'historial'
  tabActiva: 'ruta' | 'buscar' | 'historial' = 'ruta';

  // Buscador integrado para agregar pacientes
  busquedaQuery: string = '';
  todosPacientes: any[] = [];
  pacientesEncontrados: any[] = [];
  cargandoPacientesBusqueda: boolean = false;

  // Filtro por Zonas / Colonias
  coloniaSeleccionada: string = '';
  coloniasDisponibles: { nombre: string; total: number }[] = [];

  // Historial desplegable
  jornadaExpandidaId: string | null = null;

  private subs: Subscription = new Subscription();

  constructor(
    public visitasHoyService: VisitasHoyService,
    private pacientesMapService: PacientesMapService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.generarFechaHoy();
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.sheetAbierto) {
      this.cerrarSheet();
    }
  }

  ngOnInit() {
    this.subs.add(
      this.visitasHoyService.plan$.subscribe(plan => {
        this.planHoy = plan;
        this.cdr.markForCheck();
      })
    );

    this.subs.add(
      this.visitasHoyService.historial$.subscribe(hist => {
        this.historialJornadas = hist;
        this.cdr.markForCheck();
      })
    );

    if (typeof window !== 'undefined') {
      window.addEventListener('abrirMiRutaHoy', () => this.abrirSheet());
      window.addEventListener('cerrarMiRutaHoy', () => this.cerrarSheet());
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  private generarFechaHoy() {
    const ahora = new Date();
    const opciones: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    };
    const formateada = ahora.toLocaleDateString('es-MX', opciones);
    this.fechaHoyTexto = formateada.charAt(0).toUpperCase() + formateada.slice(1);
  }

  toggleSheet() {
    this.sheetAbierto = !this.sheetAbierto;
    if (this.sheetAbierto && this.todosPacientes.length === 0) {
      this.precargarPacientesParaBusqueda();
    }
    this.cdr.markForCheck();
  }

  abrirSheet(tab?: 'ruta' | 'buscar' | 'historial') {
    this.sheetAbierto = true;
    if (tab) {
      this.tabActiva = tab;
    }
    if (this.todosPacientes.length === 0) {
      this.precargarPacientesParaBusqueda();
    }
    this.cdr.markForCheck();
  }

  cerrarSheet() {
    this.sheetAbierto = false;
    this.cdr.markForCheck();
  }

  setTab(tab: 'ruta' | 'buscar' | 'historial') {
    this.tabActiva = tab;
    if (tab === 'buscar' && this.todosPacientes.length === 0) {
      this.precargarPacientesParaBusqueda();
    }
    this.cdr.markForCheck();
  }

  get totalCount(): number {
    return this.visitasHoyService.totalCount;
  }

  // Comprueba si un paciente ya está agregado a la ruta de hoy
  estaEnPlan(id: number): boolean {
    return this.visitasHoyService.estaEnPlanHoy(id);
  }

  // =========================================================
  // ⭐ BÚSQUEDA Y AGREGADO RÁPIDO DE PACIENTES
  // =========================================================

  private precargarPacientesParaBusqueda() {
    this.cargandoPacientesBusqueda = true;
    this.pacientesMapService.getPacientes().subscribe({
      next: (lista) => {
        this.todosPacientes = lista || [];
        this.cargandoPacientesBusqueda = false;
        this.extraerColoniasDisponibles();
        this.filtrarPacientesParaBusqueda();
        this.cdr.markForCheck();
      },
      error: () => {
        this.cargandoPacientesBusqueda = false;
        this.cdr.markForCheck();
      }
    });
  }

  private extraerColoniasDisponibles() {
    const mapa = new Map<string, number>();
    this.todosPacientes.forEach((p: any) => {
      let col = (p.colonia && !/^#|^\d+$/i.test(p.colonia.trim()) && !p.colonia.toUpperCase().startsWith('REFS')
        ? p.colonia
        : this.extraerColoniaTexto(p.direccion) || '').trim().toUpperCase();
      if (col && col.length > 2 && !/^#|^\d+$/i.test(col) && !col.startsWith('REFS')) {
        mapa.set(col, (mapa.get(col) || 0) + 1);
      }
    });

    this.coloniasDisponibles = Array.from(mapa.entries())
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total); // Las colonias con más pacientes primero
  }

  extraerColoniaTexto(dir: string): string {
    if (!dir) return '';
    let dirSinRefs = dir;
    if (dir.includes('|')) dirSinRefs = dir.split('|')[0].trim();
    else if (/Refs\.?:/i.test(dir)) dirSinRefs = dir.substring(0, dir.search(/Refs\.?:/i)).trim();

    const upper = dirSinRefs.toUpperCase();
    const match = upper.match(/(?:COL\.?|COLONIA|FRACC\.?|FRACCIONAMIENTO|RESIDENCIAL|BARRIO|LOCALIDAD)\s+([^,|#\n]+)/i);
    if (match && match[1]) {
      const cand = match[1].trim();
      if (cand.length > 2 && !/^#|^\d+$/i.test(cand) && !/LEON|GTO/i.test(cand)) return cand;
    }

    let limpiaDir = upper
      .replace(/,\s*LEON\s*,?\s*GUANAJUATO.*$/i, '')
      .replace(/,\s*LEON\s*,?\s*GTO.*$/i, '')
      .replace(/,\s*LEON$/i, '')
      .replace(/,\s*GTO$/i, '')
      .trim();

    const partes = limpiaDir.split(',').map(s => s.trim()).filter(Boolean);
    const numIdx = partes.findIndex(p => /^#|^\d+$/i.test(p));
    if (numIdx !== -1 && numIdx + 1 < partes.length) {
      let postNum = partes.slice(numIdx + 1);
      if (postNum.length > 1 && /^\d+$/.test(postNum[0])) postNum = postNum.slice(1);
      let col = postNum.join(', ').trim()
        .replace(/^[-\d]+,\s*/, '')
        .replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '')
        .trim();
      if (col && col.length > 2 && !/^#|^\d+$/i.test(col) && !/LEON|GTO/i.test(col)) return col;
    }

    if (partes.length >= 2) {
      const ultima = partes[partes.length - 1].trim()
        .replace(/^[-\d]+,\s*/, '')
        .replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '')
        .trim();
      if (ultima.length > 2 && !/^#|^\d+$/i.test(ultima) && !/LEON|GTO/i.test(ultima)) return ultima;
    }

    return '';
  }

  onColoniaChange() {
    this.filtrarPacientesParaBusqueda();
  }

  seleccionarColonia(colonia: string) {
    this.coloniaSeleccionada = this.coloniaSeleccionada === colonia ? '' : colonia;
    this.filtrarPacientesParaBusqueda();
  }

  onBusquedaChange() {
    this.filtrarPacientesParaBusqueda();
  }

  private filtrarPacientesParaBusqueda() {
    const q = (this.busquedaQuery || '').trim().toUpperCase();
    const colSel = (this.coloniaSeleccionada || '').trim().toUpperCase();

    let filtrados = this.todosPacientes;

    // Filtro por zona / colonia si hay una seleccionada
    if (colSel) {
      filtrados = filtrados.filter(p => {
        const colP = (p.colonia || this.extraerColoniaTexto(p.direccion) || '').trim().toUpperCase();
        return colP.includes(colSel);
      });
    }

    // Filtro por texto si hay búsqueda
    if (q) {
      filtrados = filtrados.filter(p => {
        const nombre = (p.nombre || '').toUpperCase();
        const curp = (p.curp || '').toUpperCase();
        const dir = (p.direccion || '').toUpperCase();
        const colP = (p.colonia || this.extraerColoniaTexto(p.direccion) || '').toUpperCase();
        const tel = (p.telefono || p.telefonoCelular || '').toUpperCase();
        return nombre.includes(q) || curp.includes(q) || dir.includes(q) || colP.includes(q) || tel.includes(q);
      });
    }

    // Si no hay búsqueda ni filtro de colonia, limitar a primeros 30 para rendimiento
    this.pacientesEncontrados = (colSel || q) ? filtrados : filtrados.slice(0, 30);
  }

  agregarZonaCompleta(nombreColonia: string, maxCantidad: number = 12) {
    if (!nombreColonia) return;
    const colUpper = nombreColonia.trim().toUpperCase();
    const candidatos = this.todosPacientes.filter(p => {
      const colP = (p.colonia || this.extraerColoniaTexto(p.direccion) || '').trim().toUpperCase();
      return colP.includes(colUpper) && !this.estaEnPlan(Number(p.id));
    });

    if (candidatos.length === 0) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'info',
        title: 'Todos los pacientes de esta zona ya están en tu lista',
        showConfirmButton: false,
        timer: 2000
      });
      return;
    }

    const aAgregar = candidatos.slice(0, maxCantidad);
    let agregados = 0;
    aAgregar.forEach(p => {
      if (this.visitasHoyService.agregarPaciente(p)) {
        agregados++;
      }
    });

    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `¡${agregados} pacientes de ${nombreColonia} agregados!`,
      text: `Tienes ${this.totalCount} visitas programadas en tu lista de hoy`,
      showConfirmButton: false,
      timer: 2500
    });
    this.tabActiva = 'ruta';
    this.cdr.markForCheck();
  }

  agregarPacienteDirecto(paciente: any, event?: Event) {
    if (event) event.stopPropagation();
    const agregado = this.visitasHoyService.agregarPaciente(paciente);
    if (agregado) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `+ ${paciente.nombre || 'Paciente'} agregado`,
        text: `Tienes ${this.totalCount} de 12-15 visitas programadas`,
        showConfirmButton: false,
        timer: 1800
      });
    }
    this.cdr.markForCheck();
  }

  // =========================================================
  // ⭐ ACCIONES SOBRE LA RUTA ACTIVA
  // =========================================================

  irAGoogleMaps(paciente: PacientePlanHoy, event: Event) {
    event.stopPropagation();
    let url = '';
    if (paciente.lat && paciente.lng) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${paciente.lat},${paciente.lng}`;
    } else {
      const q = encodeURIComponent(`${paciente.direccion}, ${paciente.colonia}, León, Gto`);
      url = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    }
    window.open(url, '_blank');
  }

  enfocarEnMapa(paciente: PacientePlanHoy) {
    this.cerrarSheet();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('enfocarPacienteMapa', {
        detail: {
          pacienteId: paciente.id,
          lat: paciente.lat,
          lng: paciente.lng,
          nombre: paciente.nombre
        }
      }));
    }
  }

  removerPaciente(id: number, event: Event) {
    event.stopPropagation();
    this.visitasHoyService.removerPaciente(id);
  }

  limpiarPlanConfirm() {
    if (this.planHoy.length === 0) return;

    Swal.fire({
      title: '¿Reiniciar lista de hoy?',
      text: 'Se desmarcarán todos los pacientes de la jornada actual.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#7E101F',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, reiniciar',
      cancelButtonText: 'Cancelar'
    }).then(res => {
      if (res.isConfirmed) {
        this.visitasHoyService.limpiarPlanHoy();
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Lista de hoy reiniciada',
          showConfirmButton: false,
          timer: 2000
        });
      }
    });
  }

  // ⭐ Sugerir 12 o 15 prioritarios
  sugerirPrioritarios(cantidad: number = 12) {
    if (this.todosPacientes.length > 0) {
      this.visitasHoyService.autoSeleccionarPrioritarios(this.todosPacientes, cantidad);
      this.notificarSugerenciaExitosa(cantidad);
    } else {
      this.pacientesMapService.getPacientes().subscribe({
        next: (pacientes) => {
          this.todosPacientes = pacientes || [];
          this.visitasHoyService.autoSeleccionarPrioritarios(pacientes, cantidad);
          this.notificarSugerenciaExitosa(cantidad);
        },
        error: () => {
          Swal.fire({
            icon: 'error',
            title: 'Error de consulta',
            text: 'No se pudieron consultar los pacientes. Intenta de nuevo.',
            confirmButtonColor: '#7E101F'
          });
        }
      });
    }
  }

  private notificarSugerenciaExitosa(cantidad: number) {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: `¡${cantidad} pacientes prioritarios sugeridos!`,
      text: 'Puedes agregar o quitar los que consideres necesarios',
      showConfirmButton: false,
      timer: 2500
    });
    this.tabActiva = 'ruta';
    this.cdr.markForCheck();
  }

  // =========================================================
  // ⭐ HISTORIAL DE JORNADAS
  // =========================================================

  guardarHistorialManual() {
    if (this.totalCount === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Lista vacía',
        text: 'Agrega al menos un paciente antes de guardar en el historial.'
      });
      return;
    }

    const guardado = this.visitasHoyService.guardarJornadaActualEnHistorial();
    if (guardado) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Jornada guardada en historial',
        showConfirmButton: false,
        timer: 2200
      });
    }
  }

  toggleExpandirJornada(id: string) {
    this.jornadaExpandidaId = this.jornadaExpandidaId === id ? null : id;
    this.cdr.markForCheck();
  }

  cargarDesdeHistorial(jornada: JornadaHistorial) {
    Swal.fire({
      title: '¿Cargar esta ruta para hoy?',
      text: `Se programarán los ${jornada.totalPacientes} pacientes de ${jornada.fechaTexto} en tu lista activa.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#7E101F',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, cargar ruta',
      cancelButtonText: 'Cancelar'
    }).then(res => {
      if (res.isConfirmed) {
        this.visitasHoyService.cargarRutaDesdeHistorial(jornada);
        this.tabActiva = 'ruta';
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `¡Ruta de ${jornada.totalPacientes} pacientes cargada!`,
          showConfirmButton: false,
          timer: 2200
        });
      }
    });
  }

  eliminarDeHistorial(id: string, event: Event) {
    event.stopPropagation();
    Swal.fire({
      title: '¿Eliminar del historial?',
      text: 'Este registro diario se removerá del historial guardado.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#DC2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then(res => {
      if (res.isConfirmed) {
        this.visitasHoyService.eliminarJornadaHistorial(id);
      }
    });
  }
}
