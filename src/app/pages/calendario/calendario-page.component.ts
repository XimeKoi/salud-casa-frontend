// src/app/pages/calendario/calendario-page.component.ts

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';

interface VisitaProgramada {
    id: number;
    pacienteId: number;
    pacienteNombre: string;
    pacienteCurp: string;
    pacienteDireccion: string;
    pacienteTelefono: string;
    colonia: string;
    fecha: string;
    hora: string;
    prioridad: 'alta' | 'media' | 'baja';
    notas: string;
    estado: 'pendiente' | 'completada' | 'cancelada';
}

interface PacienteSeleccionado {
    id: number;
    nombreCompleto: string;
    curp: string;
    colonia: string;
    direccion: string;
    telefono: string;
    fecha: string;
    hora: string;
    prioridad: 'alta' | 'media' | 'baja';
    notas: string;
    tieneConflicto: boolean;
    mensajeConflicto: string;
    estaFinado: boolean;
}

@Component({
    selector: 'app-calendario-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './calendario-page.component.html',
    styleUrls: ['./calendario-page.component.scss']
})
export class CalendarioPageComponent implements OnInit {
    private apiUrl = environment.apiUrl;

    visitasProgramadas: VisitaProgramada[] = [];
    pacientesSeleccionados: PacienteSeleccionado[] = [];
    sugerenciasPacientes: any[] = [];
    busquedaPaciente: string = '';
    mostrarSugerencias: boolean = false;

    private todosLosPacientes: any[] = [];

    mesActual: number = new Date().getMonth();
    anioActual: number = new Date().getFullYear();
    nombreMeses: string[] = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    nombreDias: string[] = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    diasCalendario: any[] = [];
    yearsDisponibles: number[] = [];

    mostrarModalProgramar: boolean = false;
    mostrarModalDetalle: boolean = false;
    fechaDelDia: string = '';
    visitasDelDia: VisitaProgramada[] = [];
    totalVisitasDelDia: number = 0;

    mostrarToastFlag: boolean = false;
    mensajeToast: string = '';
    tipoToast: 'success' | 'error' | 'info' = 'info';

    confirmacionVisible: boolean = false;
    confirmacionTitulo: string = '';
    confirmacionMensaje: string = '';
    confirmacionDetalle: string = '';
    confirmacionAction: () => void = () => { };

    private pacienteDesdeMapa: any = null;
    private diaSeleccionado: number | null = null;

    constructor(
        private http: HttpClient,
        private cdr: ChangeDetectorRef,
        private router: Router,
        private route: ActivatedRoute
    ) {
        console.log('🌍 [Calendario] API URL:', this.apiUrl);
    }

    ngOnInit() {
        this.yearsDisponibles = [];
        for (let i = this.anioActual - 5; i <= this.anioActual + 5; i++) {
            this.yearsDisponibles.push(i);
        }

        this.cargarPacientesParaBusqueda();
        this.cargarVisitasDesdeStorage();
        this.cargarVisitasDesdeBackend();
        this.generarCalendario();

        this.route.queryParams.subscribe(params => {
            if (params['abrirModal'] === 'true' && params['pacienteId']) {
                const pacienteData = localStorage.getItem('pacienteSeleccionado');
                if (pacienteData) {
                    try {
                        this.pacienteDesdeMapa = JSON.parse(pacienteData);
                        localStorage.removeItem('pacienteSeleccionado');

                        setTimeout(() => {
                            this.abrirModalProgramar();
                            if (this.pacienteDesdeMapa) {
                                const pacienteCompleto = this.todosLosPacientes.find(p => p.id === this.pacienteDesdeMapa.id);
                                if (pacienteCompleto) {
                                    this.agregarPacienteSeleccionado(pacienteCompleto);
                                    this.mostrarToast('📅 Paciente cargado', `${pacienteCompleto.nombreCompleto} listo para agendar`, 'success');
                                } else {
                                    this.agregarPacienteSeleccionado(this.pacienteDesdeMapa);
                                    this.mostrarToast('📅 Paciente cargado', `${this.pacienteDesdeMapa.nombre} listo para agendar`, 'success');
                                }
                            }
                        }, 600);
                    } catch (e) {
                        console.error('Error cargando paciente desde localStorage:', e);
                    }
                }
            }
        });
    }

