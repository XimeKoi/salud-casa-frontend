import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

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
  ubicacionCoordenadas: string = '';
  ubicacionDireccionReal: string = '';
  obteniendoUbicacion = false;
  latitud: number | null = null;
  longitud: number | null = null;

  pacienteHistorial: Paciente | null = null;
  historialVisitas: VisitaCompletada[] = [];

  fotoModalVisible = false;
  fotoModalSrc = '';

  diasSemana: DiaCalendario[] = [];

  loading = false;
  private initialLoadDone = false;

  // Paginación
  paginaActual: number = 1;
  itemsPorPagina: number = 10;
  totalPaginas: number = 1;
  paginas: number[] = [];

  // Para la recarga automática
  private navigationSubscription: Subscription = new Subscription();

  constructor(
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }

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

  verificarElementosPaginacion() {
    const paginationElement = document.querySelector('.pagination-container');
    const scrollElement = document.querySelector('.tabla-scroll-wrapper');
  }

  get pacientesPaginados(): Paciente[] {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.pacientesFiltrados.slice(inicio, fin);
  }

  cambiarPagina(pagina: number) {
    if (pagina < 1 || pagina > this.totalPaginas) return;
    this.paginaActual = pagina;
    const tablaContainer = document.querySelector('.tabla-scroll-wrapper');
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

  cargarPacientes() {
    this.loading = true;
    const idEnfermera = 1;

    this.http.get<any[]>(`http://localhost:3000/pacientes/enfermera/${idEnfermera}`)
      .subscribe({
        next: (data) => {
          if (Array.isArray(data) && data.length > 0) {
            this.pacientes = data.map(p => ({
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
              curp: p.curp
            }));
          } else {
            this.cargarPacientesLocal();
          }
          this.cargarHistorialDesdeLocalStorage();
          this.aplicarFiltros();
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error al cargar pacientes:', err);
          this.cargarPacientesLocal();
          this.loading = false;
        }
      });
  }

  aplicarFiltros() {
    this.pacientesFiltrados = this.pacientes.filter(p => {
      const cumpleBusqueda = !this.filtroBusqueda ||
        p.nombre.toLowerCase().includes(this.filtroBusqueda.toLowerCase()) ||
        p.direccion.toLowerCase().includes(this.filtroBusqueda.toLowerCase()) ||
        p.colonia.toLowerCase().includes(this.filtroBusqueda.toLowerCase()) ||
        p.seccion.includes(this.filtroBusqueda);
      const cumpleEstado = this.filtroEstado === 'todos' || p.estadoVisita === this.filtroEstado;
      return cumpleBusqueda && cumpleEstado;
    });
    this.paginaActual = 1;
    this.calcularPaginas();
  }

  construirNombreCompleto(paciente: any): string {
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

  extraerColonia(direccion: string): string {
    if (!direccion) return '';
    const partes = direccion.split(',');
    if (partes.length >= 2) return partes[1].trim();
    return '';
  }

  mapearEstatus(estatus: string): 'completada' | 'pendiente' | 'incidencia' {
    if (estatus === 'VISITADO' || estatus === 'completada') return 'completada';
    if (estatus === 'RECHAZO' || estatus === 'incidencia') return 'incidencia';
    return 'pendiente';
  }

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
        historialVisitas: []
      });
    }
    localStorage.setItem('pacientesCache', JSON.stringify(this.pacientes));
    this.cargarHistorialDesdeLocalStorage();
    this.aplicarFiltros();
  }

  cargarHistorialDesdeLocalStorage() {
    try {
      const historialGuardado = localStorage.getItem('historialVisitasPacientes');
      if (historialGuardado) {
        const historial = JSON.parse(historialGuardado);
        this.pacientes.forEach(paciente => {
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
      this.pacientes.forEach(paciente => {
        if (paciente.historialVisitas && paciente.historialVisitas.length > 0) {
          historial[paciente.id] = paciente.historialVisitas.slice(0, 3);
        }
      });
      localStorage.setItem('historialVisitasPacientes', JSON.stringify(historial));
    } catch (error) {
      console.error('Error al guardar:', error);
    }
  }

  async obtenerDireccionDesdeCoordenadas(lat: number, lng: number): Promise<string> {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`);
      const data = await response.json();
      if (data && data.address) {
        const addr = data.address;
        const calle = addr.road || addr.street || '';
        const numero = addr.house_number || '';
        const colonia = addr.suburb || addr.neighbourhood || '';
        let direccion = '';
        if (calle) direccion += calle;
        if (numero) direccion += ` #${numero}`;
        if (colonia) direccion += `, ${colonia}`;
        return direccion || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } catch (error) {
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  }

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

  // ==================== MÉTODOS DE CALENDARIO (MODAL) ====================

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
    this.diasSemana.forEach(dia => {
      dia.totalVisitas = dia.visitas.length;
      dia.completadas = dia.visitas.filter(v => v.estatus === 'completada').length;
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
    const index = this.visitasSeleccionadas.findIndex(v => v === visita);
    if (index === -1) this.visitasSeleccionadas.push(visita);
    else this.visitasSeleccionadas.splice(index, 1);
  }

  // ==================== MÉTODOS DE REAGENDAR ====================

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
      this.http.post(`http://localhost:3000/pacientes/${this.selectedPaciente.id}/visita/reagendar`, {
        fechaAnterior: this.visitaParaReagendar?.hora || 'No especificada',
        fechaNueva: `${this.nuevaFechaReagendar} ${this.nuevaHoraReagendar}`,
        usuarioId: 1
      }).subscribe({
        next: () => {
          this.crearNotificacion('🔄 Visita Reagendada',
            `La visita ha sido reagendada para el ${this.nuevaFechaReagendar} a las ${this.nuevaHoraReagendar}`,
            'success'
          );
          this.cerrarModalReagendar();
        },
        error: (err) => {
          console.error('Error al reagendar visita:', err);
          this.crearNotificacion('❌ Error', 'No se pudo reagendar la visita', 'error');
        }
      });
    } else {
      this.crearNotificacion('Error', 'No hay paciente seleccionado', 'error');
    }
  }

  // ==================== MÉTODOS DE HISTORIAL ====================

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

  // ==================== MÉTODOS PARA CAMBIAR ESTADO ====================

  marcarPendiente(paciente: Paciente) {
    paciente.estadoVisita = 'pendiente';
    this.http.patch(`http://localhost:3000/pacientes/${paciente.id}/estatus`, {
      estatus: 'pendiente',
      usuarioId: 1
    }).subscribe({
      next: () => {
        this.crearNotificacion('📋 Pendiente', `${paciente.nombre} marcado como pendiente`, 'info');
        this.aplicarFiltros();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error:', err);
        this.crearNotificacion('❌ Error', 'No se pudo actualizar el estado', 'error');
        this.cargarPacientes();
      }
    });
  }

  marcarFinado(paciente: Paciente) {
    if (confirm(`⚠️ ¿Estás seguro de marcar como FINADO a ${paciente.nombre}?`)) {
      this.http.patch(`http://localhost:3000/pacientes/${paciente.id}/estatus`, {
        estatus: 'finado',
        usuarioId: 1
      }).subscribe({
        next: () => {
          paciente.estadoVisita = 'completada';
          this.crearNotificacion('⚰️ Finado', `${paciente.nombre} marcado como finado`, 'error');
          this.aplicarFiltros();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error:', err);
          this.crearNotificacion('❌ Error', 'No se pudo marcar como finado', 'error');
        }
      });
    }
  }

  abrirModalCompletada(paciente: Paciente) {
    this.selectedPaciente = paciente;
    this.fotosPreview = [];
    this.ubicacionCoordenadas = '';
    this.ubicacionDireccionReal = '';
    this.mostrarModalCompletada = true;
    setTimeout(() => {
      this.obtenerUbicacion();
    }, 300);
  }

  cerrarModalCompletada() {
    this.mostrarModalCompletada = false;
    this.selectedPaciente = null;
    this.fotosPreview = [];
  }

  obtenerUbicacion() {
    this.obteniendoUbicacion = true;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          this.latitud = position.coords.latitude;
          this.longitud = position.coords.longitude;
          this.ubicacionCoordenadas = `${this.latitud.toFixed(6)}, ${this.longitud.toFixed(6)}`;
          const direccion = await this.obtenerDireccionDesdeCoordenadas(this.latitud, this.longitud);
          this.ubicacionDireccionReal = direccion;
          this.obteniendoUbicacion = false;
          this.crearNotificacion('📍 Ubicación obtenida', direccion, 'info');
        },
        (error) => {
          console.error('Error:', error);
          this.obteniendoUbicacion = false;
          this.crearNotificacion('⚠️ Error', 'No se pudo obtener la ubicación', 'error');
        }
      );
    } else {
      this.ubicacionCoordenadas = 'Geolocalización no soportada';
      this.obteniendoUbicacion = false;
      this.crearNotificacion('⚠️ Error', 'Geolocalización no soportada', 'error');
    }
  }

  async onFotosSeleccionadas(event: any) {
    const files = event.target.files;
    const MAX_FOTOS = 3;
    if (files && files.length > 0) {
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
      this.crearNotificacion('📸 Fotos', `${this.fotosPreview.length} foto(s) seleccionadas`, 'success');
    }
  }

  eliminarFoto(index: number) {
    this.fotosPreview.splice(index, 1);
  }

  abrirCamara() {
    if (this.fotosPreview.length >= 3) {
      this.crearNotificacion('⚠️ Límite', 'Ya has tomado el máximo de 3 fotos', 'error');
      return;
    }
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
          this.crearNotificacion('📸 Foto tomada', `Foto ${this.fotosPreview.length}/3`, 'success');
        };
        reader.readAsDataURL(file);
      }
      input.value = '';
    };
    input.click();
  }

  async guardarCompletada() {
    if (!this.selectedPaciente) {
      this.crearNotificacion('Error', 'No hay paciente seleccionado', 'error');
      return;
    }
    if (this.fotosPreview.length === 0) {
      this.crearNotificacion('⚠️ Requerido', 'Debes tomar al menos una foto', 'error');
      return;
    }
    const fotosComprimidas: string[] = [];
    for (const foto of this.fotosPreview) {
      const comprimida = await this.comprimirImagen(foto);
      fotosComprimidas.push(comprimida);
    }
    const nuevaVisita: VisitaCompletada = {
      fecha: new Date(),
      ubicacionCoordenadas: this.ubicacionCoordenadas || 'No registrada',
      ubicacionDireccion: this.ubicacionDireccionReal || this.ubicacionCoordenadas,
      fotos: fotosComprimidas.slice(0, 1),
      coordenadas: this.ubicacionCoordenadas || 'No registradas'
    };
    if (!this.selectedPaciente.historialVisitas) {
      this.selectedPaciente.historialVisitas = [];
    }
    this.selectedPaciente.historialVisitas.unshift(nuevaVisita);
    if (this.selectedPaciente.historialVisitas.length > 3) {
      this.selectedPaciente.historialVisitas = this.selectedPaciente.historialVisitas.slice(0, 3);
    }
    this.guardarHistorialEnLocalStorage();
    this.http.patch(`http://localhost:3000/pacientes/${this.selectedPaciente.id}/estatus`, {
      estatus: 'completada',
      usuarioId: 1
    }).subscribe({
      next: () => {
        this.selectedPaciente!.estadoVisita = 'completada';
        this.selectedPaciente!.fechaProgramada = new Date();
        this.mostrarModalCompletada = false;
        this.selectedPaciente = null;
        this.fotosPreview = [];
        this.aplicarFiltros();
        this.crearNotificacion('✅ Visita completada', `Se guardó ${fotosComprimidas.length} foto(s)`, 'success');
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error:', err);
        this.crearNotificacion('❌ Error', 'No se pudo completar la visita', 'error');
      }
    });
  }

  abrirIncidencia(paciente: Paciente) {
    this.http.patch(`http://localhost:3000/pacientes/${paciente.id}/estatus`, {
      estatus: 'incidencia',
      usuarioId: 1
    }).subscribe({
      next: () => {
        paciente.estadoVisita = 'incidencia';
        this.crearNotificacion('⚠️ Incidencia', `${paciente.nombre} tiene una incidencia`, 'warning');
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
      error: (err) => {
        console.error('Error:', err);
        this.crearNotificacion('❌ Error', 'No se pudo marcar la incidencia', 'error');
      }
    });
  }

  // ==================== NOTIFICACIONES ====================

  crearNotificacion(titulo: string, mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'info') {
    const config = {
      success: { color: '#2e7d32', bgColor: '#e8f5e9', icon: 'fa-check-circle', borderColor: '#2e7d32' },
      error: { color: '#c62828', bgColor: '#ffebee', icon: 'fa-exclamation-circle', borderColor: '#c62828' },
      info: { color: '#701f2f', bgColor: '#fefaf7', icon: 'fa-info-circle', borderColor: '#701f2f' },
      warning: { color: '#e67e22', bgColor: '#fff3e0', icon: 'fa-exclamation-triangle', borderColor: '#e67e22' }
    };
    const cfg = config[tipo];
    const toast = document.createElement('div');
    toast.style.cssText = `
            position: fixed; top: 24px; right: 24px; background: white; border-radius: 16px;
            padding: 0; min-width: 320px; max-width: 450px; z-index: 1000000;
            box-shadow: 0 8px 32px rgba(0,0,0,0.12); border-left: 5px solid ${cfg.borderColor};
            animation: slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: 'Montserrat', sans-serif; overflow: hidden;
        `;
    toast.innerHTML = `
            <div style="display: flex; align-items: stretch; gap: 0;">
                <div style="background: ${cfg.bgColor}; padding: 18px 16px; display: flex; align-items: center; justify-content: center; min-width: 60px;">
                    <i class="fas ${cfg.icon}" style="font-size: 24px; color: ${cfg.color};"></i>
                </div>
                <div style="padding: 16px 20px 16px 16px; flex: 1; display: flex; flex-direction: column; justify-content: center;">
                    <div style="font-weight: 700; font-size: 15px; color: #1a1a1a; margin-bottom: 4px;">${titulo}</div>
                    <div style="font-size: 13px; color: #555; line-height: 1.4;">${mensaje}</div>
                </div>
                <button onclick="this.closest('div[style]').remove()" style="background: none; border: none; color: #bbb; cursor: pointer; padding: 8px 12px; font-size: 16px;">
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

  // ==================== MÉTODOS PARA ESTADOS ====================

  getEstadoClass(estado: string): string {
    switch (estado) {
      case 'completada': return 'estado-completada';
      case 'pendiente': return 'estado-pendiente';
      case 'incidencia': return 'estado-incidencia';
      default: return '';
    }
  }

  getEstadoIcono(estado: string): string {
    switch (estado) {
      case 'completada': return 'fas fa-check-circle';
      case 'pendiente': return 'fas fa-clock';
      case 'incidencia': return 'fas fa-exclamation-triangle';
      default: return 'fas fa-question-circle';
    }
  }

  getEstadoTexto(estado: string): string {
    switch (estado) {
      case 'completada': return 'Completada';
      case 'pendiente': return 'Pendiente';
      case 'incidencia': return 'Incidencia';
      default: return '';
    }
  }
}