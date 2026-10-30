// src/app/pages/incidencias/incidencias.component.ts

import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';

interface Incidencia {
    id?: number;
    tipo: string;
    otroTexto?: string;
    descripcion: string;
    direccion: string;
    fecha: Date;
    fotos: string[];
    resuelta: boolean;
    estado?: string;
    pacienteId?: number;
    datosPaciente?: {
        id: number;
        nombre: string;
        direccion: string;
        telefono: string;
        colonia: string;
        seccion: string;
        lat?: number;
        lng?: number;
    };
    metadatosEvidencia?: {
        diaSemana: string;
        fechaFormateada: string;
        hora: string;
        lat: number;
        lng: number;
        coordenadas: string;
        direccion: string;
        fuenteGPS: string;
        precision?: string;
        timestamp?: string;
    };
}

import { PageHeaderNavComponent } from '../../components/page-header-nav/page-header-nav';
import { PacientesMapService } from '../../services/pacientes-map.service';

@Component({
    selector: 'app-incidencias',
    standalone: true,
    imports: [CommonModule, FormsModule, PageHeaderNavComponent],
    templateUrl: './incidencias.component.html',
    styleUrls: ['./incidencias.component.scss']
})
export class IncidenciasComponent implements OnInit, AfterViewInit, OnDestroy {

    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

    incidencias: Incidencia[] = [];
    incidenciasFiltradas: Incidencia[] = [];
    filtroActual: string = 'todas';

    nuevaIncidencia: Incidencia = {
        tipo: 'no_localizado',
        descripcion: '',
        direccion: '',
        fecha: new Date(),
        fotos: [],
        resuelta: false,
        otroTexto: ''
    };

    fotosPreview: string[] = [];
    mostrarFormulario: boolean = false;
    fotoModal: string | null = null;
    procesando: boolean = false;
    datosPaciente: any = null;
    loading: boolean = false;
    usandoLocalStorage: boolean = false;
    metadatosEvidencia: any = null;
    vinoDelMapa: boolean = false;

    tiposIncidencias = [
        { valor: 'no_localizado', label: 'No se localizó al usuario', icono: 'fas fa-user-xmark', color: '#f59e0b', desc: 'No se encontró a nadie en el domicilio' },
        { valor: 'casa_cerrada', label: 'Casa cerrada / Sin acceso', icono: 'fas fa-door-closed', color: '#6366f1', desc: 'Vivienda cerrada con portón o candado' },
        { valor: 'usuario_rechazo', label: 'Usuario rechazó la visita', icono: 'fas fa-user-slash', color: '#ef4444', desc: 'El usuario o familiar no aceptó la atención' },
        { valor: 'direccion_incorrecta', label: 'Dirección incorrecta', icono: 'fas fa-location-crosshairs', color: '#8b5cf6', desc: 'La dirección no existe o no corresponde' },
        { valor: 'emergencia_medica', label: 'Emergencia médica', icono: 'fas fa-truck-medical', color: '#dc2626', desc: 'Situación crítica de salud urgente' },
        { valor: 'otro', label: 'Otro motivo / Observación', icono: 'fas fa-ellipsis', color: '#0ea5e9', desc: 'Cualquier otra circunstancia en campo' }
    ];

    esColoniaValida(colonia?: string | null): boolean {
        if (!colonia) return false;
        const c = colonia.trim().toLowerCase();
        return c !== '' && c !== 'sin colonia' && c !== 'n/a' && c !== 'null' && c !== 'undefined';
    }

    get direccionCompleta(): string {
        if (!this.datosPaciente) return '';
        let dir = (this.datosPaciente.direccion || '').trim();
        // Limpiar "Sin colonia" si viene al final de la dirección
        dir = dir.replace(/,?\s*sin colonia\s*$/i, '').trim();

        const col = (this.datosPaciente.colonia || '').trim();
        if (!this.esColoniaValida(col)) {
            return dir || 'Dirección no asignada';
        }
        if (dir.toLowerCase().includes(col.toLowerCase())) {
            return dir;
        }
        return dir ? `${dir}, ${col}` : col;
    }

    obtenerTipoSeleccionado(): any {
        return this.tiposIncidencias.find(t => t.valor === this.nuevaIncidencia.tipo) || this.tiposIncidencias[0];
    }

    private apiUrl = environment.apiUrl;

    constructor(
        private cdr: ChangeDetectorRef,
        private router: Router,
        private http: HttpClient,
        private ngZone: NgZone,
        private pacientesMapService: PacientesMapService
    ) {
        console.log('🔍 [Incidencias] API URL:', this.apiUrl);
    }

    // ⭐ ============================================
    // ⭐ ngOnInit - COMPLETO CORREGIDO
    // ⭐ ============================================

