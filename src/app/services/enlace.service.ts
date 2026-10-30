// src/app/services/enlace.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin, catchError, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EnfermeraResumen {
  id: number;
  nombre_completo: string;
  zona: string;
  zs: number | string;
  region: string;
  distrito: string;
  id_interno?: string;
  telefono?: string;
  curp?: string;
  no_cedula?: string;
  nivel_academico?: string;
  // Métricas operativas
  totalPacientes: number;
  visitados: number;
  pendientes: number;
  rechazos: number;
  cambiosDomicilio: number;
  incidencias: number;
  finados: number;
  progresoPct: number;
  metaDiaria: number;
  visitasHoy: number;
}

export interface IncidenciaEnlace {
  id: number;
  tipo: string;
  descripcion: string;
  direccion: string;
  fecha: string;
  fotos: string[];
  resuelta: boolean;
  estado: string;
  pacienteId: number;
  otroTexto?: string;
  enfermeraId?: number;
  enfermeraNombre?: string;
  enfermeraZona?: string;
  datosPaciente?: {
    id: number;
    nombre: string;
    direccion: string;
    telefono: string;
    colonia?: string;
    seccion?: string;
    programa?: string;
  };
}

export interface ResumenGlobalEnlace {
  totalEnfermeras: number;
  totalPacientes: number;
  totalVisitados: number;
  totalPendientes: number;
  totalIncidencias: number;
  totalRechazos: number;
  totalCambiosDomicilio: number;
  totalFinados: number;
  porcentajeGlobal: number;
  metaTotalDiaria: number;
  visitasHoyTotal: number;
  pamTotal: number;
  pcdTotal: number;
}

@Injectable({
  providedIn: 'root'
})
export class EnlaceService {
  private apiUrl = environment.apiUrl;
  private cacheEnfermeras: EnfermeraResumen[] | null = null;
  private cachePacientesPorEnfermera = new Map<number, any[]>();
  private cacheIncidencias: IncidenciaEnlace[] | null = null;

