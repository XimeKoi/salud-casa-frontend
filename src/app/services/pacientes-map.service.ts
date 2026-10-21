// src/app/services/pacientes-map.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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
    zona?: string;
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
    private cacheEnfermeraId: number | null = null;
    private readonly NIVELES_CACHE_TTL = 30000; // 30 segundos

    constructor(private http: HttpClient) { }

    public obtenerIdEnfermeraActual(): number {
        try {
            const userStr = localStorage.getItem('userData');
            if (userStr) {
                const userObj = JSON.parse(userStr);
                return userObj.id_personal_enfermeria || userObj.id || 1;
            }
        } catch (e) { }
        return 1;
    }

    clearCache(): void {
        console.log('🧹 [PacientesMapService] Cache limpiado');
        this.cachePacientes = [];
        this.cacheTimestamp = 0;
        this.cacheEnfermeraId = null;
    }

    refreshPacientes(): void {
        console.log('🔄 [PacientesMapService] Forzando recarga de pacientes');
        this.clearCache();
    }

    setPacientesCache(pacientes: any[], idEnfermera?: number): void {
        console.log(`📦 [PacientesMapService] Cache establecido con ${pacientes?.length || 0} pacientes`);
        if (pacientes && pacientes.length > 0) {
            this.cachePacientes = this.procesarPacientes(pacientes);
            this.cacheTimestamp = Date.now();
            this.cacheEnfermeraId = idEnfermera || this.obtenerIdEnfermeraActual();
        }
    }

    getPacientes(idEnfermera?: number): Observable<PacienteMap[]> {
        const id = idEnfermera !== undefined ? idEnfermera : this.obtenerIdEnfermeraActual();
        return this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${id}`).pipe(
            map(data => this.procesarPacientes(data || []))
        );
    }

    async getPacientesEnfermera(idEnfermera?: number): Promise<any[]> {
        const id = idEnfermera !== undefined ? idEnfermera : this.obtenerIdEnfermeraActual();
        try {
            console.log(`📥 Intentando obtener pacientes de la BD para enfermera ${id}...`);
            const pacientes = await firstValueFrom(
                this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${id}`)
            );
            console.log(`📊 ${pacientes?.length || 0} pacientes obtenidos de la BD`);

            // ⭐ GUARDAR COPIA LOCAL PARA MODO SIN CONEXIÓN (OFFLINE)
            if (pacientes && Array.isArray(pacientes) && pacientes.length > 0) {
                try {
                    localStorage.setItem('cuidalia_pacientes_raw_' + id, JSON.stringify(pacientes));
                    console.log(`💾 [Offline Cache] ${pacientes.length} pacientes guardados localmente para enfermera ${id}`);
                } catch (e) {
                    console.warn('⚠️ No se pudo guardar en localStorage:', e);
                }
            }

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
            console.warn('⚠️ Sin conexión con la BD, intentando cargar pacientes desde almacenamiento local offline...', error);
            try {
                const localData = localStorage.getItem('cuidalia_pacientes_raw_' + id);
                if (localData) {
                    const parsed = JSON.parse(localData);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        console.log(`📶 [Modo Offline] Recuperados ${parsed.length} pacientes desde almacenamiento local para enfermera ${id}`);
                        return parsed;
                    }
                }
            } catch (e) {
                console.error('Error leyendo pacientes offline:', e);
            }
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

    public extraerColonia(direccion: string, coloniaOriginal?: string): string {
        const origen = (coloniaOriginal || '').trim();
        if (origen && origen.length > 2) {
            const c = origen.toUpperCase();
            if (!c.includes('DISPONIBLE') && !c.includes('SIN COLONIA') && !/^#|^\d+$/i.test(origen) && !c.startsWith('REFS')) {
                if (c.includes('ROSA')) return 'Santa Rosa de Lima';
                if (c.includes('NARANJO')) return 'Los Naranjos';
                if (c.includes('MANANTIAL')) return 'Los Manantiales';
                if (c.includes('MISION') && (c.includes('JOSE') || c.includes('JESUITA'))) return 'Misión de San José';
                if (c.includes('REAL') && c.includes('JOSE')) return 'Real San José';
                if (c.includes('CONSUELO')) return 'San José del Consuelo';
                if (c.includes('VICTORIA')) return 'Residencial Victoria';
                if (c.includes('SANTA FE')) return 'Misión de Santa Fe';
                if (c.includes('CENTRO') || c.includes('OBREGON') || c.includes('HIDALGO')) return 'Zona Centro';
                return origen.replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '').trim();
            }
        }

        if (!direccion) return 'Santa Rosa de Lima';

        let dirSinRefs = direccion;
        if (direccion.includes('|')) {
            dirSinRefs = direccion.split('|')[0].trim();
        } else if (/Refs\.?:/i.test(direccion)) {
            const idx = direccion.search(/Refs\.?:/i);
            dirSinRefs = direccion.substring(0, idx).trim();
        }

        const d = dirSinRefs.toUpperCase().trim();
        if (d.includes('ROSA')) return 'Santa Rosa de Lima';
        if (d.includes('NARANJO')) return 'Los Naranjos';
        if (d.includes('MANANTIAL')) return 'Los Manantiales';
        if (d.includes('MISION') && (d.includes('JOSE') || d.includes('JESUITA'))) return 'Misión de San José';
        if (d.includes('REAL') && d.includes('JOSE')) return 'Real San José';
        if (d.includes('CONSUELO')) return 'San José del Consuelo';
        if (d.includes('VICTORIA')) return 'Residencial Victoria';
        if (d.includes('ARBOLEDA')) return 'Arboledas de San José';
        if (d.includes('PIRUL')) return 'Los Pirules';
        if (d.includes('PRIVANZA') || d.includes('VIREO')) return 'Privanza';
        if (d.includes('CANTERA')) return 'La Cantera';
        if (d.includes('SANTA FE')) return 'Misión de Santa Fe';
        if (d.includes('SANTA CLARA')) return 'Santa Clara';
        if (d.includes('AMERICA')) return 'Américas';
        if (d.includes('CENTRO') || d.includes('OBREGON') || d.includes('HIDALGO')) return 'Zona Centro';
        if (d.includes('MORENA')) return 'Ex Hacienda la Morena';
        if (d.includes('SAN FELIPE')) return 'San Felipe de Jesús';
        if (d.includes('VIBORAS')) return 'Las Víboras';
        if (d.includes('SAN CARLOS')) return 'San Carlos';
        if (d.includes('SAN MIGUEL')) return 'San Miguel';
        if (d.includes('BEETHOVEN') || d.includes('CHOPIN') || d.includes('MOZART') || d.includes('WAGNER') || d.includes('LEON MODERNO')) return 'León Moderno';

        const matchCol = dirSinRefs.match(/(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+([^,\|]+)/i);
        if (matchCol && matchCol[1]) {
            const cand = matchCol[1].trim();
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

        const parts = limpiaDir.split(',').map(s => s.trim()).filter(Boolean);
        const numIdx = parts.findIndex(p => /^#|^\d+$/i.test(p));
        if (numIdx !== -1 && numIdx + 1 < parts.length) {
            let postNum = parts.slice(numIdx + 1);
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

        if (parts.length >= 2) {
            const ultima = parts[parts.length - 1].trim()
                .replace(/^[-\d]+,\s*/, '')
                .replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '')
                .trim();
            if (ultima.length > 2 && !/^#|^\d+$/i.test(ultima) && !/LEON|GTO/i.test(ultima)) {
                return ultima;
            }
        }

        return 'Santa Rosa de Lima';
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

    determinarZona(p: any): string {
        const dir = (p.direccion || '').toUpperCase();
        const col = (p.colonia || '').toUpperCase();
        const texto = `${col} ${dir}`.toUpperCase();

        // 1. ZONA SANTA ROSA DE LIMA
        if (texto.includes('SANTA ROSA DE LIMA') || texto.includes('SAN LAZARO') || texto.includes('SAN BENIGNO')) {
            return 'Zona Santa Rosa de Lima';
        }

        // 2. ZONA SAN JOSÉ DEL CONSUELO
        if (texto.includes('SAN JOSE DEL CONSUELO') || texto.includes('CONSUELO') ||
            texto.includes('CORRALES AYALA') || texto.includes('RAFAEL RANGEL') ||
            texto.includes('MANUEL BARANDA') || texto.includes('MANUEL BRANDA') ||
            texto.includes('OBREGON GONZALES') || texto.includes('OBREGON COLE') ||
            texto.includes('SANTO TOMAS DE AQUINO') || texto.includes('TELLEZ CRUCES') ||
            texto.includes('SAN JOSE DE CEMENTOS')) {
            return 'Zona San José del Consuelo';
        }

        // 3. ZONA MISIÓN DE SAN JOSÉ
        if (texto.includes('MISION DE SAN JOSE') || texto.includes('MIS CATEQUISTAS') ||
            texto.includes('MISION CATEQUISTA') || texto.includes('MISION EVANGELICA') ||
            texto.includes('MISION CRISTIANA') || texto.includes('MISION SANTA FE')) {
            return 'Zona Misión de San José';
        }

        // 4. ZONA REAL DE SAN JOSÉ
        if (texto.includes('REAL DE SAN JOSE') || texto.includes('VALLE DE SAN JOSE') ||
            texto.includes('ARBOLEDAS DE SAN JOSE') || texto.includes('FRAY ') ||
            texto.includes('FRAYLES') || texto.includes('VALLE CASTELLAL')) {
            return 'Zona Real de San José';
        }

        // 5. ZONA RESIDENCIAL VICTORIA
        if (texto.includes('VICTORIA') || texto.includes('RECIDENCIAL VICTORIA') ||
            texto.includes('DE LA FAMA') || texto.includes('RENTERIA')) {
            return 'Zona Residencial Victoria';
        }

        // 6. ZONA LOS NARANJOS
        if (texto.includes('NARANJO') || texto.includes('AZAHARES') || texto.includes('AZARES')) {
            return 'Zona Los Naranjos';
        }

        // 7. ZONA EL MANANTIAL
        if (texto.includes('MANANTIAL') || texto.includes('MANANTIALES')) {
            return 'Zona El Manantial';
        }

        // 8. ZONA VALLE DE SEÑORA
        if (texto.includes('VALLE DE SEÑORA') || texto.includes('VALLE DE SENORA') ||
            texto.includes('BISMUTO') || texto.includes('ACTINIO') || texto.includes('OSMIO')) {
            return 'Zona Valle de Señora';
        }

        // 9. ZONA RESIDENCIAL TABACHINES
        if (texto.includes('TABACHINES')) {
            return 'Zona Tabachines';
        }

        // 10. ZONA SAN JUAN DE DIOS
        if (texto.includes('SAN JUAN DE DIOS') || texto.includes('JUAN DE DIOS')) {
            return 'Zona San Juan de Dios';
        }

        // 11. ZONA CENTRO
        if (texto.includes('ZONA CENTRO') || texto.includes('CENTRO') || texto.includes('BARRIO DE SANTIAGO') || texto.includes('COECILLO')) {
            return 'Zona Centro';
        }

        // 12. ZONA COBERTURA METROPOLITANA
        return 'Zona Cobertura Metropolitana';
    }

    public procesarPacientes(pacientesBD: any[]): PacienteMap[] {
        const pacientesConCoords: PacienteMap[] = [];
        let conTelefono = 0;
        let sinTelefono = 0;

        for (const p of pacientesBD) {
            if (p.nombre === 'Usuario' || p.nombre?.toLowerCase().includes('prueba')) {
                continue;
            }

            const nombreCompleto = this.construirNombreCompleto(p);
            const direccion = p.direccion || '';
            const coloniaValida = p.colonia && p.colonia.length > 2 &&
                !p.colonia.toUpperCase().includes('DISPONIBLE') &&
                !p.colonia.toUpperCase().includes('SIN COLONIA') &&
                !p.colonia.toUpperCase().includes('NO DISPONIBLE') &&
                !/^#|^\d+$/i.test(p.colonia.trim()) &&
                !p.colonia.toUpperCase().startsWith('REFS');
            const colonia = coloniaValida ? p.colonia : this.extraerColonia(direccion, p.zonaTrabajo);
            const seccion = this.extraerSeccion(p.zonaTrabajo || p.seccion || '') || '277';

            let lat = p.lat ? parseFloat(p.lat) : null;
            let lng = p.lng ? parseFloat(p.lng) : null;

            let estatus = p.estatus || 'pendiente';
            const estatusUpper = estatus.toUpperCase();
            if (estatusUpper === 'RECHAZO' || estatusUpper === 'RECHAZADO') estatus = 'rechazo';
            else if (estatusUpper === 'VISITADO' || estatusUpper === 'COMPLETADO' || estatusUpper === 'COMPLETADA') estatus = 'visitado';
            else if (estatusUpper === 'PENDIENTE DE VISITA' || estatusUpper === 'SIN VISITA' || estatusUpper === 'PENDIENTE') estatus = 'pendiente';
            else if (estatusUpper === 'INCIDENCIA') estatus = 'incidencia';
            else if (estatusUpper === 'CAMBIO DE DOMICILIO') estatus = 'cambio_domicilio';
            else if (estatusUpper === 'FINADO') estatus = 'finado';

            const telefonoFijo = p.telefonoFijo || '';
            const telefonoCelular = p.telefonoCelular || '';

            let telefonoFormateado = 'No disponible';
            if (telefonoFijo && telefonoCelular) {
                telefonoFormateado = `${telefonoFijo} / ${telefonoCelular}`;
            } else if (telefonoCelular) {
                telefonoFormateado = `${telefonoCelular}`;
            } else if (telefonoFijo) {
                telefonoFormateado = `${telefonoFijo}`;
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
            const zona = this.determinarZona(p);

            pacientesConCoords.push({
                id: p.id || 0,
                nombre: nombreCompleto,
                apellidoPaterno: p.apellidoPaterno || '',
                apellidoMaterno: p.apellidoMaterno || '',
                direccion: direccion || 'Dirección no disponible',
                colonia: colonia,
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
                fechaFinado: finadoInfo.fechaFinado,
                zona: zona
            });
        }

        console.log(`✅ ${pacientesConCoords.length} pacientes procesados`);
        console.log(`📞 Con teléfono: ${conTelefono} de ${pacientesConCoords.length}`);
        console.log(`📭 Sin teléfono: ${sinTelefono} de ${pacientesConCoords.length}`);
        console.log(`🎨 Pacientes con discapacidad: ${pacientesConCoords.filter(p => p.discapacidades.motriz || p.discapacidades.visual || p.discapacidades.auditiva || p.discapacidades.intelectual || p.discapacidades.psicosocial).length}`);
        console.log(`💀 Pacientes finados: ${pacientesConCoords.filter(p => p.finado).length}`);

        return pacientesConCoords;
    }

    async getPacientesConCoordenadas(idEnfermera?: number): Promise<PacienteMap[]> {
        const id = idEnfermera !== undefined ? idEnfermera : this.obtenerIdEnfermeraActual();
        if (this.cachePacientes.length > 0 && this.cacheEnfermeraId === id && (Date.now() - this.cacheTimestamp) < this.CACHE_TTL) {
            console.log(`📦 Usando cache de pacientes (${this.cachePacientes.length} pacientes) para enfermera ${id}`);
            return this.cachePacientes;
        }

        try {
            console.log(`📥 Obteniendo pacientes para el mapa para enfermera ${id}...`);
            const pacientesBD = await this.getPacientesEnfermera(id);

            if (!pacientesBD || pacientesBD.length === 0) {
                console.warn('⚠️ No se encontraron pacientes en la BD');
                return [];
            }

            const pacientesProcesados = this.procesarPacientes(pacientesBD);

            this.cachePacientes = pacientesProcesados;
            this.cacheEnfermeraId = id;
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

    getPacientesConFiltros(idEnfermera?: number, filtros?: {
        perfiles?: { adulto?: boolean; discapacitado?: boolean; finado?: boolean };
        riesgos?: { g1?: boolean; g2?: boolean; g3?: boolean; g4?: boolean };
        zona?: string;
    }): PacienteMap[] {
        const id = idEnfermera !== undefined ? idEnfermera : this.obtenerIdEnfermeraActual();
        let pacientes = this.cachePacientes;

        if (pacientes.length === 0 || this.cacheEnfermeraId !== id) {
            this.getPacientesConCoordenadas(id);
            pacientes = this.cachePacientes;
        }

        if (!filtros) return pacientes;

        let resultado = [...pacientes];

        if (filtros.zona && filtros.zona.trim() !== '' && filtros.zona.toUpperCase() !== 'TODAS LAS ZONAS' && filtros.zona.toUpperCase() !== 'TODAS') {
            const zonaFiltro = filtros.zona.toUpperCase().trim();
            resultado = resultado.filter(p => {
                const z = (p.zona || this.determinarZona(p)).toUpperCase();
                const direccion = (p.direccion || '').toUpperCase();
                const colonia = (p.colonia || '').toUpperCase();
                return z === zonaFiltro || z.includes(zonaFiltro) || zonaFiltro.includes(z) ||
                       direccion.includes(zonaFiltro) || colonia.includes(zonaFiltro);
            });
        }

        const perfiles = filtros.perfiles || {};
        const hayFiltrosPerfil = perfiles.adulto || perfiles.discapacitado || perfiles.finado;

        if (hayFiltrosPerfil) {
            resultado = resultado.filter(p => {
                const programa = (p.programa || '').toUpperCase();
                const estatus = (p.estatus || '').toUpperCase();
                const esFinado = Boolean(p.finado || estatus === 'FINADO' || (p as any).fechaFinado);
                const esDiscapacitado = Boolean(
                    programa === 'PCD' || programa.includes('PCD') ||
                    programa === 'DISCAPACIDAD' || programa.includes('DIS') ||
                    p.discapacidades?.motriz || p.discapacidades?.visual ||
                    p.discapacidades?.auditiva || p.discapacidades?.intelectual ||
                    p.discapacidades?.psicosocial
                );
                const esAdulto = Boolean(programa === 'PAM' || programa.includes('ADULTO') || programa.includes('PAM'));

                if (perfiles.finado && esFinado) return true;
                if (perfiles.discapacitado && esDiscapacitado && !esFinado) return true;
                if (perfiles.adulto && esAdulto && !esFinado) return true;
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
    async getPacientesConNivelRiesgo(idEnfermera?: number): Promise<any[]> {
        const id = idEnfermera !== undefined ? idEnfermera : this.obtenerIdEnfermeraActual();
        try {
            const response = await firstValueFrom(
                this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${id}/con-riesgo`)
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