    ngOnInit() {
        console.log('🔄 [Incidencias] ngOnInit ejecutado');

        this.limpiarFormulario();
        this.mostrarFormulario = false;
        this.cargarIncidencias();

        // ⭐ VERIFICAR SI VIENE DEL MAPA
        this.vinoDelMapa = sessionStorage.getItem('fromMap') === 'true';

        // ⭐ VERIFICAR LOCAL STORAGE
        const pacienteLocal = localStorage.getItem('incidenciaPaciente');
        if (pacienteLocal) {
            this.vinoDelMapa = true;
        }
        console.log('🔍 [Incidencias] Verificando localStorage en ngOnInit:', pacienteLocal);

        if (pacienteLocal) {
            try {
                const paciente = JSON.parse(pacienteLocal);
                console.log('📝 [Incidencias] Paciente encontrado en localStorage:', paciente);

                this.datosPaciente = {
                    id: paciente.id,
                    nombre: paciente.nombre || '',
                    direccion: paciente.direccion || '',
                    telefono: paciente.telefono || '',
                    colonia: paciente.colonia || '',
                    seccion: paciente.seccion || '',
                    lat: Number(paciente.lat) || 0,
                    lng: Number(paciente.lng) || 0
                };

                this.nuevaIncidencia.pacienteId = this.datosPaciente.id;
                this.nuevaIncidencia.direccion = this.direccionCompleta;
                this.mostrarFormulario = true;

                // ⭐ RELLENAR DESCRIPCIÓN AUTOMÁTICAMENTE
                this.onTipoIncidenciaChange();

                localStorage.removeItem('incidenciaPaciente');
                sessionStorage.removeItem('pacienteParaIncidencia');
                sessionStorage.removeItem('fromMap');

                this.cdr.detectChanges();
                console.log('✅ Formulario abierto con datos del paciente:', this.datosPaciente.nombre);
            } catch (e) {
                console.error('Error al parsear paciente de localStorage:', e);
            }
        } else {
            // ⭐ VERIFICAR SESSION STORAGE (FALLBACK)
            const pacienteSession = sessionStorage.getItem('pacienteParaIncidencia');
            console.log('🔍 [Incidencias] Verificando sessionStorage en ngOnInit:', pacienteSession);

            if (pacienteSession) {
                try {
                    const paciente = JSON.parse(pacienteSession);
                    console.log('📝 [Incidencias] Paciente encontrado en sessionStorage:', paciente);

                    this.datosPaciente = {
                        id: paciente.id,
                        nombre: paciente.nombre || '',
                        direccion: paciente.direccion || '',
                        telefono: paciente.telefono || '',
                        colonia: paciente.colonia || '',
                        seccion: paciente.seccion || '',
                        lat: Number(paciente.lat) || 0,
                        lng: Number(paciente.lng) || 0
                    };

                    this.nuevaIncidencia.pacienteId = this.datosPaciente.id;
                    this.nuevaIncidencia.direccion = this.direccionCompleta;
                    this.mostrarFormulario = true;

                    // ⭐ RELLENAR DESCRIPCIÓN AUTOMÁTICAMENTE
                    this.onTipoIncidenciaChange();

                    sessionStorage.removeItem('pacienteParaIncidencia');
                    sessionStorage.removeItem('fromMap');

                    this.cdr.detectChanges();
                    console.log('✅ Formulario abierto con datos del paciente (sessionStorage):', this.datosPaciente.nombre);
                } catch (e) {
                    console.error('Error al parsear paciente de sessionStorage:', e);
                }
            } else {
                this.limpiarDatosPaciente();
                console.log('❌ No se encontraron datos de paciente en ningún storage');
            }
        }

        // ⭐ ESCUCHAR EVENTO DE PACIENTE SELECCIONADO
        window.addEventListener('pacienteSeleccionadoParaIncidencia', this.handlePacienteSeleccionado.bind(this));
    }

    // ⭐ ============================================
    // ⭐ HANDLE PACIENTE SELECCIONADO
    // ⭐ ============================================

    handlePacienteSeleccionado(event: any) {
        const paciente = event.detail;
        console.log('📝 [Incidencias] Paciente recibido para incidencia:', paciente);

        if (paciente) {
            this.datosPaciente = {
                id: paciente.id || paciente.pacienteId,
                nombre: paciente.nombre || '',
                direccion: paciente.direccion || '',
                telefono: paciente.telefono || '',
                colonia: paciente.colonia || '',
                seccion: paciente.seccion || '',
                lat: Number(paciente.lat) || 0,
                lng: Number(paciente.lng) || 0
            };

            this.nuevaIncidencia.pacienteId = this.datosPaciente.id;
            this.nuevaIncidencia.direccion = this.direccionCompleta;

            this.mostrarFormulario = true;

            // ⭐ RELLENAR DESCRIPCIÓN AUTOMÁTICAMENTE
            this.onTipoIncidenciaChange();

            localStorage.removeItem('incidenciaPaciente');
            sessionStorage.removeItem('pacienteParaIncidencia');
            sessionStorage.removeItem('fromMap');

            this.cdr.detectChanges();
            console.log('✅ Formulario abierto con datos del paciente (evento):', this.datosPaciente.nombre);
        }
    }

    // ⭐ ============================================
    // ⭐ LIMPIAR DATOS DEL PACIENTE
    // ⭐ ============================================

    limpiarDatosPaciente() {
        localStorage.removeItem('incidenciaPaciente');
        sessionStorage.removeItem('fromMap');
        sessionStorage.removeItem('pacienteParaIncidencia');
        this.datosPaciente = null;
    }

    // ⭐ ============================================
    // ⭐ LIMPIAR FORMULARIO
    // ⭐ ============================================

    private limpiarFormulario() {
        this.nuevaIncidencia = {
            tipo: 'no_localizado',
            descripcion: '',
            direccion: '',
            fecha: new Date(),
            fotos: [],
            resuelta: false,
            otroTexto: ''
        };
        this.fotosPreview = [];
        this.procesando = false;
        this.metadatosEvidencia = null;
    }

    // ⭐ ============================================
    // ⭐ RESET FORMULARIO COMPLETO
    // ⭐ ============================================

    resetearFormulario() {
        this.limpiarFormulario();
        if (this.datosPaciente) {
            this.nuevaIncidencia.direccion = this.direccionCompleta;
            this.nuevaIncidencia.pacienteId = this.datosPaciente.id;
            // ⭐ RELLENAR DESCRIPCIÓN AUTOMÁTICAMENTE AL RESETEAR
            this.onTipoIncidenciaChange();
        }
        this.cdr.detectChanges();
    }

    seleccionarTipoIncidencia(valor: string) {
        this.nuevaIncidencia.tipo = valor;
        this.onTipoIncidenciaChange();
    }

    agregarNotaRapida(texto: string) {
        if (!this.nuevaIncidencia.descripcion || this.nuevaIncidencia.descripcion.trim() === '') {
            this.nuevaIncidencia.descripcion = texto;
        } else if (!this.nuevaIncidencia.descripcion.includes(texto)) {
            this.nuevaIncidencia.descripcion = `${this.nuevaIncidencia.descripcion.trim()} ${texto}`;
        }
        this.cdr.detectChanges();
    }

    obtenerIniciales(nombre: string): string {
        if (!nombre) return 'P';
        const partes = nombre.trim().split(/\s+/);
        if (partes.length >= 2) {
            return (partes[0][0] + partes[1][0]).toUpperCase();
        }
        return partes[0].substring(0, 2).toUpperCase();
    }

    ngAfterViewInit() {
        console.log('👀 [Incidencias] ngAfterViewInit ejecutado');
        this.cdr.detectChanges();
    }

    // ⭐ ============================================
    // ⭐ ngOnDestroy - COMPLETO
    // ⭐ ============================================