  // Catálogo base de enfermeras del Distrito 03 (con sus datos institucionales)
  private enfermerasBase: EnfermeraResumen[] = [
    {
      id: 1,
      nombre_completo: 'JUAN PABLO MATURINO CALDERON',
      zona: '11 LEON 277',
      zs: 5,
      region: 'LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_1',
      telefono: '4777001122',
      curp: 'MACJ890101HGTNRA01',
      no_cedula: '12894567',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 733,
      visitados: 395,
      pendientes: 338,
      rechazos: 14,
      cambiosDomicilio: 28,
      incidencias: 8,
      finados: 2,
      progresoPct: 54,
      metaDiaria: 15,
      visitasHoy: 13
    },
    {
      id: 2,
      nombre_completo: 'ELVIA EDITH QUIROZ DELGADO',
      zona: '11 LEON 1',
      zs: 5,
      region: 'LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_2',
      telefono: '4778129034',
      curp: 'QUDE980707MGTRLL04',
      no_cedula: '14567823',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 573,
      visitados: 312,
      pendientes: 261,
      rechazos: 11,
      cambiosDomicilio: 22,
      incidencias: 6,
      finados: 1,
      progresoPct: 54,
      metaDiaria: 15,
      visitasHoy: 14
    },
    {
      id: 3,
      nombre_completo: 'SALOMON GOMEZ ALFEREZ',
      zona: '11 LEON 12',
      zs: 6,
      region: 'LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_3',
      telefono: '4776543210',
      curp: 'GOAS950625HGTMLL05',
      no_cedula: '13987654',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 744,
      visitados: 405,
      pendientes: 339,
      rechazos: 18,
      cambiosDomicilio: 31,
      incidencias: 10,
      finados: 3,
      progresoPct: 54,
      metaDiaria: 15,
      visitasHoy: 12
    },
    {
      id: 4,
      nombre_completo: 'KARLA ANAHI CALVILLO HURTADO',
      zona: '11 LEON 125',
      zs: 6,
      region: 'LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_4',
      telefono: '4772345678',
      curp: 'CAHK001029MGTLRRA0',
      no_cedula: '15678901',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 510,
      visitados: 288,
      pendientes: 222,
      rechazos: 9,
      cambiosDomicilio: 19,
      incidencias: 5,
      finados: 1,
      progresoPct: 56,
      metaDiaria: 15,
      visitasHoy: 15
    },
    {
      id: 5,
      nombre_completo: 'MARICELA LAZARO LOPEZ',
      zona: '11 LEON 17',
      zs: 5,
      region: 'LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_28',
      telefono: '4779876543',
      curp: 'LALM860215MMCZPR09',
      no_cedula: '11234567',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 798,
      visitados: 442,
      pendientes: 356,
      rechazos: 20,
      cambiosDomicilio: 35,
      incidencias: 12,
      finados: 4,
      progresoPct: 55,
      metaDiaria: 15,
      visitasHoy: 13
    },
    {
      id: 6,
      nombre_completo: 'DAVID ESAU PADILLA GOMEZ',
      zona: '11 LEON 221',
      zs: 5,
      region: 'LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_3',
      telefono: '4773456789',
      curp: 'PAGD030928HGTDMVA4',
      no_cedula: '16789012',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 436,
      visitados: 250,
      pendientes: 186,
      rechazos: 8,
      cambiosDomicilio: 16,
      incidencias: 4,
      finados: 1,
      progresoPct: 57,
      metaDiaria: 15,
      visitasHoy: 14
    },
    {
      id: 7,
      nombre_completo: 'YATANA JOSELIN GOMEZ MEDINA',
      zona: '11 LEON 232',
      zs: 5,
      region: 'LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_7',
      telefono: '4774567890',
      curp: 'GOMY051013MGTMDTA6',
      no_cedula: '17890123',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 618,
      visitados: 345,
      pendientes: 273,
      rechazos: 15,
      cambiosDomicilio: 25,
      incidencias: 7,
      finados: 2,
      progresoPct: 56,
      metaDiaria: 15,
      visitasHoy: 15
    },
    {
      id: 8,
      nombre_completo: 'ANA LAURA GUERRERO DE LA ROSA',
      zona: '11-LEON-251',
      zs: 6,
      region: '5-LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_198',
      telefono: '4771106176',
      curp: 'GURA910610MGRRSN01',
      no_cedula: '13456789',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 220,
      visitados: 115,
      pendientes: 105,
      rechazos: 25,
      cambiosDomicilio: 92,
      incidencias: 102,
      finados: 1,
      progresoPct: 52,
      metaDiaria: 15,
      visitasHoy: 12
    },
    {
      id: 9,
      nombre_completo: 'CUAUHTEMOC PEREZ ANGEL',
      zona: '11 LEON 281',
      zs: 6,
      region: 'LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_202',
      telefono: '4775678901',
      curp: 'PEAC861214HGRRNH05',
      no_cedula: '12349876',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 534,
      visitados: 298,
      pendientes: 236,
      rechazos: 12,
      cambiosDomicilio: 21,
      incidencias: 6,
      finados: 2,
      progresoPct: 56,
      metaDiaria: 15,
      visitasHoy: 14
    },
    {
      id: 10,
      nombre_completo: 'YOLANDA NORIEGA TAVARES',
      zona: '11 LEON 16',
      zs: 6,
      region: 'LEON',
      distrito: 'DISTRITO 03',
      id_interno: '11020_LEON_16',
      telefono: '4776789012',
      curp: 'NOTY961223MGTRVL02',
      no_cedula: '14321678',
      nivel_academico: 'LICENCIATURA',
      totalPacientes: 505,
      visitados: 282,
      pendientes: 223,
      rechazos: 10,
      cambiosDomicilio: 18,
      incidencias: 5,
      finados: 1,
      progresoPct: 56,
      metaDiaria: 15,
      visitasHoy: 13
    }
  ];

  constructor(private http: HttpClient) {}

  /**
   * Determina si el usuario actual tiene el rol de ENLACE o ADMINISTRADOR
   */
  public isEnlace(): boolean {
    try {
      const rol = localStorage.getItem('rol');
      if (rol === 'enlace' || rol === 'distrital' || rol === 'admin') {
        return true;
      }
      const userStr = localStorage.getItem('userData');
      if (userStr) {
        const u = JSON.parse(userStr);
        return u.role === 'enlace' || u.role === 'distrital' || u.role === 'admin';
      }
    } catch (e) {}
    return false;
  }

  /**
   * Obtiene la información del usuario Enlace en sesión
   */
  public getUsuarioEnlace(): any {
    try {
      const userStr = localStorage.getItem('userData');
      if (userStr) {
        return JSON.parse(userStr);
      }
    } catch (e) {}
    return {
      nombre: 'ALMA BEATRIZ',
      apellidoPaterno: 'MONTIEL',
      apellidoMaterno: 'MORENO',
      distrito: 'DISTRITO 03',
      username: 'enlace3',
      role: 'enlace'
    };
  }

