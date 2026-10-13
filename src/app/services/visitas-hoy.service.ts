// src/app/services/visitas-hoy.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface PacientePlanHoy {
  id: number;
  nombre: string;
  curp?: string;
  direccion?: string;
  colonia?: string;
  telefono?: string;
  seccion?: string;
  lat?: number;
  lng?: number;
  riesgo?: string;
  completada: boolean;
  horaCompletada?: string;
  orden: number;
}

export interface JornadaHistorial {
  id: string; // Formato YYYY-MM-DD
  fecha: string;
  fechaTexto: string;
  totalPacientes: number;
  pacientes: PacientePlanHoy[];
  colonias: string[];
  horaGuardado?: string;
}

@Injectable({
  providedIn: 'root'
})
export class VisitasHoyService {
  private readonly STORAGE_KEY = 'cuidalia_visitas_hoy_v1';
  private readonly DATE_KEY = 'cuidalia_visitas_hoy_fecha';
  private readonly HISTORIAL_KEY = 'cuidalia_historial_jornadas_v1';

  private planSubject = new BehaviorSubject<PacientePlanHoy[]>([]);
  plan$ = this.planSubject.asObservable();

  private historialSubject = new BehaviorSubject<JornadaHistorial[]>([]);
  historial$ = this.historialSubject.asObservable();

  constructor() {
    this.cargarDesdeStorage();

    if (typeof window !== 'undefined') {
      window.addEventListener('marcarVisitaHoyCompletada', (event: any) => {
        const id = event.detail?.pacienteId || event.detail?.id;
        if (id) {
          this.marcarCompletada(Number(id));
        }
      });
    }
  }

  get planActual(): PacientePlanHoy[] {
    return this.planSubject.getValue();
  }

  get historialActual(): JornadaHistorial[] {
    return this.historialSubject.getValue();
  }

  get totalCount(): number {
    return this.planActual.length;
  }

  get completadasCount(): number {
    return this.planActual.filter(p => p.completada).length;
  }

  get pendientesCount(): number {
    return this.planActual.filter(p => !p.completada).length;
  }

  get progresoPct(): number {
    const total = this.totalCount;
    return total > 0 ? Math.round((this.completadasCount / total) * 100) : 0;
  }

  estaEnPlanHoy(id: number | string): boolean {
    if (id === null || id === undefined) return false;
    const numId = Number(id);
    if (isNaN(numId)) return false;
    return this.planActual.some(p => Number(p.id) === numId);
  }

  togglePaciente(paciente: any): boolean {
    const id = Number(paciente.id || paciente.pacienteId);
    if (isNaN(id)) return false;
    if (this.estaEnPlanHoy(id)) {
      this.removerPaciente(id);
      return false; // Removido
    } else {
      this.agregarPaciente(paciente);
      return true; // Agregado
    }
  }

  agregarPaciente(paciente: any): boolean {
    const id = Number(paciente.id || paciente.pacienteId);
    if (isNaN(id) || this.estaEnPlanHoy(id)) return false;

    const nuevo: PacientePlanHoy = {
      id: id,
      nombre: paciente.nombre || 'Paciente sin nombre',
      curp: paciente.curp || '',
      direccion: paciente.direccion || '',
      colonia: paciente.colonia || '',
      telefono: paciente.telefono || '',
      seccion: paciente.seccion || '',
      lat: paciente.lat ? Number(paciente.lat) : undefined,
      lng: paciente.lng ? Number(paciente.lng) : undefined,
      riesgo: paciente.riesgo || paciente.nivelRiesgo || 'g1',
      completada: false,
      orden: this.planActual.length + 1
    };

    const actualizado = [...this.planActual, nuevo];
    this.guardarEnStorage(actualizado);
    this.notificarCambioGlobal('agregado', nuevo);
    return true;
  }

  removerPaciente(id: number | string) {
    const numId = Number(id);
    const filtrado = this.planActual
      .filter(p => Number(p.id) !== numId)
      .map((p, idx) => ({ ...p, orden: idx + 1 }));

    this.guardarEnStorage(filtrado);
    this.notificarCambioGlobal('removido', { id: numId });
  }

  marcarCompletada(id: number | string, completada: boolean = true) {
    const numId = Number(id);
    const actualizado = this.planActual.map(p => {
      if (Number(p.id) === numId) {
        const ahora = new Date();
        const horaStr = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return {
          ...p,
          completada: completada,
          horaCompletada: completada ? horaStr : undefined
        };
      }
      return p;
    });

    this.guardarEnStorage(actualizado);
    this.notificarCambioGlobal('actualizado', { id: numId, completada });
  }

  limpiarPlanHoy() {
    this.guardarEnStorage([]);
    this.notificarCambioGlobal('limpiado', {});
  }

  // ⭐ Auto-seleccionar pacientes prioritarios (por defecto 12, meta de 12 a 15)
  autoSeleccionarPrioritarios(pacientes: any[], cantidadMax: number = 12) {
    if (!pacientes || pacientes.length === 0) return;

    // Priorizar: 1. Riesgo Crítico/Alto (G4, G3), 2. Con mayor días pendiente, 3. No visitados
    const candidatos = [...pacientes].filter(p => !this.estaEnPlanHoy(Number(p.id)));

    candidatos.sort((a, b) => {
      const pesoRiesgo: { [k: string]: number } = { g4: 4, g3: 3, g2: 2, g1: 1 };
      const rA = pesoRiesgo[(a.riesgo || a.nivelRiesgo || '').toLowerCase()] || 0;
      const rB = pesoRiesgo[(b.riesgo || b.nivelRiesgo || '').toLowerCase()] || 0;
      if (rB !== rA) return rB - rA;

      const diasA = Number(a.diasPendiente || 0);
      const diasB = Number(b.diasPendiente || 0);
      return diasB - diasA;
    });

    const elegidos = candidatos.slice(0, cantidadMax);
    elegidos.forEach(p => this.agregarPaciente(p));
  }

