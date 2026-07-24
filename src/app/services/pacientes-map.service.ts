// src/app/services/pacientes-map.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PacienteMap {
    id: number;
    nombre: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
    direccion: string;
    colonia: string;
    telefono: string;
    telefonoFijo: string;
    telefonoCelular: string;
    estatus: string;
    seccion: string;
    lat: number;
    lng: number;
    programa: string;
    curp: string;
    genero: string;
    discapacidades: {
        motriz: boolean;
        visual: boolean;
        auditiva: boolean;
        intelectual: boolean;
        psicosocial: boolean;
    };
    finado: boolean;
    fechaFinado: string;
}

@Injectable({
    providedIn: 'root'
})
export class PacientesMapService {
    private apiUrl = environment.apiUrl;
    private cachePacientes: PacienteMap[] = [];
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 30000; // 30 segundos

    // ⭐ CACHE PARA NIVELES DE RIESGO
    private nivelesRiesgoCache: Map<number, string> = new Map();
    private nivelesRiesgoTimestamp: number = 0;
    private readonly NIVELES_CACHE_TTL = 30000; // 30 segundos

    constructor(private http: HttpClient) { }

    clearCache(): void {
        console.log('🧹 [PacientesMapService] Cache limpiado');
        this.cachePacientes = [];
        this.cacheTimestamp = 0;
    }

    refreshPacientes(): void {
        console.log('🔄 [PacientesMapService] Forzando recarga de pacientes');
        this.clearCache();
    }

    setPacientesCache(pacientes: any[]): void {
        console.log(`📦 [PacientesMapService] Cache establecido con ${pacientes?.length || 0} pacientes`);
        if (pacientes && pacientes.length > 0) {
            this.cachePacientes = this.procesarPacientes(pacientes);
            this.cacheTimestamp = Date.now();
        }
    }