    ngOnDestroy() {
        window.removeEventListener('pacienteSeleccionadoParaIncidencia', this.handlePacienteSeleccionado.bind(this));
        sessionStorage.removeItem('pacienteParaIncidencia');
        sessionStorage.removeItem('fromMap');
    }

    // ⭐ ============================================
    // ⭐ CARGAR INCIDENCIAS
    // ⭐ ============================================

    cargarIncidencias() {
        this.loading = true;
        this.usandoLocalStorage = false;

        this.http.get<any[]>(`${this.apiUrl}/incidencias`)
            .subscribe({
                next: (data) => {
                    console.log('✅ Incidencias cargadas desde BD:', data);
                    if (Array.isArray(data)) {
                        this.incidencias = data.map(inc => ({
                            id: inc.id,
                            tipo: inc.tipo,
                            descripcion: inc.descripcion,
                            direccion: inc.direccion,
                            fecha: new Date(inc.fecha),
                            fotos: inc.fotos || [],
                            resuelta: inc.resuelta || inc.estado === 'resuelta' || inc.estado === 'resuelto' || false,
                            estado: inc.estado || (inc.resuelta ? 'resuelta' : 'recibida'),
                            pacienteId: inc.pacienteId,
                            datosPaciente: inc.datosPaciente,
                            otroTexto: inc.otroTexto || ''
                        }));
                    } else {
                        this.incidencias = [];
                    }
                    this.aplicarFiltro();
                    this.loading = false;
                    this.guardarIncidencias();
                    this.cdr.detectChanges();
                },
                error: (error) => {
                    console.error('❌ Error al cargar incidencias desde BD:', error);
                    this.usandoLocalStorage = true;
                    this.cargarIncidenciasLocal();
                    this.loading = false;
                    this.mostrarToast('⚠️ Usando almacenamiento local (sin conexión a BD)', 'warning');
                    this.cdr.detectChanges();
                }
            });
    }

    cargarIncidenciasLocal() {
        const guardadas = localStorage.getItem('incidencias');
        if (guardadas) {
            try {
                const data = JSON.parse(guardadas);
                if (Array.isArray(data)) {
                    this.incidencias = data.map((inc: any) => ({
                        ...inc,
                        fecha: new Date(inc.fecha),
                        resuelta: inc.resuelta || inc.estado === 'resuelta' || inc.estado === 'resuelto' || false,
                        estado: inc.estado || (inc.resuelta ? 'resuelta' : 'recibida')
                    }));
                    console.log(`📋 Cargadas ${this.incidencias.length} incidencias desde localStorage`);
                } else {
                    this.incidencias = [];
                }
            } catch (e) {
                console.error('Error al cargar incidencias desde localStorage:', e);
                this.incidencias = [];
            }
        } else {
            this.incidencias = [];
        }
        this.aplicarFiltro();
        this.cdr.detectChanges();
    }

    guardarIncidencias() {
        try {
            localStorage.setItem('incidencias', JSON.stringify(this.incidencias));
            console.log(`💾 Guardadas ${this.incidencias.length} incidencias en localStorage`);
        } catch (error) {
            console.error('Error al guardar en localStorage:', error);
        }
    }

    guardarIncidenciaEnBD(incidencia: Incidencia) {
        this.loading = true;

        const nuevoEstatus = (incidencia.tipo === 'usuario_rechazo' ? 'RECHAZO' : 'INCIDENCIA');

        const incidenciaData = {
            tipo: incidencia.tipo,
            descripcion: incidencia.descripcion,
            direccion: incidencia.direccion,
            fecha: incidencia.fecha.toISOString(),
            fotos: incidencia.fotos || [],
            resuelta: incidencia.resuelta,
            estado: 'recibida',
            pacienteId: incidencia.pacienteId,
            datosPaciente: incidencia.datosPaciente,
            otroTexto: incidencia.otroTexto || ''
        };

        console.log('📤 Guardando incidencia en BD con fotos:', {
            tipo: incidenciaData.tipo,
            pacienteId: incidenciaData.pacienteId,
            fotosCount: (incidenciaData.fotos || []).length
        });

        this.http.post(`${this.apiUrl}/incidencias`, incidenciaData)
            .subscribe({
                next: (response: any) => {
                    console.log('✅ Incidencia y fotos guardadas en BD:', response);
                    const nuevaIncidencia = { ...incidencia, id: response.id || Date.now(), estado: 'recibida' };
                    this.incidencias.unshift(nuevaIncidencia);
                    this.guardarIncidencias();
                    this.aplicarFiltro();
                    this.loading = false;
                    this.mostrarToast('✅ Incidencia y fotos guardadas en la Base de Datos', 'success');
                    this.cdr.detectChanges();

                    if (incidencia.pacienteId) {
                        this.actualizarEstadoPaciente(incidencia.pacienteId, nuevoEstatus);
                    }

                    // ⭐ Mostrar diálogo con aviso por WhatsApp y SMS para el paciente
                    this.mostrarDialogoNotificarPaciente(nuevaIncidencia);
                },
                error: (error) => {
                    console.error('❌ Error al guardar incidencia en BD:', error);
                    this.loading = false;
                    const nuevaIncidencia = { ...incidencia, id: Date.now(), estado: 'recibida' };
                    this.incidencias.unshift(nuevaIncidencia);
                    this.guardarIncidencias();
                    this.aplicarFiltro();
                    this.enviarNotificacionLocal(nuevaIncidencia);
                    this.mostrarToast('⚠️ Incidencia guardada localmente (sin conexión a BD)', 'warning');
                    this.usandoLocalStorage = true;
                    this.cdr.detectChanges();

                    if (incidencia.pacienteId) {
                        this.actualizarEstadoPaciente(incidencia.pacienteId, nuevoEstatus);
                    }

                    // ⭐ Mostrar diálogo con aviso por WhatsApp y SMS para el paciente
                    this.mostrarDialogoNotificarPaciente(nuevaIncidencia);
                }
            });
    }

