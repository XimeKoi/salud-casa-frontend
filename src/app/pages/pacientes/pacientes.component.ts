// src/app/pages/pacientes/pacientes.component.ts

import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';

interface VisitaCompletada {
  fecha: Date;
  ubicacionCoordenadas: string;
  ubicacionDireccion: string;
  fotos: string[];
  coordenadas: string;
}

interface Paciente {
  id: number;
  nombre: string;
  direccion: string;
  telefono: string;
  colonia: string;
  seccion: string;
  estadoVisita: 'completada' | 'pendiente' | 'incidencia';
  fechaProgramada: Date;
  tieneIncidencia: boolean;
  historialVisitas?: VisitaCompletada[];
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  nombres?: string;
  programa?: string;
  curp?: string;
  nivelRiesgo: 'g1' | 'g2' | 'g3' | 'g4' | null;
  fechaPendiente?: Date | null;
  diasPendiente?: number | null;
  visitasCompletadas?: number;
}

interface Visita {
  hora: string;
  paciente: string;
  colonia: string;
  telefono?: string;
  edad?: number;
  estatus?: 'pendiente' | 'completada' | 'reagendada';
  reagendada?: boolean;
  horaAnterior?: string;
}

interface DiaCalendario {
  nombre: string;
  fecha: string;
  visitas: Visita[];
  totalVisitas: number;
  completadas: number;
}

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pacientes.component.html',
  styleUrls: ['./pacientes.component.scss']
})
export class PacientesComponent implements OnInit, AfterViewInit, OnDestroy {

  Math = Math;

  pacientes: Paciente[] = [];
  pacientesFiltrados: Paciente[] = [];
  filtroBusqueda = '';
  filtroEstado = 'todos';
  filtroRiesgo = 'todos';
  tabActivo: 'todos' | 'pendientes' | 'en_espera' | 'vencidos' | 'completadas' | 'incidencias' = 'todos';
  vistaModo: 'tabla' | 'tarjetas' = 'tabla';

  selectedPaciente: Paciente | null = null;
  mostrarModalCalendario = false;
  mostrarModalCompletada = false;
  mostrarModalReagendar = false;
  mostrarModalHistorial = false;

  visitaParaReagendar: Visita | null = null;
  visitasSeleccionadas: Visita[] = [];
  nuevaFechaReagendar = '';
  nuevaHoraReagendar = '';
  motivoReagendar = '';
  intentoEnvio = false;
  diaSeleccionado: DiaCalendario | null = null;

  fotosPreview: string[] = [];
  saltarFotoActivo: boolean = false;

  pacienteHistorial: Paciente | null = null;
  historialVisitas: VisitaCompletada[] = [];

  fotoModalVisible = false;
  fotoModalSrc = '';

  diasSemana: DiaCalendario[] = [];

  loading = false;
  private initialLoadDone = false;

  paginaActual: number = 1;
  itemsPorPagina: number = 10;
  totalPaginas: number = 1;
  paginas: number[] = [];

  private navigationSubscription: Subscription = new Subscription();

  private apiUrl = environment.apiUrl;

  riesgoAbierto: number | null = null;

