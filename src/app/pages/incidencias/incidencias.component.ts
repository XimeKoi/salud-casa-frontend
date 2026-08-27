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
    pacienteId?: number;
    datosPaciente?: {
        id: number;
        nombre: string;
        direccion: string;
        telefono: string;
        colonia: string;
        seccion: string;
    };
}

@Component({
    selector: 'app-incidencias',
    standalone: true,
    imports: [CommonModule, FormsModule],
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

    tiposIncidencias = [
        { valor: 'no_localizado', label: 'No se localizó al usuario', icono: 'fas fa-search' },
        { valor: 'direccion_incorrecta', label: 'Dirección incorrecta', icono: 'fas fa-map-marker-alt' },
        { valor: 'casa_cerrada', label: 'Casa cerrada / Sin acceso', icono: 'fas fa-door-closed' },
        { valor: 'usuario_rechazo', label: 'Usuario rechazó la visita', icono: 'fas fa-user-slash' },
        { valor: 'emergencia_medica', label: 'Emergencia médica', icono: 'fas fa-ambulance' },
        { valor: 'otro', label: 'Otro', icono: 'fas fa-ellipsis-h' }
    ];

    get direccionCompleta(): string {
        if (this.datosPaciente) {
            return `${this.datosPaciente.direccion}, ${this.datosPaciente.colonia}`;
        }
        return '';
    }

    private apiUrl = environment.apiUrl;

    constructor(
        private cdr: ChangeDetectorRef,
        private router: Router,
        private http: HttpClient,
        private ngZone: NgZone
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

        // ⭐ VERIFICAR LOCAL STORAGE
        const pacienteLocal = localStorage.getItem('incidenciaPaciente');
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
                    seccion: paciente.seccion || ''
                };

                this.nuevaIncidencia.pacienteId = this.datosPaciente.id;
                this.nuevaIncidencia.direccion = `${this.datosPaciente.direccion}, ${this.datosPaciente.colonia}`;
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
                        seccion: paciente.seccion || ''
                    };

                    this.nuevaIncidencia.pacienteId = this.datosPaciente.id;
                    this.nuevaIncidencia.direccion = `${this.datosPaciente.direccion}, ${this.datosPaciente.colonia}`;
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
                seccion: paciente.seccion || ''
            };

            this.nuevaIncidencia.pacienteId = this.datosPaciente.id;
            this.nuevaIncidencia.direccion = `${this.datosPaciente.direccion}, ${this.datosPaciente.colonia}`;

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
    }

    // ⭐ ============================================
    // ⭐ RESET FORMULARIO COMPLETO
    // ⭐ ============================================

    resetearFormulario() {
        this.limpiarFormulario();
        if (this.datosPaciente) {
            this.nuevaIncidencia.direccion = `${this.datosPaciente.direccion}, ${this.datosPaciente.colonia}`;
            this.nuevaIncidencia.pacienteId = this.datosPaciente.id;
            // ⭐ RELLENAR DESCRIPCIÓN AUTOMÁTICAMENTE AL RESETEAR
            this.onTipoIncidenciaChange();
        }
        this.cdr.detectChanges();
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
                            resuelta: inc.resuelta || false,
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
                        fecha: new Date(inc.fecha)
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

        const incidenciaData = {
            tipo: incidencia.tipo,
            descripcion: incidencia.descripcion,
            direccion: incidencia.direccion,
            fecha: incidencia.fecha.toISOString(),
            fotos: incidencia.fotos,
            resuelta: incidencia.resuelta,
            pacienteId: incidencia.pacienteId,
            datosPaciente: incidencia.datosPaciente,
            otroTexto: incidencia.otroTexto || ''
        };

        console.log('📤 Guardando incidencia en BD:', incidenciaData);

        this.http.post(`${this.apiUrl}/incidencias`, incidenciaData)
            .subscribe({
                next: (response: any) => {
                    console.log('✅ Incidencia guardada en BD:', response);
                    const nuevaIncidencia = { ...incidencia, id: response.id || Date.now() };
                    this.incidencias.unshift(nuevaIncidencia);
                    this.guardarIncidencias();
                    this.aplicarFiltro();
                    this.loading = false;
                    this.mostrarToast('✅ Incidencia guardada correctamente', 'success');
                    this.cdr.detectChanges();

                    if (incidencia.pacienteId) {
                        this.actualizarEstadoPaciente(incidencia.pacienteId, 'incidencia');
                    }

                    this.limpiarDatosPaciente();
                    this.datosPaciente = null;
                    this.mostrarFormulario = false;

                    setTimeout(() => {
                        this.router.navigate(['/pacientes']);
                    }, 1500);
                },
                error: (error) => {
                    console.error('❌ Error al guardar incidencia en BD:', error);
                    this.loading = false;
                    const nuevaIncidencia = { ...incidencia, id: Date.now() };
                    this.incidencias.unshift(nuevaIncidencia);
                    this.guardarIncidencias();
                    this.aplicarFiltro();
                    this.enviarNotificacionLocal(nuevaIncidencia);
                    this.mostrarToast('⚠️ Incidencia guardada localmente (sin conexión a BD)', 'warning');
                    this.usandoLocalStorage = true;
                    this.cdr.detectChanges();

                    this.limpiarDatosPaciente();
                    this.datosPaciente = null;
                    this.mostrarFormulario = false;

                    setTimeout(() => {
                        this.router.navigate(['/pacientes']);
                    }, 1500);
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
        this.http.patch(`${this.apiUrl}/pacientes/${pacienteId}/estatus`, { estatus: estado })
            .subscribe({
                next: () => console.log('✅ Estado del paciente actualizado a:', estado),
                error: (err) => console.error('❌ Error actualizando estado:', err)
            });
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

    get incidenciasPendientes(): number {
        return this.incidencias.filter(i => !i.resuelta).length;
    }

    get incidenciasResueltas(): number {
        return this.incidencias.filter(i => i.resuelta).length;
    }

    aplicarFiltro() {
        if (this.filtroActual === 'pendientes') {
            this.incidenciasFiltradas = this.incidencias.filter(i => !i.resuelta);
        } else if (this.filtroActual === 'resueltas') {
            this.incidenciasFiltradas = this.incidencias.filter(i => i.resuelta);
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

    async procesarFotos(event: any) {
        if (this.procesando) {
            return;
        }

        this.procesando = true;

        const files = event.target.files;

        if (files && files.length > 0) {
            let procesadas = 0;
            const total = files.length;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();

                    reader.onload = async (e: any) => {
                        try {
                            const imagenComprimida = await this.comprimirImagen(e.target.result);
                            this.fotosPreview.push(imagenComprimida);
                            this.nuevaIncidencia.fotos.push(imagenComprimida);
                        } catch (error) {
                            console.error('Error al comprimir imagen:', error);
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
                                this.mostrarToast(`📸 ${total} foto(s) cargada(s) correctamente`, 'success');
                            }, 300);
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
        } else {
            this.procesando = false;
        }
    }

    comprimirImagen(base64: string, maxWidth: number = 800): Promise<string> {
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
                ctx!.drawImage(img, 0, 0, width, height);

                const compressed = canvas.toDataURL('image/jpeg', 0.6);
                resolve(compressed);
            };
            img.src = base64;
        });
    }

    eliminarFoto(index: number) {
        this.fotosPreview.splice(index, 1);
        this.nuevaIncidencia.fotos.splice(index, 1);
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
                            <span style="font-weight: 700; color: #1a1a1a;">${this.datosPaciente.direccion}</span>
                            <span style="font-weight: 600; color: #7B1D2E;">Colonia:</span>
                            <span style="font-weight: 700; color: #1a1a1a;">${this.datosPaciente.colonia}</span>
                            <span style="font-weight: 600; color: #7B1D2E;">Tipo:</span>
                            <span style="font-weight: 700; color: #1a1a1a;">${this.getTipoLabel(this.nuevaIncidencia.tipo)}</span>
                        </div>
                    </div>
                    <div style="background: #fff3e0; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #e67e22;">
                        <div style="font-size: 13px; color: #666;">
                            <i class="fas fa-info-circle" style="color: #e67e22; margin-right: 8px;"></i>
                            Se registrará la incidencia y se actualizará el estado del paciente.
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
                    pacienteId: this.datosPaciente?.id
                };

                this.guardarIncidenciaEnBD(nuevaIncidencia);

                this.limpiarDatosPaciente();
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