    private enviarNotificacionLocal(incidencia: Incidencia) {
        const nombrePaciente = incidencia.datosPaciente?.nombre || 'Paciente';

        const notificacion = {
            titulo: `⚠️ Nueva Incidencia - ${nombrePaciente}`,
            mensaje: `Se registró una incidencia para ${nombrePaciente}: ${incidencia.descripcion}`,
            tipo: 'incidencia',
            prioridad: 'alta',
            usuarioId: 1,
            metadata: {
                incidenciaId: incidencia.id,
                pacienteId: incidencia.pacienteId,
                tipo: incidencia.tipo
            },
            url: `/incidencias/${incidencia.id}`
        };

        try {
            const notificaciones = JSON.parse(localStorage.getItem('notificacionesCache') || '[]');
            const existe = notificaciones.some((n: any) =>
                n.metadata?.incidenciaId === incidencia.id
            );
            if (!existe) {
                notificaciones.unshift({
                    ...notificacion,
                    id: Date.now(),
                    leida: false,
                    createdAt: new Date().toISOString()
                });
                localStorage.setItem('notificacionesCache', JSON.stringify(notificaciones));
                console.log('📨 Notificación guardada localmente');
            }
        } catch (error) {
            console.error('Error guardando notificación local:', error);
        }
    }

    actualizarEstadoPaciente(pacienteId: number, estado: string) {
        const estatusFinal = (estado || 'INCIDENCIA').toUpperCase();

        // 1. Persistir estatus en la Base de Datos
        this.http.patch(`${this.apiUrl}/pacientes/${pacienteId}/estatus`, { estatus: estatusFinal })
            .subscribe({
                next: () => console.log('✅ [Incidencias] Estado del paciente actualizado en BD a:', estatusFinal),
                error: (err) => console.warn('⚠️ [Incidencias] Aviso PATCH estatus:', err)
            });

        // 2. Actualizar inmediatamente cachés locales de pacientes (para reflejo inmediato en el mapa)
        try {
            const enfermeraId = this.pacientesMapService ? this.pacientesMapService.obtenerIdEnfermeraActual() : 1;
            const keys = [
                'cuidalia_map_pacientes_' + enfermeraId,
                'cuidalia_pacientes_raw_' + enfermeraId,
                'pacientes_cache_' + enfermeraId,
                'cuidalia_map_pacientes_1',
                'cuidalia_pacientes_raw_1'
            ];

            keys.forEach(k => {
                const raw = localStorage.getItem(k);
                if (raw) {
                    try {
                        const list = JSON.parse(raw);
                        if (Array.isArray(list)) {
                            let modificado = false;
                            list.forEach((p: any) => {
                                if (Number(p.id) === Number(pacienteId)) {
                                    p.estatus = estatusFinal;
                                    modificado = true;
                                }
                            });
                            if (modificado) {
                                localStorage.setItem(k, JSON.stringify(list));
                                console.log(`💾 [Incidencias] Paciente ${pacienteId} actualizado a ${estatusFinal} en caché local ${k}`);
                            }
                        }
                    } catch (e) { }
                }
            });
        } catch (e) {
            console.warn('Error al actualizar almacenamiento local de paciente:', e);
        }

        // 3. Forzar invalidación de caché en el servicio
        if (this.pacientesMapService) {
            this.pacientesMapService.refreshPacientes();
        }

        // 4. Emitir eventos globales para que el mapa actualice marcador y pop al instante
        window.dispatchEvent(new CustomEvent('recargarMapa'));
        window.dispatchEvent(new CustomEvent('pacienteActualizado', {
            detail: {
                id: pacienteId,
                estatus: estatusFinal
            }
        }));
    }

    // ⭐ ============================================
    // ⭐ ON TIPO INCIDENCIA CHANGE - RELLENA DESCRIPCIÓN
    // ⭐ ============================================

    onTipoIncidenciaChange() {
        if (this.nuevaIncidencia.tipo === 'otro') {
            this.nuevaIncidencia.descripcion = '';
        } else {
            this.nuevaIncidencia.descripcion = this.getDescripcionPorDefecto();
        }
    }

    getDescripcionPorDefecto(): string {
        switch (this.nuevaIncidencia.tipo) {
            case 'no_localizado':
                return 'No se encontró al usuario en el domicilio indicado.';
            case 'direccion_incorrecta':
                return 'La dirección registrada no coincide con la ubicación real.';
            case 'casa_cerrada':
                return 'La vivienda se encontraba cerrada, no se pudo realizar la visita.';
            case 'usuario_rechazo':
                return 'El usuario rechazó recibir la visita domiciliaria.';
            case 'emergencia_medica':
                return 'Se detectó una situación de emergencia médica.';
            default:
                return '';
        }
    }

    obtenerEstadoNormalizado(inc: Incidencia): 'recibida' | 'en proceso' | 'resuelta' {
        if (inc.resuelta || (inc.estado && (inc.estado === 'resuelta' || inc.estado === 'resuelto'))) {
            return 'resuelta';
        }
        if (inc.estado === 'en proceso' || inc.estado === 'en_proceso') {
            return 'en proceso';
        }
        return 'recibida';
    }

    obtenerEtiquetaEstado(inc: Incidencia): string {
        const est = this.obtenerEstadoNormalizado(inc);
        if (est === 'resuelta') return 'Resuelta por Enlace';
        if (est === 'en proceso') return 'En proceso de solución';
        return 'Recibida por Enlace';
    }

    obtenerClaseEstado(inc: Incidencia): string {
        const est = this.obtenerEstadoNormalizado(inc);
        if (est === 'resuelta') return 'resolved resuelta';
        if (est === 'en proceso') return 'en-proceso';
        return 'recibida';
    }

    obtenerIconoEstado(inc: Incidencia): string {
        const est = this.obtenerEstadoNormalizado(inc);
        if (est === 'resuelta') return 'fa-circle-check';
        if (est === 'en proceso') return 'fa-arrows-rotate';
        return 'fa-inbox';
    }

    get incidenciasRecibidas(): number {
        return this.incidencias.filter(i => this.obtenerEstadoNormalizado(i) === 'recibida').length;
    }

    get incidenciasEnProceso(): number {
        return this.incidencias.filter(i => this.obtenerEstadoNormalizado(i) === 'en proceso').length;
    }

    get incidenciasResueltas(): number {
        return this.incidencias.filter(i => this.obtenerEstadoNormalizado(i) === 'resuelta').length;
    }

    get incidenciasPendientes(): number {
        return this.incidencias.filter(i => this.obtenerEstadoNormalizado(i) !== 'resuelta').length;
    }

