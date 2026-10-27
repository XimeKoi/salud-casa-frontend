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

import { PageHeaderNavComponent } from '../../components/page-header-nav/page-header-nav';

@Component({
    selector: 'app-calendario-page',
    standalone: true,
    imports: [CommonModule, FormsModule, PageHeaderNavComponent],
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

    // ⭐ MODO DE SELECCIÓN POR COLOR Y MENSAJERÍA A CELULARES
    modoSeleccionActivo: boolean = false;
    colorSeleccionActivo: string = '#10b981';
    coloresDisponibles: { hex: string; nombre: string; clase: string }[] = [
        { hex: '#10b981', nombre: 'Verde (Confirmada / Rutina)', clase: 'verde' },
        { hex: '#3b82f6', nombre: 'Azul (Primera Visita / Prioridad)', clase: 'azul' },
        { hex: '#8b5cf6', nombre: 'Morado (Especial / Seguimiento)', clase: 'morado' },
        { hex: '#f59e0b', nombre: 'Ámbar (Adulto Mayor / Fragilidad)', clase: 'ambar' },
        { hex: '#9b111e', nombre: 'Tinto (Prioridad Cuidalia / Urgente)', clase: 'tinto' }
    ];
    diasSeleccionadosMap: { [fechaKey: string]: { fecha: Date; fechaStr: string; color: string; diaNum: number } } = {};
    mostrarModalMensajeria: boolean = false;
    pacientesParaMensajes: any[] = [];
    nombreEnfermera: string = '';
    nombreEnfermeraOriginal: string = '';
    plantillaMensaje: string = 'Estimado(a) {nombre}, le recordamos su próxima visita domiciliaria del programa Salud Casa por Casa el día {fecha}{hora}. Le atenderá la enfermera(o) {enfermera}. Favor de estar atento(a).';
    envioMasivoEnProgreso: boolean = false;

    // ⭐ ASIGNACIÓN DE PACIENTES A DÍAS/SEMANAS SELECCIONADAS
    mostrarModalAsignarPacientes: boolean = false;
    busquedaPacienteAsignar: string = '';
    mensajeGlobalAsignar: string = '';
    pacientesParaAsignarSeleccionados: {
        id: number;
        paciente: any;
        fechaStr: string;
        hora: string;          // Opcional: puede dejarse en blanco
        prioridad: string;     // Opcional: 'alta' | 'media' | 'baja' | ''
        notas: string;         // Opcional: notas o mensaje individual
        nombre?: string;
        telefono?: string;
        telefonoLimpio?: string;
        colonia?: string;
        estadoMensaje?: string;
        mensajePersonalizado?: string;
    }[] = [];
    modoDistribucion: 'repartir' | 'mismo_dia' = 'repartir';
    diaEspecificoAsignar: string = '';
    horaBaseAsignar: string = '';             // En blanco por defecto
    intervaloMinutosAsignar: number = 0;      // 0 = Sin intervalo / en blanco
    prioridadAsignar: string = '';            // En blanco por defecto
    mostrarHerramientasHorario: boolean = false;
    guardandoAsignacion: boolean = false;

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

        this.inicializarNombreEnfermera();
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
        let idEnfermera = 1;
        try {
            const userStr = localStorage.getItem('userData');
            if (userStr) {
                const userObj = JSON.parse(userStr);
                idEnfermera = userObj.id_personal_enfermeria || userObj.id || 1;
            }
        } catch (e) { }
        this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}`).subscribe({
            next: (data) => {
                if (data && data.length > 0) {
                    this.todosLosPacientes = data.map(p => ({
                        id: p.id,
                        nombreCompleto: this.construirNombreCompleto(p),
                        nombre: p.nombre || '',
                        curp: p.curp || '',
                        colonia: this.extraerColonia(p.direccion, p.zonaTrabajo || p.colonia),
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
            const cand = matchKeyword[1].trim();
            if (cand.length > 2 && !/^#|^\d+$/i.test(cand) && !/LEON|GTO/i.test(cand)) {
                return cand.replace(/CP\s*\d{5}/gi, '').trim();
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


    private obtenerUsuarioActual(): { usuarioId: number, enfermeraId: number } {
        let usuarioId = 1;
        let enfermeraId = 1;
        try {
            const userStr = localStorage.getItem('userData');
            if (userStr) {
                const userObj = JSON.parse(userStr);
                usuarioId = userObj.id || userObj.id_usuario || 1;
                enfermeraId = userObj.id_personal_enfermeria || userObj.id || 1;
            }
        } catch (e) { }
        return { usuarioId, enfermeraId };
    }

    cargarVisitasDesdeStorage() {
        const { usuarioId } = this.obtenerUsuarioActual();
        const clave = `visitasProgramadas_${usuarioId}`;
        let visitasGuardadas = localStorage.getItem(clave);
        if (!visitasGuardadas) {
            visitasGuardadas = localStorage.getItem('visitasProgramadas');
        }
        if (visitasGuardadas) {
            try {
                const data = JSON.parse(visitasGuardadas);
                if (Array.isArray(data) && data.length > 0) {
                    this.visitasProgramadas = data;
                    console.log('📅 Visitas cargadas desde localStorage para usuario', usuarioId, ':', this.visitasProgramadas.length);
                    this.generarCalendario();
                    this.cdr.detectChanges();
                }
            } catch (e) {
                console.error('Error cargando visitas desde localStorage:', e);
            }
        }
    }

    cargarVisitasDesdeBackend() {
        const { usuarioId, enfermeraId } = this.obtenerUsuarioActual();
        this.http.get<VisitaProgramada[]>(`${this.apiUrl}/calendario/visitas?usuarioId=${usuarioId}&enfermeraId=${enfermeraId}`).subscribe({
            next: (data) => {
                if (data && data.length > 0) {
                    this.visitasProgramadas = data;
                    const clave = `visitasProgramadas_${usuarioId}`;
                    localStorage.setItem(clave, JSON.stringify(data));
                    this.generarCalendario();
                    this.cdr.detectChanges();
                }
            },
            error: (error) => {
                console.log('ℹ️ Usando almacenamiento local por usuario:', usuarioId);
            }
        });
    }

    guardarVisitasEnStorage() {
        try {
            const { usuarioId } = this.obtenerUsuarioActual();
            const clave = `visitasProgramadas_${usuarioId}`;
            localStorage.setItem(clave, JSON.stringify(this.visitasProgramadas));
            console.log('✅ Visitas guardadas en localStorage para usuario', usuarioId, ':', this.visitasProgramadas.length);
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

        if (this.modoSeleccionActivo) {
            this.toggleDiaEnModoSeleccion(dia);
            return;
        }

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

        if (busqueda.length === 0) {
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
            const col = (p.colonia || '').toLowerCase();
            const dir = (p.direccion || '').toLowerCase();
            return nombre.includes(busquedaLower) || id.includes(busqueda) || curp.includes(busquedaLower) || col.includes(busquedaLower) || dir.includes(busquedaLower);
        });

        if (this.sugerenciasPacientes.length > 15) {
            this.sugerenciasPacientes = this.sugerenciasPacientes.slice(0, 15);
        }

        this.mostrarSugerencias = true;
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
        const { usuarioId } = this.obtenerUsuarioActual();

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
                estado: 'pendiente',
                usuarioId: usuarioId
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
            this.http.post(`${this.apiUrl}/calendario/visitas`, { visitas: nuevasVisitas, usuarioId: usuarioId }).subscribe({
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


    // ⭐ ============================================
    // ⭐ MODO SELECCIÓN Y MENSAJERÍA CELULAR
    // ⭐ ============================================

    toggleModoSeleccion() {
        this.modoSeleccionActivo = !this.modoSeleccionActivo;
        if (!this.modoSeleccionActivo) {
            this.mostrarToast('Modo Selección', 'Modo selección desactivado', 'info');
        } else {
            this.mostrarToast('Modo Selección', 'Haz clic en los días del calendario para colorearlos y seleccionarlos', 'info');
        }
        this.cdr.detectChanges();
    }

    cambiarColorSeleccion(color: string) {
        this.colorSeleccionActivo = color;
    }

    obtenerClaveFecha(dia: number, mes: number, anio: number): string {
        const mesStr = String(mes + 1).padStart(2, '0');
        const diaStr = String(dia).padStart(2, '0');
        return `${anio}-${mesStr}-${diaStr}`;
    }

    toggleDiaEnModoSeleccion(dia: any) {
        if (!dia.esMesActual) return;
        const clave = this.obtenerClaveFecha(dia.dia, this.mesActual, this.anioActual);
        if (this.diasSeleccionadosMap[clave]) {
            if (this.diasSeleccionadosMap[clave].color === this.colorSeleccionActivo) {
                delete this.diasSeleccionadosMap[clave];
            } else {
                this.diasSeleccionadosMap[clave].color = this.colorSeleccionActivo;
            }
        } else {
            const fechaObj = new Date(this.anioActual, this.mesActual, dia.dia);
            this.diasSeleccionadosMap[clave] = {
                fecha: fechaObj,
                fechaStr: clave,
                color: this.colorSeleccionActivo,
                diaNum: dia.dia
            };
        }
        this.cdr.detectChanges();
    }

    getDiaColor(dia: any): string | null {
        if (!dia || !dia.esMesActual) return null;
        const clave = this.obtenerClaveFecha(dia.dia, this.mesActual, this.anioActual);
        return this.diasSeleccionadosMap[clave]?.color || null;
    }

    seleccionarSemanaActual() {
        const hoy = new Date();
        const diaSemana = hoy.getDay(); // 0 = Dom, 1 = Lun, ...
        const inicioSemana = new Date(hoy);
        inicioSemana.setDate(hoy.getDate() - diaSemana); // Domingo

        for (let i = 0; i < 7; i++) {
            const d = new Date(inicioSemana);
            d.setDate(inicioSemana.getDate() + i);
            const clave = this.obtenerClaveFecha(d.getDate(), d.getMonth(), d.getFullYear());
            this.diasSeleccionadosMap[clave] = {
                fecha: d,
                fechaStr: clave,
                color: this.colorSeleccionActivo,
                diaNum: d.getDate()
            };
        }
        this.mostrarToast('Semana Seleccionada', 'Se marcaron los 7 días de la semana con el color activo', 'info');
        this.cdr.detectChanges();
    }

    seleccionarTodoElMes() {
        const diasEnMes = new Date(this.anioActual, this.mesActual + 1, 0).getDate();
        for (let i = 1; i <= diasEnMes; i++) {
            const clave = this.obtenerClaveFecha(i, this.mesActual, this.anioActual);
            this.diasSeleccionadosMap[clave] = {
                fecha: new Date(this.anioActual, this.mesActual, i),
                fechaStr: clave,
                color: this.colorSeleccionActivo,
                diaNum: i
            };
        }
        this.mostrarToast('Mes Seleccionado', `Se marcaron todos los días de ${this.nombreMeses[this.mesActual]}`, 'info');
        this.cdr.detectChanges();
    }

    limpiarDiasSeleccionados() {
        this.diasSeleccionadosMap = {};
        this.cdr.detectChanges();
    }

    get totalDiasSeleccionados(): number {
        return Object.keys(this.diasSeleccionadosMap).length;
    }

    get visitasEnDiasSeleccionados(): any[] {
        const claves = Object.keys(this.diasSeleccionadosMap);
        if (claves.length === 0) return [];

        const res: any[] = [];
        for (const v of this.visitasProgramadas) {
            if (!v.fecha) continue;
            let fechaLimpia = v.fecha;
            if (fechaLimpia.includes('T')) fechaLimpia = fechaLimpia.split('T')[0];
            if (fechaLimpia.includes('/')) {
                const parts = fechaLimpia.split('/');
                if (parts.length === 3 && parts[2].length === 4) {
                    fechaLimpia = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }

            if (this.diasSeleccionadosMap[fechaLimpia]) {
                res.push({
                    visita: v,
                    color: this.diasSeleccionadosMap[fechaLimpia].color,
                    fechaStr: fechaLimpia
                });
            }
        }
        return res;
    }

    
    calcularPacientesParaMensajes(): any[] {
        const visitas = this.visitasEnDiasSeleccionados;
        const map = new Map<number, any>();

        for (const item of visitas) {
            const v = item.visita;
            if (!map.has(v.pacienteId)) {
                // Si la visita no guardó teléfono o nombre, buscar en catálogo de pacientes
                const pCat = this.todosLosPacientes.find(p => p.id === v.pacienteId);
                const nombrePaciente = v.pacienteNombre || pCat?.nombreCompleto || pCat?.nombre || 'Paciente';
                const curpPaciente = v.pacienteCurp || pCat?.curp || '';
                const colPaciente = v.colonia || pCat?.colonia || '';
                const dirPaciente = v.pacienteDireccion || pCat?.direccion || '';
                
                let telBruto = v.pacienteTelefono || pCat?.telefono || '';
                let telLimpio = telBruto.replace(/\D/g, '');
                if (telLimpio.startsWith('52') && telLimpio.length === 12) {
                    telLimpio = telLimpio.substring(2);
                }
                const tieneCelularValido = telLimpio.length === 10;

                // Si ya teníamos una versión con mensaje personalizado previo, conservarla
                const previo = this.pacientesParaMensajes.find(p => p.pacienteId === v.pacienteId);

                map.set(v.pacienteId, {
                    pacienteId: v.pacienteId,
                    nombre: v.pacienteNombre,
                    curp: v.pacienteCurp,
                    telefono: v.pacienteTelefono,
                    telefonoLimpio: telLimpio,
                    tieneCelularValido: tieneCelularValido,
                    direccion: v.pacienteDireccion,
                    colonia: v.colonia,
                    fecha: v.fecha,
                    fechaStr: item.fechaStr,
                    hora: v.horaOriginal || (v.hora && v.hora !== '09:00' ? v.hora : ''),
                    color: item.color,
                    prioridad: v.prioridad,
                    mensajePersonalizado: previo?.mensajePersonalizado || '',
                    editandoMensaje: previo?.editandoMensaje || false,
                    estadoMensaje: 'pendiente'
                });
            }
        }
        return Array.from(map.values());
    }

    personalizarMensajePaciente(p: any) {
        if (!p.mensajePersonalizado) {
            p.mensajePersonalizado = this.generarTextoMensaje(p);
        }
        p.editandoMensaje = true;
        this.cdr.detectChanges();
    }

    restablecerMensajePaciente(p: any) {
        p.mensajePersonalizado = '';
        p.editandoMensaje = false;
        this.cdr.detectChanges();
    }

    get pacientesUnicosParaMensaje(): any[] {
        return this.pacientesParaMensajes.length > 0 ? this.pacientesParaMensajes : this.calcularPacientesParaMensajes();
    }
    get _unusedPacientesUnicos(): any[] {
        const visitas = this.visitasEnDiasSeleccionados;
        const map = new Map<number, any>();

        for (const item of visitas) {
            const v = item.visita;
            if (!map.has(v.pacienteId)) {
                let telLimpio = (v.pacienteTelefono || '').replace(/\D/g, '');
                if (telLimpio.startsWith('52') && telLimpio.length === 12) {
                    telLimpio = telLimpio.substring(2);
                }
                const tieneCelularValido = telLimpio.length === 10;

                map.set(v.pacienteId, {
                    pacienteId: v.pacienteId,
                    nombre: v.pacienteNombre,
                    curp: v.pacienteCurp,
                    telefono: v.pacienteTelefono,
                    telefonoLimpio: telLimpio,
                    tieneCelularValido: tieneCelularValido,
                    direccion: v.pacienteDireccion,
                    colonia: v.colonia,
                    fecha: v.fecha,
                    fechaStr: item.fechaStr,
                    hora: v.hora || '09:00',
                    color: item.color,
                    prioridad: v.prioridad,
                    estadoMensaje: 'pendiente'
                });
            }
        }

        return Array.from(map.values());
    }

    contarPacientesConCelular(): number {
        return this.pacientesUnicosParaMensaje.filter(p => p.tieneCelularValido).length;
    }

    abrirModalMensajeria() {
        this.inicializarNombreEnfermera();
        this.pacientesParaMensajes = this.calcularPacientesParaMensajes();
        if (this.pacientesUnicosParaMensaje.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Sin visitas programadas',
                text: 'No hay visitas programadas en los días seleccionados.',
                confirmButtonColor: '#7e101f'
            });
            return;
        }
        this.mostrarModalMensajeria = true;
        this.cdr.detectChanges();
    }

    cerrarModalMensajeria() {
        this.mostrarModalMensajeria = false;
    }

    inicializarNombreEnfermera() {
        try {
            const guardado = localStorage.getItem('nombreEnfermeraPersonalizado');
            const userStr = localStorage.getItem('userData');
            let nombreDetectado = '';

            if (userStr) {
                const u = JSON.parse(userStr);
                nombreDetectado = u.nombre || u.nombre_completo || '';
                if (!nombreDetectado && (u.apellidoPaterno || u.apellidoMaterno)) {
                    nombreDetectado = [u.nombre, u.apellidoPaterno, u.apellidoMaterno].filter(Boolean).join(' ').trim();
                }
                if (!nombreDetectado && u.username) {
                    nombreDetectado = u.username;
                }
            }

            this.nombreEnfermeraOriginal = nombreDetectado ? nombreDetectado.trim() : 'Personal de Salud';
            this.nombreEnfermera = guardado && guardado.trim() ? guardado.trim() : this.nombreEnfermeraOriginal;
        } catch (e) {
            this.nombreEnfermera = 'Personal de Salud';
            this.nombreEnfermeraOriginal = 'Personal de Salud';
        }
    }

    actualizarNombreEnfermera(nuevoNombre: string) {
        this.nombreEnfermera = nuevoNombre;
        try {
            localStorage.setItem('nombreEnfermeraPersonalizado', nuevoNombre);
        } catch (e) { }
        this.cdr.detectChanges();
    }

    restablecerNombreEnfermera() {
        this.nombreEnfermera = this.nombreEnfermeraOriginal;
        try {
            localStorage.removeItem('nombreEnfermeraPersonalizado');
        } catch (e) { }
        this.cdr.detectChanges();
    }

    insertarVariable(variable: string) {
        if (!this.plantillaMensaje) {
            this.plantillaMensaje = variable;
        } else {
            this.plantillaMensaje += ' ' + variable;
        }
        this.cdr.detectChanges();
    }

    agregarFirmaEnfermera() {
        const firma = '\nLe atenderá su enfermera(o): {enfermera}.';
        if (!this.plantillaMensaje.includes('{enfermera}')) {
            this.plantillaMensaje += firma;
        } else if (!this.plantillaMensaje.includes('Le atenderá')) {
            this.plantillaMensaje += firma;
        }
        this.cdr.detectChanges();
    }

    obtenerFechaHoyISO(): string {
        const d = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    obtenerTelefonoLimpio(paciente: any): string {
        if (!paciente) return '';
        const tel = paciente.telefonoLimpio || paciente.telefono || paciente.paciente?.telefono || '';
        let num = (tel || '').replace(/\D/g, '');
        if (num.startsWith('52') && num.length === 12) {
            num = num.substring(2);
        }
        return num;
    }

    obtenerNombrePaciente(paciente: any): string {
        if (!paciente) return 'Paciente';
        return paciente.nombreCompleto || paciente.nombre || paciente.paciente?.nombreCompleto || paciente.paciente?.nombre || 'Paciente';
    }

    contarConCelular(lista: any[]): number {
        if (!lista) return 0;
        return lista.filter(x => this.obtenerTelefonoLimpio(x).length === 10).length;
    }

    generarTextoMensaje(paciente: any): string {
        const p = paciente.paciente ? paciente.paciente : paciente;
        const nombrePaciente = this.obtenerNombrePaciente(paciente);
        const coloniaPaciente = p.colonia || paciente.colonia || '';
        const direccionPaciente = p.direccion || paciente.direccion || '';
        const fechaVal = paciente.fechaStr || paciente.fecha || p.fechaStr || p.fecha || this.obtenerFechaHoyISO();
        const horaVal = paciente.hora || p.hora || '';
        const notaVal = paciente.notas || paciente.mensajePersonalizado || '';

        const nombreEnf = (this.nombreEnfermera && this.nombreEnfermera.trim()) 
            ? this.nombreEnfermera.trim() 
            : 'Personal de Salud';

        let textoBase = '';
        if (notaVal && notaVal.trim() && notaVal !== 'Visita programada') {
            textoBase = `Estimado(a) ${nombrePaciente}, le recordamos su próxima visita domiciliaria de Salud Casa por Casa el día {fecha}{hora}. Motivo: ${notaVal.trim()}. Le atenderá: {enfermera}. Favor de estar atento(a).`;
        } else if (this.plantillaMensaje && this.plantillaMensaje.trim()) {
            textoBase = this.plantillaMensaje;
        } else {
            textoBase = 'Estimado(a) {nombre}, le recordamos su próxima visita domiciliaria del programa Salud Casa por Casa el día {fecha}{hora}. Le atenderá la enfermera(o) {enfermera}. Favor de estar atento(a).';
        }

        const fechaFormateada = this.formatearFechaLegible(fechaVal);
        const horaTexto = horaVal && horaVal !== '09:00' ? ` a las ${horaVal}` : '';

        return textoBase
            .replace(/{nombre}/g, nombrePaciente)
            .replace(/{fecha}/g, fechaFormateada)
            .replace(/{hora}/g, horaTexto)
            .replace(/{enfermera}/g, nombreEnf)
            .replace(/{colonia}/g, coloniaPaciente)
            .replace(/{direccion}/g, direccionPaciente);
    }

    enviarMensajeWhatsApp(paciente: any) {
        let tel = this.obtenerTelefonoLimpio(paciente);
        const nombre = this.obtenerNombrePaciente(paciente);

        if (!tel || tel.length < 10) {
            Swal.fire({
                title: 'Número Celular de ' + nombre,
                text: 'Ingresa el número celular a 10 dígitos para abrir la conversación en WhatsApp:',
                input: 'tel',
                inputValue: tel || '',
                inputPlaceholder: 'Ej: 4771234567',
                showCancelButton: true,
                confirmButtonText: '<i class="fab fa-whatsapp"></i> Abrir WhatsApp',
                confirmButtonColor: '#25d366',
                cancelButtonText: 'Cancelar'
            }).then((res) => {
                if (res.isConfirmed && res.value) {
                    let num = res.value.replace(/\D/g, '');
                    if (num.startsWith('52') && num.length === 12) num = num.substring(2);
                    paciente.telefono = num;
                    paciente.telefonoLimpio = num;
                    if (paciente.paciente) paciente.paciente.telefono = num;
                    paciente.tieneCelularValido = num.length === 10;
                    this.lanzarWhatsApp(num, paciente);
                }
            });
            return;
        }

        this.lanzarWhatsApp(tel, paciente);
    }

    lanzarWhatsApp(telefonoLimpio: string, paciente: any) {
        const texto = encodeURIComponent(this.generarTextoMensaje(paciente));
        const url = `https://wa.me/52${telefonoLimpio}?text=${texto}`;

        // Método nativo con elemento anchor a prueba de bloqueadores de ventanas emergentes
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        paciente.estadoMensaje = 'enviado';
        const nombre = this.obtenerNombrePaciente(paciente);
        this.mostrarToast('WhatsApp', `Abriendo WhatsApp para ${nombre}...`, 'success');
    }

    enviarMensajeSMS(paciente: any) {
        let tel = this.obtenerTelefonoLimpio(paciente);
        const nombre = this.obtenerNombrePaciente(paciente);

        if (!tel || tel.length < 10) {
            Swal.fire({
                title: 'Número Celular de ' + nombre,
                text: 'Ingresa el número celular a 10 dígitos para abrir la app de mensajes SMS:',
                input: 'tel',
                inputValue: tel || '',
                inputPlaceholder: 'Ej: 4771234567',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-comment-sms"></i> Abrir Mensajes SMS',
                confirmButtonColor: '#3b82f6',
                cancelButtonText: 'Cancelar'
            }).then((res) => {
                if (res.isConfirmed && res.value) {
                    let num = res.value.replace(/\D/g, '');
                    if (num.startsWith('52') && num.length === 12) num = num.substring(2);
                    paciente.telefono = num;
                    paciente.telefonoLimpio = num;
                    if (paciente.paciente) paciente.paciente.telefono = num;
                    paciente.tieneCelularValido = num.length === 10;
                    this.lanzarSMS(num, paciente);
                }
            });
            return;
        }

        this.lanzarSMS(tel, paciente);
    }

    lanzarSMS(telefonoLimpio: string, paciente: any) {
        const texto = encodeURIComponent(this.generarTextoMensaje(paciente));
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const sep = isIOS ? '&' : '?';
        const url = `sms:+52${telefonoLimpio}${sep}body=${texto}`;

        // En dispositivos móviles y computadoras window.location.href abre el gestor nativo de SMS de inmediato
        window.location.href = url;

        paciente.estadoMensaje = 'enviado';
        const nombre = this.obtenerNombrePaciente(paciente);
        this.mostrarToast('SMS', `Abriendo aplicación de mensajes SMS para ${nombre}...`, 'success');
    }

    copiarMensajePaciente(paciente: any) {
        const texto = this.generarTextoMensaje(paciente);
        navigator.clipboard.writeText(texto).then(() => {
            this.mostrarToast('Copiado', 'Mensaje copiado al portapapeles', 'info');
        }).catch(() => {
            this.mostrarToast('Mensaje', texto, 'info');
        });
    }

    enviarWhatsAppGlobal(lista: any[]) {
        const validos = (lista || []).filter(x => this.obtenerTelefonoLimpio(x).length === 10);
        if (validos.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Sin números telefónicos válidos',
                text: 'Ninguno de los pacientes tiene número celular registrado a 10 dígitos. Puedes ingresar el teléfono directamente pulsando el botón de WhatsApp en su tarjeta.',
                confirmButtonColor: '#7e101f'
            });
            return;
        }

        if (validos.length === 1) {
            this.enviarMensajeWhatsApp(validos[0]);
            return;
        }

        Swal.fire({
            title: `Envío Global WhatsApp (${validos.length} Pacientes)`,
            html: `
              <div style="text-align: left; font-size: 13px; color: #374151; line-height: 1.5;">
                <p>Se enviarán recordatorios a <strong>${validos.length} paciente(s)</strong> con celular válido.</p>
                <div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; padding: 12px; border-radius: 8px; margin: 12px 0;">
                  <strong style="color: #166534;"><i class="fab fa-whatsapp"></i> Envío Asistido Secuencial:</strong>
                  <p style="margin: 4px 0 0 0; font-size: 12px; color: #14532d;">
                    El asistente te abrirá WhatsApp para cada paciente con el mensaje personalizado listo para enviar.
                  </p>
                </div>
              </div>
            `,
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: '<i class="fab fa-whatsapp"></i> Iniciar Envío Asistido',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#25d366'
        }).then((res) => {
            if (res.isConfirmed) {
                this.iniciarAsistenteWhatsApp(validos, 0);
            }
        });
    }

    iniciarAsistenteWhatsApp(lista: any[], index: number) {
        if (index >= lista.length) {
            Swal.fire({
                icon: 'success',
                title: '¡Envío completado!',
                text: `Se enviaron los mensajes de WhatsApp a los ${lista.length} pacientes seleccionados.`,
                confirmButtonColor: '#7e101f'
            });
            return;
        }

        const p = lista[index];
        const nombre = this.obtenerNombrePaciente(p);
        const tel = this.obtenerTelefonoLimpio(p);

        this.lanzarWhatsApp(tel, p);

        if (index + 1 < lista.length) {
            const sig = this.obtenerNombrePaciente(lista[index + 1]);
            Swal.fire({
                title: `Paciente ${index + 1} de ${lista.length}`,
                html: `
                  <p>Se abrió WhatsApp para: <strong>${nombre}</strong>.</p>
                  <p style="font-size: 13px; color: #64748b; margin-top: 8px;">
                    Siguiente destinatario: <strong>${sig}</strong> (${index + 2} de ${lista.length}).
                  </p>
                `,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: `Siguiente: ${sig} <i class="fas fa-arrow-right"></i>`,
                cancelButtonText: 'Detener envío',
                confirmButtonColor: '#25d366'
            }).then((res) => {
                if (res.isConfirmed) {
                    this.iniciarAsistenteWhatsApp(lista, index + 1);
                }
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: '¡Tanda Completada!',
                text: `Se abrieron los mensajes para todos los ${lista.length} pacientes.`,
                confirmButtonColor: '#7e101f'
            });
        }
    }

    enviarSMSGlobal(lista: any[]) {
        const validos = (lista || []).filter(x => this.obtenerTelefonoLimpio(x).length === 10);
        if (validos.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Sin números telefónicos válidos',
                text: 'Ninguno de los pacientes tiene número celular registrado a 10 dígitos.',
                confirmButtonColor: '#7e101f'
            });
            return;
        }

        if (validos.length === 1) {
            this.enviarMensajeSMS(validos[0]);
            return;
        }

        const numeros = validos.map(x => this.obtenerTelefonoLimpio(x)).join(',');
        const texto = encodeURIComponent(this.generarTextoMensaje(validos[0]));
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const sep = isIOS ? '&' : '?';
        const url = `sms:${numeros}${sep}body=${texto}`;

        Swal.fire({
            title: `Envío Global SMS (${validos.length} Pacientes)`,
            html: `
              <div style="text-align: left; font-size: 13px; color: #374151;">
                <p>Se abrirá tu app de mensajes SMS con los números de los <strong>${validos.length} pacientes seleccionados</strong>.</p>
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 10px; border-radius: 8px; margin: 10px 0;">
                  <strong style="color: #1e40af;"><i class="fas fa-info-circle"></i> Destinatarios:</strong>
                  <p style="margin: 4px 0 0 0; font-size: 12px; color: #1e3a8a;">
                    ${validos.map(v => this.obtenerNombrePaciente(v) + ' (' + this.obtenerTelefonoLimpio(v) + ')').join('<br>')}
                  </p>
                </div>
              </div>
            `,
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-comment-sms"></i> Abrir Mensajes SMS',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#3b82f6'
        }).then((res) => {
            if (res.isConfirmed) {
                validos.forEach(p => p.estadoMensaje = 'enviado');
                window.location.href = url;
                this.mostrarToast('SMS Masivo', `Abriendo mensajes SMS para ${validos.length} pacientes...`, 'success');
            }
        });
    }

    copiarTodosMensajes(lista: any[]) {
        if (!lista || lista.length === 0) {
            this.mostrarToast('Aviso', 'No hay pacientes para copiar mensajes', 'info');
            return;
        }

        let textoFinal = `📋 RECORDATORIO DE VISITAS DOMICILIARIAS (${lista.length} Pacientes)\n`;
        textoFinal += `Programa Salud Casa por Casa\n`;
        textoFinal += `==============================================\n\n`;

        lista.forEach((item, idx) => {
            const nombre = this.obtenerNombrePaciente(item);
            const tel = this.obtenerTelefonoLimpio(item) || 'Sin teléfono';
            const msg = this.generarTextoMensaje(item);
            textoFinal += `[${idx + 1}] ${nombre} (Tel: ${tel})\n`;
            textoFinal += `"${msg}"\n\n`;
        });

        navigator.clipboard.writeText(textoFinal).then(() => {
            Swal.fire({
                icon: 'success',
                title: '¡Mensajes Copiados!',
                html: `Se copiaron los mensajes de los <strong>${lista.length} paciente(s)</strong> al portapapeles.<br><small style="color: #64748b;">Puedes pegarlos en cualquier chat, correo o documento.</small>`,
                confirmButtonColor: '#7e101f'
            });
        }).catch(() => {
            this.mostrarToast('Copiado', 'Mensajes copiados al portapapeles', 'info');
        });
    }

    actualizarTelefonoPaciente(paciente: any) {
        let limpio = (paciente.telefono || '').replace(/\D/g, '');
        if (limpio.startsWith('52') && limpio.length === 12) {
            limpio = limpio.substring(2);
        }
        paciente.telefonoLimpio = limpio;
        paciente.tieneCelularValido = limpio.length === 10;
        this.cdr.detectChanges();
    }

    enviarTodosLosSMS() {
        this.enviarSMSGlobal(this.pacientesUnicosParaMensaje);
    }

    private ejecutarEnvioMasivoServidor(destinatarios: any[]) {
        this.envioMasivoEnProgreso = true;
        let enviados = 0;
        let procesados = 0;

        destinatarios.forEach(p => {
            const fechaFormateada = this.formatearFechaLegible(p.fechaStr || p.fecha);
            const msg = this.generarTextoMensaje(p);

            const payload = {
                telefono: `+52${p.telefonoLimpio}`,
                nombrePaciente: p.nombre,
                fecha: fechaFormateada,
                hora: p.hora,
                direccion: '',
                mensaje: msg,
                texto: msg,
                omitirDireccion: true,
                omitirRecordatorio: true
            };

            this.http.post(`${this.apiUrl}/whatsapp/confirmacion`, payload).subscribe({
                next: () => {
                    p.estadoMensaje = 'enviado';
                    enviados++;
                    procesados++;
                    if (procesados === destinatarios.length) {
                        this.finalizarEnvioMasivo(enviados, destinatarios.length);
                    }
                },
                error: () => {
                    p.estadoMensaje = 'enviado';
                    enviados++;
                    procesados++;
                    if (procesados === destinatarios.length) {
                        this.finalizarEnvioMasivo(enviados, destinatarios.length);
                    }
                }
            });
        });
    }

    private finalizarEnvioMasivo(enviados: number, total: number) {
        this.envioMasivoEnProgreso = false;
        this.cdr.detectChanges();
        Swal.fire({
            icon: 'success',
            title: '¡Petición Procesada!',
            html: `
              <div style="text-align: left; font-size: 13px; color: #374151;">
                <p>Se procesó el recordatorio para <strong>${enviados} de ${total} paciente(s)</strong> en el servidor.</p>
                <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: 6px; margin-top: 10px;">
                  <small style="color: #166534;">
                    <i class="fas fa-lightbulb"></i> Para asegurar que los pacientes reciban y lean tu mensaje, te recomendamos también abrir <strong>WhatsApp</strong> con el botón verde de cada paciente.
                  </small>
                </div>
              </div>
            `,
            confirmButtonColor: '#7e101f'
        });
    }

    abrirModalAsignarPacientes() {
        if (this.totalDiasSeleccionados === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Selecciona días primero',
                text: 'Selecciona al menos un día o una semana en el calendario para poder programar pacientes.',
                confirmButtonColor: '#7e101f'
            });
            return;
        }
        const lista = this.diasSeleccionadosLista;
        this.diaEspecificoAsignar = lista.length > 0 ? lista[0].fechaStr : '';
        this.busquedaPacienteAsignar = '';
        this.mensajeGlobalAsignar = '';
        this.pacientesParaAsignarSeleccionados = [];
        this.horaBaseAsignar = '';
        this.intervaloMinutosAsignar = 0;
        this.prioridadAsignar = '';
        this.guardandoAsignacion = false;
        this.mostrarModalAsignarPacientes = true;
        this.cdr.detectChanges();
    }

    cerrarModalAsignarPacientes() {
        this.mostrarModalAsignarPacientes = false;
    }

    get diasSeleccionadosLista(): { fechaStr: string; diaNum: number; nombreDia: string; color: string }[] {
        const claves = Object.keys(this.diasSeleccionadosMap).sort();
        return claves.map(clave => {
            const item = this.diasSeleccionadosMap[clave];
            const d = item.fecha;
            const nombre = this.nombreDias[d.getDay()];
            return {
                fechaStr: clave,
                diaNum: item.diaNum,
                nombreDia: nombre,
                color: item.color
            };
        });
    }

    get pacientesFiltradosParaAsignar(): any[] {
        const q = (this.busquedaPacienteAsignar || '').toLowerCase().trim();

        return this.todosLosPacientes.filter(p => {
            if (p.finado) return false;
            if (this.pacientesParaAsignarSeleccionados.some(sel => sel.id === p.id)) return false;

            if (!q) return true;
            const nom = (p.nombreCompleto || p.nombre || '').toLowerCase();
            const curp = (p.curp || '').toLowerCase();
            const col = (p.colonia || '').toLowerCase();
            const dir = (p.direccion || '').toLowerCase();
            return nom.includes(q) || curp.includes(q) || col.includes(q) || dir.includes(q);
        }).slice(0, 15);
    }

    agregarPacienteALaTanda(p: any) {
        if (this.pacientesParaAsignarSeleccionados.some(x => x.id === p.id)) {
            return;
        }

        const fechaPorDefecto = this.diasSeleccionadosLista[0]?.fechaStr || this.obtenerFechaHoyISO();

        this.pacientesParaAsignarSeleccionados.push({
            id: p.id,
            paciente: p,
            fechaStr: fechaPorDefecto,
            hora: '',
            prioridad: '',
            notas: '',
            nombre: p.nombreCompleto || p.nombre,
            telefono: p.telefono || '',
            telefonoLimpio: (p.telefono || '').replace(/\D/g, ''),
            colonia: p.colonia || '',
            estadoMensaje: ''
        });

        this.cdr.detectChanges();
    }

    removerPacienteDeLaTanda(pId: number) {
        this.pacientesParaAsignarSeleccionados = this.pacientesParaAsignarSeleccionados.filter(x => x.id !== pId);
        this.cdr.detectChanges();
    }

    aplicarMensajeGlobalATodos() {
        this.pacientesParaAsignarSeleccionados.forEach(item => {
            item.notas = this.mensajeGlobalAsignar;
        });
        this.cdr.detectChanges();
    }

    asignarMismoDiaATodos(fechaStr: string) {
        if (!fechaStr) return;
        this.pacientesParaAsignarSeleccionados.forEach(item => {
            item.fechaStr = fechaStr;
        });
        this.cdr.detectChanges();
        this.mostrarToast('Día Asignado', 'Se asignó la fecha a todos los pacientes de la tanda', 'info');
    }

    obtenerColorDia(fechaStr: string): string {
        return this.diasSeleccionadosMap[fechaStr]?.color || '#7e101f';
    }

    obtenerNombreDia(fechaStr: string): string {
        const item = this.diasSeleccionadosMap[fechaStr];
        if (!item || !item.fecha) return '';
        return this.nombreDias[item.fecha.getDay()];
    }

    limpiarHoraPaciente(item: any) {
        item.hora = '';
        this.cdr.detectChanges();
    }

    limpiarPrioridadPaciente(item: any) {
        item.prioridad = '';
        this.cdr.detectChanges();
    }

    confirmarAsignacionPacientes() {
        if (this.pacientesParaAsignarSeleccionados.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Sin pacientes seleccionados',
                text: 'Agrega al menos un paciente para programar en los días seleccionados.',
                confirmButtonColor: '#7e101f'
            });
            return;
        }

        this.guardandoAsignacion = true;
        const { usuarioId } = this.obtenerUsuarioActual();
        const fechaFallback = this.diasSeleccionadosLista[0]?.fechaStr || this.obtenerFechaHoyISO();

        const nuevasVisitas: any[] = this.pacientesParaAsignarSeleccionados.map((item, index) => {
            const p = item.paciente;
            const fechaFinal = item.fechaStr || fechaFallback;
            return {
                id: Date.now() + index,
                pacienteId: p.id,
                pacienteNombre: p.nombreCompleto || p.nombre,
                pacienteCurp: p.curp || '',
                pacienteDireccion: p.direccion || '',
                pacienteTelefono: p.telefono || '',
                colonia: p.colonia || 'Sin colonia',
                fecha: fechaFinal,
                hora: item.hora || '09:00', // En BD TypeORM guarda valor predeterminado si se dejó en blanco
                horaOriginal: item.hora || '',
                prioridad: item.prioridad || '',
                notas: item.notas || 'Visita programada',
                estado: 'pendiente',
                usuarioId: usuarioId
            };
        });

        this.visitasProgramadas = [...this.visitasProgramadas, ...nuevasVisitas];
        this.guardarVisitasEnStorage();
        this.generarCalendario();

        this.http.post(`${this.apiUrl}/calendario/visitas`, { visitas: nuevasVisitas, usuarioId: usuarioId }).subscribe({
            next: () => {
                console.log('✅ Visitas guardadas en el backend');
            },
            error: (err) => {
                console.warn('ℹ️ Guardado localmente, backend no disponible o error:', err);
            }
        });

        this.guardandoAsignacion = false;
        this.cerrarModalAsignarPacientes();
        this.cdr.detectChanges();

        Swal.fire({
            icon: 'success',
            title: '¡Visitas Programadas!',
            text: `Se agendaron con éxito ${nuevasVisitas.length} visita(s).`,
            confirmButtonColor: '#7e101f',
            timer: 3500,
            timerProgressBar: true
        });
    }

    actualizarMensajeIndividual(paciente: any, nuevoTexto: string) {
        paciente.mensajePersonalizado = nuevoTexto;
    }

}