  constructor(
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {
    console.log('🌍 [Pacientes] API URL:', this.apiUrl);
  }

  ngOnInit() {
    this.cargarPacientes();
    this.generarDiasSemana();
    this.initialLoadDone = true;

    this.navigationSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      if (event.url.includes('/pacientes') && this.initialLoadDone) {
        this.cargarPacientes();
        this.generarDiasSemana();
      }
    });
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.verificarElementosPaginacion();
    }, 500);
  }

  ngOnDestroy() {
    if (this.navigationSubscription) {
      this.navigationSubscription.unsubscribe();
    }
  }

  verificarElementosPaginacion() { }

  get pacientesPaginados(): Paciente[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.pacientesFiltrados.slice(inicio, fin);
  }

  // ⭐ CONTADORES PARA BADGES Y KPIS
  // ⭐ CONTADORES PARA BADGES Y TABS
  get totalPacientesCount(): number {
    return this.pacientes.length;
  }

  get pacientesPendientesCount(): number {
    return this.pacientes.filter(p => p.estadoVisita === 'pendiente').length;
  }

  get pacientesEnEsperaCount(): number {
    return this.pacientes.filter(p =>
      p.estadoVisita === 'pendiente' &&
      p.diasPendiente !== null &&
      (p.diasPendiente ?? 0) < 20
    ).length;
  }

  get pacientesVencidosCount(): number {
    return this.pacientes.filter(p =>
      p.estadoVisita === 'pendiente' &&
      p.diasPendiente !== null &&
      (p.diasPendiente ?? 0) >= 20
    ).length;
  }

  get pacientesCompletadasCount(): number {
    return this.pacientes.filter(p => p.estadoVisita === 'completada').length;
  }

  get pacientesIncidenciasCount(): number {
    return this.pacientes.filter(p => p.estadoVisita === 'incidencia' || p.tieneIncidencia).length;
  }

  // ⭐ CAMBIAR TAB
  cambiarTab(tab: 'todos' | 'pendientes' | 'en_espera' | 'vencidos' | 'completadas' | 'incidencias') {
    this.tabActivo = tab;
    this.paginaActual = 1;
    this.aplicarFiltros();
  }

  // ⭐ CAMBIAR MODO DE VISTA (TABLA / TARJETAS)
  cambiarModoVista(modo: 'tabla' | 'tarjetas') {
    this.vistaModo = modo;
  }

  // ⭐ INICIALES PARA EL AVATAR DEL PACIENTE
  getIniciales(nombre: string): string {
    if (!nombre) return 'P';
    const partes = nombre.trim().split(/\s+/);
    if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
    return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase();
  }

  // ⭐ ESTILOS, ICONOS Y TEXTO DE ESTADO
  getEstadoClass(estado: string): string {
    switch (estado) {
      case 'completada': return 'estado-completada';
      case 'pendiente': return 'estado-pendiente';
      case 'incidencia': return 'estado-incidencia';
      default: return 'estado-pendiente';
    }
  }

  getEstadoIcono(estado: string): string {
    switch (estado) {
      case 'completada': return 'fas fa-circle-check';
      case 'pendiente': return 'fas fa-clock';
      case 'incidencia': return 'fas fa-circle-exclamation';
      default: return 'fas fa-question-circle';
    }
  }

  getEstadoTexto(estado: string): string {
    switch (estado) {
      case 'completada': return 'Completada';
      case 'pendiente': return 'Pendiente';
      case 'incidencia': return 'Incidencia';
      default: return estado || 'Pendiente';
    }
  }

  // ⭐ LIMPIAR TODOS LOS FILTROS
  limpiarFiltros() {
    this.filtroBusqueda = '';
    this.filtroEstado = 'todos';
    this.filtroRiesgo = 'todos';
    this.tabActivo = 'todos';
    this.aplicarFiltros();
  }

  // ⭐ COPIAR AL PORTAPAPELES
  copiarTexto(texto: string, etiqueta: string = 'Texto') {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      this.crearNotificacion('Copiado', `${etiqueta} copiado al portapapeles: ${texto}`, 'info');
    }).catch(() => {
      this.crearNotificacion('Error', 'No se pudo copiar el texto', 'error');
    });
  }

  cambiarPagina(pagina: number) {
    if (pagina < 1 || pagina > this.totalPaginas) return;
    this.paginaActual = pagina;
    const tablaContainer = document.querySelector('.tabla-scroll-wrapper') as HTMLElement;
    if (tablaContainer) {
      tablaContainer.scrollTop = 0;
      tablaContainer.scrollLeft = 0;
    }
  }

  calcularPaginas() {
    this.totalPaginas = Math.ceil(this.pacientesFiltrados.length / this.itemsPorPagina);
    if (this.totalPaginas === 0) {
      this.totalPaginas = 1;
    }
    this.paginas = [];
    const maxPaginasMostradas = 5;
    let inicio = Math.max(1, this.paginaActual - Math.floor(maxPaginasMostradas / 2));
    let fin = Math.min(this.totalPaginas, inicio + maxPaginasMostradas - 1);
    if (fin - inicio + 1 < maxPaginasMostradas) {
      inicio = Math.max(1, fin - maxPaginasMostradas + 1);
    }
    for (let i = inicio; i <= fin; i++) {
      this.paginas.push(i);
    }
  }

  onItemsPorPaginaChange() {
    this.paginaActual = 1;
    this.calcularPaginas();
  }

  // ⭐ ============================================
  // ⭐ CARGAR PACIENTES
  // ⭐ ============================================

  cargarPacientes() {
    this.loading = true;
    const idEnfermera = 1;

    this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}/con-riesgo`)
      .subscribe({
        next: (data: any[]) => {
          if (Array.isArray(data) && data.length > 0) {
            this.pacientes = data.map((p: any) => {
              const paciente = {
                id: p.id,
                nombre: this.construirNombreCompleto(p),
                direccion: p.direccion || '',
                telefono: p.telefonoCelular || p.telefonoFijo || '',
                colonia: p.zonaTrabajo || this.extraerColonia(p.direccion),
                seccion: p.zonaTrabajo?.split('-').pop() || '',
                estadoVisita: this.mapearEstatus(p.estatus),
                fechaProgramada: new Date(),
                tieneIncidencia: p.estatus === 'RECHAZO' || p.estatus === 'incidencia',
                historialVisitas: [],
                apellidoPaterno: p.apellidoPaterno || '',
                apellidoMaterno: p.apellidoMaterno || '',
                nombres: p.nombre || '',
                programa: p.programa,
                curp: p.curp,
                nivelRiesgo: p.nivelRiesgo || this.obtenerNivelRiesgoPorEstatus(p.estatus),
                fechaPendiente: null,
                diasPendiente: null,
                visitasCompletadas: 0
              };
              return paciente;
            });
          } else {
            this.cargarPacientesSinNiveles();
          }
          this.cargarHistorialDesdeLocalStorage();
          this.cargarPendientesDesdeLocalStorage();
          this.aplicarFiltros();
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          console.error('Error al cargar pacientes con niveles:', err);
          this.cargarPacientesSinNiveles();
          this.loading = false;
        }
      });
  }

  cargarPacientesSinNiveles() {
    const idEnfermera = 1;
    this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}`)
      .subscribe({
        next: (data: any[]) => {
          if (Array.isArray(data) && data.length > 0) {
            this.pacientes = data.map((p: any) => ({
              id: p.id,
              nombre: this.construirNombreCompleto(p),
              direccion: p.direccion || '',
              telefono: p.telefonoCelular || p.telefonoFijo || '',
              colonia: p.zonaTrabajo || this.extraerColonia(p.direccion),
              seccion: p.zonaTrabajo?.split('-').pop() || '',
              estadoVisita: this.mapearEstatus(p.estatus),
              fechaProgramada: new Date(),
              tieneIncidencia: p.estatus === 'RECHAZO' || p.estatus === 'incidencia',
              historialVisitas: [],
              apellidoPaterno: p.apellidoPaterno || '',
              apellidoMaterno: p.apellidoMaterno || '',
              nombres: p.nombre || '',
              programa: p.programa,
              curp: p.curp,
              nivelRiesgo: this.obtenerNivelRiesgoPorEstatus(p.estatus),
              fechaPendiente: null,
              diasPendiente: null,
              visitasCompletadas: 0
            }));
          }
          this.cargarHistorialDesdeLocalStorage();
          this.cargarPendientesDesdeLocalStorage();
          this.aplicarFiltros();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          console.error('Error en fallback:', err);
          this.cargarPacientesLocal();
        }
      });
  }

  private construirNombreCompleto(paciente: any): string {
    const apellidoPaterno = paciente.apellidoPaterno || paciente.paterno || '';
    const apellidoMaterno = paciente.apellidoMaterno || paciente.materno || '';
    const nombres = paciente.nombre || paciente.nombres || '';
    const partes = [];
    if (apellidoPaterno) partes.push(apellidoPaterno);
    if (apellidoMaterno) partes.push(apellidoMaterno);
    if (nombres) partes.push(nombres);
    if (partes.length === 0) return paciente.nombreCompleto || 'Nombre no disponible';
    return partes.join(' ').trim();
  }

  private extraerColonia(direccion: string): string {
    if (!direccion) return '';
    const partes = direccion.split(',');
    if (partes.length >= 2) return partes[1].trim();
    return '';
  }

  private mapearEstatus(estatus: string): 'completada' | 'pendiente' | 'incidencia' {
    if (estatus === 'VISITADO' || estatus === 'completada') return 'completada';
    if (estatus === 'RECHAZO' || estatus === 'incidencia') return 'incidencia';
    return 'pendiente';
  }

  // ⭐ ============================================
  // ⭐ CALCULAR DÍAS PENDIENTE
  // ⭐ ============================================

  private calcularDiasPendiente(fechaPendiente: Date | null | undefined): number | null {
    if (!fechaPendiente) return null;
    const fecha = new Date(fechaPendiente);
    const hoy = new Date();
    const diffTime = hoy.getTime() - fecha.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  private actualizarDiasPendientes() {
    this.pacientes.forEach(p => {
      if (p.estadoVisita === 'pendiente' && p.fechaPendiente) {
        p.diasPendiente = this.calcularDiasPendiente(p.fechaPendiente);
      } else {
        p.diasPendiente = null;
      }
    });
  }

  // ⭐ GUARDAR PENDIENTES EN LOCAL STORAGE
  private guardarPendientesEnLocalStorage() {
    try {
      const pendientes: any = {};
      this.pacientes.forEach((p: Paciente) => {
        if (p.estadoVisita === 'pendiente' && p.fechaPendiente) {
          pendientes[p.id] = {
            fechaPendiente: p.fechaPendiente
          };
        }
      });
      localStorage.setItem('pacientesPendientes', JSON.stringify(pendientes));
    } catch (error) {
      console.error('Error al guardar pendientes:', error);
    }
  }

  private cargarPendientesDesdeLocalStorage() {
    try {
      const pendientesGuardado = localStorage.getItem('pacientesPendientes');
      if (pendientesGuardado) {
        const pendientes = JSON.parse(pendientesGuardado);
        this.pacientes.forEach((p: Paciente) => {
          if (pendientes[p.id]) {
            p.fechaPendiente = new Date(pendientes[p.id].fechaPendiente);
            p.diasPendiente = this.calcularDiasPendiente(p.fechaPendiente);
          }
        });
      }
    } catch (e) {
      console.error('Error cargando pendientes:', e);
    }
  }

  // ⭐ ============================================
  // ⭐ LIMPIAR DIRECCIÓN
  // ⭐ ============================================

  limpiarDireccion(direccion: string): string {
    if (!direccion) return 'DIRECCIÓN NO DISPONIBLE';

    let limpia = direccion.toUpperCase();

    const reemplazos: { [key: string]: string } = {
      '¢': 'O', '¡': 'I', '£': 'U', '¤': 'N', '¦': 'A',
      '¨': 'E', '©': 'O', 'ª': 'U', '«': 'N', '¬': 'A',
      '®': 'E', '¯': 'I', '°': 'O', '±': 'U', '²': 'N',
      '³': 'A', '´': 'E', 'µ': 'I', '¶': 'O', '·': 'U',
      '¸': 'N', '¹': 'A', 'º': 'E', '»': 'I', '¼': 'O',
      '½': 'U', '¾': 'N', '¿': 'A', 'V¡A': 'VIA', 'LE¢N': 'LEON',
    };

    for (const [buscar, reemplazar] of Object.entries(reemplazos)) {
      limpia = limpia.replace(new RegExp(buscar, 'g'), reemplazar);
    }

    limpia = limpia.replace(/\|/g, ', ');
    limpia = limpia.replace(/\s+/g, ' ');
    limpia = limpia.trim();

    limpia = limpia.replace(/, LEON, GTO$/i, '');
    limpia = limpia.replace(/, LEON, GUANAJUATO$/i, '');
    limpia = limpia.replace(/, LEON \| GTO$/i, '');
    limpia = limpia.replace(/\| GTO$/i, '');
    limpia = limpia.replace(/LEON\| GTO$/i, '');
    limpia = limpia.replace(/LEON, GTO$/i, '');
    limpia = limpia.replace(/GTO\.?$/i, '');
    limpia = limpia.replace(/MEXICO\.?$/i, '');
    limpia = limpia.replace(/LEON$/i, '');

    limpia = limpia.replace(/COL\.\s*/gi, 'COL. ');
    limpia = limpia.replace(/FRACC\.\s*/gi, 'FRACC. ');
    limpia = limpia.replace(/FRACCIONAMIENTO\s*/gi, 'FRACC. ');

    limpia = limpia.replace(/\b\d{5}\b/g, '');

    limpia = limpia.replace(/, , /g, ', ');
    limpia = limpia.replace(/ ,/g, '');
    limpia = limpia.replace(/,,/g, ',');
    limpia = limpia.replace(/,\s*,/g, ', ');
    limpia = limpia.replace(/,\s+$/g, '');
    limpia = limpia.replace(/^\s+,/g, '');

    limpia = limpia.replace(/\s+/g, ' ').trim();

    if (limpia.length < 5) return direccion.toUpperCase();

    return limpia;
  }

  // ⭐ ============================================
  // ⭐ NIVELES DE RIESGO
  // ⭐ ============================================

  toggleRiesgoDropdown(pacienteId: number) {
    this.riesgoAbierto = this.riesgoAbierto === pacienteId ? null : pacienteId;
  }

  seleccionarNivelRiesgo(paciente: Paciente, nivel: 'g1' | 'g2' | 'g3' | 'g4' | null | string) {
    const nivelFinal = (!nivel || nivel === '' || nivel === 'null') ? null : (nivel as 'g1' | 'g2' | 'g3' | 'g4');
    this.cambiarNivelRiesgo(paciente, nivelFinal);
    this.riesgoAbierto = null;
  }

  cambiarNivelRiesgo(paciente: Paciente, nivel: 'g1' | 'g2' | 'g3' | 'g4' | null) {
    const nivelAnterior = paciente.nivelRiesgo;
    paciente.nivelRiesgo = nivel;

    this.http.patch(`${this.apiUrl}/pacientes/${paciente.id}/nivel-riesgo`, {
      nivelRiesgo: nivel,
      usuarioId: 1
    }).subscribe({
      next: () => {
        console.log(`✅ Nivel de riesgo actualizado para paciente ${paciente.id}: ${nivel}`);
        this.aplicarFiltros();
        this.cdr.detectChanges();
        this.actualizarDashboard(paciente.id, nivel);
        this.crearNotificacion(
          'Riesgo actualizado',
          `${paciente.nombre} ahora es ${this.getLabelNivelRiesgo(nivel)}`,
          'success'
        );
      },
      error: (err: any) => {
        console.error('❌ Error guardando nivel de riesgo:', err);
        paciente.nivelRiesgo = nivelAnterior;
        this.crearNotificacion(
          'Error',
          'No se pudo guardar el nivel de riesgo. Intenta de nuevo.',
          'error'
        );
      }
    });
  }

  private actualizarDashboard(pacienteId: number, nivelRiesgo: string | null) {
    window.dispatchEvent(new CustomEvent('nivelesRiesgoActualizados', {
      detail: {
        pacienteId: pacienteId,
        nivelRiesgo: nivelRiesgo,
        timestamp: new Date().toISOString()
      }
    }));
  }

  getLabelNivelRiesgo(nivel: string | null): string {
    const labels: Record<string, string> = {
      'g1': 'Grupo 1 (Bajo)',
      'g2': 'Grupo 2 (Medio)',
      'g3': 'Grupo 3 (Alto)',
      'g4': 'Grupo 4 (Crítico)'
    };
    return nivel ? labels[nivel] || 'Sin asignar' : 'Sin asignar';
  }

  getLabelNivelRiesgoCorto(nivel: string | null): string {
    switch (nivel) {
      case 'g1': return 'Bajo';
      case 'g2': return 'Medio';
      case 'g3': return 'Alto';
      case 'g4': return 'Crítico';
      default: return 'Sin';
    }
  }

  getColorNivelRiesgo(nivel: string | null): string {
    switch (nivel) {
      case 'g1': return '#22c55e';
      case 'g2': return '#eab308';
      case 'g3': return '#f97316';
      case 'g4': return '#ef4444';
      default: return '#94a3b8';
    }
  }

  getIconoNivelRiesgo(nivel: string | null): string {
    switch (nivel) {
      case 'g1': return 'fas fa-check-circle';
      case 'g2': return 'fas fa-exclamation-circle';
      case 'g3': return 'fas fa-exclamation-triangle';
      case 'g4': return 'fas fa-skull';
      default: return 'fas fa-minus-circle';
    }
  }

  private obtenerNivelRiesgoPorEstatus(estatus: string): 'g1' | 'g2' | 'g3' | 'g4' | null {
    const estatusUpper = (estatus || '').toUpperCase();
    if (estatusUpper === 'VISITADO' || estatusUpper === 'COMPLETADA') return 'g1';
    if (estatusUpper === 'PENDIENTE' || estatusUpper === 'SIN VISITA') return 'g2';
    if (estatusUpper === 'RECHAZO' || estatusUpper === 'INCIDENCIA') return 'g3';
    if (estatusUpper === 'FINADO') return 'g4';
    return null;
  }

  // ⭐ ============================================
  // ⭐ FILTROS Y PAGINACIÓN
  // ⭐ ============================================

  aplicarFiltros() {
    let base = [...this.pacientes];

    // ⭐ FILTRO POR TAB
    if (this.tabActivo === 'pendientes') {
      base = base.filter(p => p.estadoVisita === 'pendiente');
    } else if (this.tabActivo === 'en_espera') {
      base = base.filter(p =>
        p.estadoVisita === 'pendiente' &&
        p.diasPendiente !== null &&
        (p.diasPendiente ?? 0) < 20
      );
    } else if (this.tabActivo === 'vencidos') {
      base = base.filter(p =>
        p.estadoVisita === 'pendiente' &&
        p.diasPendiente !== null &&
        (p.diasPendiente ?? 0) >= 20
      );
    } else if (this.tabActivo === 'completadas') {
      base = base.filter(p => p.estadoVisita === 'completada');
    } else if (this.tabActivo === 'incidencias') {
      base = base.filter(p => p.estadoVisita === 'incidencia' || p.tieneIncidencia);
    }

    // ⭐ FILTRO DE BÚSQUEDA
    if (this.filtroBusqueda.trim()) {
      const query = this.filtroBusqueda.toLowerCase().trim();
      base = base.filter(p =>
        (p.nombre && p.nombre.toLowerCase().includes(query)) ||
        (p.direccion && p.direccion.toLowerCase().includes(query)) ||
        (p.colonia && p.colonia.toLowerCase().includes(query)) ||
        (p.seccion && p.seccion.toLowerCase().includes(query)) ||
        (p.curp && p.curp.toLowerCase().includes(query)) ||
        (p.programa && p.programa.toLowerCase().includes(query)) ||
        (p.telefono && p.telefono.includes(query))
      );
    }

    // ⭐ FILTRO DE ESTADO
    if (this.filtroEstado !== 'todos') {
      base = base.filter(p => p.estadoVisita === this.filtroEstado);
    }

    // ⭐ FILTRO DE NIVEL DE RIESGO
    if (this.filtroRiesgo !== 'todos') {
      if (this.filtroRiesgo === 'sin-asignar') {
        base = base.filter(p => !p.nivelRiesgo);
      } else {
        base = base.filter(p => p.nivelRiesgo === this.filtroRiesgo);
      }
    }

    this.pacientesFiltrados = base;
    this.paginaActual = 1;
    this.calcularPaginas();
  }

  // ⭐ ============================================
  // ⭐ DATOS LOCALES (FALLBACK)
  // ⭐ ============================================

  cargarPacientesLocal() {
    this.pacientes = [];
    for (let i = 1; i <= 30; i++) {
      this.pacientes.push({
        id: i,
        nombre: `Paciente ${i} Apellido${i}`,
        direccion: `Calle ${i} #${i * 100}`,
        telefono: `477${1000000 + i}`,
        colonia: `Colonia ${i}`,
        seccion: `${1000 + i}`,
        estadoVisita: i % 3 === 0 ? 'completada' : (i % 3 === 1 ? 'pendiente' : 'incidencia'),
        fechaProgramada: new Date(),
        tieneIncidencia: i % 3 === 2,
        historialVisitas: [],
        nivelRiesgo: i % 4 === 0 ? 'g1' : (i % 4 === 1 ? 'g2' : (i % 4 === 2 ? 'g3' : 'g4')),
        fechaPendiente: i % 3 === 1 ? new Date(Date.now() - (i * 86400000)) : null,
        diasPendiente: i % 3 === 1 ? i : null,
        visitasCompletadas: 0
      });
    }
    localStorage.setItem('pacientesCache', JSON.stringify(this.pacientes));
    this.cargarHistorialDesdeLocalStorage();
    this.cargarPendientesDesdeLocalStorage();
    this.aplicarFiltros();
  }

  cargarHistorialDesdeLocalStorage() {
    try {
      const historialGuardado = localStorage.getItem('historialVisitasPacientes');
      if (historialGuardado) {
        const historial = JSON.parse(historialGuardado);
        this.pacientes.forEach((paciente: Paciente) => {
          if (historial[paciente.id] && Array.isArray(historial[paciente.id])) {
            paciente.historialVisitas = historial[paciente.id];
          }
        });
      }
    } catch (e) {
      console.error('Error cargando historial:', e);
    }
  }

  guardarHistorialEnLocalStorage() {
    try {
      const historial: any = {};
      this.pacientes.forEach((paciente: Paciente) => {
        if (paciente.historialVisitas && paciente.historialVisitas.length > 0) {
          historial[paciente.id] = paciente.historialVisitas.slice(0, 3);
        }
      });
      localStorage.setItem('historialVisitasPacientes', JSON.stringify(historial));
    } catch (error) {
      console.error('Error al guardar:', error);
    }
  }

  // ⭐ ============================================
  // ⭐ COMPRIMIR IMAGEN
  // ⭐ ============================================

  async comprimirImagen(base64: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxWidth = 150;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx!.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.3);
        resolve(compressed);
      };
      img.src = base64;
    });
  }

  // ⭐ ============================================
  // ⭐ CALENDARIO
  // ⭐ ============================================

  generarDiasSemana() {
    const hoy = new Date();
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1);
    const diasNombres = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    this.diasSemana = [];
    for (let i = 0; i < 7; i++) {
      const fecha = new Date(inicioSemana);
      fecha.setDate(inicioSemana.getDate() + i);
      this.diasSemana.push({
        nombre: diasNombres[i],
        fecha: `${fecha.getDate()}`,
        visitas: this.generarVisitasParaDia(fecha),
        totalVisitas: 0,
        completadas: 0
      });
    }
    this.diasSemana.forEach((dia: DiaCalendario) => {
      dia.totalVisitas = dia.visitas.length;
      dia.completadas = dia.visitas.filter((v: Visita) => v.estatus === 'completada').length;
    });
  }

  generarVisitasParaDia(fecha: Date): Visita[] {
    const esFinde = fecha.getDay() === 0 || fecha.getDay() === 6;
    const numVisitas = esFinde ? 3 : 6;
    const visitas: Visita[] = [];
    const horas = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30'];
    const colonias = ['Centro', 'Norte', 'Sur', 'Lomas', 'Industrial', 'Valle Verde'];
    const pacientesReales = this.pacientes.slice(0, 10);
    for (let i = 0; i < numVisitas && i < horas.length; i++) {
      const paciente = pacientesReales[i % pacientesReales.length];
      visitas.push({
        hora: horas[i],
        paciente: paciente?.nombre || `Paciente ${i + 1}`,
        colonia: colonias[i % colonias.length],
        telefono: paciente?.telefono || `477${1000000 + i}`,
        edad: 65 + (i * 2),
        estatus: i < 2 ? 'completada' : 'pendiente'
      });
    }
    return visitas;
  }

  get fechaMinima(): string {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  // ⭐ ============================================
  // ⭐ MODALES
  // ⭐ ============================================

  abrirModalCalendario(paciente: Paciente) {
    this.selectedPaciente = paciente;
    this.generarDiasSemana();
    this.mostrarModalCalendario = true;
  }

  cerrarModalCalendario() {
    this.mostrarModalCalendario = false;
    this.diaSeleccionado = null;
    this.limpiarSeleccion();
  }

  verDetallesDia(dia: DiaCalendario) {
    this.diaSeleccionado = dia;
    this.limpiarSeleccion();
  }

  volverVistaSemana() {
    this.diaSeleccionado = null;
    this.limpiarSeleccion();
  }

  limpiarSeleccion() {
    this.visitasSeleccionadas = [];
  }

  toggleSeleccionVisita(visita: Visita) {
    if (visita.estatus === 'completada') return;
    const index = this.visitasSeleccionadas.findIndex((v: Visita) => v === visita);
    if (index === -1) this.visitasSeleccionadas.push(visita);
    else this.visitasSeleccionadas.splice(index, 1);
  }

  abrirModalReagendarIndividual(visita: Visita, event: Event) {
    event.stopPropagation();
    this.visitaParaReagendar = visita;
    this.intentoEnvio = false;
    this.nuevaFechaReagendar = '';
    this.nuevaHoraReagendar = '';
    this.motivoReagendar = '';
    this.mostrarModalReagendar = true;
  }

  abrirModalReagendar() {
    if (this.visitasSeleccionadas.length === 0) return;
    this.visitaParaReagendar = null;
    this.intentoEnvio = false;
    this.nuevaFechaReagendar = '';
    this.nuevaHoraReagendar = '';
    this.motivoReagendar = '';
    this.mostrarModalReagendar = true;
  }

  cerrarModalReagendar() {
    this.mostrarModalReagendar = false;
    this.visitaParaReagendar = null;
  }

  ejecutarReagendamiento() {
    this.intentoEnvio = true;
    if (!this.nuevaFechaReagendar || !this.nuevaHoraReagendar) {
      this.crearNotificacion('Error', 'Selecciona fecha y hora', 'error');
      return;
    }

    if (this.selectedPaciente) {
      this.http.post(`${this.apiUrl}/pacientes/${this.selectedPaciente.id}/visita/reagendar`, {
        fechaAnterior: this.visitaParaReagendar?.hora || 'No especificada',
        fechaNueva: `${this.nuevaFechaReagendar} ${this.nuevaHoraReagendar}`,
        usuarioId: 1
      }).subscribe({
        next: () => {
          this.crearNotificacion('Visita Reagendada',
            `La visita ha sido reagendada para el ${this.nuevaFechaReagendar} a las ${this.nuevaHoraReagendar}`,
            'success'
          );
          this.cerrarModalReagendar();
        },
        error: (err: any) => {
          console.error('Error al reagendar visita:', err);
          this.crearNotificacion('Error', 'No se pudo reagendar la visita', 'error');
        }
      });
    } else {
      this.crearNotificacion('Error', 'No hay paciente seleccionado', 'error');
    }
  }

  // ⭐ ============================================
  // ⭐ HISTORIAL
  // ⭐ ============================================

  verHistorial(paciente: Paciente) {
    this.pacienteHistorial = paciente;
    this.historialVisitas = paciente.historialVisitas || [];
    this.mostrarModalHistorial = true;
  }

  cerrarModalHistorial() {
    this.mostrarModalHistorial = false;
    this.pacienteHistorial = null;
    this.historialVisitas = [];
  }

  openFotoModal(foto: string) {
    this.fotoModalSrc = foto;
    this.fotoModalVisible = true;
  }

  cerrarFotoModal() {
    this.fotoModalVisible = false;
    this.fotoModalSrc = '';
  }

  // ⭐ ============================================
  // ⭐ ACCIONES DE PACIENTES - CORREGIDO
  // ⭐ ============================================

  // ⭐ MARCAR PENDIENTE - CON SWEETALERT2 Y ICONOS
  marcarPendiente(paciente: Paciente) {
    // ⭐ SI YA ESTÁ PENDIENTE, MOSTRAR TOAST CON ICONOS
    if (paciente.estadoVisita === 'pendiente') {
      const dias = paciente.diasPendiente ?? 0;
      let mensajeAdicional = '';

      if (dias >= 20) {
        mensajeAdicional = '<i class="fas fa-check-circle" style="color: #2e7d32;"></i> <strong>¡Listo para visita!</strong> Ya pasaron 20 días, puedes completar la visita.';
      } else {
        mensajeAdicional = `<i class="fas fa-hourglass-half" style="color: #e67e22;"></i> <strong>Faltan ${20 - dias} días</strong> para poder completar la visita.`;
      }

      this.crearNotificacion(
        'Ya está pendiente',
        `El paciente <strong>${paciente.nombre}</strong> ya se encuentra en estado <strong>PENDIENTE</strong>.<br>
         <span style="font-size: 12px; color: #888;">Lleva <strong>${dias}</strong> días en este estado.<br><br>
         ${mensajeAdicional}</span>`,
        'warning'
      );
      return;
    }

    // ⭐ SI ESTÁ COMPLETADA, USAR SWEETALERT2
    if (paciente.estadoVisita === 'completada') {
      Swal.fire({
        title: '¿Marcar como pendiente?',
        html: `
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; background: #f8f4f0; padding: 12px; border-radius: 10px;">
            <i class="fas fa-user-circle" style="font-size: 32px; color: #701f2f;"></i>
            <div style="text-align: left;">
              <div style="font-weight: 700; font-size: 16px; color: #701f2f;">${paciente.nombre}</div>
              <div style="font-size: 12px; color: #888;"><i class="fas fa-map-marker-alt"></i> ${paciente.direccion}</div>
            </div>
          </div>
          <p style="font-size: 15px; margin-bottom: 8px;">
            Estás a punto de marcar al paciente como <strong style="color: #e67e22;">PENDIENTE</strong>.
          </p>
          <div style="background: #fff3e0; padding: 12px; border-radius: 10px; border-left: 4px solid #e67e22; margin: 10px 0;">
            <i class="fas fa-exclamation-triangle" style="color: #e67e22; margin-right: 8px;"></i>
            <span style="color: #e67e22; font-weight: 600;">Esta acción reiniciará el contador de días a 0</span>
          </div>
          <p style="font-size: 13px; color: #888; margin-top: 8px;">
            <i class="fas fa-calendar-day"></i> Se podrá visitar nuevamente en <strong>20 días</strong>.
          </p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e67e22',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, marcar como pendiente',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        customClass: {
          popup: 'swal-pendiente-popup',
          confirmButton: 'swal-confirm-btn',
          cancelButton: 'swal-cancel-btn'
        }
      }).then((result) => {
        if (result.isConfirmed) {
          this.ejecutarMarcarPendiente(paciente);
        }
      });
      return;
    }

    // ⭐ SI ESTÁ EN INCIDENCIA, USAR SWEETALERT2
    if (paciente.estadoVisita === 'incidencia') {
      Swal.fire({
        title: '¿Marcar como pendiente?',
        html: `
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; background: #f8f4f0; padding: 12px; border-radius: 10px;">
            <i class="fas fa-user-circle" style="font-size: 32px; color: #701f2f;"></i>
            <div style="text-align: left;">
              <div style="font-weight: 700; font-size: 16px; color: #701f2f;">${paciente.nombre}</div>
              <div style="font-size: 12px; color: #888;"><i class="fas fa-map-marker-alt"></i> ${paciente.direccion}</div>
            </div>
          </div>
          <p style="font-size: 15px; margin-bottom: 8px;">
            Estás a punto de marcar al paciente como <strong style="color: #e67e22;">PENDIENTE</strong>.
          </p>
          <div style="background: #ffebee; padding: 12px; border-radius: 10px; border-left: 4px solid #c62828; margin: 10px 0;">
            <i class="fas fa-exclamation-circle" style="color: #c62828; margin-right: 8px;"></i>
            <span style="color: #c62828; font-weight: 600;">Este paciente tiene una incidencia registrada</span>
          </div>
          <p style="font-size: 13px; color: #888; margin-top: 8px;">
            <i class="fas fa-calendar-day"></i> Se podrá visitar nuevamente en <strong>20 días</strong>.
          </p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e67e22',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, marcar como pendiente',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        customClass: {
          popup: 'swal-pendiente-popup',
          confirmButton: 'swal-confirm-btn',
          cancelButton: 'swal-cancel-btn'
        }
      }).then((result) => {
        if (result.isConfirmed) {
          this.ejecutarMarcarPendiente(paciente);
        }
      });
      return;
    }
  }

  // ⭐ EJECUTAR MARCAR PENDIENTE
  private ejecutarMarcarPendiente(paciente: Paciente) {
    paciente.estadoVisita = 'pendiente';
    paciente.fechaPendiente = new Date();
    paciente.diasPendiente = 0;

    this.http.patch(`${this.apiUrl}/pacientes/${paciente.id}/estatus`, {
      estatus: 'pendiente',
      usuarioId: 1
    }).subscribe({
      next: () => {
        this.guardarPendientesEnLocalStorage();
        this.crearNotificacion(
          'Pendiente',
          `Paciente <strong>${paciente.nombre}</strong> marcado como pendiente.<br>
           <span style="font-size: 12px; color: #888;">Se podrá visitar nuevamente en <strong>20 días</strong>.</span>`,
          'info'
        );
        this.aplicarFiltros();
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error:', err);
        this.crearNotificacion(
          'Error',
          'No se pudo actualizar el estado del paciente. Intenta de nuevo.',
          'error'
        );
        this.cargarPacientes();
      }
    });
  }

  marcarFinado(paciente: Paciente) {
    if (confirm(`⚠️ ¿Estás seguro de marcar como FINADO a ${paciente.nombre}?`)) {
      this.http.patch(`${this.apiUrl}/pacientes/${paciente.id}/estatus`, {
        estatus: 'finado',
        usuarioId: 1
      }).subscribe({
        next: () => {
          paciente.estadoVisita = 'completada';
          paciente.fechaPendiente = null;
          paciente.diasPendiente = null;
          this.guardarPendientesEnLocalStorage();
          this.crearNotificacion('Finado', `${paciente.nombre} marcado como finado`, 'error');
          this.aplicarFiltros();
          this.cdr.detectChanges();
        },
        error: (err: any) => {
          console.error('Error:', err);
          this.crearNotificacion('Error', 'No se pudo marcar como finado', 'error');
        }
      });
    }
  }

  // ⭐ ABRIR MODAL COMPLETADA - CON VALIDACIÓN DE 20 DÍAS
  abrirModalCompletada(paciente: Paciente) {
    if (paciente.estadoVisita === 'pendiente' &&
      paciente.diasPendiente !== null &&
      (paciente.diasPendiente ?? 0) < 20) {
      this.crearNotificacion(
        'Visita bloqueada',
        `Deben pasar ${20 - (paciente.diasPendiente ?? 0)} días más para poder completar esta visita.`,
        'warning'
      );
      return;
    }

    this.selectedPaciente = paciente;
    this.fotosPreview = [];
    this.saltarFotoActivo = false;
    this.mostrarModalCompletada = true;
  }

  cerrarModalCompletada() {
    this.mostrarModalCompletada = false;
    this.selectedPaciente = null;
    this.fotosPreview = [];
    this.saltarFotoActivo = false;
  }

  // ⭐ BOTÓN "NO TOMAR FOTO" - SOLO MARCA LA OPCIÓN, NO GUARDA AUTOMÁTICAMENTE
  saltarFoto() {
    if (this.selectedPaciente?.estadoVisita === 'pendiente' &&
      this.selectedPaciente?.diasPendiente !== null &&
      (this.selectedPaciente?.diasPendiente ?? 0) < 20) {
      this.crearNotificacion('Bloqueado', 'Deben pasar 20 días para completar esta visita', 'warning');
      return;
    }

    // ⭐ LIMPIAR FOTOS Y ACTIVAR FLAG
    this.fotosPreview = [];
    this.saltarFotoActivo = true;
    this.crearNotificacion('Sin evidencia', 'La visita se completará sin evidencia fotográfica', 'info');
  }

  // ⭐ FOTOS
  onFotosSeleccionadas(event: any) {
    const files = event.target.files;
    const MAX_FOTOS = 3;
    if (files && files.length > 0) {
      this.saltarFotoActivo = false;

      const filesArray = Array.from(files);
      const espacioDisponible = MAX_FOTOS - this.fotosPreview.length;
      const nuevasFotos = filesArray.slice(0, espacioDisponible);
      for (const file of nuevasFotos) {
        if ((file as File).type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = async (e: any) => {
            const imagenComprimida = await this.comprimirImagen(e.target.result);
            this.fotosPreview.push(imagenComprimida);
          };
          reader.readAsDataURL(file as File);
        }
      }
      event.target.value = '';
    }
  }

  eliminarFoto(index: number) {
    this.fotosPreview.splice(index, 1);
    if (this.fotosPreview.length === 0) {
      this.saltarFotoActivo = false;
    }
  }

  abrirCamara() {
    if (this.fotosPreview.length >= 3) {
      this.crearNotificacion('Límite', 'Ya has tomado el máximo de 3 fotos', 'error');
      return;
    }
    this.saltarFotoActivo = false;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (e: any) => {
          const imagenComprimida = await this.comprimirImagen(e.target.result);
          this.fotosPreview.push(imagenComprimida);
          this.crearNotificacion('Foto tomada', `Foto ${this.fotosPreview.length}/3`, 'success');
        };
        reader.readAsDataURL(file);
      }
      input.value = '';
    };
    input.click();
  }

  // ⭐ GUARDAR COMPLETADA - CON VALIDACIÓN DE FOTOS O SALTAR
  async guardarCompletada() {
    if (!this.selectedPaciente) {
      this.crearNotificacion('Error', 'No hay paciente seleccionado', 'error');
      return;
    }

    if (this.selectedPaciente.estadoVisita === 'pendiente' &&
      this.selectedPaciente.diasPendiente !== null &&
      (this.selectedPaciente.diasPendiente ?? 0) < 20) {
      this.crearNotificacion('Bloqueado', 'Deben pasar 20 días para completar esta visita', 'warning');
      return;
    }

    // ⭐ SI NO HAY FOTOS Y NO SE ACTIVÓ "NO TOMAR FOTO", PREGUNTAR
    if (this.fotosPreview.length === 0 && !this.saltarFotoActivo) {
      const confirmar = confirm('⚠️ No has tomado ninguna foto.\n\n¿Deseas completar la visita sin evidencia fotográfica?');
      if (!confirmar) {
        return;
      }
      this.saltarFotoActivo = true;
    }

    // ⭐ PROCESAR FOTOS
    const fotosComprimidas: string[] = [];
    for (const foto of this.fotosPreview) {
      const comprimida = await this.comprimirImagen(foto);
      fotosComprimidas.push(comprimida);
    }

    // ⭐ CREAR VISITA
    const nuevaVisita: VisitaCompletada = {
      fecha: new Date(),
      ubicacionCoordenadas: 'No registrada',
      ubicacionDireccion: 'No registrada',
      fotos: fotosComprimidas.slice(0, 3),
      coordenadas: 'No registradas'
    };

    if (!this.selectedPaciente.historialVisitas) {
      this.selectedPaciente.historialVisitas = [];
    }
    this.selectedPaciente.historialVisitas.unshift(nuevaVisita);
    if (this.selectedPaciente.historialVisitas.length > 3) {
      this.selectedPaciente.historialVisitas = this.selectedPaciente.historialVisitas.slice(0, 3);
    }

    this.guardarHistorialEnLocalStorage();

    // ⭐ ACTUALIZAR ESTADO
    this.http.patch(`${this.apiUrl}/pacientes/${this.selectedPaciente.id}/estatus`, {
      estatus: 'completada',
      usuarioId: 1
    }).subscribe({
      next: () => {
        if (this.selectedPaciente) {
          this.selectedPaciente.estadoVisita = 'completada';
          this.selectedPaciente.fechaProgramada = new Date();
          this.selectedPaciente.fechaPendiente = null;
          this.selectedPaciente.diasPendiente = null;
        }
        this.guardarPendientesEnLocalStorage();
        this.mostrarModalCompletada = false;
        this.selectedPaciente = null;
        this.fotosPreview = [];
        this.saltarFotoActivo = false;
        this.aplicarFiltros();

        const mensaje = fotosComprimidas.length > 0
          ? 'Visita completada con evidencia fotográfica'
          : 'Visita completada sin evidencia fotográfica';
        this.crearNotificacion('Visita completada', mensaje, 'success');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error:', err);
        this.crearNotificacion('Error', 'No se pudo completar la visita', 'error');
      }
    });
  }

  abrirIncidencia(paciente: Paciente) {
    this.http.patch(`${this.apiUrl}/pacientes/${paciente.id}/estatus`, {
      estatus: 'incidencia',
      usuarioId: 1
    }).subscribe({
      next: () => {
        paciente.estadoVisita = 'incidencia';
        paciente.fechaPendiente = null;
        paciente.diasPendiente = null;
        this.guardarPendientesEnLocalStorage();
        this.crearNotificacion('Incidencia', `${paciente.nombre} tiene una incidencia`, 'warning');
        const datosPaciente = {
          id: paciente.id,
          nombre: paciente.nombre,
          direccion: paciente.direccion,
          telefono: paciente.telefono,
          colonia: paciente.colonia,
          seccion: paciente.seccion
        };
        localStorage.setItem('incidenciaPaciente', JSON.stringify(datosPaciente));
        this.router.navigate(['/incidencias']);
      },
      error: (err: any) => {
        console.error('Error:', err);
        this.crearNotificacion('Error', 'No se pudo marcar la incidencia', 'error');
      }
    });
  }

  // ⭐ ============================================
  // ⭐ NOTIFICACIONES (TOAST) - CON ICONOS
  // ⭐ ============================================

  crearNotificacion(titulo: string, mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'info') {
    const config = {
      success: {
        color: '#2e7d32',
        bgColor: '#e8f5e9',
        icon: 'fa-check-circle',
        borderColor: '#2e7d32',
        iconColor: '#2e7d32'
      },
      error: {
        color: '#c62828',
        bgColor: '#ffebee',
        icon: 'fa-exclamation-circle',
        borderColor: '#c62828',
        iconColor: '#c62828'
      },
      info: {
        color: '#701f2f',
        bgColor: '#fefaf7',
        icon: 'fa-info-circle',
        borderColor: '#701f2f',
        iconColor: '#701f2f'
      },
      warning: {
        color: '#e67e22',
        bgColor: '#fff3e0',
        icon: 'fa-exclamation-triangle',
        borderColor: '#e67e22',
        iconColor: '#e67e22'
      }
    };
    const cfg = config[tipo];
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed; top: 24px; right: 24px; background: white; border-radius: 16px;
      padding: 0; min-width: 320px; max-width: 450px; z-index: 1000000;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12); border-left: 5px solid ${cfg.borderColor};
      animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      font-family: 'Segoe UI', sans-serif; overflow: hidden;
    `;
    toast.innerHTML = `
      <div style="display: flex; align-items: stretch; gap: 0;">
        <div style="background: ${cfg.bgColor}; padding: 18px 16px; display: flex; align-items: center; justify-content: center; min-width: 60px;">
          <i class="fas ${cfg.icon}" style="font-size: 24px; color: ${cfg.iconColor};"></i>
        </div>
        <div style="padding: 16px 20px 16px 16px; flex: 1; display: flex; flex-direction: column; justify-content: center;">
          <div style="font-weight: 700; font-size: 15px; color: #1a1a1a; margin-bottom: 4px;">${titulo}</div>
          <div style="font-size: 13px; color: #555; line-height: 1.4;">${mensaje}</div>
        </div>
        <button onclick="this.closest('div[style]').remove()" style="background: none; border: none; color: #bbb; cursor: pointer; padding: 8px 12px; font-size: 16px; transition: color 0.2s;">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 350);
    }, 4000);
  }

}