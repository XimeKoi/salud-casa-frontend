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
    comentarios?: string;
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
                                } else {
                                    this.agregarPacienteSeleccionado(this.pacienteDesdeMapa);
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
        const nombre = (p.nombre || '').trim();
        const apPaterno = (p.apellidoPaterno || '').trim();
        const apMaterno = (p.apellidoMaterno || '').trim();

        // Si el nombre ya contiene el apellido paterno, evitar duplicar
        if (apPaterno && nombre.toUpperCase().includes(apPaterno.toUpperCase())) {
            return this.limpiarNombreDuplicado(nombre, apPaterno, apMaterno);
        }

        const partes: string[] = [];
        if (nombre) partes.push(nombre);
        if (apPaterno) partes.push(apPaterno);
        if (apMaterno) partes.push(apMaterno);

        const res = partes.join(' ').trim();
        return this.limpiarNombreDuplicado(res || nombre || 'Paciente sin nombre', apPaterno, apMaterno);
    }

    private limpiarNombreDuplicado(nombre: string, apP?: string, apM?: string): string {
        if (!nombre) return 'Paciente sin nombre';
        let n = nombre.trim();
        const p = (apP || '').trim();
        const m = (apM || '').trim();

        if (p && m) {
            const patronInicio = new RegExp(`^${p}\\s+${m}\\s+`, 'i');
            const patronFin = new RegExp(`\\s+${p}\\s+${m}$`, 'i');
            if (patronInicio.test(n) && patronFin.test(n)) {
                n = n.replace(patronInicio, '').trim();
            }
        } else if (p) {
            const patronInicio = new RegExp(`^${p}\\s+`, 'i');
            const patronFin = new RegExp(`\\s+${p}$`, 'i');
            if (patronInicio.test(n) && patronFin.test(n)) {
                n = n.replace(patronInicio, '').trim();
            }
        }

        const tokens = n.split(/\s+/).filter(Boolean);
        const uniqueTokens: string[] = [];
        tokens.forEach(token => {
            const upper = token.toUpperCase();
            const occurrences = tokens.filter(t => t.toUpperCase() === upper).length;
            if (occurrences > 1 && uniqueTokens.some(t => t.toUpperCase() === upper)) {
                return;
            }
            uniqueTokens.push(token);
        });
        return uniqueTokens.join(' ');
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

    private compararFechas(fechaStr: string, dia: number, mes: number, anio: number): boolean {
        if (!fechaStr) return false;

        let fechaLimpia = fechaStr;

        if (fechaLimpia.includes('T')) {
            fechaLimpia = fechaLimpia.split('T')[0];
        }

        if (fechaLimpia.includes('/')) {
            const parts = fechaLimpia.split('/');
            if (parts.length === 3) {
                if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
                    fechaLimpia = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }
        }

        const mesStr = String(mes + 1).padStart(2, '0');
        const diaStr = String(dia).padStart(2, '0');
        const fechaEsperada = `${anio}-${mesStr}-${diaStr}`;

        return fechaLimpia === fechaEsperada;
    }

    generarCalendario() {
        console.log('📅 Generando calendario para:', this.nombreMeses[this.mesActual], this.anioActual);

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

            const visitasDelDia = this.visitasProgramadas.filter(v => {
                if (!v.fecha) return false;
                return this.compararFechas(v.fecha, i, this.mesActual, this.anioActual);
            });

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
        this.cdr.detectChanges();
    }

    agregarPacienteSeleccionado(paciente: any) {
        const yaSeleccionado = this.pacientesSeleccionados.some(p => p.id === paciente.id);
        if (yaSeleccionado) {
            this.mostrarToast('Paciente ya seleccionado', 'Este paciente ya está en la lista', 'info');
            return;
        }

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

    // ⭐⭐⭐ NUEVO: Enviar confirmación por WhatsApp / SMS ⭐⭐⭐
    private enviarConfirmacionWhatsApp(visita: VisitaProgramada) {
        if (!visita.pacienteTelefono) {
            console.warn(`⚠️ No hay teléfono para ${visita.pacienteNombre}`);
            return;
        }

        const fechaFormateada = this.formatearFechaLegible(visita.fecha);
        let telLimpio = (visita.pacienteTelefono || '').replace(/\D/g, '');
        if (telLimpio.length === 10) {
            telLimpio = `+52${telLimpio}`;
        }

        const mensajeLimpio = `Cuidalia: Le confirmamos su visita médica para ${visita.pacienteNombre} el día ${fechaFormateada} a las ${visita.hora}.`;

        const payload = {
            telefono: telLimpio,
            nombrePaciente: visita.pacienteNombre,
            fecha: fechaFormateada,
            hora: visita.hora,
            direccion: '', // Se elimina la dirección del mensaje
            mensaje: mensajeLimpio,
            texto: mensajeLimpio,
            omitirDireccion: true,
            omitirRecordatorio: true
        };

        console.log('📤 Enviando confirmación WhatsApp / SMS:', payload);

        this.http.post(`${this.apiUrl}/whatsapp/confirmacion`, payload).subscribe({
            next: (response: any) => {
                if (response.success) {
                    console.log(`✅ Confirmación enviada a ${visita.pacienteNombre}`);
                    this.mostrarToast(
                        '📱 SMS enviado',
                        `Se envió confirmación a ${visita.pacienteNombre}`,
                        'success'
                    );
                } else {
                    console.warn('⚠️ No se pudo enviar confirmación:', response.message);
                }
            },
            error: (error) => {
                console.error('❌ Error enviando confirmación WhatsApp / SMS:', error);
            }
        });
    }

    // ⭐⭐⭐ NUEVO: Formatear fecha para mensajes ⭐⭐⭐
    private formatearFechaLegible(fechaStr: string): string {
        if (!fechaStr) return 'Fecha no especificada';
        const parts = fechaStr.split('-');
        if (parts.length === 3) {
            const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
            const mes = meses[parseInt(parts[1]) - 1];
            return `${parseInt(parts[2])} de ${mes} de ${parts[0]}`;
        }
        return fechaStr;
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

    private obtenerFechaCorrecta(fechaStr: string): string {
        if (!fechaStr) {
            const hoy = new Date();
            const anio = hoy.getFullYear();
            const mes = String(hoy.getMonth() + 1).padStart(2, '0');
            const dia = String(hoy.getDate()).padStart(2, '0');
            return `${anio}-${mes}-${dia}`;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
            return fechaStr;
        }

        if (fechaStr.includes('T')) {
            return fechaStr.split('T')[0];
        }

        if (fechaStr.includes('/')) {
            const parts = fechaStr.split('/');
            if (parts.length === 3) {
                if (parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
                    return `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
                return `${parts[2]}-${parts[0]}-${parts[1]}`;
            }
        }

        return fechaStr;
    }

    getPrioridadClass(prioridad: string): string {
        switch (prioridad) {
            case 'alta': return 'prioridad-alta';
            case 'media': return 'prioridad-media';
            default: return 'prioridad-baja';
        }
    }

    getEstadoClass(estado: string): string {
        switch (estado) {
            case 'completada': return 'estado-completada';
            case 'cancelada': return 'estado-cancelada';
            default: return 'estado-pendiente';
        }
    }

    guardarVisitaProgramada() {
        console.log('🔴 [CALENDARIO] guardarVisitaProgramada() ejecutado');

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

        const nuevasVisitas: VisitaProgramada[] = this.pacientesSeleccionados.map((p, index) => {
            let fechaCorrecta = this.obtenerFechaCorrecta(p.fecha);

            return {
                id: Date.now() + index,
                pacienteId: p.id,
                pacienteNombre: p.nombreCompleto,
                pacienteCurp: p.curp || '',
                pacienteDireccion: p.direccion || '',
                pacienteTelefono: p.telefono || '',
                colonia: p.colonia || 'Sin colonia',
                fecha: fechaCorrecta,
                hora: p.hora || '09:00',
                prioridad: p.prioridad || 'media',
                notas: p.notas || p.comentarios || '',
                estado: 'pendiente'
            };
        });

        console.log('🔴 [CALENDARIO] Nuevas visitas creadas:', nuevasVisitas.length);

        this.visitasProgramadas = [...this.visitasProgramadas, ...nuevasVisitas];
        this.guardarVisitasEnStorage();

        // ⭐⭐⭐ ENVIAR CONFIRMACIÓN POR WHATSAPP - LLAMADA DIRECTA ⭐⭐⭐
        nuevasVisitas.forEach(visita => {
            console.log('🔴 [CALENDARIO] Procesando visita para:', visita.pacienteNombre);
            console.log('🔴 [CALENDARIO] Teléfono:', visita.pacienteTelefono);

            // Enviar notificación (esto funciona)
            this.enviarNotificacionVisitaProgramada(visita);

            // ⭐ LLAMADA DIRECTA AL ENDPOINT DE WHATSAPP / SMS ⭐
            if (visita.pacienteTelefono) {
                let telLimpio = (visita.pacienteTelefono || '').replace(/\D/g, '');
                if (telLimpio.length === 10) {
                    telLimpio = `+52${telLimpio}`;
                }
                const fechaFormateada = this.formatearFechaLegible(visita.fecha);
                const mensajeLimpio = `Cuidalia: Le confirmamos su visita médica para ${visita.pacienteNombre} el día ${fechaFormateada} a las ${visita.hora}.`;

                const payload = {
                    telefono: telLimpio,
                    nombrePaciente: visita.pacienteNombre,
                    fecha: fechaFormateada,
                    hora: visita.hora,
                    direccion: '', // Se elimina la dirección
                    mensaje: mensajeLimpio,
                    texto: mensajeLimpio,
                    omitirDireccion: true,
                    omitirRecordatorio: true
                };

                console.log('📤 ENVIANDO SMS DIRECTAMENTE:', payload);

                this.http.post(`${this.apiUrl}/whatsapp/confirmacion`, payload).subscribe({
                    next: (response: any) => {
                        console.log('✅ RESPUESTA SMS:', response);
                        if (response.success) {
                            this.mostrarToast(
                                '📱 SMS enviado',
                                `Confirmación enviada a ${visita.pacienteNombre}`,
                                'success'
                            );
                        }
                    },
                    error: (error) => {
                        console.error('❌ Error enviando SMS:', error);
                    }
                });
            } else {
                console.warn(`⚠️ No hay teléfono para ${visita.pacienteNombre}`);
            }
        });

        this.generarCalendario();
        this.mostrarToast(
            '✅ Visitas programadas',
            `${nuevasVisitas.length} visita(s) programada(s) correctamente.`,
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

    private ultimoCambioId: number | null = null;
    private ultimoCambioEstado: string = '';
    private ultimoCambioTiempo: number = 0;
    private toastTimer: any = null;

    cambiarEstadoVisita(id: number, nuevoEstado: string) {
        const ahora = Date.now();
        // Evitar doble ejecución si el evento change se dispara dos veces en móviles Android
        if (this.ultimoCambioId === id && this.ultimoCambioEstado === nuevoEstado && (ahora - this.ultimoCambioTiempo < 1200)) {
            return;
        }

        const visita = this.visitasProgramadas.find(v => v.id === id);
        if (!visita) return;
        if (visita.estado === nuevoEstado) return;

        this.ultimoCambioId = id;
        this.ultimoCambioEstado = nuevoEstado;
        this.ultimoCambioTiempo = ahora;

        visita.estado = nuevoEstado as any;
        this.guardarVisitasEnStorage();
        this.generarCalendario();

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

    mostrarToast(titulo: string, mensaje: string, tipo: 'success' | 'error' | 'info' = 'info') {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
        this.mensajeToast = mensaje;
        this.tipoToast = tipo;
        this.mostrarToastFlag = true;

        this.toastTimer = setTimeout(() => {
            this.cerrarToast();
        }, 3000);
    }

    cerrarToast() {
        if (this.toastTimer) {
            clearTimeout(this.toastTimer);
            this.toastTimer = null;
        }
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