  // ========================================================
  // ⭐ HISTORIAL DE JORNADAS POR DÍA
  // ========================================================

  archivarJornada(fechaIso: string, lista: PacientePlanHoy[]): boolean {
    if (!lista || lista.length === 0) return false;
    try {
      const historial = this.obtenerHistorialStorage();
      const partes = fechaIso.split('-');
      const fechaObj = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
      const opciones: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      };
      const formateada = fechaObj.toLocaleDateString('es-MX', opciones);
      const fechaTexto = formateada.charAt(0).toUpperCase() + formateada.slice(1);

      const coloniasSet = new Set<string>();
      lista.forEach(p => {
        if (p.colonia && p.colonia.trim().length > 0) {
          coloniasSet.add(p.colonia.trim());
        }
      });

      const nuevaEntrada: JornadaHistorial = {
        id: fechaIso,
        fecha: fechaIso,
        fechaTexto: fechaTexto,
        totalPacientes: lista.length,
        pacientes: [...lista],
        colonias: Array.from(coloniasSet),
        horaGuardado: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      // Si ya existía una entrada para esa fecha, la actualizamos; si no, la anteponemos
      const sinFecha = historial.filter(h => h.id !== fechaIso);
      const actualizado = [nuevaEntrada, ...sinFecha].slice(0, 30); // Guardar últimos 30 días

      localStorage.setItem(this.HISTORIAL_KEY, JSON.stringify(actualizado));
      this.historialSubject.next(actualizado);
      return true;
    } catch (e) {
      console.warn('⚠️ No se pudo archivar jornada en historial:', e);
      return false;
    }
  }

  guardarJornadaActualEnHistorial(): boolean {
    if (this.totalCount === 0) return false;
    const hoyStr = new Date().toISOString().split('T')[0];
    return this.archivarJornada(hoyStr, this.planActual);
  }

  cargarRutaDesdeHistorial(jornada: JornadaHistorial) {
    if (!jornada.pacientes || jornada.pacientes.length === 0) return;
    const clonados = jornada.pacientes.map((p, idx) => ({
      ...p,
      orden: idx + 1,
      completada: false,
      horaCompletada: undefined
    }));
    this.guardarEnStorage(clonados);
    this.notificarCambioGlobal('cargado_desde_historial', clonados);
  }

  eliminarJornadaHistorial(id: string) {
    const historial = this.obtenerHistorialStorage();
    const filtrado = historial.filter(h => h.id !== id);
    try {
      localStorage.setItem(this.HISTORIAL_KEY, JSON.stringify(filtrado));
      this.historialSubject.next(filtrado);
    } catch (e) {
      console.warn('⚠️ Error al eliminar del historial:', e);
    }
  }

  private obtenerHistorialStorage(): JornadaHistorial[] {
    try {
      const guardado = localStorage.getItem(this.HISTORIAL_KEY);
      return guardado ? JSON.parse(guardado) : [];
    } catch (e) {
      return [];
    }
  }

  private notificarCambioGlobal(accion: string, detail: any) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('planHoyActualizado', {
        detail: { accion, detail, total: this.totalCount, completadas: this.completadasCount }
      }));
    }
  }

  private guardarEnStorage(lista: PacientePlanHoy[]) {
    try {
      const hoyStr = new Date().toISOString().split('T')[0];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(lista));
      localStorage.setItem(this.DATE_KEY, hoyStr);
      this.planSubject.next(lista);
    } catch (e) {
      console.warn('⚠️ No se pudo guardar plan hoy en localStorage:', e);
    }
  }

  private cargarDesdeStorage() {
    try {
      const hoyStr = new Date().toISOString().split('T')[0];
      const fechaGuardada = localStorage.getItem(this.DATE_KEY);

      // Cargar historial previo
      const historialPrevio = this.obtenerHistorialStorage();
      this.historialSubject.next(historialPrevio);

      // ⭐ Si es un nuevo día:
      // 1. Archivar la jornada de ayer si tenía pacientes
      // 2. Iniciar la lista de HOY completamente VACÍA
      if (fechaGuardada && fechaGuardada !== hoyStr) {
        console.log('📅 Nuevo día detectado (' + hoyStr + '). Archivando jornada anterior (' + fechaGuardada + ') y comenzando lista vacía.');
        const guardadoAyer = localStorage.getItem(this.STORAGE_KEY);
        if (guardadoAyer) {
          const listaAyer: PacientePlanHoy[] = JSON.parse(guardadoAyer);
          if (listaAyer && listaAyer.length > 0) {
            this.archivarJornada(fechaGuardada, listaAyer);
          }
        }
        // Iniciar hoy completamente en blanco
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
        localStorage.setItem(this.DATE_KEY, hoyStr);
        this.planSubject.next([]);
        return;
      }

      // Si es la primera vez que se usa la app hoy
      if (!fechaGuardada) {
        localStorage.setItem(this.DATE_KEY, hoyStr);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify([]));
        this.planSubject.next([]);
        return;
      }

      // Mismo día: cargar la lista activa de hoy
      const guardado = localStorage.getItem(this.STORAGE_KEY);
      if (guardado) {
        const lista: PacientePlanHoy[] = JSON.parse(guardado);
        this.planSubject.next(lista || []);
      }
    } catch (e) {
      console.warn('⚠️ Error al cargar plan hoy:', e);
      this.planSubject.next([]);
    }
  }
}
