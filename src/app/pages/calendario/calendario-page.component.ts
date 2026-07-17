// src/app/pages/calendario/calendario-page.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { CalendarioService, VisitaData } from '../../services/calendario.service';

interface VisitaProgramada {
    id: number;
    pacienteId: number;
    pacienteNombre: string;
    pacienteCurp: string;
    pacienteDireccion: string;
    pacienteTelefono: string;
    fecha: string;
    hora: string;
    estado: 'pendiente' | 'completada' | 'cancelada';
    notas: string;
    prioridad: 'alta' | 'media' | 'baja';
}

interface DiaCalendario {
    fecha: Date;
    dia: number;
    mes: number;
    anio: number;
    visitas: VisitaProgramada[];
    totalVisitas: number;
    esHoy: boolean;
    esMesActual: boolean;
    tieneVisitas: boolean;
}

interface PacienteSeleccionado {
    id: number;
    nombreCompleto: string;
    curp: string;
    direccion: string;
    telefono: string;
    colonia: string;
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

    mesActual: number = new Date().getMonth();
    anioActual: number = new Date().getFullYear();
    nombreMeses: string[] = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    nombreDias: string[] = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    yearsDisponibles: number[] = [];

    diasCalendario: DiaCalendario[] = [];
    visitasProgramadas: VisitaProgramada[] = [];
    pacientesDisponibles: any[] = [];

    mostrarModalDetalle: boolean = false;
    diaDetalle: DiaCalendario | null = null;

    get visitasDelDia(): VisitaProgramada[] {
        return this.diaDetalle?.visitas || [];
    }

    get totalVisitasDelDia(): number {
        return this.diaDetalle?.visitas?.length || 0;
    }

    get tieneVisitasDelDia(): boolean {
        return !!(this.diaDetalle?.visitas && this.diaDetalle.visitas.length > 0);
    }

    get fechaDelDia(): string {
        if (!this.diaDetalle) return '';
        return `${this.diaDetalle.dia} de ${this.nombreMeses[this.diaDetalle.mes]}`;
    }

    get visitasDelMes(): VisitaProgramada[] {
        const mesStr = `${this.anioActual}-${String(this.mesActual + 1).padStart(2, '0')}`;
        return this.visitasProgramadas.filter(v =>
            v.fecha && v.fecha.startsWith(mesStr)
        );
    }

    diaSeleccionado: DiaCalendario | null = null;

    mostrarModalProgramar: boolean = false;

    pacientesSeleccionados: PacienteSeleccionado[] = [];

    fechaDefault: string = '';
    horaDefault: string = '09:00';
    prioridadDefault: 'alta' | 'media' | 'baja' = 'media';
    notasDefault: string = '';

    busquedaPaciente: string = '';
    sugerenciasPacientes: any[] = [];
    mostrarSugerencias: boolean = false;
    loading: boolean = false;

    mensajeToast: string = '';
    tipoToast: string = '';
    mostrarToastFlag: boolean = false;

    confirmacionVisible: boolean = false;
    confirmacionTitulo: string = '';
    confirmacionMensaje: string = '';
    confirmacionDetalle: string = '';
    confirmacionOnConfirm: (() => void) | null = null;
    confirmacionOnCancel: (() => void) | null = null;

    private apiUrl = 'http://localhost:3000';
    private idEnfermera = 1;

    constructor(
        private http: HttpClient,
        private route: ActivatedRoute,
        private calendarioService: CalendarioService
    ) { }

    ngOnInit() {
        const yearActual = new Date().getFullYear();
        for (let i = yearActual - 5; i <= yearActual + 5; i++) {
            this.yearsDisponibles.push(i);
        }

        this.calendarioService.visitaData$.subscribe((data) => {
            if (data) {
                this.precargarPacienteDesdeMapa(data);
                this.calendarioService.clearVisitaData();
            }
        });

        this.route.queryParams.subscribe(params => {
            if (params['pacienteId']) {
                const data: VisitaData = {
                    pacienteId: Number(params['pacienteId']),
                    nombre: params['nombre'] || '',
                    telefono: params['telefono'] || '',
                    direccion: params['direccion'] || '',
                    curp: params['curp'] || '',
                    colonia: params['colonia'] || ''
                };
                this.precargarPacienteDesdeMapa(data);
            }
        });

        this.visitasProgramadas = this.calendarioService.getVisitasProgramadas() || [];
        this.cargarDatos();
    }

