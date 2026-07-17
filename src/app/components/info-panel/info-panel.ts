// src/app/components/info-panel/info-panel.ts

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { AppState } from '../../store/app.state';
import * as AppActions from '../../store/app.actions';
import { PacientesMapService, PacienteMap } from '../../services/pacientes-map.service';
import { DistritoService } from '../../services/distrito.service';
import { MapService } from '../../services/map.service';
import * as L from 'leaflet';

declare const Toastify: any;

@Component({
  selector: 'app-info-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './info-panel.html',
  styleUrls: ['./info-panel.scss']
})
export class InfoPanelComponent implements OnInit, OnDestroy {

  // ⭐ MANTENER 'referido' PARA EL STORE, PERO AGREGAR 'finado'
  perfiles = {
    adulto: false,
    discapacitado: false,
    referido: false,  // ⭐ MANTENER PARA EL STORE
    finado: false     // ⭐ NUEVO PARA EL FILTRO
  };

  riesgosSeleccionados = {
    g1: false,
    g2: false,
    g3: false,
    g4: false
  };

  zonaSeleccionada: string = '';

  currentData = {
    total: 0,
    visitas: 0,
    p: { a: 0, d: 0, f: 0 },
    g: { g1: 0, g2: 0, g3: 0, g4: 0 }
  };

  filteredData = {
    total: 0,
    visitas: 0,
    p: { a: 0, d: 0, f: 0 },
    g: { g1: 0, g2: 0, g3: 0, g4: 0 }
  };

  private pacientes: PacienteMap[] = [];
  private pacientesFiltrados: PacienteMap[] = [];
  private pacientesOriginales: PacienteMap[] = [];
  private subscriptions: Subscription[] = [];
  private loading: boolean = false;

  private coloresPerfiles = {
    adulto: '#2e7d32',
    discapacitado: '#7B1FA2',
    finado: '#c62828'
  };

  private coloresRiesgos = {
    g1: '#4CAF50',
    g2: '#FFC107',
    g3: '#FF9800',
    g4: '#D32F2F'
  };

  private coloresEstatus: { [key: string]: string } = {
    'VISITADO': '#2e7d32',
    'COMPLETADA': '#2e7d32',
    'PENDIENTE': '#FFC107',
    'SIN VISITA': '#FFC107',
    'RECHAZO': '#D32F2F',
    'INCIDENCIA': '#D32F2F',
    'FINADO': '#6c757d'
  };

  private colorDefault: string = '#1976d2';

  constructor(
    private store: Store<{ app: AppState }>,
    private pacientesMapService: PacientesMapService,
    private distritoService: DistritoService,
    private mapService: MapService
  ) { }

  ngOnInit() {
    this.subscriptions.push(
      this.store.select(state => state.app.manzanaSeleccionada).subscribe(zona => {
        this.zonaSeleccionada = zona || '';
        this.aplicarFiltros();
      })
    );

    this.cargarPacientesYCalcular();
  }

  // src/app/components/info-panel/info-panel.ts
  // ⭐ SOLO LAS PARTES MODIFICADAS

  // ⭐ REEMPLAZAR EL MÉTODO cargarPacientesYCalcular
  async cargarPacientesYCalcular() {
    this.loading = true;
    try {
      const distrito = this.distritoService.getDistritoActual();
      const pacientes = await this.pacientesMapService.getPacientesConCoordenadas(distrito.idEnfermera);

      this.pacientes = pacientes;
      this.pacientesOriginales = [...this.pacientes];

      console.log('📊 Pacientes cargados (TODOS):', this.pacientes.length);

      // ⭐ LOG PARA VER PACIENTES CON DISCAPACIDAD
      const discapacitados = this.pacientes.filter(p =>
        p.discapacidades?.motriz || p.discapacidades?.visual ||
        p.discapacidades?.auditiva || p.discapacidades?.intelectual ||
        p.discapacidades?.psicosocial
      );
      console.log('🎨 Pacientes con discapacidad:', discapacitados.length);
      console.log('🎨 Detalle:', discapacitados.map(p => ({
        nombre: p.nombre,
        discapacidades: p.discapacidades,
        programa: p.programa
      })));

      // ⭐ LOG PARA VER PACIENTES FINADOS
      const finados = this.pacientes.filter(p => p.finado);
      console.log('💀 Pacientes finados:', finados.length);
      console.log('💀 Detalle:', finados.map(p => ({ nombre: p.nombre, finado: p.finado })));

      this.calcularDatosGenerales();

      setTimeout(() => {
        this.aplicarFiltros();
      }, 500);
    } catch (error) {
      console.error('Error cargando pacientes:', error);
    } finally {
      this.loading = false;
    }
  }