    aplicarFiltro() {
        if (this.filtroActual === 'recibidas') {
            this.incidenciasFiltradas = this.incidencias.filter(i => this.obtenerEstadoNormalizado(i) === 'recibida');
        } else if (this.filtroActual === 'en_proceso') {
            this.incidenciasFiltradas = this.incidencias.filter(i => this.obtenerEstadoNormalizado(i) === 'en proceso');
        } else if (this.filtroActual === 'resueltas') {
            this.incidenciasFiltradas = this.incidencias.filter(i => this.obtenerEstadoNormalizado(i) === 'resuelta');
        } else if (this.filtroActual === 'pendientes') {
            this.incidenciasFiltradas = this.incidencias.filter(i => this.obtenerEstadoNormalizado(i) !== 'resuelta');
        } else {
            this.incidenciasFiltradas = [...this.incidencias];
        }
    }

    // ⭐ ============================================
    // ⭐ TOGGLE FORMULARIO
    // ⭐ ============================================

    toggleFormulario() {
        // ⭐ VERIFICAR SI HAY PACIENTE SELECCIONADO
        if (!this.datosPaciente) {
            Swal.fire({
                icon: 'warning',
                title: 'Paciente no seleccionado',
                html: `
                    <div style="text-align: left; padding: 10px 0;">
                        <div style="background: #fff3e0; padding: 16px; border-radius: 10px; border-left: 4px solid #e67e22; margin-bottom: 12px;">
                            <p style="margin: 0; color: #e67e22; font-weight: 600;">
                                <i class="fas fa-exclamation-triangle" style="margin-right: 8px;"></i>
                                No se ha seleccionado un paciente.
                            </p>
                        </div>
                        <div style="color: #666; font-size: 14px;">
                            Las incidencias deben estar asociadas a un paciente.
                            <br><br>
                            <strong>¿Cómo seleccionar un paciente?</strong>
                            <br>
                            1. Ve al mapa y selecciona un paciente
                            <br>
                            2. Haz clic en el botón "Reportar Incidencia" en el popup
                        </div>
                    </div>
                `,
                confirmButtonColor: '#701f2f',
                confirmButtonText: 'Entendido'
            });
            return;
        }

        this.mostrarFormulario = !this.mostrarFormulario;
        if (!this.mostrarFormulario) {
            this.limpiarDatosPaciente();
            this.resetearFormulario();
        } else {
            // ⭐ RELLENAR DESCRIPCIÓN CUANDO SE ABRE MANUALMENTE
            this.onTipoIncidenciaChange();
        }
        this.cdr.detectChanges();
    }

    cambiarFiltro(filtro: string) {
        this.filtroActual = filtro;
        this.aplicarFiltro();
        this.cdr.detectChanges();
    }

    abrirSelector(event: Event) {
        if (this.procesando) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }

