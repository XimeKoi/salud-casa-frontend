// src/app/pages/captura/captura.component.ts

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import Swal from 'sweetalert2';

declare const Toastify: any;

@Component({
    selector: 'app-captura',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './captura.component.html',
    styleUrls: ['./captura.component.scss'],
    host: {
        'style': 'display: block; height: 100%; width: 100%;'
    }
})
export class CapturaComponent implements OnInit {
    busquedaBeneficiario: string = '';
    pacienteId: string = '';
    pacienteNombre: string = '';
    pacienteCurp: string = '';
    pacienteDireccion: string = '';
    pacienteTelefono: string = '';
    pacienteSeccion: string = '';
    pacienteApellidoPaterno: string = '';
    pacienteApellidoMaterno: string = '';
    pacienteNombres: string = '';
    numVisita: number = 1;
    estatusVital: string = 'vivo';
    fechaVisita: string = '';
    comentarios: string = '';
    pacienteFinado: boolean = false;
    fechaFinado: string = '';
    mostrarAdvertenciaSeleccion: boolean = false;
    programaActual: string = '';

    discapacidades = {
        motriz: false,
        visual: false,
        auditiva: false,
        intelectual: false,
        psicosocial: false
    };

    pacientes: any[] = [];
    pacientesFiltrados: any[] = [];
    finados: any[] = [];
    visitasPorPaciente: Map<string, any[]> = new Map();
    sugerencias: any[] = [];
    mostrarSugerencias: boolean = true;
    loading: boolean = false;

    private apiUrl = environment.apiUrl;
    private usuarioId: number = 1;

    constructor(
        private http: HttpClient,
        private cdr: ChangeDetectorRef
    ) {
        console.log(' [Captura] API URL:', this.apiUrl);
    }

    ngOnInit() {
        this.cargarPacientesDesdeBD();
        this.cargarFinados();
        this.cargarVisitas();
    }