  // ⭐ REEMPLAZAR EL MÉTODO asignarPerfil
  private asignarPerfil(paciente: PacienteMap): string | null {
    const programa = (paciente.programa || '').toUpperCase();
    const estatus = (paciente.estatus || '').toUpperCase();

    // ⭐ VERIFICAR SI ES ADULTO MAYOR
    if (programa === 'PAM' || programa.includes('ADULTO')) return 'adulto';

    // ⭐ VERIFICAR SI ES DISCAPACITADO (usando los campos extraídos)
    const tieneDiscapacidad = paciente.discapacidades?.motriz ||
      paciente.discapacidades?.visual ||
      paciente.discapacidades?.auditiva ||
      paciente.discapacidades?.intelectual ||
      paciente.discapacidades?.psicosocial;

    if (tieneDiscapacidad || programa === 'DISCAPACIDAD' || programa.includes('DIS')) {
      return 'discapacitado';
    }

    // ⭐ VERIFICAR SI ES FINADO
    if (paciente.finado || estatus === 'FINADO') {
      return 'finado';
    }

    return null;
  }

  // ⭐ REEMPLAZAR EL MÉTODO aplicarFiltros para usar el servicio
  private aplicarFiltros() {
    console.log('🔍 Aplicando filtros...');

    // ⭐ USAR EL SERVICIO PARA OBTENER PACIENTES FILTRADOS
    const distrito = this.distritoService.getDistritoActual();
    const filtros = {
      perfiles: {
        adulto: this.perfiles.adulto,
        discapacitado: this.perfiles.discapacitado,
        finado: this.perfiles.finado
      },
      riesgos: {
        g1: this.riesgosSeleccionados.g1,
        g2: this.riesgosSeleccionados.g2,
        g3: this.riesgosSeleccionados.g3,
        g4: this.riesgosSeleccionados.g4
      },
      zona: this.zonaSeleccionada
    };

    // ⭐ OBTENER PACIENTES FILTRADOS DIRECTAMENTE DEL SERVICIO
    this.pacientesFiltrados = this.pacientesMapService.getPacientesConFiltros(
      distrito.idEnfermera,
      filtros
    );

    console.log(`📊 Total filtrados: ${this.pacientesFiltrados.length} de ${this.pacientesOriginales.length}`);

    // ⭐ CALCULAR DATOS FILTRADOS
    this.calcularDatosFiltrados();

    // ⭐ ENVIAR AL STORE
    this.store.dispatch(AppActions.setFiltrosPerfiles({
      perfiles: {
        adulto: this.perfiles.adulto,
        discapacitado: this.perfiles.discapacitado,
        referido: false
      }
    }));

    this.store.dispatch(AppActions.setFiltrosRiesgos({
      riesgos: { ...this.riesgosSeleccionados }
    }));

    this.actualizarMapaConFiltros();
  }

