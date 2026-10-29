// src/app/pages/pacientes/pacientes.component.ts

import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
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
  estadoVisita: 'completada' | 'pendiente' | 'incidencia' | 'rechazo';
  fechaProgramada?: Date;
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
  estatus?: string;
  finado?: boolean;
  fechaFinado?: string | null;
  discapacidadMotriz?: boolean;
  discapacidadVisual?: boolean;
  discapacidadAuditiva?: boolean;
  discapacidadIntelectual?: boolean;
  discapacidadPsicosocial?: boolean;
  discapacidades?: {
    motriz: boolean;
    visual: boolean;
    auditiva: boolean;
    intelectual: boolean;
    psicosocial: boolean;
  };
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

import { PageHeaderNavComponent } from '../../components/page-header-nav/page-header-nav';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderNavComponent],
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
  tabActivo: 'todos' | 'pendientes' | 'en_espera' | 'vencidos' | 'completadas' | 'incidencias' | 'rechazos' = 'todos';
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

  // ⭐ MODAL EDITAR PACIENTE (DIRECCIÓN, CONTACTO, ESTADO)
  mostrarModalEditar: boolean = false;
  pacienteEditando: any = null;
  guardandoEdicion: boolean = false;
  formEdicion = {
    calleNumero: '',
    colonia: '',
    referencias: '',
    telefonoCelular: '',
    telefonoFijo: '',
    estatus: 'PENDIENTE',
    diasPendiente: 0,
    estatusVital: 'vivo',
    finado: false,
    fechaFinado: '',
    programa: 'PAM',
    discapacidades: {
      motriz: false,
      visual: false,
      auditiva: false,
      intelectual: false,
      psicosocial: false
    }
  };

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
    private route: ActivatedRoute,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {
    console.log('🌍 [Pacientes] API URL:', this.apiUrl);
  }

  ngOnInit() {
    this.cargarPacientes();
    this.generarDiasSemana();
    this.initialLoadDone = true;

    this.route.queryParams.subscribe(params => {
      if (params['editarId']) {
        const pId = parseInt(params['editarId'], 10);
        setTimeout(() => {
          const pac = this.pacientes.find(p => p.id === pId);
          if (pac) {
            this.abrirModalEditar(pac);
          }
        }, 700);
      }
    });

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
    return this.pacientes.filter(p => p.estadoVisita === 'incidencia').length;
  }

  get pacientesRechazosCount(): number {
    return this.pacientes.filter(p => p.estadoVisita === 'rechazo').length;
  }

  // ⭐ CAMBIAR TAB
  cambiarTab(tab: 'todos' | 'pendientes' | 'en_espera' | 'vencidos' | 'completadas' | 'incidencias' | 'rechazos') {
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
      case 'rechazo': return 'estado-rechazo';
      default: return 'estado-pendiente';
    }
  }

  getEstadoIcono(estado: string): string {
    switch (estado) {
      case 'completada': return 'fas fa-circle-check';
      case 'pendiente': return 'fas fa-clock';
      case 'incidencia': return 'fas fa-triangle-exclamation';
      case 'rechazo': return 'fas fa-ban';
      default: return 'fas fa-question-circle';
    }
  }

  getEstadoTexto(estado: string): string {
    switch (estado) {
      case 'completada': return 'Completada';
      case 'pendiente': return 'Pendiente';
      case 'incidencia': return 'Incidencia';
      case 'rechazo': return 'Rechazado';
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

  private obtenerIdEnfermeraActual(): number {
    try {
      const userStr = localStorage.getItem('userData');
      if (userStr) {
        const userObj = JSON.parse(userStr);
        return userObj.id_personal_enfermeria || userObj.id || 1;
      }
    } catch (e) { }
    return 1;
  }

  cargarPacientes() {
    this.loading = true;
    const idEnfermera = this.obtenerIdEnfermeraActual();

    this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}/con-riesgo`)
      .subscribe({
        next: (data: any[]) => {
          if (Array.isArray(data) && data.length > 0) {
            this.pacientes = data.map((p: any) => {
              const discMotriz = !!(p.discapacidadMotriz || p.discapacidades?.motriz);
              const discVisual = !!(p.discapacidadVisual || p.discapacidades?.visual);
              const discAuditiva = !!(p.discapacidadAuditiva || p.discapacidades?.auditiva);
              const discIntelectual = !!(p.discapacidadIntelectual || p.discapacidades?.intelectual);
              const discPsicosocial = !!(p.discapacidadPsicosocial || p.discapacidades?.psicosocial);
              const esFinado = p.finado === true || (p.estatus || '').toUpperCase() === 'FINADO';

              const paciente: Paciente = {
                id: p.id,
                nombre: this.construirNombreCompleto(p),
                direccion: p.direccion || '',
                telefono: p.telefonoCelular || p.telefonoFijo || '',
                colonia: this.extraerColonia(p.direccion, p.zonaTrabajo),
                seccion: p.zonaTrabajo?.split('-').pop() || '',
                estadoVisita: this.mapearEstatus(p.estatus),
                fechaProgramada: p.fechaProgramada ? new Date(p.fechaProgramada) : new Date(),
                tieneIncidencia: ['INCIDENCIA', 'CAMBIO DE DOMICILIO'].includes((p.estatus || '').toUpperCase()),
                apellidoPaterno: p.apellidoPaterno || '',
                apellidoMaterno: p.apellidoMaterno || '',
                nombres: p.nombre || '',
                programa: p.programa || (discMotriz || discVisual || discAuditiva || discIntelectual || discPsicosocial ? 'DISCAPACIDAD' : 'PAM'),
                curp: p.curp,
                nivelRiesgo: p.nivelRiesgo || this.obtenerNivelRiesgoPorEstatus(p.estatus),
                fechaPendiente: null,
                diasPendiente: null,
                visitasCompletadas: 0,
                estatus: p.estatus || 'PENDIENTE',
                finado: esFinado,
                fechaFinado: p.fechaFinado || (esFinado ? new Date().toISOString().split('T')[0] : null),
                discapacidadMotriz: discMotriz,
                discapacidadVisual: discVisual,
                discapacidadAuditiva: discAuditiva,
                discapacidadIntelectual: discIntelectual,
                discapacidadPsicosocial: discPsicosocial,
                discapacidades: {
                  motriz: discMotriz,
                  visual: discVisual,
                  auditiva: discAuditiva,
                  intelectual: discIntelectual,
                  psicosocial: discPsicosocial
                }
              };
              return paciente;
            });
          } else {
            this.cargarPacientesSinNiveles();
          }
          try {
            if (this.pacientes && this.pacientes.length > 0) {
              localStorage.setItem('cuidalia_pacientes_list_' + idEnfermera, JSON.stringify(this.pacientes));
            }
          } catch (e) {}
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
    const idEnfermera = this.obtenerIdEnfermeraActual();
    this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}`)
      .subscribe({
        next: (data: any[]) => {
          if (Array.isArray(data) && data.length > 0) {
            this.pacientes = data.map((p: any) => {
              const discMotriz = !!(p.discapacidadMotriz || p.discapacidades?.motriz);
              const discVisual = !!(p.discapacidadVisual || p.discapacidades?.visual);
              const discAuditiva = !!(p.discapacidadAuditiva || p.discapacidades?.auditiva);
              const discIntelectual = !!(p.discapacidadIntelectual || p.discapacidades?.intelectual);
              const discPsicosocial = !!(p.discapacidadPsicosocial || p.discapacidades?.psicosocial);
              const esFinado = p.finado === true || (p.estatus || '').toUpperCase() === 'FINADO';

              return {
                id: p.id,
                nombre: this.construirNombreCompleto(p),
                direccion: p.direccion || '',
                telefono: p.telefonoCelular || p.telefonoFijo || '',
                colonia: this.extraerColonia(p.direccion, p.zonaTrabajo),
                seccion: p.zonaTrabajo?.split('-').pop() || '',
                estadoVisita: this.mapearEstatus(p.estatus),
                fechaProgramada: p.fechaProgramada ? new Date(p.fechaProgramada) : new Date(),
                tieneIncidencia: ['INCIDENCIA', 'CAMBIO DE DOMICILIO'].includes((p.estatus || '').toUpperCase()),
                historialVisitas: [],
                apellidoPaterno: p.apellidoPaterno || '',
                apellidoMaterno: p.apellidoMaterno || '',
                nombres: p.nombre || '',
                programa: p.programa || (discMotriz || discVisual || discAuditiva || discIntelectual || discPsicosocial ? 'DISCAPACIDAD' : 'PAM'),
                curp: p.curp,
                nivelRiesgo: this.obtenerNivelRiesgoPorEstatus(p.estatus),
                fechaPendiente: null,
                diasPendiente: null,
                visitasCompletadas: 0,
                estatus: p.estatus || 'PENDIENTE',
                finado: esFinado,
                fechaFinado: p.fechaFinado || (esFinado ? new Date().toISOString().split('T')[0] : null),
                discapacidadMotriz: discMotriz,
                discapacidadVisual: discVisual,
                discapacidadAuditiva: discAuditiva,
                discapacidadIntelectual: discIntelectual,
                discapacidadPsicosocial: discPsicosocial,
                discapacidades: {
                  motriz: discMotriz,
                  visual: discVisual,
                  auditiva: discAuditiva,
                  intelectual: discIntelectual,
                  psicosocial: discPsicosocial
                }
              };
            });
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

  private extraerColonia(direccion: string, coloniaOriginal?: string): string {
    if (coloniaOriginal && coloniaOriginal.length > 2) {
      const cUpper = coloniaOriginal.toUpperCase().trim();
      if (!cUpper.includes('DISPONIBLE') &&
          !cUpper.includes('SIN COLONIA') &&
          !/^#|^\d+$/i.test(coloniaOriginal.trim()) &&
          !cUpper.startsWith('REFS')) {
        let limpia = coloniaOriginal
          .replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        return limpia || coloniaOriginal;
      }
    }

    if (!direccion) return '';

    let dirSinRefs = direccion;
    if (direccion.includes('|')) {
      dirSinRefs = direccion.split('|')[0].trim();
    } else if (/Refs\.?:/i.test(direccion)) {
      const idx = direccion.search(/Refs\.?:/i);
      dirSinRefs = direccion.substring(0, idx).trim();
    }

    const matchKeyword = dirSinRefs.match(/(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+([^,\|]+)/i);
    if (matchKeyword && matchKeyword[1]) {
      const candidata = matchKeyword[1].trim();
      if (candidata.length > 2 && !/^#|^\d+$/i.test(candidata) && !/LEON|GTO/i.test(candidata)) {
        return candidata.replace(/CP\s*\d{5}/gi, '').trim();
      }
    }

    let limpiaDir = dirSinRefs
      .replace(/,\s*LEON\s*,?\s*GUANAJUATO.*$/i, '')
      .replace(/,\s*LEON\s*,?\s*GTO.*$/i, '')
      .replace(/,\s*LEON$/i, '')
      .replace(/,\s*GTO$/i, '')
      .trim();

    const partes = limpiaDir.split(',').map(s => s.trim()).filter(Boolean);
    const numIdx = partes.findIndex(p => /^#|^\d+$/i.test(p));
    if (numIdx !== -1 && numIdx + 1 < partes.length) {
      let postNum = partes.slice(numIdx + 1);
      if (postNum.length > 1 && /^\d+$/.test(postNum[0])) {
        postNum = postNum.slice(1);
      }
      let col = postNum.join(', ').trim()
        .replace(/^[-\d]+,\s*/, '')
        .replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '')
        .trim();
      if (col && col.length > 2 && !/^#|^\d+$/i.test(col) && !/LEON|GTO/i.test(col)) {
        return col;
      }
    }

    if (partes.length >= 2) {
      const ultima = partes[partes.length - 1].trim()
        .replace(/^[-\d]+,\s*/, '')
        .replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '')
        .trim();
      if (ultima.length > 2 && !/^#|^\d+$/i.test(ultima) && !/LEON|GTO/i.test(ultima)) {
        return ultima;
      }
    }

    return '';
  }

  private mapearEstatus(estatus: string): 'completada' | 'pendiente' | 'incidencia' | 'rechazo' {
    const s = (estatus || '').toUpperCase();
    if (s === 'VISITADO' || s === 'COMPLETADA' || s === 'COMPLETADO') return 'completada';
    if (s === 'RECHAZO' || s === 'RECHAZADO') return 'rechazo';
    if (s === 'INCIDENCIA' || s === 'CAMBIO DE DOMICILIO') return 'incidencia';
    return 'pendiente';
  }

  // ⭐ ============================================
  // ⭐ CALCULAR DÍAS PENDIENTE Y CICLO DE 20 DÍAS
  // ⭐ ============================================

  private calcularDiasPendiente(fechaPendiente: Date | null | undefined): number | null {
    if (!fechaPendiente) return null;
    const fecha = new Date(fechaPendiente);
    if (isNaN(fecha.getTime())) return null;
    const hoy = new Date();
    const diffTime = hoy.getTime() - fecha.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  private actualizarDiasPendientes() {
    this.pacientes.forEach(p => {
      if (p.estadoVisita === 'pendiente') {
        if (!p.fechaPendiente) {
          p.fechaPendiente = p.fechaProgramada ? new Date(p.fechaProgramada) : new Date();
        }
        p.diasPendiente = this.calcularDiasPendiente(p.fechaPendiente) ?? 0;
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
            fechaPendiente: p.fechaPendiente instanceof Date ? p.fechaPendiente.toISOString() : p.fechaPendiente
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
      const pendientes = pendientesGuardado ? JSON.parse(pendientesGuardado) : {};
      
      const notificadosGuardados = localStorage.getItem('cuidalia_notificados_20d');
      const notificados: string[] = notificadosGuardados ? JSON.parse(notificadosGuardados) : [];
      const nuevosNotificados: string[] = [...notificados];
      let nuevoCambioStorage = false;

      this.pacientes.forEach((p: Paciente) => {
        if (p.estadoVisita === 'pendiente') {
          if (pendientes[p.id] && pendientes[p.id].fechaPendiente) {
            p.fechaPendiente = new Date(pendientes[p.id].fechaPendiente);
          } else {
            // Inicializar fecha base para contar los días que transcurren
            p.fechaPendiente = p.fechaProgramada ? new Date(p.fechaProgramada) : new Date();
            pendientes[p.id] = {
              fechaPendiente: p.fechaPendiente instanceof Date ? p.fechaPendiente.toISOString() : p.fechaPendiente
            };
            nuevoCambioStorage = true;
          }

          p.diasPendiente = this.calcularDiasPendiente(p.fechaPendiente) ?? 0;

          // Al cumplirse el ciclo de 20 días, emitir notificación al usuario
          if (p.diasPendiente >= 20 && !nuevosNotificados.includes(String(p.id))) {
            nuevosNotificados.push(String(p.id));
            this.crearNotificacion(
              '🔔 ¡Listo para visita médica!',
              `El paciente ${p.nombre} ha cumplido su ciclo de espera (${p.diasPendiente}/20 días). Ya está disponible para visita.`,
              'success'
            );
          }
        } else {
          p.diasPendiente = null;
        }
      });

      if (nuevoCambioStorage) {
        localStorage.setItem('pacientesPendientes', JSON.stringify(pendientes));
      }

      if (nuevosNotificados.length !== notificados.length) {
        localStorage.setItem('cuidalia_notificados_20d', JSON.stringify(nuevosNotificados));
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

    let dirSinRefs = direccion;
    if (direccion.includes('|')) {
      dirSinRefs = direccion.split('|')[0].trim();
    } else if (/Refs\.?:/i.test(direccion)) {
      const idx = direccion.search(/Refs\.?:/i);
      dirSinRefs = direccion.substring(0, idx).trim();
    }

    let limpia = dirSinRefs.toUpperCase();

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
    if (estatusUpper === 'VISITADO' || estatusUpper === 'COMPLETADA' || estatusUpper === 'COMPLETADO') return 'g1';
    if (estatusUpper === 'PENDIENTE' || estatusUpper === 'SIN VISITA') return 'g2';
    if (estatusUpper === 'RECHAZO' || estatusUpper === 'RECHAZADO' || estatusUpper === 'INCIDENCIA' || estatusUpper === 'CAMBIO DE DOMICILIO') return 'g3';
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
      base = base.filter(p => p.estadoVisita === 'incidencia' || (p.tieneIncidencia && p.estadoVisita !== 'rechazo'));
    } else if (this.tabActivo === 'rechazos') {
      base = base.filter(p => p.estadoVisita === 'rechazo');
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
    const idEnfermera = this.obtenerIdEnfermeraActual();
    this.pacientes = [];

    // ⭐ 1. PRIMERO INTENTAR CARGAR LA LISTA COMPLETA REAL GUARDADA EN CACHÉ
    try {
      const listCache = localStorage.getItem('cuidalia_pacientes_list_' + idEnfermera);
      if (listCache) {
        const parsed = JSON.parse(listCache);
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`📶 [Offline Pacientes] Cargados ${parsed.length} pacientes reales desde caché local para enfermera ${idEnfermera}`);
          this.pacientes = parsed.map((p: any) => ({
            ...p,
            fechaProgramada: p.fechaProgramada ? new Date(p.fechaProgramada) : new Date(),
            fechaPendiente: p.fechaPendiente ? new Date(p.fechaPendiente) : null
          }));
          this.cargarHistorialDesdeLocalStorage();
          this.cargarPendientesDesdeLocalStorage();
          this.aplicarFiltros();
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }
      }

      // ⭐ 2. SI NO EXISTE LA LISTA FORMATEADA, BUSCAR EL RAW DE LA BD
      const rawCache = localStorage.getItem('cuidalia_pacientes_raw_' + idEnfermera);
      if (rawCache) {
        const raw = JSON.parse(rawCache);
        if (Array.isArray(raw) && raw.length > 0) {
          console.log(`📶 [Offline Pacientes] Mapeando ${raw.length} pacientes desde raw caché local`);
          this.pacientes = raw.map((p: any) => ({
            id: p.id,
            nombre: this.construirNombreCompleto(p),
            direccion: p.direccion || '',
            telefono: p.telefonoCelular || p.telefonoFijo || '',
            colonia: this.extraerColonia(p.direccion, p.zonaTrabajo),
            seccion: p.zonaTrabajo?.split('-').pop() || '',
            estadoVisita: this.mapearEstatus(p.estatus),
            fechaProgramada: p.fechaProgramada ? new Date(p.fechaProgramada) : new Date(),
            tieneIncidencia: ['INCIDENCIA', 'CAMBIO DE DOMICILIO'].includes((p.estatus || '').toUpperCase()),
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
          this.cargarHistorialDesdeLocalStorage();
          this.cargarPendientesDesdeLocalStorage();
          this.aplicarFiltros();
          this.loading = false;
          this.cdr.detectChanges();
          return;
        }
      }
    } catch (e) {
      console.error('Error recuperando pacientes offline:', e);
    }

    console.warn('⚠️ No hay pacientes en caché local para mostrar offline.');
    this.loading = false;
    this.aplicarFiltros();
    this.cdr.detectChanges();
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

    // ⭐ SI ESTÁ EN INCIDENCIA O RECHAZO, USAR SWEETALERT2
    if (paciente.estadoVisita === 'incidencia' || paciente.estadoVisita === 'rechazo') {
      const esRechazo = paciente.estadoVisita === 'rechazo';
      const alertaTitulo = esRechazo ? 'Este paciente rechazó la atención previamente' : 'Este paciente tiene una incidencia registrada';
      const alertaColor = esRechazo ? '#b91c1c' : '#c2410c';
      const alertaBg = esRechazo ? '#fee2e2' : '#fff7ed';
      const alertaIcon = esRechazo ? 'fa-ban' : 'fa-triangle-exclamation';

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
          <div style="background: ${alertaBg}; padding: 12px; border-radius: 10px; border-left: 4px solid ${alertaColor}; margin: 10px 0;">
            <i class="fas ${alertaIcon}" style="color: ${alertaColor}; margin-right: 8px;"></i>
            <span style="color: ${alertaColor}; font-weight: 600;">${alertaTitulo}</span>
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

    // Resetear notificación previa para nuevo ciclo de 20 días
    try {
      const notificadosGuardados = localStorage.getItem('cuidalia_notificados_20d');
      if (notificadosGuardados) {
        let notificados: string[] = JSON.parse(notificadosGuardados);
        notificados = notificados.filter(id => id !== String(paciente.id));
        localStorage.setItem('cuidalia_notificados_20d', JSON.stringify(notificados));
      }
    } catch (e) {}

    this.http.patch(`${this.apiUrl}/pacientes/${paciente.id}/estatus`, {
      estatus: 'pendiente',
      usuarioId: 1
    }).subscribe({
      next: () => {
        this.guardarPendientesEnLocalStorage();
        this.crearNotificacion(
          'Pendiente',
          `Paciente <strong>${paciente.nombre}</strong> marcado como pendiente.<br>
           <span style="font-size: 12px; color: #888;">Ciclo iniciado (0/20 días). Se le notificará al cumplir 20 días.</span>`,
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

  async marcarFinado(paciente: Paciente) {
    const result = await Swal.fire({
      title: '¿Confirmar Finado?',
      html: `
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px; background: #fdf2f4; padding: 14px; border-radius: 12px; border: 1px solid #fce7eb;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: #0f172a; display: flex; align-items: center; justify-content: center; color: white; font-size: 22px; flex-shrink: 0;">
            <i class="fas fa-skull"></i>
          </div>
          <div style="text-align: left; overflow: hidden;">
            <div style="font-weight: 700; font-size: 15px; color: #701f2f;">${paciente.nombre}</div>
            <div style="font-size: 12px; color: #666; margin-top: 2px;"><i class="fas fa-map-marker-alt"></i> ${paciente.direccion || 'Sin dirección'}</div>
          </div>
        </div>
        <div style="background: #fee2e2; padding: 12px 14px; border-radius: 10px; border-left: 4px solid #ef4444; margin-bottom: 10px; text-align: left;">
          <div style="color: #991b1b; font-weight: 700; font-size: 13px; margin-bottom: 3px;">
            <i class="fas fa-exclamation-triangle"></i> Acción irreversible
          </div>
          <p style="font-size: 12.5px; color: #7f1d1d; margin: 0; line-height: 1.4;">
            El paciente será registrado con estatus <strong>FINADO</strong> y se actualizará su expediente en el sistema.
          </p>
        </div>
      `,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#64748b',
      confirmButtonText: '<i class="fas fa-skull" style="margin-right: 6px;"></i> Sí, marcar como Finado',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      customClass: {
        popup: 'swal-pendiente-popup',
        confirmButton: 'swal-confirm-btn',
        cancelButton: 'swal-cancel-btn'
      }
    });

    if (!result.isConfirmed) {
      return;
    }

    this.http.patch(`${this.apiUrl}/pacientes/${paciente.id}/estatus`, {
      estatus: 'finado',
      usuarioId: 1
    }).subscribe({
      next: () => {
        paciente.estadoVisita = 'completada';
        paciente.fechaPendiente = null;
        paciente.diasPendiente = null;
        this.guardarPendientesEnLocalStorage();

        Swal.fire({
          icon: 'success',
          title: 'Registrado como Finado',
          text: `${paciente.nombre} ha sido marcado como finado.`,
          confirmButtonColor: '#701f2f',
          timer: 2500,
          timerProgressBar: true
        });

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

  // ⭐ ABRIR MODAL COMPLETADA - CON VALIDACIÓN DE 20 DÍAS
  abrirModalCompletada(paciente: Paciente) {
    if (paciente.estadoVisita === 'pendiente' &&
      paciente.diasPendiente !== null &&
      (paciente.diasPendiente ?? 0) < 20) {
      const diasFaltantes = 20 - (paciente.diasPendiente ?? 0);
      Swal.fire({
        title: 'Visita Bloqueada',
        html: `
          <div style="text-align: center; padding: 8px 0;">
            <div style="width: 56px; height: 56px; margin: 0 auto 14px; border-radius: 50%; background: #fff3e0; display: flex; align-items: center; justify-content: center; color: #e67e22; font-size: 26px;">
              <i class="fas fa-lock"></i>
            </div>
            <p style="font-size: 15px; color: #333; margin-bottom: 10px;">
              El paciente <strong style="color: #701f2f;">${paciente.nombre}</strong> se encuentra en período de espera reglamentario.
            </p>
            <div style="background: #fff8e6; padding: 12px 16px; border-radius: 10px; border: 1px solid #fed7aa; margin-top: 10px;">
              <span style="color: #c2410c; font-size: 13.5px; font-weight: 600;">
                <i class="fas fa-calendar-day"></i> Faltan <strong>${diasFaltantes} ${diasFaltantes === 1 ? 'día' : 'días'}</strong> para completar el ciclo de 20 días.
              </span>
            </div>
          </div>
        `,
        icon: 'warning',
        confirmButtonColor: '#e67e22',
        confirmButtonText: 'Entendido',
        customClass: {
          popup: 'swal-pendiente-popup',
          confirmButton: 'swal-confirm-btn'
        }
      });
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

    // ⭐ SI NO HAY FOTOS Y NO SE ACTIVÓ "NO TOMAR FOTO", PREGUNTAR CON SWEETALERT2
    if (this.fotosPreview.length === 0 && !this.saltarFotoActivo) {
      const confirmResult = await Swal.fire({
        title: '¿Completar sin evidencia fotográfica?',
        html: `
          <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px; background: #fdf2f4; padding: 14px; border-radius: 12px; border: 1px solid #fce7eb;">
            <div style="width: 48px; height: 48px; border-radius: 50%; background: #701f2f; display: flex; align-items: center; justify-content: center; color: white; font-size: 22px; flex-shrink: 0;">
              <i class="fas fa-camera-slash"></i>
            </div>
            <div style="text-align: left; overflow: hidden;">
              <div style="font-weight: 700; font-size: 15px; color: #701f2f; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${this.selectedPaciente.nombre}</div>
              <div style="font-size: 12px; color: #666; margin-top: 2px;"><i class="fas fa-map-marker-alt"></i> ${this.selectedPaciente.direccion || 'Sin dirección'}</div>
            </div>
          </div>
          <div style="background: #fff8e6; padding: 12px 14px; border-radius: 10px; border-left: 4px solid #f59e0b; margin-bottom: 12px; text-align: left;">
            <div style="display: flex; align-items: center; gap: 8px; color: #b45309; font-weight: 700; font-size: 13px; margin-bottom: 4px;">
              <i class="fas fa-triangle-exclamation"></i> No has adjuntado fotos de evidencia
            </div>
            <p style="font-size: 12.5px; color: #78350f; margin: 0; line-height: 1.4;">
              ¿Deseas marcar y guardar la visita médica de este paciente como <strong>COMPLETADA</strong> sin evidencia fotográfica?
            </p>
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-check-circle" style="margin-right: 6px;"></i> Sí, completar visita',
        cancelButtonText: '<i class="fas fa-camera" style="margin-right: 6px;"></i> Tomar fotografía',
        reverseButtons: true,
        backdrop: 'rgba(0, 0, 0, 0.5)',
        customClass: {
          popup: 'swal-completada-popup',
          confirmButton: 'swal-confirm-btn',
          cancelButton: 'swal-cancel-btn'
        }
      });

      if (!confirmResult.isConfirmed) {
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

    const pacienteGuardado = this.selectedPaciente;
    const nombreGuardado = this.selectedPaciente.nombre;

    // ⭐ CREAR VISITA
    const nuevaVisita: VisitaCompletada = {
      fecha: new Date(),
      ubicacionCoordenadas: 'No registrada',
      ubicacionDireccion: 'No registrada',
      fotos: fotosComprimidas.slice(0, 3),
      coordenadas: 'No registradas'
    };

    if (!pacienteGuardado.historialVisitas) {
      pacienteGuardado.historialVisitas = [];
    }
    pacienteGuardado.historialVisitas.unshift(nuevaVisita);
    if (pacienteGuardado.historialVisitas.length > 3) {
      pacienteGuardado.historialVisitas = pacienteGuardado.historialVisitas.slice(0, 3);
    }

    this.guardarHistorialEnLocalStorage();

    // ⭐ ACTUALIZAR ESTADO
    this.http.patch(`${this.apiUrl}/pacientes/${pacienteGuardado.id}/estatus`, {
      estatus: 'completada',
      usuarioId: 1
    }).subscribe({
      next: () => {
        pacienteGuardado.estadoVisita = 'completada';
        pacienteGuardado.fechaProgramada = new Date();
        pacienteGuardado.fechaPendiente = null;
        pacienteGuardado.diasPendiente = null;

        this.guardarPendientesEnLocalStorage();
        this.mostrarModalCompletada = false;
        this.selectedPaciente = null;
        this.fotosPreview = [];
        this.saltarFotoActivo = false;
        this.aplicarFiltros();

        const mensaje = fotosComprimidas.length > 0
          ? 'Visita completada con evidencia fotográfica'
          : 'Visita completada sin evidencia fotográfica';

        Swal.fire({
          icon: 'success',
          title: '¡Visita Completada con Éxito!',
          html: `
            <div style="text-align: center; padding: 6px 0;">
              <p style="font-size: 15px; color: #333; margin-bottom: 12px;">
                Se registró exitosamente la visita para <strong style="color: #701f2f;">${nombreGuardado}</strong>.
              </p>
              <div style="display: inline-flex; align-items: center; gap: 8px; background: #e8f5e9; color: #166534; font-size: 13px; font-weight: 600; padding: 6px 16px; border-radius: 20px; border: 1px solid #c8e6c9;">
                <i class="fas ${fotosComprimidas.length > 0 ? 'fa-camera' : 'fa-check-double'}"></i>
                <span>${mensaje}</span>
              </div>
            </div>
          `,
          confirmButtonColor: '#10b981',
          confirmButtonText: '<i class="fas fa-check"></i> Aceptar',
          timer: 3500,
          timerProgressBar: true,
          customClass: {
            popup: 'swal-completada-popup',
            confirmButton: 'swal-confirm-btn'
          }
        });

        this.crearNotificacion('Visita completada', mensaje, 'success');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error:', err);
        Swal.fire({
          icon: 'error',
          title: 'Error al completar visita',
          text: 'No se pudo guardar la visita en el servidor. Por favor, intenta de nuevo.',
          confirmButtonColor: '#701f2f'
        });
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



  // ⭐ ============================================
  // ⭐ MODAL EDITAR PACIENTE (DIRECCIÓN, CONTACTO, ESTADO)
  // ⭐ ============================================

  abrirModalEditar(paciente: Paciente) {
    this.pacienteEditando = paciente;
    this.guardandoEdicion = false;

    const dir = paciente.direccion || '';
    let calleNum = '';
    let col = paciente.colonia || '';
    let refs = '';

    if (dir.includes('|')) {
      const parts = dir.split('|');
      refs = parts.slice(1).join('|').replace(/^[\s:]*Refs\.?:?\s*/i, '').trim();
      calleNum = parts[0].trim();
    } else if (/Refs\.?:/i.test(dir)) {
      const idx = dir.search(/Refs\.?:/i);
      refs = dir.substring(idx).replace(/^Refs\.?:?\s*/i, '').trim();
      calleNum = dir.substring(0, idx).trim();
    } else {
      calleNum = dir;
    }

    calleNum = calleNum
      .replace(/,\s*LEON\s*,?\s*GUANAJUATO.*$/i, '')
      .replace(/,\s*LEON\s*,?\s*GTO.*$/i, '')
      .replace(/,\s*LEON$/i, '')
      .replace(/,\s*GTO$/i, '')
      .trim();

    if (col && calleNum.toLowerCase().includes(col.toLowerCase())) {
      const safeCol = col.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexCol = new RegExp(`,?\\s*(?:COLONIA|COL\\.)?\\s*` + safeCol, 'i');
      calleNum = calleNum.replace(regexCol, '').trim();
    }

    const tel = (paciente.telefono || '').trim();
    let telCel = '';
    let telFijo = '';
    if (tel.includes('/')) {
      const p = tel.split('/');
      telCel = p[0].trim();
      telFijo = p[1].trim();
    } else {
      telCel = tel;
    }

    let st = 'PENDIENTE';
    if (paciente.estadoVisita === 'completada') st = 'COMPLETADA';
    else if (paciente.estadoVisita === 'rechazo') st = 'RECHAZO';
    else if (paciente.estadoVisita === 'incidencia') st = 'INCIDENCIA';
    else if ((paciente as any).estatus === 'FINADO') st = 'FINADO';

    const esFinado = (paciente as any).estatus === 'FINADO' || paciente.finado === true || paciente.estadoVisita === ('finado' as any);
    const estatusVital = esFinado ? 'finado' : 'vivo';

    const discMotriz = !!(paciente.discapacidadMotriz || (paciente as any).discapacidades?.motriz);
    const discVisual = !!(paciente.discapacidadVisual || (paciente as any).discapacidades?.visual);
    const discAuditiva = !!(paciente.discapacidadAuditiva || (paciente as any).discapacidades?.auditiva);
    const discIntelectual = !!(paciente.discapacidadIntelectual || (paciente as any).discapacidades?.intelectual);
    const discPsicosocial = !!(paciente.discapacidadPsicosocial || (paciente as any).discapacidades?.psicosocial);

    const tieneAlgunaDisc = discMotriz || discVisual || discAuditiva || discIntelectual || discPsicosocial;
    const prog = paciente.programa || (tieneAlgunaDisc ? 'DISCAPACIDAD' : 'PAM');

    this.formEdicion = {
      calleNumero: calleNum,
      colonia: col,
      referencias: refs,
      telefonoCelular: telCel,
      telefonoFijo: telFijo,
      estatus: esFinado ? 'FINADO' : st,
      diasPendiente: paciente.diasPendiente ?? 0,
      estatusVital: estatusVital,
      finado: esFinado,
      fechaFinado: paciente.fechaFinado || (esFinado ? new Date().toISOString().split('T')[0] : ''),
      programa: prog,
      discapacidades: {
        motriz: discMotriz,
        visual: discVisual,
        auditiva: discAuditiva,
        intelectual: discIntelectual,
        psicosocial: discPsicosocial
      }
    };

    this.mostrarModalEditar = true;
    this.cdr.detectChanges();
  }

  onEstatusVivoEdicion() {
    this.formEdicion.estatusVital = 'vivo';
    this.formEdicion.finado = false;
    if (this.formEdicion.estatus === 'FINADO') {
      this.formEdicion.estatus = 'PENDIENTE';
    }
    this.cdr.detectChanges();
  }

  onEstatusFinadoEdicion() {
    this.formEdicion.estatusVital = 'finado';
    this.formEdicion.finado = true;
    this.formEdicion.estatus = 'FINADO';
    if (!this.formEdicion.fechaFinado) {
      this.formEdicion.fechaFinado = new Date().toISOString().split('T')[0];
    }
    this.cdr.detectChanges();
  }

  toggleDiscapacidadEdicion(tipo: 'motriz' | 'visual' | 'auditiva' | 'intelectual' | 'psicosocial') {
    if (this.formEdicion.finado || this.formEdicion.estatusVital === 'finado') {
      return;
    }
    if (!this.formEdicion.discapacidades) {
      this.formEdicion.discapacidades = {
        motriz: false,
        visual: false,
        auditiva: false,
        intelectual: false,
        psicosocial: false
      };
    }
    this.formEdicion.discapacidades[tipo] = !this.formEdicion.discapacidades[tipo];

    const algunaActiva = Object.values(this.formEdicion.discapacidades).some(v => !!v);
    if (algunaActiva) {
      this.formEdicion.programa = 'DISCAPACIDAD';
    } else if (this.formEdicion.programa === 'DISCAPACIDAD') {
      this.formEdicion.programa = 'PAM';
    }
    this.cdr.detectChanges();
  }

  cerrarModalEditar() {
    this.mostrarModalEditar = false;
    this.pacienteEditando = null;
    this.guardandoEdicion = false;
  }

  guardarEdicionPaciente() {
    if (!this.pacienteEditando) return;
    if (!this.formEdicion.calleNumero.trim() || !this.formEdicion.colonia.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Por favor ingresa la calle con número y la colonia.',
        confirmButtonColor: '#7e101f'
      });
      return;
    }

    this.guardandoEdicion = true;

    const cNum = this.formEdicion.calleNumero.trim();
    const col = this.formEdicion.colonia.trim();
    const refs = this.formEdicion.referencias.trim();
    let nuevaDireccion = `${cNum}, ${col}, LEON, GUANAJUATO`;
    if (refs) {
      nuevaDireccion += ` | Refs.: ${refs}`;
    }

    const tieneAlgunaDiscapacidad = !!(
      this.formEdicion.discapacidades?.motriz ||
      this.formEdicion.discapacidades?.visual ||
      this.formEdicion.discapacidades?.auditiva ||
      this.formEdicion.discapacidades?.intelectual ||
      this.formEdicion.discapacidades?.psicosocial
    );

    const esFinado = this.formEdicion.estatusVital === 'finado' || this.formEdicion.estatus === 'FINADO' || !!this.formEdicion.finado;
    const estatusFinal = esFinado ? 'FINADO' : (this.formEdicion.estatus || 'PENDIENTE');
    const programaFinal = tieneAlgunaDiscapacidad ? 'DISCAPACIDAD' : (this.formEdicion.programa || 'PAM');
    const fechaFinadoFinal = esFinado ? (this.formEdicion.fechaFinado || new Date().toISOString().split('T')[0]) : null;

    const payload: any = {
      direccion: nuevaDireccion,
      zonaTrabajo: col,
      telefonoCelular: this.formEdicion.telefonoCelular.trim(),
      telefonoFijo: this.formEdicion.telefonoFijo.trim(),
      estatus: estatusFinal,
      programa: programaFinal,
      finado: esFinado,
      fechaFinado: fechaFinadoFinal,
      discapacidadMotriz: !!this.formEdicion.discapacidades?.motriz,
      discapacidadVisual: !!this.formEdicion.discapacidades?.visual,
      discapacidadAuditiva: !!this.formEdicion.discapacidades?.auditiva,
      discapacidadIntelectual: !!this.formEdicion.discapacidades?.intelectual,
      discapacidadPsicosocial: !!this.formEdicion.discapacidades?.psicosocial,
      discapacidades: {
        motriz: !!this.formEdicion.discapacidades?.motriz,
        visual: !!this.formEdicion.discapacidades?.visual,
        auditiva: !!this.formEdicion.discapacidades?.auditiva,
        intelectual: !!this.formEdicion.discapacidades?.intelectual,
        psicosocial: !!this.formEdicion.discapacidades?.psicosocial
      }
    };

    this.http.patch(`${this.apiUrl}/pacientes/${this.pacienteEditando.id}`, payload).subscribe({
      next: (res: any) => {
        this.guardandoEdicion = false;

        this.pacienteEditando.direccion = nuevaDireccion;
        this.pacienteEditando.colonia = col;
        this.pacienteEditando.telefono = this.formEdicion.telefonoCelular || this.formEdicion.telefonoFijo;
        this.pacienteEditando.estadoVisita = this.mapearEstatus(estatusFinal);
        this.pacienteEditando.estatus = estatusFinal;
        this.pacienteEditando.finado = esFinado;
        this.pacienteEditando.fechaFinado = fechaFinadoFinal;
        this.pacienteEditando.programa = programaFinal;
        this.pacienteEditando.discapacidadMotriz = payload.discapacidadMotriz;
        this.pacienteEditando.discapacidadVisual = payload.discapacidadVisual;
        this.pacienteEditando.discapacidadAuditiva = payload.discapacidadAuditiva;
        this.pacienteEditando.discapacidadIntelectual = payload.discapacidadIntelectual;
        this.pacienteEditando.discapacidadPsicosocial = payload.discapacidadPsicosocial;
        this.pacienteEditando.discapacidades = { ...payload.discapacidades };
        if (estatusFinal === 'PENDIENTE') {
          const dias = Math.max(0, Number(this.formEdicion.diasPendiente) || 0);
          const fechaCalculada = new Date(Date.now() - (dias * 24 * 60 * 60 * 1000));
          this.pacienteEditando.fechaPendiente = fechaCalculada;
          this.pacienteEditando.diasPendiente = dias;
        }

        const idx = this.pacientes.findIndex(p => p.id === this.pacienteEditando.id);
        if (idx !== -1) {
          this.pacientes[idx].direccion = nuevaDireccion;
          this.pacientes[idx].colonia = col;
          this.pacientes[idx].telefono = this.formEdicion.telefonoCelular || this.formEdicion.telefonoFijo;
          this.pacientes[idx].estadoVisita = this.mapearEstatus(estatusFinal);
          this.pacientes[idx].estatus = estatusFinal;
          this.pacientes[idx].finado = esFinado;
          this.pacientes[idx].fechaFinado = fechaFinadoFinal;
          this.pacientes[idx].programa = programaFinal;
          this.pacientes[idx].discapacidadMotriz = payload.discapacidadMotriz;
          this.pacientes[idx].discapacidadVisual = payload.discapacidadVisual;
          this.pacientes[idx].discapacidadAuditiva = payload.discapacidadAuditiva;
          this.pacientes[idx].discapacidadIntelectual = payload.discapacidadIntelectual;
          this.pacientes[idx].discapacidadPsicosocial = payload.discapacidadPsicosocial;
          this.pacientes[idx].discapacidades = { ...payload.discapacidades };
          if (estatusFinal === 'PENDIENTE') {
            const dias = Math.max(0, Number(this.formEdicion.diasPendiente) || 0);
            const fechaCalculada = new Date(Date.now() - (dias * 24 * 60 * 60 * 1000));
            this.pacientes[idx].fechaPendiente = fechaCalculada;
            this.pacientes[idx].diasPendiente = dias;
            this.guardarPendientesEnLocalStorage();
          }
        }

        const idEnfermera = this.obtenerIdEnfermeraActual();
        try {
          localStorage.setItem('cuidalia_pacientes_list_' + idEnfermera, JSON.stringify(this.pacientes));
        } catch (e) {}

        this.aplicarFiltros();
        this.cerrarModalEditar();
        this.cdr.detectChanges();

        Swal.fire({
          icon: 'success',
          title: '¡Paciente Actualizado!',
          text: 'La dirección, condición vital, discapacidades y estatus se guardaron correctamente.',
          confirmButtonColor: '#7e101f',
          timer: 2500,
          timerProgressBar: true
        });
      },
      error: (err: any) => {
        this.guardandoEdicion = false;
        console.error('Error al guardar edición de paciente:', err);
        Swal.fire({
          icon: 'error',
          title: 'Error al guardar',
          text: 'No se pudo conectar con el servidor para actualizar el paciente.',
          confirmButtonColor: '#7e101f'
        });
      }
    });
  }

}