        if (this.fileInput && this.fileInput.nativeElement) {
            this.fileInput.nativeElement.value = '';
            setTimeout(() => {
                if (this.fileInput && this.fileInput.nativeElement && !this.procesando) {
                    this.fileInput.nativeElement.click();
                }
            }, 50);
        }
    }

    async obtenerGeolocalizacionActual(): Promise<{ lat: number; lng: number; fuente: string; precision?: string }> {
        const fallbackLat = Number(this.datosPaciente?.lat) || 0;
        const fallbackLng = Number(this.datosPaciente?.lng) || 0;

        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            try {
                const pos: GeolocationPosition = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 10000
                    });
                });
                return {
                    lat: Number(pos.coords.latitude.toFixed(6)),
                    lng: Number(pos.coords.longitude.toFixed(6)),
                    fuente: 'GPS en Vivo',
                    precision: pos.coords.accuracy ? `±${Math.round(pos.coords.accuracy)}m` : 'Alta'
                };
            } catch (err) {
                console.warn('⚠️ No se pudo obtener GPS en vivo, usando coordenadas registradas:', err);
            }
        }

        if (fallbackLat !== 0 && fallbackLng !== 0) {
            return {
                lat: fallbackLat,
                lng: fallbackLng,
                fuente: 'Georreferencia Domiciliaria',
                precision: 'Padrón Georreferenciado'
            };
        }

        return {
            lat: 21.1236,
            lng: -101.68,
            fuente: 'Zona Operativa León, Gto.',
            precision: 'Aproximada'
        };
    }

    calcularMetadatosEvidencia(coords: { lat: number; lng: number; fuente: string; precision?: string }) {
        const ahora = new Date();
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const diaSemana = diasSemana[ahora.getDay()];

        const pad = (n: number) => n.toString().padStart(2, '0');
        const fechaFormateada = `${pad(ahora.getDate())}/${pad(ahora.getMonth() + 1)}/${ahora.getFullYear()}`;
        const horaFormateada = `${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())} hrs`;

        this.metadatosEvidencia = {
            diaSemana: diaSemana,
            fechaFormateada: fechaFormateada,
            hora: horaFormateada,
            lat: coords.lat,
            lng: coords.lng,
            coordenadas: `${coords.lat}, ${coords.lng}`,
            direccion: this.direccionCompleta,
            fuenteGPS: coords.fuente,
            precision: coords.precision || 'Normal',
            timestamp: ahora.toISOString()
        };

        this.nuevaIncidencia.metadatosEvidencia = { ...this.metadatosEvidencia };
    }

    async procesarFotos(event: any) {
        if (this.procesando) {
            return;
        }

        const files = event.target.files;
        if (!files || files.length === 0) {
            return;
        }

        this.procesando = true;

        // ⭐ 1. CALCULAR AUTOMÁTICAMENTE DÍA, FECHA, HORA, LUGAR Y COORDENADAS GPS
        const coords = await this.obtenerGeolocalizacionActual();
        this.calcularMetadatosEvidencia(coords);

        let procesadas = 0;
        const total = files.length;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();

                reader.onload = async (e: any) => {
                    try {
                        const imagenComprimida = await this.comprimirYEstamparImagen(
                            e.target.result,
                            1000,
                            this.metadatosEvidencia
                        );
                        this.fotosPreview.push(imagenComprimida);
                        this.nuevaIncidencia.fotos.push(imagenComprimida);
                    } catch (error) {
                        console.error('Error al procesar y sellar imagen:', error);
                        this.fotosPreview.push(e.target.result);
                        this.nuevaIncidencia.fotos.push(e.target.result);
                    }

                    procesadas++;
                    this.cdr.detectChanges();

                    if (procesadas === total) {
                        setTimeout(() => {
                            if (this.fileInput && this.fileInput.nativeElement) {
                                this.fileInput.nativeElement.value = '';
                            }
                            this.procesando = false;
                            this.cdr.detectChanges();
                            this.mostrarToast(`📸 Foto(s) anexada(s) con coordenadas y fecha/hora calculados`, 'success');
                        }, 250);
                    }
                };

                reader.onerror = () => {
                    procesadas++;
                    if (procesadas === total) {
                        this.procesando = false;
                        this.cdr.detectChanges();
                        this.mostrarToast(`❌ Error al cargar algunas fotos`, 'error');
                    }
                };

                reader.readAsDataURL(file);
            } else {
                procesadas++;
                if (procesadas === total) {
                    this.procesando = false;
                    this.cdr.detectChanges();
                }
            }
        }
    }

    comprimirYEstamparImagen(base64: string, maxWidth: number = 1000, metadatos?: any): Promise<string> {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(base64);
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                // ⭐ SELLAR CON MARCA DE AGUA PROFESIONAL DE CAMPO
                if (metadatos) {
                    const barHeight = Math.max(52, Math.round(height * 0.12));
                    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
                    ctx.fillRect(0, height - barHeight, width, barHeight);

                    // Línea dorada superior
                    ctx.fillStyle = '#D4AF37';
                    ctx.fillRect(0, height - barHeight, width, 3);

                    const fontSizeMain = Math.max(11, Math.round(barHeight * 0.28));
                    const fontSizeSub = Math.max(9, Math.round(barHeight * 0.22));

                    ctx.font = `bold ${fontSizeMain}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    ctx.fillStyle = '#ffffff';
                    ctx.textBaseline = 'top';

                    const paddingX = Math.round(width * 0.03);
                    const line1Y = height - barHeight + 8;
                    const line2Y = line1Y + fontSizeMain + 5;

                    const line1 = `📅 ${metadatos.diaSemana}, ${metadatos.fechaFormateada} - ${metadatos.hora} | 📍 GPS: ${metadatos.coordenadas}`;
                    ctx.fillText(line1, paddingX, line1Y);

                    ctx.font = `500 ${fontSizeSub}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
                    ctx.fillStyle = '#cbd5e1';
                    const line2 = `🏠 ${metadatos.direccion || 'Ubicación en territorio'} | 🛡️ CUIDALIA`;
                    ctx.fillText(line2, paddingX, line2Y);
                }

                const compressed = canvas.toDataURL('image/jpeg', 0.72);
                resolve(compressed);
            };
            img.src = base64;
        });
    }

    eliminarFoto(index: number) {
        this.fotosPreview.splice(index, 1);
        this.nuevaIncidencia.fotos.splice(index, 1);
        if (this.fotosPreview.length === 0) {
            this.metadatosEvidencia = null;
            if (this.nuevaIncidencia.metadatosEvidencia) {
                delete this.nuevaIncidencia.metadatosEvidencia;
            }
        }
        this.cdr.detectChanges();
        this.mostrarToast('🗑️ Foto eliminada', 'info');
    }

    // ⭐ ============================================
    // ⭐ REGISTRAR INCIDENCIA
    // ⭐ ============================================

    registrarIncidencia() {
        if (!this.datosPaciente) {
            this.mostrarToast(' No hay un paciente seleccionado', 'warning');
            return;
        }

        if (!this.nuevaIncidencia.descripcion || this.nuevaIncidencia.descripcion.trim() === '') {
            this.mostrarToast(' Complete la descripción de la incidencia', 'error');
            return;
        }

        Swal.fire({
            title: 'Confirmar incidencia',
            html: `
                <div style="text-align: left; padding: 10px 0;">
                    <div style="background: #f8f4f0; padding: 14px; border-radius: 10px; margin-bottom: 12px; border: 1px solid #e9e0d6;">
                        <div style="display: grid; grid-template-columns: 100px 1fr; gap: 4px 8px; font-size: 13px;">
                            <span style="font-weight: 600; color: #7B1D2E;">Paciente:</span>
                            <span style="font-weight: 700; color: #1a1a1a;">${this.datosPaciente.nombre}</span>
                            <span style="font-weight: 600; color: #7B1D2E;">Dirección:</span>
                            <span style="font-weight: 700; color: #1a1a1a;">${this.direccionCompleta}</span>
                            <span style="font-weight: 600; color: #7B1D2E;">Tipo:</span>
                            <span style="font-weight: 700; color: #1a1a1a;">${this.getTipoLabel(this.nuevaIncidencia.tipo)}</span>
                        </div>
                    </div>
                    <div style="background: #fff3e0; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #e67e22;">
                        <div style="font-size: 13px; color: #666;">
                            <i class="fas fa-info-circle" style="color: #e67e22; margin-right: 8px;"></i>
                            Se registrará la incidencia con sello de georreferencia y se actualizará el estado del paciente.
                        </div>
                    </div>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#701f2f',
            cancelButtonColor: '#999999',
            confirmButtonText: '✅ Guardar incidencia',
            cancelButtonText: '❌ Cancelar',
            reverseButtons: true
        }).then((result: any) => {
            if (result.isConfirmed) {
                const nuevaIncidencia: Incidencia = {
                    ...this.nuevaIncidencia,
                    fecha: new Date(),
                    fotos: [...this.nuevaIncidencia.fotos],
                    resuelta: false,
                    datosPaciente: { ...this.datosPaciente },
                    pacienteId: this.datosPaciente?.id,
                    metadatosEvidencia: this.metadatosEvidencia ? { ...this.metadatosEvidencia } : null
                };

                this.guardarIncidenciaEnBD(nuevaIncidencia);
                this.resetearFormulario();
                this.mostrarFormulario = false;
                this.cdr.detectChanges();
            }
        });
    }

    marcarResuelta(id: number) {
        const inc = this.incidencias.find(i => i.id === id);
        if (inc) {
            inc.resuelta = true;

            this.http.patch(`${this.apiUrl}/incidencias/${id}`, { resuelta: true })
                .subscribe({
                    next: () => {
                        console.log('✅ Incidencia marcada como resuelta en BD');
                        this.guardarIncidencias();
                        this.aplicarFiltro();
                        this.mostrarToast('✅ Incidencia marcada como resuelta', 'success');
                        this.cdr.detectChanges();

                        if (inc.pacienteId) {
                            this.actualizarEstadoPaciente(inc.pacienteId, 'completada');
                        }
                    },
                    error: (err) => {
                        console.error('❌ Error al marcar como resuelta:', err);
                        this.guardarIncidencias();
                        this.aplicarFiltro();
                        this.mostrarToast('⚠️ Marcada localmente (sin conexión a BD)', 'warning');
                        this.cdr.detectChanges();
                    }
                });
        }
    }

    getTipoLabel(tipo: string): string {
        const found = this.tiposIncidencias.find(t => t.valor === tipo);
        return found ? found.label : tipo;
    }

    getTipoIcono(tipo: string): string {
        const found = this.tiposIncidencias.find(t => t.valor === tipo);
        return found ? found.icono : 'fas fa-question-circle';
    }

    openModal(foto: string) {
        this.fotoModal = foto;
    }

    closeModal() {
        this.fotoModal = null;
    }

    // ⭐ ============================================
    // ⭐ NOTIFICACIÓN DE INCIDENCIA AL PACIENTE (WHATSAPP / SMS)
    // ⭐ ============================================

    construirMensajeIncidencia(incidencia: Incidencia): string {
        const datosP = (incidencia.datosPaciente as any) || (this.datosPaciente as any) || {};
        const nombrePaciente = datosP.nombre || 'Paciente';
        const tipoLabel = this.getTipoLabel(incidencia.tipo);
        const detalle = (incidencia.descripcion || '').trim();

        const nombreEnfermera = 'Enfermera Ana Guerrero';
        const telefonoEnfermera = '4777092580';

        let motivoTexto = tipoLabel;
        if (detalle && detalle.toLowerCase() !== tipoLabel.toLowerCase()) {
            const detalleLimpio = detalle.length > 120 ? detalle.substring(0, 117) + '...' : detalle;
            motivoTexto += `: "${detalleLimpio}"`;
        }

        return `Estimado(a) ${nombrePaciente}, le informamos que el personal del programa Salud Casa por Casa acudió a su domicilio y se registró la siguiente eventualidad: ${motivoTexto}. Por favor comuníquese con su ${nombreEnfermera} al teléfono ${telefonoEnfermera} para reagendar una nueva cita de visita médica. Favor de estar al pendiente.`;
    }

    lanzarWhatsAppIncidencia(telefonoLimpio: string, mensaje: string) {
        let num = (telefonoLimpio || '').replace(/\D/g, '');
        if (num.startsWith('52') && num.length === 12) {
            num = num.substring(2);
        }
        const texto = encodeURIComponent(mensaje);
        const url = `https://wa.me/52${num}?text=${texto}`;

        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        this.mostrarToast('Abriendo WhatsApp para notificar al paciente...', 'success');
    }

    lanzarSMSIncidencia(telefonoLimpio: string, mensaje: string) {
        let num = (telefonoLimpio || '').replace(/\D/g, '');
        if (num.startsWith('52') && num.length === 12) {
            num = num.substring(2);
        }
        const texto = encodeURIComponent(mensaje);
        const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
        const sep = isIOS ? '&' : '?';
        const url = `sms:+52${num}${sep}body=${texto}`;

        window.location.href = url;
        this.mostrarToast('Abriendo aplicación de mensajes SMS...', 'success');
    }

    notificarIncidenciaWhatsApp(incidencia: Incidencia) {
        const datosP = (incidencia.datosPaciente as any) || {};
        let tel = (datosP.telefono || '').replace(/\D/g, '');
        if (tel.startsWith('52') && tel.length === 12) tel = tel.substring(2);
        const msg = this.construirMensajeIncidencia(incidencia);

        if (!tel || tel.length < 10) {
            Swal.fire({
                title: 'Teléfono del Paciente',
                text: 'Ingresa el número celular a 10 dígitos para enviar WhatsApp:',
                input: 'tel',
                inputValue: tel,
                inputPlaceholder: 'Ej: 4771234567',
                showCancelButton: true,
                confirmButtonText: '<i class="fab fa-whatsapp"></i> Abrir WhatsApp',
                confirmButtonColor: '#25d366',
                cancelButtonText: 'Cancelar'
            }).then((res) => {
                if (res.isConfirmed && res.value) {
                    this.lanzarWhatsAppIncidencia(res.value, msg);
                }
            });
            return;
        }

        this.lanzarWhatsAppIncidencia(tel, msg);
    }

    notificarIncidenciaSMS(incidencia: Incidencia) {
        const datosP = (incidencia.datosPaciente as any) || {};
        let tel = (datosP.telefono || '').replace(/\D/g, '');
        if (tel.startsWith('52') && tel.length === 12) tel = tel.substring(2);
        const msg = this.construirMensajeIncidencia(incidencia);

        if (!tel || tel.length < 10) {
            Swal.fire({
                title: 'Teléfono del Paciente',
                text: 'Ingresa el número celular a 10 dígitos para enviar SMS:',
                input: 'tel',
                inputValue: tel,
                inputPlaceholder: 'Ej: 4771234567',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-comment-sms"></i> Abrir SMS',
                confirmButtonColor: '#3b82f6',
                cancelButtonText: 'Cancelar'
            }).then((res) => {
                if (res.isConfirmed && res.value) {
                    this.lanzarSMSIncidencia(res.value, msg);
                }
            });
            return;
        }

        this.lanzarSMSIncidencia(tel, msg);
    }

    mostrarDialogoNotificarPaciente(incidencia: Incidencia) {
        const datosP = (incidencia.datosPaciente as any) || (this.datosPaciente as any) || {};
        const nombrePaciente = datosP.nombre || 'Paciente';
        let telPaciente = (datosP.telefono || '').replace(/\D/g, '');
        if (telPaciente.startsWith('52') && telPaciente.length === 12) {
            telPaciente = telPaciente.substring(2);
        }

        const nombreEnfermera = 'Enfermera Ana Guerrero';
        const telefonoEnfermera = '4777092580';
        const textoMensaje = this.construirMensajeIncidencia(incidencia);

        Swal.fire({
            title: '¡Incidencia Registrada con Éxito!',
            html: `
                <div style="text-align: left; font-size: 13px; color: #1e293b; line-height: 1.5;">
                    <div style="background: #f0fdf4; border: 1.5px solid #86efac; padding: 12px 14px; border-radius: 10px; margin-bottom: 12px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <i class="fas fa-check-circle" style="color: #16a34a; font-size: 16px;"></i>
                            <strong style="color: #166534; font-size: 13.5px;">Incidencia guardada y georreferenciada</strong>
                        </div>
                        <div style="font-size: 12px; color: #15803d;">
                            Envía un aviso inmediato a <strong>${nombrePaciente}</strong> sobre el motivo de la incidencia para reagendar su cita.
                        </div>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="font-size: 11.5px; font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">
                            <i class="fas fa-phone"></i> Teléfono del Paciente (10 dígitos):
                        </label>
                        <input id="swal-tel-paciente" type="tel" value="${telPaciente}" placeholder="Ej: 4771234567"
                            style="width: 100%; box-sizing: border-box; padding: 8px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 600; color: #1e293b; outline: none;" />
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label style="font-size: 11.5px; font-weight: 700; color: #475569; display: block; margin-bottom: 4px;">
                            <i class="fas fa-comment-dots"></i> Mensaje de Notificación al Paciente:
                        </label>
                        <textarea id="swal-msg-paciente" rows="4"
                            style="width: 100%; box-sizing: border-box; padding: 9px 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 12px; line-height: 1.4; color: #334155; resize: vertical; outline: none; background: #f8fafc;">${textoMensaje}</textarea>
                    </div>

                    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 8px 12px; margin-bottom: 14px; font-size: 11.5px; color: #1e40af;">
                        <i class="fas fa-user-nurse"></i> Contacto para reagendar: <strong>${nombreEnfermera}</strong> (${telefonoEnfermera})
                    </div>

                    <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
                        <button type="button" id="btn-swal-wa"
                            style="flex: 1; min-width: 130px; background: linear-gradient(135deg, #25d366 0%, #16a34a 100%); color: #ffffff; border: none; padding: 10px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(37,211,102,0.3);">
                            <i class="fab fa-whatsapp" style="font-size: 15px;"></i> WhatsApp
                        </button>
                        <button type="button" id="btn-swal-sms"
                            style="flex: 1; min-width: 130px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; border: none; padding: 10px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 6px rgba(59,130,246,0.3);">
                            <i class="fas fa-comment-sms" style="font-size: 14px;"></i> Mensaje SMS
                        </button>
                        <button type="button" id="btn-swal-copiar"
                            style="background: #ffffff; color: #334155; border: 1.5px solid #cbd5e1; padding: 10px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                            <i class="fas fa-copy"></i> Copiar
                        </button>
                    </div>
                </div>
            `,
            showConfirmButton: true,
            confirmButtonText: 'Finalizar y volver a Pacientes',
            confirmButtonColor: '#701f2f',
            allowOutsideClick: false,
            didOpen: () => {
                const btnWa = document.getElementById('btn-swal-wa');
                const btnSms = document.getElementById('btn-swal-sms');
                const btnCopy = document.getElementById('btn-swal-copiar');
                const inputTel = document.getElementById('swal-tel-paciente') as HTMLInputElement;
                const areaMsg = document.getElementById('swal-msg-paciente') as HTMLTextAreaElement;

                if (btnWa) {
                    btnWa.onclick = () => {
                        const tel = (inputTel?.value || '').replace(/\D/g, '');
                        const msg = areaMsg?.value || textoMensaje;
                        if (!tel || tel.length < 10) {
                            this.mostrarToast('Ingresa un número celular a 10 dígitos', 'warning');
                            inputTel?.focus();
                            return;
                        }
                        this.lanzarWhatsAppIncidencia(tel, msg);
                    };
                }

                if (btnSms) {
                    btnSms.onclick = () => {
                        const tel = (inputTel?.value || '').replace(/\D/g, '');
                        const msg = areaMsg?.value || textoMensaje;
                        if (!tel || tel.length < 10) {
                            this.mostrarToast('Ingresa un número celular a 10 dígitos', 'warning');
                            inputTel?.focus();
                            return;
                        }
                        this.lanzarSMSIncidencia(tel, msg);
                    };
                }

                if (btnCopy) {
                    btnCopy.onclick = () => {
                        const msg = areaMsg?.value || textoMensaje;
                        navigator.clipboard.writeText(msg).then(() => {
                            this.mostrarToast('Mensaje copiado al portapapeles', 'info');
                        }).catch(() => {
                            this.mostrarToast('No se pudo copiar', 'error');
                        });
                    };
                }
            }
        }).then(() => {
            const redirectPath = this.vinoDelMapa ? '/map' : '/pacientes';
            this.limpiarDatosPaciente();
            this.datosPaciente = null;
            this.mostrarFormulario = false;
            this.router.navigate([redirectPath]);
        });
    }

    // ⭐ ============================================
    // ⭐ MOSTRAR TOAST
    // ⭐ ============================================

    mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'success') {
        const colores = {
            success: '#2e7d32',
            error: '#c62828',
            info: '#1976d2',
            warning: '#e67e22'
        };

        const iconos = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };

        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; background: white;
            border-radius: 16px; padding: 0; min-width: 320px;
            max-width: 450px; z-index: 1000000; 
            box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            border-left: 5px solid ${colores[tipo]};
            animation: slideInRight 0.3s ease-out;
            font-family: 'Segoe UI', sans-serif;
            overflow: hidden;
        `;
        toast.innerHTML = `
            <div style="display: flex; align-items: stretch; gap: 0;">
                <div style="background: ${colores[tipo]}10; padding: 18px 16px; display: flex; align-items: center; justify-content: center; min-width: 60px;">
                    <i class="fas ${iconos[tipo]}" style="font-size: 24px; color: ${colores[tipo]};"></i>
                </div>
                <div style="padding: 16px 20px 16px 16px; flex: 1; display: flex; align-items: center;">
                    <div style="font-weight: 600; font-size: 14px; color: #1a1a1a;">${mensaje}</div>
                </div>
                <button onclick="this.closest('div[style]').remove()" style="background: none; border: none; color: #bbb; cursor: pointer; padding: 8px 12px; font-size: 16px; transition: color 0.2s;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            if (toast && toast.parentNode) {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.5s ease';
                setTimeout(() => {
                    if (toast.parentNode) toast.remove();
                }, 500);
            }
        }, 4000);
    }
}