    async getPacientesEnfermera(idEnfermera: number = 1): Promise<any[]> {
        try {
            console.log('📥 Intentando obtener pacientes de la BD...');
            const pacientes = await firstValueFrom(
                this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}`)
            );
            console.log(`📊 ${pacientes?.length || 0} pacientes obtenidos de la BD`);

            const conDiscapacidad = pacientes?.filter(p =>
                p.discapacidadMotriz || p.discapacidadVisual ||
                p.discapacidadAuditiva || p.discapacidadIntelectual ||
                p.discapacidadPsicosocial
            ) || [];
            const finados = pacientes?.filter(p => p.estatus?.toUpperCase() === 'FINADO' || p.fechaFinado) || [];
            console.log(`🎨 Pacientes con discapacidad en BD: ${conDiscapacidad.length}`);
            console.log(`💀 Pacientes finados en BD: ${finados.length}`);

            return pacientes || [];
        } catch (error) {
            console.error('⚠️ Error obteniendo pacientes de la BD:', error);
            return [];
        }
    }

    private construirNombreCompleto(paciente: any): string {
        const partes = [];
        if (paciente.apellidoPaterno) partes.push(paciente.apellidoPaterno);
        if (paciente.apellidoMaterno) partes.push(paciente.apellidoMaterno);
        if (paciente.nombre) partes.push(paciente.nombre);
        return partes.length > 0 ? partes.join(' ').trim() : 'Nombre no disponible';
    }

    private extraerSeccion(zonaTrabajo: string): string {
        if (!zonaTrabajo) return '';
        const partes = zonaTrabajo.split('-');
        return partes.length >= 2 ? partes[1] : '';
    }

    private extraerColonia(direccion: string): string {
        if (!direccion) return '';
        const partes = direccion.split(',');
        return partes.length >= 2 ? partes[1].trim() : '';
    }

    private detectarGenero(nombre: string, curp: string): string {
        if (curp && curp.length >= 11) {
            const sexo = curp.charAt(10).toUpperCase();
            if (sexo === 'H') return 'M';
            if (sexo === 'M') return 'F';
        }
        return 'U';
    }

    private extraerDiscapacidades(paciente: any): { motriz: boolean; visual: boolean; auditiva: boolean; intelectual: boolean; psicosocial: boolean } {
        return {
            motriz: paciente.discapacidadMotriz || false,
            visual: paciente.discapacidadVisual || false,
            auditiva: paciente.discapacidadAuditiva || false,
            intelectual: paciente.discapacidadIntelectual || false,
            psicosocial: paciente.discapacidadPsicosocial || false
        };
    }

    private esFinado(paciente: any): { finado: boolean; fechaFinado: string } {
        const estatus = (paciente.estatus || '').toUpperCase();
        if (estatus === 'FINADO' || paciente.fechaFinado) {
            return {
                finado: true,
                fechaFinado: paciente.fechaFinado ? new Date(paciente.fechaFinado).toLocaleDateString('es-MX') : 'Fecha no registrada'
            };
        }
        return {
            finado: false,
            fechaFinado: ''
        };
    }

    private procesarPacientes(pacientesBD: any[]): PacienteMap[] {
        const pacientesConCoords: PacienteMap[] = [];
        let conTelefono = 0;
        let sinTelefono = 0;

        for (const p of pacientesBD) {
            if (p.nombre === 'Usuario' || p.nombre?.toLowerCase().includes('prueba')) {
                continue;
            }

            const nombreCompleto = this.construirNombreCompleto(p);
            const direccion = p.direccion || '';
            const colonia = this.extraerColonia(direccion);
            const seccion = this.extraerSeccion(p.zonaTrabajo || p.seccion || '') || '277';

            let lat = p.lat ? parseFloat(p.lat) : null;
            let lng = p.lng ? parseFloat(p.lng) : null;

            let estatus = p.estatus || 'pendiente';
            if (estatus === 'RECHAZO') estatus = 'rechazo';
            else if (estatus === 'VISITADO') estatus = 'visitado';
            else if (estatus === 'PENDIENTE DE VISITA' || estatus === 'SIN VISITA') estatus = 'pendiente';
            else if (estatus === 'INCIDENCIA') estatus = 'incidencia';
            else if (estatus === 'FINADO') estatus = 'finado';

            const telefonoFijo = p.telefonoFijo || '';
            const telefonoCelular = p.telefonoCelular || '';

            let telefonoFormateado = 'No disponible';
            if (telefonoFijo && telefonoCelular) {
                telefonoFormateado = `📞 ${telefonoFijo} / 📱 ${telefonoCelular}`;
            } else if (telefonoCelular) {
                telefonoFormateado = `📱 ${telefonoCelular}`;
            } else if (telefonoFijo) {
                telefonoFormateado = `📞 ${telefonoFijo}`;
            }

            if (telefonoFormateado !== 'No disponible') {
                conTelefono++;
            } else {
                sinTelefono++;
            }

            const curp = p.curp || '';
            const genero = this.detectarGenero(p.nombre, curp);

            const discapacidades = this.extraerDiscapacidades(p);
            const finadoInfo = this.esFinado(p);

            if (nombreCompleto.toLowerCase().includes('guzmán') ||
                p.nombre?.toLowerCase().includes('guzmán') ||
                p.apellidoPaterno?.toLowerCase().includes('guzmán')) {
                console.log(`🔍 [PacientesMapService] Paciente GUZMÁN encontrado:`, {
                    id: p.id,
                    nombre: nombreCompleto,
                    programa: p.programa,
                    estatus: p.estatus,
                    discapacidades: discapacidades,
                    finado: finadoInfo.finado,
                    lat: lat,
                    lng: lng
                });
            }

            pacientesConCoords.push({
                id: p.id || 0,
                nombre: nombreCompleto,
                apellidoPaterno: p.apellidoPaterno || '',
                apellidoMaterno: p.apellidoMaterno || '',
                direccion: direccion || 'Dirección no disponible',
                colonia: colonia || 'Colonia no disponible',
                telefono: telefonoFormateado,
                telefonoFijo: telefonoFijo,
                telefonoCelular: telefonoCelular,
                estatus: estatus,
                seccion: seccion,
                programa: p.programa || 'PAM',
                lat: lat || 0,
                lng: lng || 0,
                curp: curp,
                genero: genero,
                discapacidades: discapacidades,
                finado: finadoInfo.finado,
                fechaFinado: finadoInfo.fechaFinado
            });
        }

        console.log(`✅ ${pacientesConCoords.length} pacientes procesados`);
        console.log(`📞 Con teléfono: ${conTelefono} de ${pacientesConCoords.length}`);
        console.log(`📭 Sin teléfono: ${sinTelefono} de ${pacientesConCoords.length}`);
        console.log(`🎨 Pacientes con discapacidad: ${pacientesConCoords.filter(p => p.discapacidades.motriz || p.discapacidades.visual || p.discapacidades.auditiva || p.discapacidades.intelectual || p.discapacidades.psicosocial).length}`);
        console.log(`💀 Pacientes finados: ${pacientesConCoords.filter(p => p.finado).length}`);

        return pacientesConCoords;
    }

    async getPacientesConCoordenadas(idEnfermera: number = 1): Promise<PacienteMap[]> {
        if (this.cachePacientes.length > 0 && (Date.now() - this.cacheTimestamp) < this.CACHE_TTL) {
            console.log(`📦 Usando cache de pacientes (${this.cachePacientes.length} pacientes)`);
            return this.cachePacientes;
        }

        try {
            console.log('📥 Obteniendo pacientes para el mapa...');
            const pacientesBD = await this.getPacientesEnfermera(idEnfermera);

            if (!pacientesBD || pacientesBD.length === 0) {
                console.warn('⚠️ No se encontraron pacientes en la BD');
                return [];
            }

            const pacientesProcesados = this.procesarPacientes(pacientesBD);

            this.cachePacientes = pacientesProcesados;
            this.cacheTimestamp = Date.now();

            return pacientesProcesados;
        } catch (error) {
            console.error('⚠️ Error procesando pacientes:', error);
            return [];
        }
    }

    // ⭐ ============================================
    // ⭐ OBTENER PACIENTES CON FILTROS APLICADOS
    // ⭐ ============================================

    getPacientesConFiltros(idEnfermera: number = 1, filtros?: {
        perfiles?: { adulto?: boolean; discapacitado?: boolean; finado?: boolean };
        riesgos?: { g1?: boolean; g2?: boolean; g3?: boolean; g4?: boolean };
        zona?: string;
    }): PacienteMap[] {
        let pacientes = this.cachePacientes;

        if (pacientes.length === 0) {
            this.getPacientesConCoordenadas(idEnfermera);
            pacientes = this.cachePacientes;
        }

        if (!filtros) return pacientes;

        let resultado = [...pacientes];

        if (filtros.zona) {
            const zona = filtros.zona.toUpperCase();
            resultado = resultado.filter(p => {
                const direccion = (p.direccion || '').toUpperCase();
                const colonia = (p.colonia || '').toUpperCase();
                return direccion.includes(zona) || colonia.includes(zona);
            });
        }

        const perfiles = filtros.perfiles || {};
        const hayFiltrosPerfil = perfiles.adulto || perfiles.discapacitado || perfiles.finado;

        if (hayFiltrosPerfil) {
            resultado = resultado.filter(p => {
                const programa = (p.programa || '').toUpperCase();
                const esAdulto = programa === 'PAM' || programa.includes('ADULTO');
                const esDiscapacitado = p.discapacidades?.motriz || p.discapacidades?.visual ||
                    p.discapacidades?.auditiva || p.discapacidades?.intelectual ||
                    p.discapacidades?.psicosocial ||
                    programa === 'DISCAPACIDAD' || programa.includes('DIS');
                const esFinado = p.finado || (p.estatus || '').toUpperCase() === 'FINADO';

                if (perfiles.adulto && esAdulto) return true;
                if (perfiles.discapacitado && esDiscapacitado) return true;
                if (perfiles.finado && esFinado) return true;
                return false;
            });
        }

        const riesgos = filtros.riesgos || {};
        const hayFiltrosRiesgo = riesgos.g1 || riesgos.g2 || riesgos.g3 || riesgos.g4;

        if (hayFiltrosRiesgo) {
            resultado = resultado.filter(p => {
                const estatus = (p.estatus || '').toUpperCase();
                let riesgo = 'g2';
                if (estatus === 'VISITADO' || estatus === 'COMPLETADA') riesgo = 'g1';
                else if (estatus === 'PENDIENTE' || estatus === 'SIN VISITA') riesgo = 'g2';
                else if (estatus === 'RECHAZO' || estatus === 'INCIDENCIA') riesgo = 'g3';
                else if (estatus === 'FINADO') riesgo = 'g4';

                if (riesgos.g1 && riesgo === 'g1') return true;
                if (riesgos.g2 && riesgo === 'g2') return true;
                if (riesgos.g3 && riesgo === 'g3') return true;
                if (riesgos.g4 && riesgo === 'g4') return true;
                return false;
            });
        }

        return resultado;
    }

    // ⭐ ============================================
    // ⭐ NIVELES DE RIESGO - MÉTODOS PARA BACKEND
    // ⭐ ============================================

    /**
     * Obtener todos los niveles de riesgo del backend
     */
    async cargarNivelesRiesgoDesdeBackend(): Promise<void> {
        try {
            console.log('📊 Cargando niveles de riesgo del backend...');
            const response = await firstValueFrom(
                this.http.get<any[]>(`${this.apiUrl}/pacientes/niveles-riesgo`)
            );

            if (response && Array.isArray(response)) {
                this.nivelesRiesgoCache = new Map();
                response.forEach(item => {
                    if (item.pacienteId && item.nivelRiesgo) {
                        this.nivelesRiesgoCache.set(item.pacienteId, item.nivelRiesgo);
                    }
                });
                this.nivelesRiesgoTimestamp = Date.now();
                console.log(`✅ ${this.nivelesRiesgoCache.size} niveles de riesgo cargados`);
            }
        } catch (error) {
            console.warn('⚠️ Error cargando niveles de riesgo del backend:', error);
        }
    }

    /**
     * Obtener nivel de riesgo de un paciente específico
     */
    async obtenerNivelRiesgoPaciente(pacienteId: number): Promise<string | null> {
        try {
            if (this.nivelesRiesgoCache.has(pacienteId)) {
                return this.nivelesRiesgoCache.get(pacienteId) || null;
            }

            const response = await firstValueFrom(
                this.http.get<any>(`${this.apiUrl}/pacientes/${pacienteId}/nivel-riesgo`)
            );

            if (response && response.nivelRiesgo) {
                this.nivelesRiesgoCache.set(pacienteId, response.nivelRiesgo);
                return response.nivelRiesgo;
            }
            return null;
        } catch (error) {
            console.warn(`⚠️ Error obteniendo nivel de riesgo para paciente ${pacienteId}:`, error);
            return null;
        }
    }

    /**
     * Actualizar nivel de riesgo de un paciente
     */
    async actualizarNivelRiesgo(
        pacienteId: number,
        nivelRiesgo: string | null,
        usuarioId: number = 1
    ): Promise<{ success: boolean; message: string; nivelRiesgo: string | null }> {
        try {
            const response = await firstValueFrom(
                this.http.patch<any>(`${this.apiUrl}/pacientes/${pacienteId}/nivel-riesgo`, {
                    nivelRiesgo: nivelRiesgo,
                    usuarioId: usuarioId
                })
            );

            if (response && response.success) {
                if (nivelRiesgo) {
                    this.nivelesRiesgoCache.set(pacienteId, nivelRiesgo);
                } else {
                    this.nivelesRiesgoCache.delete(pacienteId);
                }
                console.log(`✅ Nivel de riesgo actualizado para paciente ${pacienteId}: ${nivelRiesgo}`);
            }

            return response;
        } catch (error) {
            // ⭐ CORREGIDO: manejar error de tipo unknown
            const errorMessage = error instanceof Error ? error.message : 'Error al actualizar nivel de riesgo';
            console.error(`❌ Error actualizando nivel de riesgo para paciente ${pacienteId}:`, error);
            return {
                success: false,
                message: errorMessage,
                nivelRiesgo: null
            };
        }
    }

    /**
     * Obtener pacientes con nivel de riesgo incluido
     */
    async getPacientesConNivelRiesgo(idEnfermera: number = 1): Promise<any[]> {
        try {
            const response = await firstValueFrom(
                this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}/con-riesgo`)
            );
            return response || [];
        } catch (error) {
            console.error('❌ Error obteniendo pacientes con nivel de riesgo:', error);
            return [];
        }
    }

    /**
     * Notificar cambio en niveles de riesgo (para actualizar dashboard)
     */
    notificarCambioNivelesRiesgo(pacienteId: number, nivelRiesgo: string | null): void {
        window.dispatchEvent(new CustomEvent('nivelesRiesgoActualizados', {
            detail: {
                pacienteId: pacienteId,
                nivelRiesgo: nivelRiesgo,
                timestamp: new Date().toISOString()
            }
        }));
    }

    /**
     * Obtener nivel de riesgo de un paciente desde el cache (síncrono)
     */
    getNivelRiesgoFromCache(pacienteId: number): string | null {
        return this.nivelesRiesgoCache.get(pacienteId) || null;
    }
}