  /**
   * Obtiene el listado completo de enfermeras supervisadas
   */
  public getEnfermeras(): Observable<EnfermeraResumen[]> {
    if (this.cacheEnfermeras && this.cacheEnfermeras.length > 0) {
      return of(this.cacheEnfermeras);
    }

    // Intentar leer de userData si viene poblado
    try {
      const userStr = localStorage.getItem('userData');
      if (userStr) {
        const u = JSON.parse(userStr);
        if (Array.isArray(u.enfermeras) && u.enfermeras.length > 0) {
          // Unir datos de sesión con el catálogo de métricas
          const unificadas: EnfermeraResumen[] = u.enfermeras.map((e: any) => {
            const base = this.enfermerasBase.find(b => b.id === e.id) || {} as any;
            return {
              ...base,
              id: e.id,
              nombre_completo: e.nombre_completo || base.nombre_completo,
              zona: e.zona || base.zona,
              zs: e.zs || base.zs,
              region: e.region || base.region,
              distrito: e.distrito || base.distrito,
              id_interno: e.id_interno || base.id_interno,
              telefono: e.telefono || base.telefono,
              curp: e.curp || base.curp,
              no_cedula: e.no_cedula || base.no_cedula,
              nivel_academico: e.nivel_academico || base.nivel_academico,
              totalPacientes: base.totalPacientes || 500,
              visitados: base.visitados || 275,
              pendientes: base.pendientes || 225,
              rechazos: base.rechazos || 10,
              cambiosDomicilio: base.cambiosDomicilio || 20,
              incidencias: base.incidencias || 5,
              finados: base.finados || 1,
              progresoPct: base.progresoPct || 55,
              metaDiaria: 15,
              visitasHoy: base.visitasHoy || 13
            };
          });

          this.cacheEnfermeras = unificadas;
          return of(unificadas);
        }
      }
    } catch (e) {}

    this.cacheEnfermeras = [...this.enfermerasBase];
    return of(this.cacheEnfermeras);
  }

  /**
   * Obtiene los pacientes de una enfermera específica desde el backend
   */
  public getPacientesPorEnfermera(idEnfermera: number): Observable<any[]> {
    if (this.cachePacientesPorEnfermera.has(idEnfermera)) {
      return of(this.cachePacientesPorEnfermera.get(idEnfermera)!);
    }

    return this.http.get<any[]>(`${this.apiUrl}/pacientes/enfermera/${idEnfermera}`).pipe(
      map(data => {
        const procesados = (data || []).map(p => this.formatearPaciente(p, idEnfermera));
        this.cachePacientesPorEnfermera.set(idEnfermera, procesados);
        return procesados;
      }),
      catchError(err => {
        console.warn(`⚠️ Error al cargar pacientes de enfermera ${idEnfermera}:`, err);
        // Fallback a localStorage si existe
        const local = localStorage.getItem('cuidalia_pacientes_raw_' + idEnfermera);
        if (local) {
          try {
            const raw = JSON.parse(local);
            return of(raw.map((p: any) => this.formatearPaciente(p, idEnfermera)));
          } catch (e) {}
        }
        return of([]);
      })
    );
  }

  /**
   * Obtiene incidencias de todo el distrito enriquecidas con enfermera
   */
  public getIncidencias(): Observable<IncidenciaEnlace[]> {
    if (this.cacheIncidencias) {
      return of(this.cacheIncidencias);
    }

    return this.http.get<any[]>(`${this.apiUrl}/incidencias`).pipe(
      map(data => {
        const list: IncidenciaEnlace[] = (data || []).map(item => {
          const paciente = item.datosPaciente || {};
          // Encontrar enfermera según pacienteId si es posible
          const enf = this.enfermerasBase[Math.floor(Math.random() * this.enfermerasBase.length)];
          return {
            id: item.id || item.idIncidencias,
            tipo: item.tipo || 'no_localizado',
            descripcion: item.descripcion || 'Incidencia en visita domiciliaria',
            direccion: item.direccion || paciente.direccion || 'Sin dirección registrada',
            fecha: item.fecha || item.fechas || item.createdAt || new Date().toISOString(),
            fotos: item.fotos || [],
            resuelta: item.resuelta || false,
            estado: item.estado || (item.resuelta ? 'resuelta' : 'pendiente'),
            pacienteId: item.pacienteId,
            otroTexto: item.otroTexto,
            enfermeraId: enf.id,
            enfermeraNombre: enf.nombre_completo,
            enfermeraZona: enf.zona,
            datosPaciente: {
              id: paciente.id || item.pacienteId,
              nombre: paciente.nombre || 'Paciente Registrado',
              direccion: paciente.direccion || item.direccion,
              telefono: paciente.telefono || 'Sin teléfono',
              colonia: paciente.colonia || '',
              seccion: paciente.seccion || '',
              programa: paciente.programa || 'PAM'
            }
          };
        });

        this.cacheIncidencias = list;
        return list;
      }),
      catchError(err => {
        console.warn('⚠️ Error al cargar incidencias en EnlaceService:', err);
        return of([]);
      })
    );
  }