  private calcularDatosGenerales() {
    if (!this.pacientes || this.pacientes.length === 0) return;

    const total = this.pacientes.length;

    const visitas = this.pacientes.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'VISITADO' || estatus === 'COMPLETADA';
    }).length;

    const adultoMayor = this.pacientes.filter(p => {
      const programa = (p.programa || '').toUpperCase();
      return programa === 'PAM' || programa.includes('ADULTO');
    }).length;

    const discapacitado = this.pacientes.filter(p => {
      const programa = (p.programa || '').toUpperCase();
      return programa === 'DISCAPACIDAD' || programa.includes('DIS');
    }).length;

    const finado = this.pacientes.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'FINADO';
    }).length;

    const pAdulto = total > 0 ? Math.round((adultoMayor / total) * 100) : 0;
    const pDiscapacitado = total > 0 ? Math.round((discapacitado / total) * 100) : 0;
    const pFinado = total > 0 ? Math.round((finado / total) * 100) : 0;

    const g1 = this.pacientes.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'VISITADO' || estatus === 'COMPLETADA';
    }).length;

    const g2 = this.pacientes.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'PENDIENTE' || estatus === 'SIN VISITA';
    }).length;

    const g3 = this.pacientes.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'RECHAZO' || estatus === 'INCIDENCIA';
    }).length;

    const g4 = this.pacientes.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'FINADO';
    }).length;

    this.currentData = {
      total: total,
      visitas: visitas,
      p: { a: pAdulto, d: pDiscapacitado, f: pFinado },
      g: { g1, g2, g3, g4 }
    };
  }



  private asignarRiesgo(paciente: PacienteMap): string {
    const estatus = (paciente.estatus || '').toUpperCase();
    if (estatus === 'VISITADO' || estatus === 'COMPLETADA') return 'g1';
    if (estatus === 'PENDIENTE' || estatus === 'SIN VISITA') return 'g2';
    if (estatus === 'RECHAZO' || estatus === 'INCIDENCIA') return 'g3';
    if (estatus === 'FINADO') return 'g4';
    return 'g2';
  }

  private obtenerColorPaciente(paciente: PacienteMap): string {
    const hayFiltrosPerfil = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado;
    const hayFiltrosRiesgo = this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4;

    if (hayFiltrosPerfil) {
      const perfil = this.asignarPerfil(paciente);
      if (perfil === 'adulto' && this.perfiles.adulto) return this.coloresPerfiles.adulto;
      if (perfil === 'discapacitado' && this.perfiles.discapacitado) return this.coloresPerfiles.discapacitado;
      if (perfil === 'finado' && this.perfiles.finado) return this.coloresPerfiles.finado;
    }

    if (hayFiltrosRiesgo) {
      const riesgo = this.asignarRiesgo(paciente);
      if (this.riesgosSeleccionados.g1 && riesgo === 'g1') return this.coloresRiesgos.g1;
      if (this.riesgosSeleccionados.g2 && riesgo === 'g2') return this.coloresRiesgos.g2;
      if (this.riesgosSeleccionados.g3 && riesgo === 'g3') return this.coloresRiesgos.g3;
      if (this.riesgosSeleccionados.g4 && riesgo === 'g4') return this.coloresRiesgos.g4;
    }

    const estatus = (paciente.estatus || '').toUpperCase();
    if (this.coloresEstatus[estatus]) {
      return this.coloresEstatus[estatus];
    }

    return this.colorDefault;
  }



  private actualizarMapaConFiltros() {
    const map = this.mapService.getMap();

    if (!map) {
      console.warn('⚠️ Mapa no disponible en el servicio');
      setTimeout(() => {
        this.actualizarMapaConFiltros();
      }, 500);
      return;
    }

    if (!map.getContainer()) {
      console.warn('⚠️ Contenedor del mapa no disponible');
      setTimeout(() => {
        this.actualizarMapaConFiltros();
      }, 500);
      return;
    }

    console.log('🗺️ Mapa disponible, aplicando filtros...');
    this.limpiarMarcadoresDelMapa(map);

    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';

    if (!hayFiltros) {
      console.log('📭 No hay filtros activos - mostrando TODOS los pacientes');
      this.agregarMarcadoresAlMapa(map, this.pacientesOriginales);
      try {
        const bounds = this.obtenerBounds(this.pacientesOriginales);
        if (bounds && bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50] });
          console.log('🔍 Zoom restaurado a vista completa');
        }
      } catch (e) {
        console.warn('No se pudo ajustar el mapa');
      }
      return;
    }

    if (this.pacientesFiltrados.length > 0) {
      console.log(`🗺️ ${this.pacientesFiltrados.length} pacientes filtrados - aplicando zoom...`);
      this.agregarMarcadoresAlMapa(map, this.pacientesFiltrados);

      try {
        const bounds = this.obtenerBounds(this.pacientesFiltrados);
        if (bounds && bounds.isValid()) {
          map.fitBounds(bounds, {
            padding: [80, 80],
            maxZoom: 16
          });
          console.log(`🔍 Zoom aplicado a ${this.pacientesFiltrados.length} pacientes`);
          this.mostrarToast(
            'Filtro aplicado',
            `${this.pacientesFiltrados.length} paciente(s) encontrado(s)`,
            'success'
          );
        } else {
          console.warn('⚠️ No se pudieron obtener bounds para los filtrados');
        }
      } catch (e) {
        console.warn('No se pudo ajustar el mapa a los filtrados:', e);
      }
    } else {
      console.log('📭 No hay pacientes que coincidan con los filtros');
      this.mostrarToast('Sin resultados', 'No hay pacientes que coincidan con los filtros seleccionados', 'warning');
      this.limpiarMarcadoresDelMapa(map);
    }
  }

  private obtenerBounds(pacientes: any[]): L.LatLngBounds | null {
    if (!pacientes || pacientes.length === 0) return null;

    const latLngs: L.LatLng[] = [];
    pacientes.forEach(p => {
      if (p.lat && p.lng && p.lat !== 0 && p.lng !== 0) {
        latLngs.push(L.latLng(p.lat, p.lng));
      }
    });

    if (latLngs.length === 0) {
      console.warn('⚠️ No hay coordenadas válidas en los pacientes filtrados');
      return null;
    }

    console.log(`📍 ${latLngs.length} coordenadas válidas para bounds`);

    try {
      const bounds = L.latLngBounds(latLngs);
      if (bounds.isValid()) {
        return bounds;
      }
      return null;
    } catch (e) {
      console.warn('Error creando bounds:', e);
      return null;
    }
  }

  private limpiarMarcadoresDelMapa(map: L.Map) {
    map.eachLayer((layer: any) => {
      if (layer instanceof L.MarkerClusterGroup) {
        map.removeLayer(layer);
      }
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });
    console.log('🧹 Marcadores del mapa limpiados');
  }

  private agregarMarcadoresAlMapa(map: L.Map, pacientes: PacienteMap[]) {
    if (pacientes.length === 0) return;

    const clusterGroup = (L as any).markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function (cluster: any) {
        const childCount = cluster.getChildCount();
        let color = '#701f2f';
        let size = 40;

        if (childCount < 10) {
          color = '#2e7d32';
          size = 35;
        } else if (childCount < 30) {
          color = '#e67e22';
          size = 40;
        } else if (childCount < 100) {
          color = '#c62828';
          size = 45;
        } else {
          color = '#701f2f';
          size = 50;
        }

        return L.divIcon({
          html: `<div style="background: ${color}; width: ${size}px; height: ${size}px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: ${size > 40 ? 16 : 14}px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
            ${childCount}
          </div>`,
          className: 'marker-cluster',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        });
      }
    });

    pacientes.forEach((paciente) => {
      if (!paciente.lat || !paciente.lng || paciente.lat === 0 || paciente.lng === 0) {
        return;
      }

      const color = this.obtenerColorPaciente(paciente);

      let icon = 'fa-user';
      const estatusLower = (paciente.estatus || '').toLowerCase();

      if (estatusLower === 'pendiente' || estatusLower === 'sin visita') {
        icon = 'fa-clock';
      } else if (estatusLower === 'visitado' || estatusLower === 'completada') {
        icon = 'fa-check-circle';
      } else if (estatusLower === 'rechazo' || estatusLower === 'incidencia') {
        icon = 'fa-exclamation-triangle';
      } else if (estatusLower === 'finado') {
        icon = 'fa-skull';
      }

      const markerIcon = L.divIcon({
        html: `<div style="
          background: ${color};
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 12px;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: transform 0.2s;
        ">
          <i class="fas ${icon}"></i>
        </div>`,
        className: 'custom-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -14]
      });

      const marker = L.marker([paciente.lat, paciente.lng], { icon: markerIcon })
        .bindPopup(`
          <div style="font-family: 'Montserrat', sans-serif; max-width: 280px; min-width: 240px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 2px solid #f0ece8;">
              <div style="width: 35px; height: 35px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; flex-shrink: 0;">
                <i class="fas fa-user"></i>
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-weight: 700; font-size: 13px; color: #701f2f; line-height: 1.2;">${paciente.nombre || 'Nombre no disponible'}</div>
                <div style="font-size: 10px; color: #999;">
                  ${paciente.programa || 'Sin programa'} ${paciente.seccion ? '· Sec: ' + paciente.seccion : ''}
                </div>
                <div style="font-size: 9px; color: ${color}; font-weight: 600; margin-top: 2px;">
                  <i class="fas fa-map-pin"></i> ${paciente.colonia || 'Sin colonia'}
                </div>
              </div>
            </div>
            <div style="font-size: 12px; color: #333; line-height: 1.6;">
              <div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 2px;">
                <i class="fas fa-map-marker-alt" style="color: #701f2f; width: 14px; margin-top: 2px; flex-shrink: 0; font-size: 11px;"></i>
                <span style="word-break: break-word; font-size: 11px;">${paciente.direccion || 'Dirección no disponible'}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <i class="fas fa-phone" style="color: #701f2f; width: 14px; flex-shrink: 0; font-size: 11px;"></i>
                <span style="font-size: 11px;">${paciente.telefono || 'Teléfono no disponible'}</span>
              </div>
            </div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #f0ece8;">
              <span style="display: inline-block; background: ${(paciente.estatus || '').toLowerCase() === 'pendiente' ? '#fff3e0' : (paciente.estatus || '').toLowerCase() === 'visitado' ? '#e8f5e9' : (paciente.estatus || '').toLowerCase() === 'rechazo' ? '#ffebee' : '#f0ece8'}; color: ${(paciente.estatus || '').toLowerCase() === 'pendiente' ? '#e67e22' : (paciente.estatus || '').toLowerCase() === 'visitado' ? '#2e7d32' : (paciente.estatus || '').toLowerCase() === 'rechazo' ? '#c62828' : '#6c757d'}; padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: 700;">
                <i class="fas ${(paciente.estatus || '').toLowerCase() === 'pendiente' ? 'fa-clock' : (paciente.estatus || '').toLowerCase() === 'visitado' ? 'fa-check-circle' : (paciente.estatus || '').toLowerCase() === 'rechazo' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                ${paciente.estatus || 'Pendiente'}
              </span>
              <span style="margin-left: 8px; font-size: 10px; color: #999;">ID: ${paciente.id || 'N/A'}</span>
            </div>
          </div>
        `, {
          maxWidth: 300,
          minWidth: 240,
          className: 'paciente-popup'
        });

      clusterGroup.addLayer(marker);
    });

    clusterGroup.addTo(map);

    try {
      map.fitBounds(clusterGroup.getBounds(), { padding: [50, 50] });
    } catch (e) {
      console.warn('No se pudo ajustar el mapa a los marcadores');
    }
  }

  private calcularDatosFiltrados() {
    const total = this.pacientesFiltrados.length;
    const visitas = this.pacientesFiltrados.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'VISITADO' || estatus === 'COMPLETADA';
    }).length;

    const adultoMayor = this.pacientesFiltrados.filter(p => {
      const programa = (p.programa || '').toUpperCase();
      return programa === 'PAM' || programa.includes('ADULTO');
    }).length;

    const discapacitado = this.pacientesFiltrados.filter(p => {
      const programa = (p.programa || '').toUpperCase();
      return programa === 'DISCAPACIDAD' || programa.includes('DIS');
    }).length;

    const finado = this.pacientesFiltrados.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'FINADO';
    }).length;

    const pAdulto = total > 0 ? Math.round((adultoMayor / total) * 100) : 0;
    const pDiscapacitado = total > 0 ? Math.round((discapacitado / total) * 100) : 0;
    const pFinado = total > 0 ? Math.round((finado / total) * 100) : 0;

    const g1 = this.pacientesFiltrados.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'VISITADO' || estatus === 'COMPLETADA';
    }).length;

    const g2 = this.pacientesFiltrados.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'PENDIENTE' || estatus === 'SIN VISITA';
    }).length;

    const g3 = this.pacientesFiltrados.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'RECHAZO' || estatus === 'INCIDENCIA';
    }).length;

    const g4 = this.pacientesFiltrados.filter(p => {
      const estatus = (p.estatus || '').toUpperCase();
      return estatus === 'FINADO';
    }).length;

    this.filteredData = {
      total: total,
      visitas: visitas,
      p: { a: pAdulto, d: pDiscapacitado, f: pFinado },
      g: { g1, g2, g3, g4 }
    };
  }

  obtenerPctRiesgo(valor: number): number {
    const total = this.filteredData.g.g1 + this.filteredData.g.g2 + this.filteredData.g.g3 + this.filteredData.g.g4;
    return total > 0 ? Math.round((valor / total) * 100) : 0;
  }

  togglePerfil(perfil: string) {
    if (perfil === 'adulto') {
      this.perfiles.adulto = !this.perfiles.adulto;
    } else if (perfil === 'discapacitado') {
      this.perfiles.discapacitado = !this.perfiles.discapacitado;
    } else if (perfil === 'finado') {
      this.perfiles.finado = !this.perfiles.finado;
    }
    this.aplicarFiltros();
  }

  toggleRiesgo(riesgo: string) {
    if (riesgo === 'g1') {
      this.riesgosSeleccionados.g1 = !this.riesgosSeleccionados.g1;
    } else if (riesgo === 'g2') {
      this.riesgosSeleccionados.g2 = !this.riesgosSeleccionados.g2;
    } else if (riesgo === 'g3') {
      this.riesgosSeleccionados.g3 = !this.riesgosSeleccionados.g3;
    } else if (riesgo === 'g4') {
      this.riesgosSeleccionados.g4 = !this.riesgosSeleccionados.g4;
    }
    this.aplicarFiltros();
  }

  toggleRiesgoChip(riesgo: string) {
    this.toggleRiesgo(riesgo);
  }

  get totalAsignados(): number {
    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';
    return hayFiltros ? this.filteredData.total : this.currentData.total;
  }

  get visitasHechas(): number {
    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';
    return hayFiltros ? this.filteredData.visitas : this.currentData.visitas;
  }

  get pendientes(): number {
    return this.totalAsignados - this.visitasHechas;
  }

  get perfilAdulto(): number {
    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';
    return hayFiltros ? this.filteredData.p.a : this.currentData.p.a;
  }

  get perfilDiscapacitado(): number {
    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';
    return hayFiltros ? this.filteredData.p.d : this.currentData.p.d;
  }

  get perfilFinado(): number {
    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';
    return hayFiltros ? this.filteredData.p.f : this.currentData.p.f;
  }

  get riesgoG1(): number {
    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';
    return hayFiltros ? this.filteredData.g.g1 : this.currentData.g.g1;
  }

  get riesgoG2(): number {
    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';
    return hayFiltros ? this.filteredData.g.g2 : this.currentData.g.g2;
  }

  get riesgoG3(): number {
    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';
    return hayFiltros ? this.filteredData.g.g3 : this.currentData.g.g3;
  }

  get riesgoG4(): number {
    const hayFiltros = this.perfiles.adulto || this.perfiles.discapacitado || this.perfiles.finado ||
      this.riesgosSeleccionados.g1 || this.riesgosSeleccionados.g2 ||
      this.riesgosSeleccionados.g3 || this.riesgosSeleccionados.g4 ||
      this.zonaSeleccionada !== '';
    return hayFiltros ? this.filteredData.g.g4 : this.currentData.g.g4;
  }

  get pctRiesgoG1(): number {
    return this.obtenerPctRiesgo(this.riesgoG1);
  }

  get pctRiesgoG2(): number {
    return this.obtenerPctRiesgo(this.riesgoG2);
  }

  get pctRiesgoG3(): number {
    return this.obtenerPctRiesgo(this.riesgoG3);
  }

  get pctRiesgoG4(): number {
    return this.obtenerPctRiesgo(this.riesgoG4);
  }

  mostrarToast(titulo: string, mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'info') {
    if (typeof Toastify !== 'undefined') {
      const config = {
        success: { color: '#701f2f', bgColor: '#fdf8f6', icon: 'fa-check-circle' },
        error: { color: '#c62828', bgColor: '#ffebee', icon: 'fa-exclamation-circle' },
        info: { color: '#701f2f', bgColor: '#fefaf7', icon: 'fa-info-circle' },
        warning: { color: '#e67e22', bgColor: '#fff3e0', icon: 'fa-exclamation-triangle' }
      };
      const cfg = config[tipo];

      Toastify({
        text: titulo,
        duration: 3000,
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
        className: 'custom-toast-info-panel'
      }).showToast();

      setTimeout(() => {
        const toastElement = document.querySelector('.custom-toast-info-panel') as HTMLElement;
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
              <button onclick="this.closest('.custom-toast-info-panel').remove()" style="background: none; border: none; color: #bbb; cursor: pointer; padding: 8px 12px; font-size: 16px; transition: color 0.2s;">
                <i class="fas fa-times"></i>
              </button>
            </div>
          `;
        }
      }, 50);
    } else {
      console.log(`📢 ${titulo}: ${mensaje}`);
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}