    cargarPacientesParaBusqueda() {
        const idEnfermera = 1;
        this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}`).subscribe({
            next: (data) => {
                if (data && data.length > 0) {
                    this.todosLosPacientes = data.map(p => ({
                        id: p.id,
                        nombreCompleto: this.construirNombreCompleto(p),
                        nombre: p.nombre || '',
                        curp: p.curp || '',
                        colonia: this.extraerColonia(p.direccion),
                        direccion: p.direccion || '',
                        telefono: p.telefonoCelular || p.telefonoFijo || '',
                        estatus: p.estatus || 'PENDIENTE',
                        finado: p.estatus === 'FINADO'
                    }));
                    console.log('📋 Pacientes cargados para búsqueda:', this.todosLosPacientes.length);
                }
            },
            error: (error) => {
                console.error('Error cargando pacientes para búsqueda:', error);
                this.cargarPacientesDesdeStorage();
            }
        });
    }

    private construirNombreCompleto(p: any): string {
        const apellidoPaterno = p.apellidoPaterno || '';
        const apellidoMaterno = p.apellidoMaterno || '';
        const nombre = p.nombre || '';
        if (apellidoPaterno && apellidoMaterno) {
            return `${apellidoPaterno} ${apellidoMaterno} ${nombre}`.trim();
        } else if (apellidoPaterno) {
            return `${apellidoPaterno} ${nombre}`.trim();
        } else if (apellidoMaterno) {
            return `${apellidoMaterno} ${nombre}`.trim();
        }
        return nombre || 'Paciente sin nombre';
    }

    private extraerColonia(direccion: string): string {
        if (!direccion) return '';
        const partes = direccion.split('|');
        if (partes.length >= 2) return partes[1].trim();
        const partesComa = direccion.split(',');
        if (partesComa.length >= 2) return partesComa[1].trim();
        return '';
    }

    private cargarPacientesDesdeStorage() {
        try {
            const cached = localStorage.getItem('pacientesCache');
            if (cached) {
                const data = JSON.parse(cached);
                if (data && data.length > 0) {
                    this.todosLosPacientes = data;
                    console.log('📋 Pacientes cargados desde localStorage:', this.todosLosPacientes.length);
                }
            }
        } catch (e) {
            console.error('Error cargando pacientes desde storage:', e);
        }
    }

    cargarVisitasDesdeStorage() {
        const visitasGuardadas = localStorage.getItem('visitasProgramadas');
        if (visitasGuardadas) {
            try {
                const data = JSON.parse(visitasGuardadas);
                if (Array.isArray(data) && data.length > 0) {
                    this.visitasProgramadas = data;
                    console.log('📅 Visitas cargadas desde localStorage:', this.visitasProgramadas.length);
                    this.generarCalendario();
                    this.cdr.detectChanges();
                }
            } catch (e) {
                console.error('Error cargando visitas desde localStorage:', e);
            }
        }
    }

    cargarVisitasDesdeBackend() {
        this.http.get<VisitaProgramada[]>(`${this.apiUrl}/calendario/visitas`).subscribe({
            next: (data) => {
                if (data && data.length > 0) {
                    this.visitasProgramadas = data;
                    localStorage.setItem('visitasProgramadas', JSON.stringify(data));
                    this.generarCalendario();
                    this.cdr.detectChanges();
                }
            },
            error: (error) => {
                console.log('ℹ️ El backend no tiene la ruta /calendario/visitas, usando almacenamiento local');
            }
        });
    }

    guardarVisitasEnStorage() {
        try {
            localStorage.setItem('visitasProgramadas', JSON.stringify(this.visitasProgramadas));
            console.log('✅ Visitas guardadas en localStorage:', this.visitasProgramadas.length);
        } catch (e) {
            console.error('Error guardando visitas en localStorage:', e);
        }
    }

    // ⭐⭐⭐ FUNCIÓN PARA COMPARAR FECHAS COMO STRINGS ⭐⭐⭐
    private compararFechas(fechaStr: string, dia: number, mes: number, anio: number): boolean {
        if (!fechaStr) return false;

        // ⭐ Limpiar la fecha: eliminar cualquier hora, timezone, etc.
        let fechaLimpia = fechaStr;

        // Si tiene formato ISO con T, extraer solo la fecha
        if (fechaLimpia.includes('T')) {
            fechaLimpia = fechaLimpia.split('T')[0];
        }

        // Si tiene formato DD/MM/YYYY, convertir a YYYY-MM-DD
        if (fechaLimpia.includes('/')) {
            const parts = fechaLimpia.split('/');
            if (parts.length === 3) {
                // Si es DD/MM/YYYY
                if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
                    fechaLimpia = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }
        }

        // ⭐ Crear la fecha esperada en formato YYYY-MM-DD
        const mesStr = String(mes + 1).padStart(2, '0');
        const diaStr = String(dia).padStart(2, '0');
        const fechaEsperada = `${anio}-${mesStr}-${diaStr}`;

        console.log(`🔍 Comparando: "${fechaLimpia}" vs "${fechaEsperada}"`);

        return fechaLimpia === fechaEsperada;
    }

    // ⭐⭐⭐ GENERAR CALENDARIO - COMPARACIÓN POR STRINGS ⭐⭐⭐
    generarCalendario() {
        console.log('📅 Generando calendario para:', this.nombreMeses[this.mesActual], this.anioActual);
        console.log('📅 Visitas disponibles:', this.visitasProgramadas.length);

        const primerDia = new Date(this.anioActual, this.mesActual, 1).getDay();
        const diasEnMes = new Date(this.anioActual, this.mesActual + 1, 0).getDate();
        const diasEnMesAnterior = new Date(this.anioActual, this.mesActual, 0).getDate();

        this.diasCalendario = [];
        const hoy = new Date();

        for (let i = primerDia - 1; i >= 0; i--) {
            const dia = diasEnMesAnterior - i;
            this.diasCalendario.push({
                dia: dia,
                esMesActual: false,
                esHoy: false,
                tieneVisitas: false,
                totalVisitas: 0,
                fecha: new Date(this.anioActual, this.mesActual - 1, dia)
            });
        }

        for (let i = 1; i <= diasEnMes; i++) {
            const fecha = new Date(this.anioActual, this.mesActual, i);
            const esHoy = fecha.getDate() === hoy.getDate() &&
                fecha.getMonth() === hoy.getMonth() &&
                fecha.getFullYear() === hoy.getFullYear();

            // ⭐⭐⭐ COMPARAR FECHAS POR STRING ⭐⭐⭐
            const visitasDelDia = this.visitasProgramadas.filter(v => {
                if (!v.fecha) return false;
                return this.compararFechas(v.fecha, i, this.mesActual, this.anioActual);
            });

            if (visitasDelDia.length > 0) {
                console.log(`📅 Día ${i}: ${visitasDelDia.length} visitas`);
            }

            this.diasCalendario.push({
                dia: i,
                esMesActual: true,
                esHoy: esHoy,
                tieneVisitas: visitasDelDia.length > 0,
                totalVisitas: visitasDelDia.length,
                fecha: fecha
            });
        }

        const totalDiasMostrados = this.diasCalendario.length;
        const diasFaltantes = (7 - (totalDiasMostrados % 7)) % 7;
        for (let i = 1; i <= diasFaltantes; i++) {
            this.diasCalendario.push({
                dia: i,
                esMesActual: false,
                esHoy: false,
                tieneVisitas: false,
                totalVisitas: 0,
                fecha: new Date(this.anioActual, this.mesActual + 1, i)
            });
        }

        // ⭐ Log de días con visitas
        const diasConVisitas = this.diasCalendario.filter(d => d.tieneVisitas);
        console.log(`📅 Días con visitas: ${diasConVisitas.length}`, diasConVisitas.map(d => d.dia));
    }

    mesAnterior() {
        if (this.mesActual === 0) {
            this.mesActual = 11;
            this.anioActual--;
        } else {
            this.mesActual--;
        }
        this.generarCalendario();
    }

    mesSiguiente() {
        if (this.mesActual === 11) {
            this.mesActual = 0;
            this.anioActual++;
        } else {
            this.mesActual++;
        }
        this.generarCalendario();
    }

    anioAnterior() {
        this.anioActual--;
        this.generarCalendario();
    }

    anioSiguiente() {
        this.anioActual++;
        this.generarCalendario();
    }

    irHoy() {
        const hoy = new Date();
        this.mesActual = hoy.getMonth();
        this.anioActual = hoy.getFullYear();
        this.generarCalendario();
    }

    cambiarMesAnio() {
        this.generarCalendario();
    }

    // ⭐⭐⭐ SELECCIONAR DÍA - COMPARACIÓN POR STRING ⭐⭐⭐
    seleccionarDia(dia: any) {
        if (!dia.esMesActual) return;

        this.diaSeleccionado = dia.dia;

        const fecha = new Date(this.anioActual, this.mesActual, dia.dia);
        this.fechaDelDia = fecha.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        // ⭐⭐⭐ COMPARAR FECHAS POR STRING ⭐⭐⭐
        this.visitasDelDia = this.visitasProgramadas.filter(v => {
            if (!v.fecha) return false;
            return this.compararFechas(v.fecha, dia.dia, this.mesActual, this.anioActual);
        });

        this.totalVisitasDelDia = this.visitasDelDia.length;
        this.mostrarModalDetalle = true;
    }

    get tieneVisitasDelDia(): boolean {
        return this.visitasDelDia.length > 0;
    }

    cerrarModalDetalle() {
        this.mostrarModalDetalle = false;
    }

    abrirModalProgramar() {
        this.mostrarModalProgramar = true;
        this.busquedaPaciente = '';
        this.sugerenciasPacientes = [];
        this.mostrarSugerencias = false;

        if (this.diaSeleccionado !== null) {
            const fecha = new Date(this.anioActual, this.mesActual, this.diaSeleccionado);
            const anio = fecha.getFullYear();
            const mes = String(fecha.getMonth() + 1).padStart(2, '0');
            const dia = String(fecha.getDate()).padStart(2, '0');
            const fechaStr = `${anio}-${mes}-${dia}`;

            this.pacientesSeleccionados.forEach(p => {
                p.fecha = fechaStr;
            });
        }

        this.cdr.detectChanges();
    }

    cerrarModalProgramar() {
        this.mostrarModalProgramar = false;
        this.pacientesSeleccionados = [];
        this.busquedaPaciente = '';
        this.sugerenciasPacientes = [];
        this.mostrarSugerencias = false;
        this.pacienteDesdeMapa = null;
        this.cdr.detectChanges();
    }

    onBusquedaPacienteChange() {
        const busqueda = this.busquedaPaciente?.trim() || '';

        if (busqueda.length < 2) {
            this.sugerenciasPacientes = [];
            this.mostrarSugerencias = false;
            this.cdr.detectChanges();
            return;
        }

        const busquedaLower = busqueda.toLowerCase();

        this.sugerenciasPacientes = this.todosLosPacientes.filter((p: any) => {
            const nombre = (p.nombreCompleto || p.nombre || '').toLowerCase();
            const id = String(p.id || '');
            const curp = (p.curp || '').toLowerCase();
            return nombre.includes(busquedaLower) || id.includes(busqueda) || curp.includes(busquedaLower);
        });

        if (this.sugerenciasPacientes.length > 10) {
            this.sugerenciasPacientes = this.sugerenciasPacientes.slice(0, 10);
        }

        this.mostrarSugerencias = this.sugerenciasPacientes.length > 0;
        console.log('📋 Resultados encontrados:', this.sugerenciasPacientes.length);
        this.cdr.detectChanges();
    }

    agregarPacienteSeleccionado(paciente: any) {
        const yaSeleccionado = this.pacientesSeleccionados.some(p => p.id === paciente.id);
        if (yaSeleccionado) {
            this.mostrarToast('Paciente ya seleccionado', 'Este paciente ya está en la lista', 'info');
            return;
        }

        // ⭐⭐⭐ FECHA LOCAL SIN DESFASE UTC ⭐⭐⭐
        let fechaSeleccionada = this.obtenerFechaLocal();
        if (this.diaSeleccionado !== null) {
            const fecha = new Date(this.anioActual, this.mesActual, this.diaSeleccionado);
            const anio = fecha.getFullYear();
            const mes = String(fecha.getMonth() + 1).padStart(2, '0');
            const dia = String(fecha.getDate()).padStart(2, '0');
            fechaSeleccionada = `${anio}-${mes}-${dia}`;
        }

        const nuevoPaciente: PacienteSeleccionado = {
            id: paciente.id,
            nombreCompleto: paciente.nombreCompleto || paciente.nombre || 'Paciente',
            curp: paciente.curp || '',
            colonia: paciente.colonia || 'Sin colonia',
            direccion: paciente.direccion || '',
            telefono: paciente.telefono || '',
            fecha: fechaSeleccionada,
            hora: this.obtenerHoraActual(),
            prioridad: 'media',
            notas: '',
            tieneConflicto: false,
            mensajeConflicto: '',
            estaFinado: paciente.estatus === 'FINADO' || paciente.finado === true
        };

        console.log('📋 Paciente agregado con fecha:', nuevoPaciente.fecha);

        this.verificarConflictos(nuevoPaciente);
        this.pacientesSeleccionados.push(nuevoPaciente);
        this.busquedaPaciente = '';
        this.sugerenciasPacientes = [];
        this.mostrarSugerencias = false;
        this.cdr.detectChanges();
    }

    private obtenerFechaLocal(): string {
        const hoy = new Date();
        const anio = hoy.getFullYear();
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        const dia = String(hoy.getDate()).padStart(2, '0');
        return `${anio}-${mes}-${dia}`;
    }

    private obtenerHoraActual(): string {
        const ahora = new Date();
        const horas = String(ahora.getHours()).padStart(2, '0');
        const minutos = String(ahora.getMinutes()).padStart(2, '0');
        return `${horas}:${minutos}`;
    }

    verificarConflictos(paciente: PacienteSeleccionado) {
        const conflicto = this.pacientesSeleccionados.find(p =>
            p.fecha === paciente.fecha &&
            p.hora === paciente.hora &&
            p.id !== paciente.id
        );

        if (conflicto) {
            paciente.tieneConflicto = true;
            paciente.mensajeConflicto = `Conflicto con ${conflicto.nombreCompleto} a la misma hora`;
        } else {
            paciente.tieneConflicto = false;
            paciente.mensajeConflicto = '';
        }
    }

    actualizarConfiguracionPaciente(id: number, campo: string, valor: any) {
        const paciente = this.pacientesSeleccionados.find(p => p.id === id);
        if (paciente) {
            (paciente as any)[campo] = valor;

            if (campo === 'fecha' || campo === 'hora') {
                this.verificarConflictos(paciente);
            }
            this.cdr.detectChanges();
        }
    }

    quitarPacienteSeleccionado(id: number) {
        this.pacientesSeleccionados = this.pacientesSeleccionados.filter(p => p.id !== id);
        this.cdr.detectChanges();
    }

    quitarTodosPacientes() {
        this.pacientesSeleccionados = [];
        this.cdr.detectChanges();
    }

    getFechaMinima(): string {
        const hoy = new Date();
        const anio = hoy.getFullYear();
        const mes = String(hoy.getMonth() + 1).padStart(2, '0');
        const dia = String(hoy.getDate()).padStart(2, '0');
        return `${anio}-${mes}-${dia}`;
    }

    private enviarNotificacionVisitaProgramada(visita: VisitaProgramada) {
        const notificacion = {
            titulo: `📅 Visita programada - ${visita.pacienteNombre}`,
            mensaje: `Se ha programado una visita para ${visita.pacienteNombre} el ${this.formatearFecha(visita.fecha)} a las ${visita.hora}`,
            tipo: 'calendario',
            prioridad: 'media',
            usuarioId: 1,
            metadata: {
                visitaId: visita.id,
                pacienteId: visita.pacienteId,
                fecha: visita.fecha,
                hora: visita.hora
            },
            url: `/calendario`
        };

        console.log('📤 Enviando notificación de calendario:', notificacion);

        this.http.post(`${this.apiUrl}/notificaciones`, notificacion).subscribe({
            next: (response) => {
                console.log('✅ Notificación de calendario enviada al backend:', response);
            },
            error: (error) => {
                console.error('❌ Error enviando notificación al backend:', error);
                this.guardarNotificacionLocal(notificacion);
            }
        });

        this.guardarNotificacionLocal(notificacion);
    }

    private formatearFecha(fecha: string): string {
        if (!fecha) return '';
        const parts = fecha.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        const date = new Date(fecha);
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    private guardarNotificacionLocal(notificacion: any) {
        try {
            const notificaciones = JSON.parse(localStorage.getItem('notificacionesCache') || '[]');
            const existe = notificaciones.some((n: any) =>
                n.metadata?.visitaId === notificacion.metadata?.visitaId
            );
            if (!existe) {
                notificaciones.unshift({
                    ...notificacion,
                    id: Date.now(),
                    leida: false,
                    createdAt: new Date().toISOString()
                });
                localStorage.setItem('notificacionesCache', JSON.stringify(notificaciones));
                console.log('📌 Notificación de calendario guardada localmente');

                window.dispatchEvent(new CustomEvent('nuevaNotificacion', {
                    detail: notificacion
                }));
            }
        } catch (error) {
            console.error('Error guardando notificación local:', error);
        }
    }

    // ⭐⭐⭐ FUNCIÓN PARA OBTENER FECHA CORRECTA (SIN DESFASE UTC) ⭐⭐⭐
    private obtenerFechaCorrecta(fechaStr: string): string {
        if (!fechaStr) {
            const hoy = new Date();
            const anio = hoy.getFullYear();
            const mes = String(hoy.getMonth() + 1).padStart(2, '0');
            const dia = String(hoy.getDate()).padStart(2, '0');
            return `${anio}-${mes}-${dia}`;
        }

        // Si la fecha tiene formato YYYY-MM-DD, mantenerla
        if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
            return fechaStr;
        }

        // Si tiene formato ISO, extraer solo la fecha
        if (fechaStr.includes('T')) {
            return fechaStr.split('T')[0];
        }

        // Si tiene formato DD/MM/YYYY o similar, convertir
        if (fechaStr.includes('/')) {
            const parts = fechaStr.split('/');
            if (parts.length === 3) {
                // Si es DD/MM/YYYY
                if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
                    return `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
                // Si es MM/DD/YYYY
                return `${parts[2]}-${parts[0]}-${parts[1]}`;
            }
        }

        return fechaStr;
    }

    // ⭐⭐⭐ GET PRIORIDAD CLASS ⭐⭐⭐
    getPrioridadClass(prioridad: string): string {
        switch (prioridad) {
            case 'alta': return 'prioridad-alta';
            case 'media': return 'prioridad-media';
            default: return 'prioridad-baja';
        }
    }

    // ⭐⭐⭐ GET ESTADO CLASS ⭐⭐⭐
    getEstadoClass(estado: string): string {
        switch (estado) {
            case 'completada': return 'estado-completada';
            case 'cancelada': return 'estado-cancelada';
            default: return 'estado-pendiente';
        }
    }

    // ⭐⭐⭐ GUARDAR VISITA CON FECHA CORRECTA ⭐⭐⭐
    guardarVisitaProgramada() {
        if (this.pacientesSeleccionados.length === 0) {
            this.mostrarToast('Error', 'Debes seleccionar al menos un paciente', 'error');
            return;
        }

        const hayConflicto = this.pacientesSeleccionados.some(p => p.tieneConflicto);
        if (hayConflicto) {
            this.mostrarToast('Error', 'Hay conflictos de horario. Resuelve los conflictos antes de guardar.', 'error');
            return;
        }

        const hayFinados = this.pacientesSeleccionados.some(p => p.estaFinado);
        if (hayFinados) {
            this.mostrarToast('Error', 'No se pueden programar visitas para pacientes finados', 'error');
            return;
        }

        // ⭐⭐⭐ CREAR VISITAS CON FECHA CORRECTA (SIN DESFASE UTC) ⭐⭐⭐
        const nuevasVisitas: VisitaProgramada[] = this.pacientesSeleccionados.map((p, index) => {
            // ⭐ Obtener fecha correcta sin desfase UTC
            let fechaCorrecta = this.obtenerFechaCorrecta(p.fecha);

            console.log(`📅 Paciente: ${p.nombreCompleto}, Fecha original: ${p.fecha}, Fecha corregida: ${fechaCorrecta}`);

            return {
                id: Date.now() + index,
                pacienteId: p.id,
                pacienteNombre: p.nombreCompleto,
                pacienteCurp: p.curp || '',
                pacienteDireccion: p.direccion || '',
                pacienteTelefono: p.telefono || '',
                colonia: p.colonia || 'Sin colonia',
                fecha: fechaCorrecta,  // ⭐⭐⭐ FECHA CORRECTA ⭐⭐⭐
                hora: p.hora || '09:00',
                prioridad: p.prioridad || 'media',
                notas: p.notas || '',
                estado: 'pendiente'
            };
        });

        console.log('📅 Guardando visitas con fechas:', nuevasVisitas.map(v => ({
            paciente: v.pacienteNombre,
            fecha: v.fecha,
            hora: v.hora
        })));

        this.visitasProgramadas = [...this.visitasProgramadas, ...nuevasVisitas];
        this.guardarVisitasEnStorage();

        nuevasVisitas.forEach(visita => {
            this.enviarNotificacionVisitaProgramada(visita);
        });

        this.generarCalendario();

        // ⭐ MOSTRAR TOAST CON COLOR SEGÚN ÉXITO
        this.mostrarToast(
            '✅ Visitas programadas',
            `${nuevasVisitas.length} visita(s) programada(s) correctamente`,
            'success'
        );

        this.cerrarModalProgramar();
        this.cdr.detectChanges();

        try {
            this.http.post(`${this.apiUrl}/calendario/visitas`, { visitas: nuevasVisitas }).subscribe({
                next: () => {
                    console.log('✅ Visitas guardadas en el backend');
                },
                error: (error) => {
                    console.log('ℹ️ El backend no tiene la ruta /calendario/visitas, las visitas están guardadas localmente');
                }
            });
        } catch (e) {
            console.log('ℹ️ No se pudo conectar con el backend, las visitas están guardadas localmente');
        }
    }

    cambiarEstadoVisita(id: number, nuevoEstado: string) {
        const visita = this.visitasProgramadas.find(v => v.id === id);
        if (visita) {
            visita.estado = nuevoEstado as any;
            this.guardarVisitasEnStorage();
            this.generarCalendario();

            // ⭐ TOAST CON COLOR SEGÚN ESTADO
            let tipo: 'success' | 'error' | 'info' = 'info';
            let mensaje = '';

            if (nuevoEstado === 'completada') {
                tipo = 'success';
                mensaje = 'Visita marcada como completada ✅';
            } else if (nuevoEstado === 'cancelada') {
                tipo = 'error';
                mensaje = 'Visita cancelada ❌';
            } else {
                tipo = 'info';
                mensaje = 'Visita marcada como pendiente ⏳';
            }

            this.mostrarToast('Estado actualizado', mensaje, tipo);
            this.cdr.detectChanges();
        }

        this.http.patch(`${this.apiUrl}/calendario/visitas/${id}`, { estado: nuevoEstado }).subscribe({
            next: () => console.log('✅ Estado actualizado en backend'),
            error: () => console.log('ℹ️ Backend no disponible, estado guardado localmente')
        });
    }

    eliminarVisita(id: number) {
        this.confirmacionTitulo = 'Eliminar visita';
        this.confirmacionMensaje = '¿Estás seguro de eliminar esta visita?';
        this.confirmacionDetalle = 'Esta acción no se puede deshacer.';
        this.confirmacionAction = () => {
            this.visitasProgramadas = this.visitasProgramadas.filter(v => v.id !== id);
            this.guardarVisitasEnStorage();
            this.generarCalendario();
            this.mostrarToast('Visita eliminada', 'La visita fue eliminada correctamente', 'success');
            this.cdr.detectChanges();

            this.http.delete(`${this.apiUrl}/calendario/visitas/${id}`).subscribe({
                next: () => console.log('✅ Visita eliminada en backend'),
                error: () => console.log('ℹ️ Backend no disponible, visita eliminada localmente')
            });
        };
        this.confirmacionVisible = true;
    }

    cancelarAction() {
        this.confirmacionVisible = false;
    }

    confirmarAction() {
        if (this.confirmacionAction) {
            this.confirmacionAction();
        }
        this.confirmacionVisible = false;
    }

    // ⭐⭐⭐ MOSTRAR TOAST CON COLORES ⭐⭐⭐
    mostrarToast(titulo: string, mensaje: string, tipo: 'success' | 'error' | 'info' = 'info') {
        this.mensajeToast = mensaje;
        this.tipoToast = tipo;
        this.mostrarToastFlag = true;

        setTimeout(() => {
            this.cerrarToast();
        }, 4000);
    }

    cerrarToast() {
        this.mostrarToastFlag = false;
    }

    getPrioridadColor(prioridad: string): string {
        switch (prioridad) {
            case 'alta': return '#dc3545';
            case 'media': return '#ffc107';
            default: return '#28a745';
        }
    }
}