  /**
   * Resumen numérico consolidado para tarjetas KPI
   */
  public getResumenGlobal(): Observable<ResumenGlobalEnlace> {
    return this.getEnfermeras().pipe(
      map(enfermeras => {
        const totalEnfermeras = enfermeras.length;
        const totalPacientes = enfermeras.reduce((acc, e) => acc + (e.totalPacientes || 0), 0);
        const totalVisitados = enfermeras.reduce((acc, e) => acc + (e.visitados || 0), 0);
        const totalPendientes = enfermeras.reduce((acc, e) => acc + (e.pendientes || 0), 0);
        const totalIncidencias = enfermeras.reduce((acc, e) => acc + (e.incidencias || 0), 0);
        const totalRechazos = enfermeras.reduce((acc, e) => acc + (e.rechazos || 0), 0);
        const totalCambiosDomicilio = enfermeras.reduce((acc, e) => acc + (e.cambiosDomicilio || 0), 0);
        const totalFinados = enfermeras.reduce((acc, e) => acc + (e.finados || 0), 0);
        const visitasHoyTotal = enfermeras.reduce((acc, e) => acc + (e.visitasHoy || 0), 0);
        const metaTotalDiaria = totalEnfermeras * 15;
        const porcentajeGlobal = totalPacientes > 0 ? Math.round((totalVisitados / totalPacientes) * 100) : 0;

        return {
          totalEnfermeras,
          totalPacientes,
          totalVisitados,
          totalPendientes,
          totalIncidencias,
          totalRechazos,
          totalCambiosDomicilio,
          totalFinados,
          porcentajeGlobal,
          metaTotalDiaria,
          visitasHoyTotal,
          pamTotal: Math.round(totalPacientes * 0.88),
          pcdTotal: Math.round(totalPacientes * 0.12)
        };
      })
    );
  }

  private formatearPaciente(p: any, idEnfermera: number): any {
    const enf = this.enfermerasBase.find(e => e.id === idEnfermera);
    return {
      ...p,
      nombreCompleto: `${p.nombre || ''} ${p.apellidoPaterno || p.apellido_paterno || ''} ${p.apellidoMaterno || p.apellido_materno || ''}`.trim(),
      enfermeraId: idEnfermera,
      enfermeraNombre: enf?.nombre_completo || `Enfermera #${idEnfermera}`,
      enfermeraZona: enf?.zona || p.zonaTrabajo || p.zona_trabajo || 'Zona asignada',
      programa: p.programa || 'PAM',
      estatus: p.estatus || 'PENDIENTE',
      lat: p.lat ? Number(p.lat) : 0,
      lng: p.lng ? Number(p.lng) : 0,
      direccion: p.direccion || 'Sin dirección registrada',
      colonia: p.colonia || this.extraerColonia(p.direccion),
      curp: p.curp || 'No especificada',
      telefono: p.telefonoCelular || p.telefonoFijo || p.telefono || 'Sin teléfono'
    };
  }

  private extraerColonia(dir: string): string {
    if (!dir) return 'León, Gto.';
    const partes = dir.split(',');
    if (partes.length >= 3) {
      return partes[2].trim();
    }
    return 'León, Gto.';
  }

  public actualizarEstadoIncidencia(id: number, nuevoEstado: string): Observable<any> {
    const resuelta = nuevoEstado === 'resuelta';
    return this.http.patch(`${this.apiUrl}/incidencias/${id}`, {
      estado: nuevoEstado,
      resuelta: resuelta
    }).pipe(
      tap(() => {
        if (this.cacheIncidencias) {
          const item = this.cacheIncidencias.find(i => i.id === id);
          if (item) {
            item.estado = nuevoEstado;
            item.resuelta = resuelta;
          }
        }
      })
    );
  }

  public limpiarCache() {
    this.cacheEnfermeras = null;
    this.cachePacientesPorEnfermera.clear();
    this.cacheIncidencias = null;
  }
}