    cargarPacientesDesdeBD() {
        this.loading = true;
        const idEnfermera = 1;

        this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}`)
            .subscribe({
                next: (data) => {
                    console.log(' Pacientes recibidos desde BD:', data.length);
                    this.pacientes = data.map(p => {
                        const apellidoPaterno = p.apellidoPaterno || '';
                        const apellidoMaterno = p.apellidoMaterno || '';
                        const nombre = p.nombre || '';

                        let nombreCompleto = nombre;
                        if (apellidoPaterno && apellidoMaterno) {
                            nombreCompleto = `${apellidoPaterno} ${apellidoMaterno} ${nombre}`;
                        } else if (apellidoPaterno) {
                            nombreCompleto = `${apellidoPaterno} ${nombre}`;
                        } else if (apellidoMaterno) {
                            nombreCompleto = `${apellidoMaterno} ${nombre}`;
                        }

                        return {
                            id: p.id,
                            numero: p.numero,
                            nombreCompleto: nombreCompleto,
                            nombre: nombre,
                            apellidoPaterno: apellidoPaterno,
                            apellidoMaterno: apellidoMaterno,
                            curp: p.curp || '',
                            telefono: p.telefonoCelular || p.telefonoFijo || '',
                            direccion: p.direccion || '',
                            colonia: this.extraerColonia(p.direccion),
                            seccion: p.zonaTrabajo?.split('-').pop() || '',
                            zonaTrabajo: p.zonaTrabajo || '',
                            estatus: p.estatus || 'PENDIENTE',
                            programa: p.programa || '',
                            region: p.region,
                            municipio: p.municipio,
                            genero: p.genero || '',
                            discapacidadMotriz: p.discapacidadMotriz || false,
                            discapacidadVisual: p.discapacidadVisual || false,
                            discapacidadAuditiva: p.discapacidadAuditiva || false,
                            discapacidadIntelectual: p.discapacidadIntelectual || false,
                            discapacidadPsicosocial: p.discapacidadPsicosocial || false,
                            fechaFinado: p.fechaFinado || null
                        };
                    });

                    this.pacientesFiltrados = [...this.pacientes];
                    this.loading = false;
                    this.cdr.detectChanges();
                },
                error: (err) => {
                    console.error('❌ Error al cargar pacientes:', err);
                    this.cargarPacientesLocal();
                    this.loading = false;
                    this.cdr.detectChanges();
                }
            });
    }

    extraerColonia(direccion: string): string {
        if (!direccion) return '';
        const partes = direccion.split(',');
        return partes.length >= 2 ? partes[1].trim() : '';
    }

    cargarPacientesLocal() {
        console.log(' Usando datos locales de fallback');
        this.pacientes = [
            {
                id: 30,
                numero: 30,
                nombreCompleto: 'SOLIS SOLIS ELOY',
                nombre: 'ELOY',
                apellidoPaterno: 'SOLIS',
                apellidoMaterno: 'SOLIS',
                curp: 'SOSE470605HGTLLL01',
                telefono: '4773975192',
                direccion: 'SAN JOSE #208, COL. SANTA ROSA DE LIMA, LEON, GTO',
                colonia: 'SANTA ROSA DE LIMA',
                seccion: '277',
                estatus: 'RECHAZO',
                programa: 'PAM'
            },
            {
                id: 148,
                numero: 148,
                nombreCompleto: 'ADOLFO',
                nombre: 'ADOLFO',
                apellidoPaterno: '',
                apellidoMaterno: '',
                curp: '',
                telefono: '4773300505',
                direccion: 'FRAY BERNARDO QUINTAVALLE 131. COL FRANCCIONAMIENTO REAL DE SAN JOSE',
                colonia: 'FRANCCIONAMIENTO REAL DE SAN JOSE',
                seccion: '277',
                estatus: 'RECHAZO',
                programa: 'PAM'
            }
        ];
        this.pacientesFiltrados = [...this.pacientes];
    }

    cargarFinados() {
        const finadosGuardados = localStorage.getItem('pacientes_finados');
        if (finadosGuardados) {
            this.finados = JSON.parse(finadosGuardados);
        }
    }

    cargarVisitas() {
        const visitasGuardadas = localStorage.getItem('visitas');
        if (visitasGuardadas) {
            const todasLasVisitas = JSON.parse(visitasGuardadas);
            this.visitasPorPaciente.clear();
            todasLasVisitas.forEach((visita: any) => {
                const key = visita.pacienteCurp || visita.pacienteId;
                if (!this.visitasPorPaciente.has(key)) {
                    this.visitasPorPaciente.set(key, []);
                }
                this.visitasPorPaciente.get(key)!.push(visita);
            });
        }
    }

    guardarVisitaEnLocalStorage(datosVisita: any) {
        const visitasGuardadas = localStorage.getItem('visitas');
        let visitas = visitasGuardadas ? JSON.parse(visitasGuardadas) : [];
        visitas.push(datosVisita);
        localStorage.setItem('visitas', JSON.stringify(visitas));
        this.cargarVisitas();
    }

    guardarFinado(curp: string, nombre: string) {
        const existe = this.finados.find(f => f.curp === curp);
        if (!existe) {
            this.finados.push({
                curp: curp,
                nombre: nombre,
                fecha: new Date().toLocaleDateString()
            });
            localStorage.setItem('pacientes_finados', JSON.stringify(this.finados));
        }
    }

    isFinado(curp: string): any {
        return this.finados.find(f => f.curp === curp);
    }

    obtenerUltimaVisita(key: string): any {
        const visitas = this.visitasPorPaciente.get(key);
        if (visitas && visitas.length > 0) {
            visitas.sort((a, b) => new Date(b.fechaRegistro).getTime() - new Date(a.fechaRegistro).getTime());
            return visitas[0];
        }
        return null;
    }

    onBusquedaChange() {
        const busqueda = this.busquedaBeneficiario;

        if (!busqueda || busqueda.trim() === '') {
            this.sugerencias = [];
            this.mostrarSugerencias = true;
            this.limpiarSeleccion();
            return;
        }

        const busquedaLower = busqueda.toLowerCase();

        this.sugerencias = this.pacientes.filter(p => {
            const coincideId = String(p.id).includes(busqueda);
            const coincideNumero = String(p.numero).includes(busqueda);
            const coincideNombreCompleto = p.nombreCompleto.toLowerCase().includes(busquedaLower);
            const coincideApellidoPaterno = p.apellidoPaterno.toLowerCase().includes(busquedaLower);
            const coincideApellidoMaterno = p.apellidoMaterno.toLowerCase().includes(busquedaLower);
            const coincideCurp = p.curp && p.curp.toLowerCase().includes(busquedaLower);

            return coincideId || coincideNumero || coincideNombreCompleto ||
                coincideApellidoPaterno || coincideApellidoMaterno || coincideCurp;
        });

        console.log(' Búsqueda:', busqueda, 'Resultados:', this.sugerencias.length);
        this.mostrarSugerencias = true;
    }

    seleccionarSugerencia(paciente: any) {
        console.log(' Seleccionado:', paciente);

        this.pacienteId = String(paciente.id);
        this.pacienteNombre = paciente.nombreCompleto || paciente.nombre || 'Sin nombre';
        this.pacienteCurp = paciente.curp || '';
        this.pacienteDireccion = paciente.direccion || '';
        this.pacienteTelefono = paciente.telefono || '';
        this.pacienteSeccion = paciente.seccion || '';
        this.pacienteApellidoPaterno = paciente.apellidoPaterno || '';
        this.pacienteApellidoMaterno = paciente.apellidoMaterno || '';
        this.pacienteNombres = paciente.nombre || '';
        this.busquedaBeneficiario = paciente.nombreCompleto || paciente.nombre;
        this.sugerencias = [];
        this.mostrarSugerencias = false;
        this.mostrarAdvertenciaSeleccion = false;

        this.programaActual = paciente.programa || 'PAM';

        const tieneDiscapacidadBD = paciente.discapacidadMotriz || paciente.discapacidadVisual ||
            paciente.discapacidadAuditiva || paciente.discapacidadIntelectual ||
            paciente.discapacidadPsicosocial;

        if (tieneDiscapacidadBD || this.programaActual.toUpperCase() === 'DISCAPACIDAD') {
            this.discapacidades = {
                motriz: paciente.discapacidadMotriz || true,
                visual: paciente.discapacidadVisual || true,
                auditiva: paciente.discapacidadAuditiva || true,
                intelectual: paciente.discapacidadIntelectual || true,
                psicosocial: paciente.discapacidadPsicosocial || true
            };
            this.mostrarToast('Paciente con discapacidad', 'Las discapacidades han sido precargadas desde la BD', 'info');
        } else {
            this.discapacidades = {
                motriz: false,
                visual: false,
                auditiva: false,
                intelectual: false,
                psicosocial: false
            };
        }

        console.log(' Datos seleccionados:', {
            id: this.pacienteId,
            nombreCompleto: this.pacienteNombre,
            programa: this.programaActual,
            discapacidades: this.discapacidades
        });

        const estatusBD = (paciente.estatus || '').toUpperCase();
        const fechaFinadoBD = paciente.fechaFinado;

        if (estatusBD === 'FINADO' || fechaFinadoBD) {
            this.pacienteFinado = true;
            this.fechaFinado = fechaFinadoBD ? new Date(fechaFinadoBD).toLocaleDateString('es-MX') : 'Fecha no registrada';
            this.estatusVital = 'finado';
            this.mostrarToast('Paciente finado', `${this.pacienteNombre} está registrado como finado.`, 'warning');
        } else {
            const finadoInfo = this.isFinado(paciente.curp);
            if (finadoInfo) {
                this.pacienteFinado = true;
                this.fechaFinado = finadoInfo.fecha;
                this.estatusVital = 'finado';
                this.mostrarToast('Paciente finado', `${this.pacienteNombre} fue registrado como finado el ${finadoInfo.fecha}.`, 'warning');
            } else {
                this.pacienteFinado = false;
                this.estatusVital = 'vivo';
                this.cargarUltimaVisita(paciente);
            }
        }

        this.cdr.detectChanges();
    }

    cargarUltimaVisita(paciente: any) {
        const key = paciente.curp || String(paciente.id);
        const ultimaVisita = this.obtenerUltimaVisita(key);
        if (ultimaVisita && ultimaVisita.estatusVital === 'vivo') {
            this.discapacidades = { ...ultimaVisita.discapacidades };
            this.numVisita = ultimaVisita.numVisita + 1;
            this.mostrarToast(
                'Historial cargado',
                `Se cargaron los datos de la última visita (Visita #${ultimaVisita.numVisita})`,
                'info'
            );
        } else if (ultimaVisita && ultimaVisita.estatusVital === 'finado') {
            this.pacienteFinado = true;
            this.fechaFinado = ultimaVisita.fechaRegistro ? new Date(ultimaVisita.fechaRegistro).toLocaleDateString() : '';
            this.estatusVital = 'finado';
        } else {
            this.numVisita = 1;
        }
    }

    limpiarSeleccion() {
        this.busquedaBeneficiario = '';
        this.pacienteId = '';
        this.pacienteNombre = '';
        this.pacienteCurp = '';
        this.pacienteDireccion = '';
        this.pacienteTelefono = '';
        this.pacienteSeccion = '';
        this.pacienteApellidoPaterno = '';
        this.pacienteApellidoMaterno = '';
        this.pacienteNombres = '';
        this.pacienteFinado = false;
        this.fechaFinado = '';
        this.estatusVital = 'vivo';
        this.fechaVisita = '';
        this.comentarios = '';
        this.mostrarAdvertenciaSeleccion = false;
        this.sugerencias = [];
        this.mostrarSugerencias = true;
        this.programaActual = '';
        this.discapacidades = {
            motriz: false,
            visual: false,
            auditiva: false,
            intelectual: false,
            psicosocial: false
        };
        this.cdr.detectChanges();
    }

    onEstatusVivo() {
        this.mostrarAdvertenciaSeleccion = false;
        if (this.pacienteId && !this.pacienteFinado) {
            this.fechaVisita = '';
            this.comentarios = '';
        }
    }

    async onEstatusFinado() {
        if (!this.pacienteId || !this.pacienteNombre) {
            this.mostrarAdvertenciaSeleccion = true;
            this.estatusVital = 'vivo';
            this.mostrarToast(
                'Selección requerida',
                'Debe seleccionar un beneficiario válido antes de marcarlo como FINADO',
                'warning'
            );
            setTimeout(() => {
                this.mostrarAdvertenciaSeleccion = false;
            }, 3000);
            return;
        }

        if (this.pacienteFinado) {
            this.mostrarToast(
                'Paciente ya finado',
                `El paciente ${this.pacienteNombre} ya está registrado como finado.`,
                'warning'
            );
            this.estatusVital = 'finado';
            return;
        }

        this.mostrarAdvertenciaSeleccion = false;

        const result = await Swal.fire({
            title: ' Confirmar Finado',
            html: `
            <div style="text-align: left; padding: 10px 0;">
                <p style="font-size: 16px; margin-bottom: 15px;">
                    <strong>¿Estás seguro de marcar a este paciente como FINADO?</strong>
                </p>
                <div style="background: #f8f4f0; padding: 15px; border-radius: 10px; margin-bottom: 15px;">
                    <div style="display: grid; grid-template-columns: 100px 1fr; gap: 4px 8px; font-size: 14px;">
                        <span style="font-weight: 600; color: #7B1D2E;">Nombre:</span>
                        <span style="font-weight: 700;">${this.pacienteNombre}</span>
                        <span style="font-weight: 600; color: #7B1D2E;">ID:</span>
                        <span>${this.pacienteId}</span>
                        <span style="font-weight: 600; color: #7B1D2E;">CURP:</span>
                        <span>${this.pacienteCurp || 'No registrado'}</span>
                    </div>
                </div>
                <div style="background: #fff3e0; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #e67e22;">
                    <p style="margin: 0; font-size: 13px; color: #666;">
                        <i class="fas fa-exclamation-triangle" style="color: #e67e22;"></i>
                        Esta acción actualizará el estatus en la base de datos y el paciente 
                        quedará bloqueado para futuras visitas.
                    </p>
                </div>
            </div>
        `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#701f2f',
            cancelButtonColor: '#999999',
            confirmButtonText: ' Confirmar Finado',
            cancelButtonText: ' Cancelar',
            reverseButtons: true,
            focusCancel: true,
            backdrop: 'rgba(0,0,0,0.5)',
            allowOutsideClick: false,
            allowEscapeKey: true,
            width: 500,
            padding: '20px'
        });

        if (result.isConfirmed) {
            try {
                console.log(` Marcando paciente ${this.pacienteId} como FINADO en la BD...`);

                const response = await firstValueFrom(
                    this.http.patch(`${this.apiUrl}/pacientes/${this.pacienteId}/estatus`, {
                        estatus: 'FINADO',
                        usuarioId: this.usuarioId
                    })
                );

                console.log(' Respuesta del backend:', response);

                const tieneDiscapacidad = this.discapacidades.motriz || this.discapacidades.visual ||
                    this.discapacidades.auditiva || this.discapacidades.intelectual ||
                    this.discapacidades.psicosocial;

                if (tieneDiscapacidad) {
                    console.log('📤 Guardando discapacidades antes del finado...');
                    await firstValueFrom(
                        this.http.patch(`${this.apiUrl}/pacientes/${this.pacienteId}/discapacidades`, {
                            motriz: this.discapacidades.motriz || false,
                            visual: this.discapacidades.visual || false,
                            auditiva: this.discapacidades.auditiva || false,
                            intelectual: this.discapacidades.intelectual || false,
                            psicosocial: this.discapacidades.psicosocial || false
                        })
                    );
                    console.log(' Discapacidades guardadas');
                }

                this.pacienteFinado = true;
                this.fechaFinado = new Date().toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                this.estatusVital = 'finado';

                if (this.pacienteCurp) {
                    this.guardarFinado(this.pacienteCurp, this.pacienteNombre);
                }

                this.fechaVisita = '';
                this.comentarios = '';

                this.mostrarToast(
                    ' Registro completado',
                    `El paciente ${this.pacienteNombre} ha sido registrado como finado.`,
                    'success'
                );

                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('recargarMapa'));
                    console.log(' Evento de recarga de mapa disparado');
                }, 500);

            } catch (error) {
                console.error(' Error al marcar como finado:', error);
                this.mostrarToast(
                    'Error',
                    'No se pudo actualizar el estatus del paciente en la BD',
                    'error'
                );
                this.estatusVital = 'vivo';
            }
        } else {
            this.estatusVital = 'vivo';
            this.mostrarToast(
                'Operación cancelada',
                `No se registró el finado del paciente ${this.pacienteNombre}.`,
                'info'
            );
        }
    }

    private enviarNotificacionVisitaGuardada(numVisita: number) {
        const nombreCompleto = this.pacienteNombre || 'Paciente';

        const notificacion = {
            titulo: `Visita #${numVisita} registrada`,
            mensaje: `Se ha registrado la visita #${numVisita} para ${nombreCompleto}`,
            tipo: 'visita',
            prioridad: 'media',
            usuarioId: this.usuarioId,
            metadata: {
                pacienteId: this.pacienteId,
                numVisita: numVisita,
                fechaRegistro: new Date().toISOString()
            },
            url: `/pacientes/${this.pacienteId}`
        };

        console.log(' Enviando notificación al backend:', notificacion);

        this.http.post(`${this.apiUrl}/notificaciones`, notificacion).subscribe({
            next: (response) => {
                console.log(' Notificación enviada al backend:', response);
            },
            error: (error) => {
                console.error(' Error enviando notificación al backend:', error);
                this.guardarNotificacionLocal(notificacion);
            }
        });

        this.guardarNotificacionLocal(notificacion);
    }

    private guardarNotificacionLocal(notificacion: any) {
        try {
            const notificaciones = JSON.parse(localStorage.getItem('notificacionesCache') || '[]');
            notificaciones.unshift({
                ...notificacion,
                id: Date.now(),
                leida: false,
                createdAt: new Date().toISOString()
            });
            localStorage.setItem('notificacionesCache', JSON.stringify(notificaciones));
            console.log(' Notificación guardada localmente');

            window.dispatchEvent(new CustomEvent('nuevaNotificacion', {
                detail: notificacion
            }));
        } catch (error) {
            console.error('Error guardando notificación local:', error);
        }
    }

    async guardarFormulario() {
        if (!this.pacienteId || !this.pacienteNombre) {
            this.mostrarToast('Error', 'Por favor seleccione un beneficiario válido', 'warning');
            return;
        }

        if (this.pacienteFinado) {
            this.mostrarToast('Paciente finado', `El paciente ${this.pacienteNombre} ya se encuentra registrado como finado.`, 'warning');
            return;
        }

        const tieneDiscapacidad = this.discapacidades.motriz || this.discapacidades.visual ||
            this.discapacidades.auditiva || this.discapacidades.intelectual ||
            this.discapacidades.psicosocial;

        const nuevoPrograma = tieneDiscapacidad ? 'DISCAPACIDAD' : 'PAM';

        try {
            console.log(` Actualizando paciente ${this.pacienteId}...`);
            console.log(' Discapacidades:', this.discapacidades);
            console.log(' Nuevo programa:', nuevoPrograma);

            const discapacidadesData = {
                motriz: this.discapacidades.motriz || false,
                visual: this.discapacidades.visual || false,
                auditiva: this.discapacidades.auditiva || false,
                intelectual: this.discapacidades.intelectual || false,
                psicosocial: this.discapacidades.psicosocial || false
            };

            console.log('📤 Enviando discapacidades:', discapacidadesData);

            await firstValueFrom(
                this.http.patch(`${this.apiUrl}/pacientes/${this.pacienteId}/discapacidades`, discapacidadesData)
            );

            console.log(` Discapacidades actualizadas`);

            await firstValueFrom(
                this.http.patch(`${this.apiUrl}/pacientes/${this.pacienteId}/programa`, {
                    programa: nuevoPrograma
                })
            );

            console.log(` Programa actualizado a ${nuevoPrograma}`);
            this.programaActual = nuevoPrograma;

        } catch (error) {
            console.error(' Error actualizando paciente:', error);
            this.mostrarToast('Error', 'No se pudo actualizar el paciente en la BD', 'error');
            return;
        }

        const datosVisita = {
            id: Date.now(),
            pacienteId: this.pacienteId,
            pacienteNombre: this.pacienteNombre,
            pacienteCurp: this.pacienteCurp,
            pacienteDireccion: this.pacienteDireccion,
            pacienteTelefono: this.pacienteTelefono,
            pacienteSeccion: this.pacienteSeccion,
            pacienteApellidoPaterno: this.pacienteApellidoPaterno,
            pacienteApellidoMaterno: this.pacienteApellidoMaterno,
            pacienteNombres: this.pacienteNombres,
            numVisita: this.numVisita,
            estatusVital: this.estatusVital,
            discapacidades: { ...this.discapacidades },
            fechaVisita: this.fechaVisita || null,
            comentarios: this.comentarios || null,
            fechaRegistro: new Date().toISOString(),
            programa: nuevoPrograma
        };

        this.guardarVisitaEnLocalStorage(datosVisita);
        this.enviarNotificacionVisitaGuardada(this.numVisita);

        let mensajeExito = 'Los datos se han registrado correctamente';
        if (tieneDiscapacidad) {
            mensajeExito = ' Visita guardada. Paciente marcado como DISCAPACIDAD';
        }
        if (!this.fechaVisita && this.estatusVital === 'vivo') {
            mensajeExito += ' Recuerde programar la próxima visita.';
        }

        this.mostrarToast('Visita guardada', mensajeExito, 'success');
        this.resetearFormulario();

        setTimeout(() => {
            window.dispatchEvent(new CustomEvent('recargarMapa'));
            console.log(' Evento de recarga de mapa disparado');
        }, 500);
    }

    resetearFormulario() {
        this.busquedaBeneficiario = '';
        this.pacienteId = '';
        this.pacienteNombre = '';
        this.pacienteCurp = '';
        this.pacienteDireccion = '';
        this.pacienteTelefono = '';
        this.pacienteSeccion = '';
        this.pacienteApellidoPaterno = '';
        this.pacienteApellidoMaterno = '';
        this.pacienteNombres = '';
        this.numVisita = 1;
        this.estatusVital = 'vivo';
        this.pacienteFinado = false;
        this.fechaFinado = '';
        this.mostrarAdvertenciaSeleccion = false;
        this.sugerencias = [];
        this.mostrarSugerencias = true;
        this.programaActual = '';
        this.discapacidades = {
            motriz: false,
            visual: false,
            auditiva: false,
            intelectual: false,
            psicosocial: false
        };
        this.fechaVisita = '';
        this.comentarios = '';
        this.cdr.detectChanges();
    }

    mostrarToast(titulo: string, mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'info', duracion: number = 3000) {
        const toastsAnteriores = document.querySelectorAll('.custom-toast-captura');
        toastsAnteriores.forEach(el => el.remove());

        const config = {
            success: { color: '#701f2f', bgColor: '#fdf8f6', icon: 'fa-check-circle' },
            error: { color: '#c62828', bgColor: '#ffebee', icon: 'fa-exclamation-circle' },
            info: { color: '#701f2f', bgColor: '#fefaf7', icon: 'fa-info-circle' },
            warning: { color: '#e67e22', bgColor: '#fff3e0', icon: 'fa-exclamation-triangle' }
        };
        const cfg = config[tipo];

        Toastify({
            text: titulo,
            duration: duracion,
            close: false,
            gravity: 'top',
            position: 'right',
            style: {
                background: '#ffffff',
                color: '#1a1a1a',
                borderRadius: '16px',
                padding: '0',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                fontFamily: "'Montserrat', sans-serif",
                borderLeft: `5px solid ${cfg.color}`,
                overflow: 'hidden',
                minWidth: '320px',
                maxWidth: '450px'
            },
            className: 'custom-toast-captura'
        }).showToast();

        setTimeout(() => {
            const toastElement = document.querySelector('.custom-toast-captura') as HTMLElement;
            if (toastElement) {
                toastElement.innerHTML = `
                    <div style="display: flex; align-items: stretch; gap: 0;">
                        <div style="background: ${cfg.bgColor}; padding: 18px 16px; display: flex; align-items: center; justify-content: center; min-width: 60px;">
                            <i class="fas ${cfg.icon}" style="font-size: 24px; color: ${cfg.color};"></i>
                        </div>
                        <div style="padding: 16px 20px 16px 16px; flex: 1;">
                            <div style="font-weight: 700; font-size: 15px; color: #1a1a1a; margin-bottom: 4px;">${titulo}</div>
                            <div style="font-size: 13px; color: #555; line-height: 1.4; white-space: pre-line;">${mensaje}</div>
                        </div>
                        <button onclick="this.closest('.custom-toast-captura').remove()" style="background: none; border: none; color: #bbb; cursor: pointer; padding: 8px 12px; font-size: 16px; transition: color 0.2s;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
            }
        }, 50);
    }
}