    getFechaMinima(): string {
        return new Date().toISOString().split('T')[0];
    }

    cargarDatos() {
        this.loading = true;
        this.cargarPacientes();
        this.generarCalendario();
    }

    cargarPacientes() {
        this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${this.idEnfermera}`)
            .subscribe({
                next: (data) => {
                    this.pacientesDisponibles = data.map(p => ({
                        id: p.id,
                        numero: p.numero,
                        nombreCompleto: this.construirNombreCompleto(p),
                        nombre: p.nombre || '',
                        apellidoPaterno: p.apellidoPaterno || '',
                        apellidoMaterno: p.apellidoMaterno || '',
                        curp: p.curp || '',
                        telefono: p.telefonoCelular || p.telefonoFijo || '',
                        direccion: p.direccion || '',
                        colonia: this.extraerColonia(p.direccion),
                        seccion: p.zonaTrabajo?.split('-').pop() || '',
                        estatus: p.estatus || 'PENDIENTE',
                        programa: p.programa || '',
                        fechaFinado: p.fechaFinado || null,
                        estaFinado: p.estatus?.toUpperCase() === 'FINADO' || p.fechaFinado !== null
                    }));
                    this.loading = false;
                },
                error: () => {
                    this.loading = false;
                    this.cargarPacientesEjemplo();
                }
            });
    }

    cargarPacientesEjemplo() {
        this.pacientesDisponibles = [
            { id: 30, numero: 30, nombreCompleto: 'SOLIS SOLIS ELOY', nombre: 'ELOY', apellidoPaterno: 'SOLIS', apellidoMaterno: 'SOLIS', curp: 'SOSE470605HGTLLL01', telefono: '4773975192', direccion: 'SAN JOSE #208, COL. SANTA ROSA DE LIMA, LEON, GTO', colonia: 'SANTA ROSA DE LIMA', seccion: '277', estatus: 'RECHAZO', programa: 'PAM', fechaFinado: null, estaFinado: false },
            { id: 148, numero: 148, nombreCompleto: 'ADOLFO', nombre: 'ADOLFO', apellidoPaterno: '', apellidoMaterno: '', curp: '', telefono: '4773300505', direccion: 'FRAY BERNARDO QUINTAVALLE 131. COL FRANCCIONAMIENTO REAL DE SAN JOSE', colonia: 'FRANCCIONAMIENTO REAL DE SAN JOSE', seccion: '277', estatus: 'RECHAZO', programa: 'PAM', fechaFinado: null, estaFinado: false }
        ];
        this.loading = false;
    }

    construirNombreCompleto(paciente: any): string {
        const partes = [];
        if (paciente.apellidoPaterno) partes.push(paciente.apellidoPaterno);
        if (paciente.apellidoMaterno) partes.push(paciente.apellidoMaterno);
        if (paciente.nombre) partes.push(paciente.nombre);
        return partes.length > 0 ? partes.join(' ') : 'Nombre no disponible';
    }

    extraerColonia(direccion: string): string {
        if (!direccion) return '';
        const partes = direccion.split(',');
        return partes.length >= 2 ? partes[1].trim() : '';
    }

    guardarVisitas() {
        this.calendarioService.setVisitasProgramadas(this.visitasProgramadas);
    }

    generarCalendario() {
        const primerDia = new Date(this.anioActual, this.mesActual, 1);
        const ultimoDia = new Date(this.anioActual, this.mesActual + 1, 0);
        const diasEnMes = ultimoDia.getDate();
        const diaInicioSemana = primerDia.getDay();

        this.diasCalendario = [];
        const hoy = new Date();
        const hoyStr = hoy.toISOString().split('T')[0];

        const diasMesAnterior = new Date(this.anioActual, this.mesActual, 0).getDate();

        for (let i = diaInicioSemana - 1; i >= 0; i--) {
            const fecha = new Date(this.anioActual, this.mesActual - 1, diasMesAnterior - i);
            const fechaStr = fecha.toISOString().split('T')[0];
            const visitasDelDia = this.visitasProgramadas.filter(v => v.fecha === fechaStr);

            this.diasCalendario.push({
                fecha: fecha,
                dia: fecha.getDate(),
                mes: fecha.getMonth(),
                anio: fecha.getFullYear(),
                visitas: visitasDelDia,
                totalVisitas: visitasDelDia.length,
                esHoy: fechaStr === hoyStr,
                esMesActual: false,
                tieneVisitas: visitasDelDia.length > 0
            });
        }

        for (let i = 1; i <= diasEnMes; i++) {
            const fecha = new Date(this.anioActual, this.mesActual, i);
            const fechaStr = fecha.toISOString().split('T')[0];
            const visitasDelDia = this.visitasProgramadas.filter(v => v.fecha === fechaStr);

            this.diasCalendario.push({
                fecha: fecha,
                dia: i,
                mes: this.mesActual,
                anio: this.anioActual,
                visitas: visitasDelDia,
                totalVisitas: visitasDelDia.length,
                esHoy: fechaStr === hoyStr,
                esMesActual: true,
                tieneVisitas: visitasDelDia.length > 0
            });
        }

        const totalDiasMostrados = this.diasCalendario.length;
        const diasRestantes = 42 - totalDiasMostrados;

        for (let i = 1; i <= diasRestantes; i++) {
            const fecha = new Date(this.anioActual, this.mesActual + 1, i);
            const fechaStr = fecha.toISOString().split('T')[0];
            const visitasDelDia = this.visitasProgramadas.filter(v => v.fecha === fechaStr);

            this.diasCalendario.push({
                fecha: fecha,
                dia: i,
                mes: fecha.getMonth(),
                anio: fecha.getFullYear(),
                visitas: visitasDelDia,
                totalVisitas: visitasDelDia.length,
                esHoy: fechaStr === hoyStr,
                esMesActual: false,
                tieneVisitas: visitasDelDia.length > 0
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

    cambiarMesAnio() {
        this.generarCalendario();
    }

    irHoy() {
        const hoy = new Date();
        this.mesActual = hoy.getMonth();
        this.anioActual = hoy.getFullYear();
        this.generarCalendario();
    }

    seleccionarDia(dia: DiaCalendario) {
        const fechaStr = dia.fecha.toISOString().split('T')[0];
        const visitas = this.visitasProgramadas.filter(v => v.fecha === fechaStr);

        this.diaDetalle = {
            ...dia,
            visitas: visitas,
            totalVisitas: visitas.length
        };
        this.mostrarModalDetalle = true;
    }

    cerrarModalDetalle() {
        this.mostrarModalDetalle = false;
        this.diaDetalle = null;
    }

    abrirModalProgramarDesdeDetalle() {
        if (this.diaDetalle) {
            this.cerrarModalDetalle();
            this.abrirModalProgramar(this.diaDetalle.fecha);
        }
    }

    verTodasVisitasMes() {
        const visitas = this.visitasDelMes;
        if (visitas.length > 0) {
            this.mostrarToast(`${visitas.length} visitas en ${this.nombreMeses[this.mesActual]}`, 'info');
        } else {
            this.mostrarToast(`No hay visitas en ${this.nombreMeses[this.mesActual]}`, 'info');
        }
    }

    abrirModalProgramar(fecha?: Date) {
        this.mostrarModalProgramar = true;
        this.pacientesSeleccionados = [];

        if (fecha) {
            this.fechaDefault = fecha.toISOString().split('T')[0];
        } else {
            this.fechaDefault = '';
        }
        this.horaDefault = '09:00';
        this.prioridadDefault = 'media';
        this.notasDefault = '';

        this.busquedaPaciente = '';
        this.sugerenciasPacientes = [];
        this.mostrarSugerencias = false;
    }

    precargarPacienteDesdeMapa(data: VisitaData) {
        if (!data || !data.pacienteId) {
            return;
        }

        const pacienteEncontrado = this.pacientesDisponibles.find(p => p.id === data.pacienteId);

        if (pacienteEncontrado) {
            // Verificar si está finado
            if (pacienteEncontrado.estaFinado) {
                this.mostrarToast(`El paciente ${pacienteEncontrado.nombreCompleto} esta FINADO y no puede agendarse`, 'error');
                return;
            }
            this.abrirModalProgramarConPaciente(pacienteEncontrado);
        } else {
            const pacienteTemp = {
                id: data.pacienteId,
                numero: data.pacienteId,
                nombreCompleto: data.nombre || `Paciente ${data.pacienteId}`,
                nombre: data.nombre ? data.nombre.split(' ')[0] : `Paciente ${data.pacienteId}`,
                apellidoPaterno: '',
                apellidoMaterno: '',
                curp: data.curp || '',
                telefono: data.telefono || '',
                direccion: data.direccion || '',
                colonia: data.colonia || '',
                seccion: '277',
                estatus: 'PENDIENTE',
                programa: 'PAM',
                fechaFinado: null,
                estaFinado: false
            };
            this.abrirModalProgramarConPaciente(pacienteTemp);
        }
    }

    abrirModalProgramarConPaciente(paciente: any) {
        this.mostrarModalProgramar = true;
        this.pacientesSeleccionados = [];

        const fechaDefault = new Date();
        fechaDefault.setDate(fechaDefault.getDate() + 1);
        this.fechaDefault = fechaDefault.toISOString().split('T')[0];
        this.horaDefault = '09:00';
        this.prioridadDefault = 'media';
        this.notasDefault = '';

        const nuevoPaciente: PacienteSeleccionado = {
            id: paciente.id,
            nombreCompleto: paciente.nombreCompleto,
            curp: paciente.curp || '',
            direccion: paciente.direccion || '',
            telefono: paciente.telefono || '',
            colonia: paciente.colonia || '',
            fecha: this.fechaDefault,
            hora: this.horaDefault,
            prioridad: this.prioridadDefault,
            notas: this.notasDefault,
            tieneConflicto: false,
            mensajeConflicto: '',
            estaFinado: paciente.estaFinado || false
        };

        if (nuevoPaciente.estaFinado) {
            this.mostrarToast(`El paciente ${paciente.nombreCompleto} esta FINADO y no puede agendarse`, 'error');
            this.pacientesSeleccionados.push(nuevoPaciente);
            return;
        }

        const yaTieneVisita = this.visitasProgramadas.some(v =>
            v.pacienteId === paciente.id &&
            v.fecha === nuevoPaciente.fecha &&
            v.estado !== 'cancelada'
        );

        if (yaTieneVisita) {
            nuevoPaciente.tieneConflicto = true;
            nuevoPaciente.mensajeConflicto = 'Ya tiene visita en esta fecha';
        }

        this.pacientesSeleccionados.push(nuevoPaciente);
        this.busquedaPaciente = '';
        this.sugerenciasPacientes = [];
        this.mostrarSugerencias = false;
    }

    cerrarModalProgramar() {
        this.mostrarModalProgramar = false;
        this.sugerenciasPacientes = [];
        this.mostrarSugerencias = false;
        this.pacientesSeleccionados = [];
    }

    onBusquedaPacienteChange() {
        const busqueda = this.busquedaPaciente;

        if (!busqueda || busqueda.trim() === '') {
            this.sugerenciasPacientes = [];
            this.mostrarSugerencias = false;
            return;
        }

        const busquedaLower = busqueda.toLowerCase();
        const idsSeleccionados = this.pacientesSeleccionados.map(p => p.id);

        this.sugerenciasPacientes = this.pacientesDisponibles.filter(p => {
            if (idsSeleccionados.includes(p.id)) return false;

            const coincideNombre = p.nombreCompleto.toLowerCase().includes(busquedaLower);
            const coincideId = String(p.id).includes(busqueda);
            const coincideCurp = p.curp && p.curp.toLowerCase().includes(busquedaLower);
            const coincideNombreSimple = p.nombre.toLowerCase().includes(busquedaLower);
            const coincideApellido = p.apellidoPaterno.toLowerCase().includes(busquedaLower);

            return coincideNombre || coincideId || coincideCurp || coincideNombreSimple || coincideApellido;
        });

        this.mostrarSugerencias = this.sugerenciasPacientes.length > 0;
    }

    agregarPacienteSeleccionado(paciente: any) {
        if (this.pacientesSeleccionados.find(p => p.id === paciente.id)) {
            this.mostrarToast('Este paciente ya esta en la lista', 'info');
            return;
        }

        // ⭐ VERIFICAR SI ESTÁ FINADO
        if (paciente.estaFinado) {
            this.mostrarToast(`El paciente ${paciente.nombreCompleto} esta FINADO y no puede agendarse`, 'error');
            return;
        }

        const nuevoPaciente: PacienteSeleccionado = {
            id: paciente.id,
            nombreCompleto: paciente.nombreCompleto,
            curp: paciente.curp || '',
            direccion: paciente.direccion || '',
            telefono: paciente.telefono || '',
            colonia: paciente.colonia || '',
            fecha: this.fechaDefault || '',
            hora: this.horaDefault,
            prioridad: this.prioridadDefault,
            notas: this.notasDefault,
            tieneConflicto: false,
            mensajeConflicto: '',
            estaFinado: false
        };

        if (nuevoPaciente.fecha) {
            const yaTieneVisita = this.visitasProgramadas.some(v =>
                v.pacienteId === paciente.id &&
                v.fecha === nuevoPaciente.fecha &&
                v.estado !== 'cancelada'
            );

            if (yaTieneVisita) {
                nuevoPaciente.tieneConflicto = true;
                nuevoPaciente.mensajeConflicto = 'Ya tiene visita en esta fecha';
            }
        }

        this.pacientesSeleccionados.push(nuevoPaciente);
        this.busquedaPaciente = '';
        this.sugerenciasPacientes = [];
        this.mostrarSugerencias = false;

        this.mostrarToast(`${paciente.nombreCompleto} agregado a la lista`, 'success');
    }

    quitarPacienteSeleccionado(pacienteId: number) {
        const paciente = this.pacientesSeleccionados.find(p => p.id === pacienteId);
        this.pacientesSeleccionados = this.pacientesSeleccionados.filter(p => p.id !== pacienteId);

        if (paciente) {
            this.mostrarToast(`${paciente.nombreCompleto} removido de la lista`, 'info');
        }
    }

    quitarTodosPacientes() {
        if (this.pacientesSeleccionados.length === 0) return;
        this.pacientesSeleccionados = [];
        this.mostrarToast('Lista limpiada', 'info');
    }

    actualizarConfiguracionPaciente(pacienteId: number, campo: string, valor: any) {
        const paciente = this.pacientesSeleccionados.find(p => p.id === pacienteId);
        if (!paciente) return;

        (paciente as any)[campo] = valor;

        if (campo === 'fecha') {
            const yaTieneVisita = this.visitasProgramadas.some(v =>
                v.pacienteId === pacienteId &&
                v.fecha === valor &&
                v.estado !== 'cancelada'
            );

            if (yaTieneVisita && valor) {
                paciente.tieneConflicto = true;
                paciente.mensajeConflicto = 'Ya tiene visita en esta fecha';
                this.mostrarToast(`${paciente.nombreCompleto} ya tiene visita en esta fecha`, 'error');
            } else {
                paciente.tieneConflicto = false;
                paciente.mensajeConflicto = '';
            }
        }
    }

    enviarNotificacionCalendario(visita: VisitaProgramada) {
        this.http.post(`http://localhost:3000/pacientes/${visita.pacienteId}/visita/programar`, {
            fecha: visita.fecha,
            hora: visita.hora,
            usuarioId: 1
        }).subscribe({
            next: () => {
                this.mostrarToast(
                    `Visita programada para ${visita.pacienteNombre} el ${visita.fecha} a las ${visita.hora}`,
                    'success'
                );
            },
            error: () => {
                this.mostrarToast('Visita guardada, pero no se pudo enviar la notificacion', 'info');
            }
        });
    }

    guardarVisitaProgramada() {
        if (this.pacientesSeleccionados.length === 0) {
            this.mostrarToast('Agregue al menos un paciente', 'error');
            return;
        }

        // ⭐ VERIFICAR PACIENTES FINADOS
        const pacientesFinados = this.pacientesSeleccionados.filter(p => p.estaFinado);
        if (pacientesFinados.length > 0) {
            const nombres = pacientesFinados.map(p => p.nombreCompleto).join(', ');
            this.mostrarToast(`No se pueden agendar pacientes FINADOS: ${nombres}`, 'error');
            return;
        }

        const pacientesSinFecha = this.pacientesSeleccionados.filter(p => !p.fecha);
        const pacientesSinHora = this.pacientesSeleccionados.filter(p => !p.hora);

        if (pacientesSinFecha.length > 0) {
            this.mostrarToast(`${pacientesSinFecha.length} paciente(s) sin fecha seleccionada`, 'error');
            return;
        }

        if (pacientesSinHora.length > 0) {
            this.mostrarToast(`${pacientesSinHora.length} paciente(s) sin hora seleccionada`, 'error');
            return;
        }

        const pacientesConConflicto = this.pacientesSeleccionados.filter(p => p.tieneConflicto);
        if (pacientesConConflicto.length > 0) {
            const nombres = pacientesConConflicto.map(p => p.nombreCompleto).join(', ');
            this.mostrarToast(`Conflictos: ${nombres}`, 'error');
            return;
        }

        const nuevasVisitas: VisitaProgramada[] = [];

        this.pacientesSeleccionados.forEach((paciente, index) => {
            const visita: VisitaProgramada = {
                id: Date.now() + index,
                pacienteId: paciente.id,
                pacienteNombre: paciente.nombreCompleto,
                pacienteCurp: paciente.curp || '',
                pacienteDireccion: paciente.direccion || '',
                pacienteTelefono: paciente.telefono || '',
                fecha: paciente.fecha,
                hora: paciente.hora,
                estado: 'pendiente',
                notas: paciente.notas || '',
                prioridad: paciente.prioridad
            };

            nuevasVisitas.push(visita);
            this.visitasProgramadas.push(visita);
            this.enviarNotificacionCalendario(visita);
        });

        this.guardarVisitas();
        this.generarCalendario();

        this.mostrarToast(`${nuevasVisitas.length} visita(s) programada(s) correctamente`, 'success');
        this.cerrarModalProgramar();
    }

    eliminarVisita(visitaId: number) {
        this.mostrarConfirmacion(
            'Eliminar esta visita',
            'Esta accion no se puede deshacer',
            'Se eliminara la visita programada de este paciente',
            () => {
                this.visitasProgramadas = this.visitasProgramadas.filter(v => v.id !== visitaId);
                this.guardarVisitas();

                if (this.diaDetalle) {
                    const fechaStr = this.diaDetalle.fecha.toISOString().split('T')[0];
                    this.diaDetalle.visitas = this.visitasProgramadas.filter(v => v.fecha === fechaStr);
                    this.diaDetalle.totalVisitas = this.diaDetalle.visitas.length;
                }

                this.generarCalendario();
                this.mostrarToast('Visita eliminada correctamente', 'success');
            }
        );
    }

    cambiarEstadoVisita(visitaId: number, estado: string) {
        const estadoValido = estado as 'pendiente' | 'completada' | 'cancelada';

        if (!['pendiente', 'completada', 'cancelada'].includes(estadoValido)) {
            return;
        }

        const visita = this.visitasProgramadas.find(v => v.id === visitaId);
        if (visita) {
            visita.estado = estadoValido;
            this.guardarVisitas();

            if (this.diaDetalle) {
                const visitaDetalle = this.diaDetalle.visitas.find(v => v.id === visitaId);
                if (visitaDetalle) visitaDetalle.estado = estadoValido;
            }

            const mensajeEstado = estadoValido === 'pendiente' ? 'pendiente' :
                estadoValido === 'completada' ? 'completada' : 'cancelada';
            this.mostrarToast(`Visita marcada como ${mensajeEstado}`, 'success');
        }
    }

    getPrioridadColor(prioridad: string): string {
        switch (prioridad) {
            case 'alta': return '#dc3545';
            case 'media': return '#ffc107';
            case 'baja': return '#28a745';
            default: return '#6c757d';
        }
    }

    getEstadoClass(estado: string): string {
        switch (estado) {
            case 'pendiente': return 'estado-pendiente';
            case 'completada': return 'estado-completada';
            case 'cancelada': return 'estado-cancelada';
            default: return '';
        }
    }

    mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'info' = 'info') {
        this.mensajeToast = mensaje;
        this.tipoToast = tipo;
        this.mostrarToastFlag = true;
    }

    cerrarToast() {
        this.mostrarToastFlag = false;
    }

    mostrarConfirmacion(
        titulo: string,
        mensaje: string,
        detalle: string,
        onConfirm: () => void,
        onCancel?: () => void
    ) {
        this.confirmacionTitulo = titulo;
        this.confirmacionMensaje = mensaje;
        this.confirmacionDetalle = detalle;
        this.confirmacionOnConfirm = onConfirm;
        this.confirmacionOnCancel = onCancel || null;
        this.confirmacionVisible = true;
    }

    confirmarAction() {
        if (this.confirmacionOnConfirm) {
            this.confirmacionOnConfirm();
        }
        this.confirmacionVisible = false;
    }

    cancelarAction() {
        if (this.confirmacionOnCancel) {
            this.confirmacionOnCancel();
        }
        this.confirmacionVisible = false;
    }
}