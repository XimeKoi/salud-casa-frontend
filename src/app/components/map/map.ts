// src/app/components/map/map.ts

import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { AppState } from '../../store/app.state';
import { MapService } from '../../services/map.service';
import { DataService } from '../../services/data';
import { GeocodingService, GeocodingResult } from '../../services/geocoding.service';
import { PacientesMapService, PacienteMap } from '../../services/pacientes-map.service';
import { DistritoService, Distrito } from '../../services/distrito.service';
import * as AppActions from '../../store/app.actions';
import {
  selectManzanaSeleccionada,
  selectFiltrosPerfiles,
  selectFiltrosRiesgos
} from '../../store/app.selectors';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import Swal from 'sweetalert2';
import { Router } from '@angular/router';
import { CalendarioService, VisitaData } from '../../services/calendario.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

declare const Toastify: any;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map.html',
  styleUrl: './map.scss'
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  isLoading = false;
  loaderText = 'Cargando capa GeoJSON…';

  searchQuery: string = '';
  isSearching: boolean = false;
  searchResults: any[] = [];
  currentZoom: number = 14;
  centerLat: number = 21.1165;
  centerLng: number = -101.6865;
  private searchMarker: L.Marker | null = null;

  pacientes: PacienteMap[] = [];
  loadingPacientes: boolean = false;
  marcadoresPacientes: L.Marker[] = [];

  distritoActual: Distrito | null = null;
  private distritoSubscription: any;

  seccionesPermitidas: string[] = ['277'];
  private mapInicializado: boolean = false;

  filtrosPerfiles = { adulto: false, discapacitado: false, referido: false, finado: false };
  filtrosRiesgos = { g1: false, g2: false, g3: false, g4: false };

  mostrarModalPaciente: boolean = false;
  pacienteGuardando: boolean = false;
  capaManzanaSeleccionada: L.Circle | null = null;
  ultimaManzanaSeleccionada: any = null;
  coordsPacientesFiltrados: L.LatLng[] = [];
  nuevoPaciente: any = {
    apellidoPaterno: '',
    apellidoMaterno: '',
    nombre: '',
    curp: '',
    telefonoFijo: '',
    telefonoCelular: '',
    estatus: 'PENDIENTE',
    programa: 'PAM',
    direccion: '',
    colonia: '',
    calle: '',
    numero: '',
    cp: '',
    lat: null,
    lng: null
  };

  public coloresManzanas: { [key: string]: string } = {};
  private coloresDisponibles = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#FF8A5C', '#A29BFE', '#FD79A8', '#00B894',
    '#E17055', '#6C5CE7', '#FDCB6E', '#00CEC9', '#E84393',
    '#0984E3', '#F8A5C2', '#74B9FF', '#55EFC4', '#FDCB6E'
  ];

  public manzanasDisponibles: string[] = [];
  public manzanaFiltro: string = '';

  private subscriptions: any[] = [];
  private clusterGroup: any = null;
  private map: L.Map | null = null;

  private coloresEstatus: { [key: string]: string } = {
    'VISITADO': '#2e7d32',
    'COMPLETADA': '#2e7d32',
    'PENDIENTE': '#FFC107',
    'SIN VISITA': '#FFC107',
    'RECHAZO': '#D32F2F',
    'INCIDENCIA': '#D32F2F',
    'FINADO': '#6c757d'
  };

  private colorDefault: string = '#6c5ce7';
  private pacientesOriginal: any[] = [];
  private _eventListener: ((event: any) => void) | null = null;
  private _incidenciaListener: ((event: any) => void) | null = null;

  private apiUrl = environment.apiUrl;
  private idEnfermera: number = 1;
  private datosCargados: boolean = false;

  private toastTimeout: any = null;
  private toastIdCounter: number = 0;
  private busquedaEnProgreso: boolean = false;

  constructor(
    private store: Store<{ app: AppState }>,
    private mapService: MapService,
    private dataService: DataService,
    private geocodingService: GeocodingService,
    private pacientesMapService: PacientesMapService,
    private distritoService: DistritoService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private router: Router,
    private calendarioService: CalendarioService,
    private http: HttpClient
  ) {
    console.log('🏗️ [MapComponent] Constructor ejecutado');
    console.log('🌍 [MapComponent] API URL:', this.apiUrl);
  }

  cargarPacientesDirectamente(forceRefresh: boolean = false) {
    if (this.loadingPacientes) return;

    console.log('🔄 [MapComponent] Cargando pacientes...');
    this.loadingPacientes = true;

    if (forceRefresh) {
      this.pacientesMapService.refreshPacientes();
    }

    this.searchQuery = '';
    this.isSearching = false;
    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    this.http.get(`${this.apiUrl}/pacientes/enfermera/${this.idEnfermera}`).subscribe({
      next: (data: any) => {
        console.log('✅ Pacientes recibidos:', data?.length || 0);
        this.pacientesMapService.setPacientesCache(data);

        const pacientesConCoords = data.filter((p: any) =>
          p.lat && p.lng && p.lat !== 0 && p.lng !== 0
        );

        this.pacientes = pacientesConCoords;
        this.pacientesOriginal = [...pacientesConCoords];

        const zonasSet = new Set<string>();
        data.forEach((p: any) => {
          let colonia = p.colonia || this.extraerColonia(p.direccion);
          if (colonia && colonia.length > 2) {
            colonia = colonia.toUpperCase().trim();
            zonasSet.add(colonia);
          }
        });

        if (zonasSet.size === 0) {
          zonasSet.add('TODAS LAS ZONAS');
        }

        const todasLasZonas = Array.from(zonasSet).sort();
        this.manzanasDisponibles = todasLasZonas;

        this.coloresManzanas = {};
        this.manzanasDisponibles.forEach((zona, index) => {
          const color = this.coloresDisponibles[index % this.coloresDisponibles.length];
          this.coloresManzanas[zona] = color;
        });

        this.store.dispatch(AppActions.setColoresManzanas({
          colores: this.coloresManzanas
        }));

        this.store.dispatch(AppActions.setManzanasDisponibles({
          manzanas: this.manzanasDisponibles
        }));

        this.loadingPacientes = false;
        this.datosCargados = true;

        if (this.mapInicializado) {
          console.log('🔄 Forzando recreación de marcadores...');
          this.limpiarMarcadoresPacientes();
          this.agregarMarcadoresPacientes();
        }

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ Error cargando pacientes:', error);
        this.loadingPacientes = false;
        this.mostrarToast('Error', 'No se pudieron cargar los pacientes', 'error');
        this.cdr.detectChanges();
      }
    });
  }

  ngOnInit() {
    console.log('🔄 [MapComponent] ngOnInit');
    this.limpiarSeleccionZona();
    this.cargarPacientesDirectamente();

    window.addEventListener('recargarMapa', (event: any) => {
      console.log('🔄 Recargando mapa desde evento...');
      this.cargarPacientesDirectamente(true);
    });

    window.addEventListener('abrirModalRegistrarPaciente', (event: any) => {
      this.ngZone.run(() => {
        const d = event.detail || {};
        this.abrirModalPaciente(d.lat, d.lng, d.direccion, d.calle, d.numero, d.colonia, d.cp);
      });
    });

    window.addEventListener('seleccionarManzana', (event: any) => {
      if (event.detail) {
        this.activarColoniaEnMapa(event.detail);
      }
    });

    window.addEventListener('limpiarManzanaSeleccionada', () => {
      this.limpiarCapaManzana();
    });

    this.subscriptions.push(
      this.store.select(state => state.app.filtrosPerfiles).subscribe(filtros => {
        if (filtros) {
          this.filtrosPerfiles = { ...this.filtrosPerfiles, ...filtros };
          this.aplicarFiltrosYEnfocar();
        }
      }),
      this.store.select(state => state.app.filtrosRiesgos).subscribe(filtros => {
        if (filtros) {
          this.filtrosRiesgos = { ...this.filtrosRiesgos, ...filtros };
          this.aplicarFiltrosYEnfocar();
        }
      })
    );
  }

  ngAfterViewInit() {
    console.log('👀 [MapComponent] ngAfterViewInit');
    setTimeout(() => {
      this.inicializarMapa();
      setTimeout(() => {
        if (this.map && this.pacientes.length > 0) {
          console.log('🔄 Forzando recreación de marcadores en afterViewInit...');
          this.limpiarMarcadoresPacientes();
          this.agregarMarcadoresPacientes();
        }
      }, 800);
    }, 300);
  }

  ngOnDestroy() {
    console.log('💀 [MapComponent] ngOnDestroy');
    if (this.distritoSubscription) {
      this.distritoSubscription.unsubscribe();
    }
    this.subscriptions.forEach((sub: any) => {
      if (sub && sub.unsubscribe) {
        sub.unsubscribe();
      }
    });
    if (this._eventListener) {
      window.removeEventListener('agregarAlCalendario', this._eventListener);
      this._eventListener = null;
    }
    if (this._incidenciaListener) {
      window.removeEventListener('reportarIncidencia', this._incidenciaListener);
      this._incidenciaListener = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.mapService.clearMap();
    }
    this.mapInicializado = false;
    window.removeEventListener('recargarMapa', () => { });

    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }
  }

  limpiarSeleccionZona() {
    this.store.dispatch(AppActions.setManzanaSeleccionada({ manzana: '' }));
    this.manzanaFiltro = '';
    this.cdr.detectChanges();
  }

  private inicializarMapa() {
    if (this.map) {
      console.log('🗺️ Mapa ya inicializado');
      return;
    }

    const mapElement = document.getElementById('leafletMap');
    if (!mapElement) {
      console.error('❌ Elemento #leafletMap no encontrado');
      setTimeout(() => this.inicializarMapa(), 500);
      return;
    }

    try {
      console.log('🗺️ Inicializando mapa...');

      this.map = L.map('leafletMap', {
        center: [this.centerLat, this.centerLng],
        zoom: this.currentZoom,
        zoomControl: true,
        fadeAnimation: true,
        zoomAnimation: true,
        attributionControl: true
      });

      this.mapService.setMap(this.map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(this.map);

      if (typeof (L as any).markerClusterGroup === 'function') {
        this.clusterGroup = (L as any).markerClusterGroup({
          maxClusterRadius: 40,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          zoomToBoundsOnClick: true,
          iconCreateFunction: (cluster: any) => {
            const childCount = cluster.getChildCount();
            let color = '#6c5ce7';
            let size = 40;

            if (childCount < 10) {
              color = '#00b894';
              size = 35;
            } else if (childCount < 30) {
              color = '#fdcb6e';
              size = 40;
            } else if (childCount < 100) {
              color = '#e17055';
              size = 45;
            } else {
              color = '#6c5ce7';
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

        this.clusterGroup.addTo(this.map);
        this.mapInicializado = true;
        console.log('✅ Mapa inicializado correctamente');
      } else {
        console.warn('⚠️ markerClusterGroup no disponible, usando marcadores sin cluster');
        this.mapInicializado = true;
      }

      this.map.on('moveend', () => {
        const center = this.map?.getCenter();
        if (center) {
          this.centerLat = center.lat;
          this.centerLng = center.lng;
          this.currentZoom = this.map?.getZoom() || 13;
          this.cdr.detectChanges();
        }
      });

      this.map.on('zoomend', () => {
        this.currentZoom = this.map?.getZoom() || 13;
        this.cdr.detectChanges();
      });

      this.map.on('click', () => {
        this.store.dispatch(AppActions.setManzanaSeleccionada({ manzana: '' }));
      });

      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize();
          const center = this.map.getCenter();
          this.centerLat = center.lat;
          this.centerLng = center.lng;
          this.currentZoom = this.map.getZoom();
          this.cdr.detectChanges();
        }
      }, 200);

      if (this.pacientes && this.pacientes.length > 0) {
        this.agregarMarcadoresPacientes();
      }

    } catch (error: any) {
      console.error('❌ Error al inicializar el mapa:', error);
      this.mostrarToast('Error', 'Error al inicializar el mapa', 'error');
    }
  }

  recargarMapaPorDistrito() {
    if (this.distritoActual && this.map) {
      this.map.setView([this.distritoActual.lat, this.distritoActual.lng], this.distritoActual.zoom);
      this.cargarPacientesDirectamente(true);
    }
  }

  private extraerColonia(direccion: string): string {
    if (!direccion) return '';
    let partes = direccion.split('|');
    if (partes.length >= 2) {
      let colonia = partes[1].trim();
      if (colonia.length > 2) return colonia;
    }
    partes = direccion.split(',');
    if (partes.length >= 2) {
      let colonia = partes[1].trim();
      if (colonia.length > 2) return colonia;
    }
    return '';
  }

  recargarPacientes() {
    console.log('🔄 Recargando pacientes...');
    this.searchQuery = '';
    this.isSearching = false;
    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }
    this.datosCargados = false;
    this.limpiarMarcadoresPacientes();
    this.cargarPacientesDirectamente(true);
  }

  actualizarPacientes() {
    this.cargarPacientesDirectamente(true);
  }

  // ⭐ ACTIVAR COLONIA Y DIBUJAR CÍRCULO
  activarColoniaEnMapa(detail: any) {
    if (!this.map || !this.mapInicializado) {
      console.warn('⚠️ Mapa no disponible para activar colonia');
      return;
    }

    const pacientes = detail.pacientes || [];
    const color = detail.color || '#9F2241';
    const nombre = detail.nombre || detail.colonia || 'Colonia';

    const pacientesConCoords = pacientes.filter((p: any) =>
      p.lat && p.lng && p.lat !== 0 && p.lng !== 0
    );

    if (pacientesConCoords.length === 0) {
      console.warn(`⚠️ La colonia "${nombre}" no tiene coordenadas válidas`);
      return;
    }

    if (this.capaManzanaSeleccionada) {
      try {
        this.map?.removeLayer(this.capaManzanaSeleccionada);
      } catch (e) { }
      this.capaManzanaSeleccionada = null;
    }

    this.ultimaManzanaSeleccionada = detail;
    this.pacientes = pacientesConCoords;
    this.agregarMarcadoresPacientes(false);

    const latLngs = pacientesConCoords.map((p: any) => L.latLng(p.lat, p.lng));
    const bounds = L.latLngBounds(latLngs);
    const center = bounds.getCenter();

    let maxDist = 0;
    latLngs.forEach((latLng: L.LatLng) => {
      const dist = center.distanceTo(latLng);
      if (dist > maxDist) maxDist = dist;
    });

    const radius = Math.max(80, maxDist + 45);

    this.capaManzanaSeleccionada = L.circle(center, {
      radius: radius,
      color: color,
      fillColor: color,
      fillOpacity: 0.14,
      weight: 3,
      dashArray: '6, 6'
    });

    this.capaManzanaSeleccionada.bindTooltip(`<b>${nombre}</b><br>${pacientesConCoords.length} pacientes`, {
      permanent: false,
      direction: 'top',
      className: 'manzana-popup'
    });

    this.capaManzanaSeleccionada.addTo(this.map);

    if (typeof (this.capaManzanaSeleccionada as any).bringToBack === 'function') {
      (this.capaManzanaSeleccionada as any).bringToBack();
    }

    if (this.hayFiltrosActivos() && this.coordsPacientesFiltrados.length > 0) {
      if (this.coordsPacientesFiltrados.length === 1) {
        this.map.setView(this.coordsPacientesFiltrados[0], 17, { animate: true });
      } else {
        const b = L.latLngBounds(this.coordsPacientesFiltrados);
        if (b.isValid()) {
          this.map.fitBounds(b, { padding: [60, 60], maxZoom: 18, animate: true });
        }
      }
    } else {
      const circleBounds = this.capaManzanaSeleccionada.getBounds();
      if (circleBounds && circleBounds.isValid()) {
        this.map.fitBounds(circleBounds, { padding: [45, 45], maxZoom: 16, animate: true });
      }
    }
  }

  limpiarCapaManzana() {
    if (this.capaManzanaSeleccionada) {
      try {
        this.map?.removeLayer(this.capaManzanaSeleccionada);
      } catch (e) { }
      this.capaManzanaSeleccionada = null;
    }
    this.ultimaManzanaSeleccionada = null;
  }

  aplicarFiltrosYEnfocar() {
    if (!this.map || !this.mapInicializado) return;

    if (this.ultimaManzanaSeleccionada && this.ultimaManzanaSeleccionada.pacientes) {
      this.pacientes = this.ultimaManzanaSeleccionada.pacientes.filter((p: any) =>
        p.lat && p.lng && p.lat !== 0 && p.lng !== 0
      );
    } else {
      this.pacientes = this.pacientesOriginal.filter((p: any) =>
        p.lat && p.lng && p.lat !== 0 && p.lng !== 0
      );
    }

    this.agregarMarcadoresPacientes(false);

    if (this.hayFiltrosActivos()) {
      if (this.coordsPacientesFiltrados.length === 1) {
        this.map.setView(this.coordsPacientesFiltrados[0], 17, { animate: true });
        setTimeout(() => {
          const markerMatch = this.marcadoresPacientes.find(m =>
            m.getLatLng().lat === this.coordsPacientesFiltrados[0].lat &&
            m.getLatLng().lng === this.coordsPacientesFiltrados[0].lng
          );
          if (markerMatch) markerMatch.openPopup();
        }, 350);
      } else if (this.coordsPacientesFiltrados.length > 1) {
        const bounds = L.latLngBounds(this.coordsPacientesFiltrados);
        if (bounds.isValid()) {
          this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18, animate: true });
        }
      } else {
        if (this.capaManzanaSeleccionada) {
          const circleBounds = this.capaManzanaSeleccionada.getBounds();
          if (circleBounds && circleBounds.isValid()) {
            this.map.fitBounds(circleBounds, { padding: [45, 45], maxZoom: 16, animate: true });
          }
        }
      }
    } else {
      // Sin filtros activos
      if (this.capaManzanaSeleccionada) {
        const circleBounds = this.capaManzanaSeleccionada.getBounds();
        if (circleBounds && circleBounds.isValid()) {
          this.map.fitBounds(circleBounds, { padding: [45, 45], maxZoom: 16, animate: true });
        }
      } else {
        if (this.distritoActual) {
          this.map.setView([this.distritoActual.lat, this.distritoActual.lng], this.distritoActual.zoom, { animate: true });
        } else {
          const coords = this.marcadoresPacientes.map(m => m.getLatLng());
          if (coords.length > 0) {
            const bounds = L.latLngBounds(coords);
            if (bounds.isValid()) {
              this.map.fitBounds(bounds, { padding: [60, 60], animate: true });
            }
          }
        }
      }
    }
  }

  // ⭐ BÚSQUEDA CON GEOLOCALIZACIÓN Y MODAL DE REGISTRO
  buscarDireccionConEntrecalles() {
    this.obtenerUbicacionActual();
  }

  private obtenerUbicacionActual() {
    if (!navigator.geolocation) {
      this.mostrarToast('Error', 'Tu navegador no soporta geolocalización', 'error', 3000);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        if (this.map) {
          this.map.setView([lat, lng], 17);
        }

        this.mostrarMarcadorUbicacionActual(lat, lng, accuracy);

        const direccionData = await this.obtenerDireccionDesdeCoordenadas(lat, lng);

        if (direccionData) {
          this.abrirModalGuardarPaciente(lat, lng, {
            calle: direccionData.calle || '',
            numero: direccionData.numero || '',
            colonia: direccionData.colonia || '',
            direccion: direccionData.direccionCompleta || ''
          });
        } else {
          this.abrirModalGuardarPaciente(lat, lng, null);
        }
      },
      (error) => {
        console.error('❌ Error de geolocalización:', error);
        this.mostrarToast('Error de ubicación', 'No se pudo obtener tu ubicación.', 'error', 4000);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }

  private mostrarMarcadorUbicacionActual(lat: number, lng: number, accuracy: number) {
    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
    }
    const myIcon = L.divIcon({
      html: `<div style="background: #1976d2; width: 22px; height: 22px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(25,118,210,0.6);"></div>`,
      className: 'current-pos-icon',
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
    this.searchMarker = L.marker([lat, lng], { icon: myIcon });
    if (this.map) {
      this.searchMarker.addTo(this.map);
    }
  }

  private async obtenerDireccionDesdeCoordenadas(lat: number, lng: number): Promise<any> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18&accept-language=es`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'SaludCasaApp/1.0', 'Accept-Language': 'es' }
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data && data.address) {
        const addr = data.address;
        const calle = addr.road || addr.street || addr.pedestrian || addr.footway || '';
        const numero = addr.house_number || '';
        const colonia = addr.suburb || addr.neighbourhood || addr.district || addr.quarter || '';
        const cp = addr.postcode || '';
        const ciudad = addr.city || addr.town || addr.village || addr.municipality || 'León';
        const estado = addr.state || addr.region || 'Guanajuato';
        const direccionCompleta = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        return { calle, numero, colonia, cp, ciudad, estado, direccionCompleta, displayName: data.display_name };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  abrirModalNuevoPacienteDesdeBusqueda() {
    const lat = this.searchMarker ? this.searchMarker.getLatLng().lat : this.centerLat;
    const lng = this.searchMarker ? this.searchMarker.getLatLng().lng : this.centerLng;
    this.abrirModalPaciente(lat, lng, this.searchQuery || '', this.searchQuery || '');
  }

  abrirModalGuardarPaciente(lat: number, lng: number, direccionData: any | null) {
    this.abrirModalPaciente(
      lat,
      lng,
      direccionData?.direccion || direccionData?.direccionCompleta || '',
      direccionData?.calle || '',
      direccionData?.numero || '',
      direccionData?.colonia || '',
      direccionData?.cp || ''
    );
  }

  abrirModalPaciente(lat?: number, lng?: number, direccion?: string, calle?: string, numero?: string, colonia?: string, cp?: string) {
    this.nuevoPaciente = {
      apellidoPaterno: '',
      apellidoMaterno: '',
      nombre: '',
      curp: '',
      telefonoFijo: '',
      telefonoCelular: '',
      estatus: 'PENDIENTE',
      programa: 'PAM',
      direccion: direccion || '',
      colonia: colonia || (this.distritoActual ? this.distritoActual.nombre : '') || '',
      calle: calle || direccion || '',
      numero: numero || '',
      cp: cp || '',
      lat: lat || this.centerLat,
      lng: lng || this.centerLng
    };
    this.actualizarDireccionCompleta();
    this.mostrarModalPaciente = true;
    this.cdr.detectChanges();
  }

  actualizarDireccionCompleta() {
    const partes: string[] = [];
    if (this.nuevoPaciente.calle && this.nuevoPaciente.calle.trim()) {
      let c = this.nuevoPaciente.calle.trim();
      if (this.nuevoPaciente.numero && this.nuevoPaciente.numero.trim()) {
        c += ` #${this.nuevoPaciente.numero.trim()}`;
      }
      partes.push(c);
    }
    if (this.nuevoPaciente.colonia && this.nuevoPaciente.colonia.trim()) {
      partes.push(this.nuevoPaciente.colonia.trim());
    }
    if (this.nuevoPaciente.cp && this.nuevoPaciente.cp.trim()) {
      partes.push(`CP ${this.nuevoPaciente.cp.trim()}`);
    }
    if (partes.length > 0) {
      partes.push('LEÓN, GUANAJUATO');
      this.nuevoPaciente.direccion = partes.join(', ');
    } else {
      this.nuevoPaciente.direccion = `${this.nuevoPaciente.lat?.toFixed(6) || ''}, ${this.nuevoPaciente.lng?.toFixed(6) || ''}`;
    }
    this.cdr.detectChanges();
  }

  cerrarModalPaciente() {
    this.mostrarModalPaciente = false;
    this.pacienteGuardando = false;
    this.cdr.detectChanges();
  }

  guardarPacienteDesdeModal() {
    if (!this.nuevoPaciente.nombre || !this.nuevoPaciente.nombre.trim() ||
      !this.nuevoPaciente.apellidoPaterno || !this.nuevoPaciente.apellidoPaterno.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'Campos requeridos',
        text: 'Nombre y apellido paterno son obligatorios',
        confirmButtonColor: '#7A192B'
      });
      return;
    }

    this.pacienteGuardando = true;
    this.cdr.detectChanges();

    const nombreCompleto = `${this.nuevoPaciente.nombre.trim()} ${this.nuevoPaciente.apellidoPaterno.trim()} ${(this.nuevoPaciente.apellidoMaterno || '').trim()}`.trim();
    const tel = this.nuevoPaciente.telefonoCelular || this.nuevoPaciente.telefonoFijo || '';
    const pacienteData = {
      ...this.nuevoPaciente,
      nombre: nombreCompleto,
      telefono: tel,
      idEnfermera: this.idEnfermera
    };

    this.http.post(`${this.apiUrl}/pacientes`, pacienteData).subscribe({
      next: (response: any) => {
        this.pacienteGuardando = false;
        this.cerrarModalPaciente();
        this.cargarPacientesDirectamente(true);
        Swal.fire({
          icon: 'success',
          title: '¡Paciente Guardado!',
          text: `${nombreCompleto} ha sido registrado correctamente.`,
          confirmButtonColor: '#7A192B'
        });
      },
      error: (error) => {
        console.warn('⚠️ Guardando localmente en mapa:', error);
        this.pacienteGuardando = false;

        const nuevoObj: PacienteMap = {
          id: Date.now(),
          nombre: nombreCompleto,
          apellidoPaterno: this.nuevoPaciente.apellidoPaterno || '',
          apellidoMaterno: this.nuevoPaciente.apellidoMaterno || '',
          curp: this.nuevoPaciente.curp || '',
          telefono: tel,
          telefonoFijo: this.nuevoPaciente.telefonoFijo || '',
          telefonoCelular: this.nuevoPaciente.telefonoCelular || '',
          programa: this.nuevoPaciente.programa || 'PAM',
          estatus: this.nuevoPaciente.estatus || 'PENDIENTE',
          seccion: '277',
          genero: 'M',
          direccion: this.nuevoPaciente.direccion || `${this.nuevoPaciente.calle} ${this.nuevoPaciente.numero || ''}, ${this.nuevoPaciente.colonia || ''}`,
          colonia: this.nuevoPaciente.colonia || 'SANTA ROSA DE LIMA',
          lat: Number(this.nuevoPaciente.lat || this.centerLat || 21.1165),
          lng: Number(this.nuevoPaciente.lng || this.centerLng || -101.6865),
          discapacidades: {
            motriz: false,
            visual: false,
            auditiva: false,
            intelectual: false,
            psicosocial: false
          },
          finado: this.nuevoPaciente.estatus === 'FINADO',
          fechaFinado: ''
        };

        this.pacientes.unshift(nuevoObj);
        this.agregarMarcadoresPacientes(false);
        if (this.map && nuevoObj.lat && nuevoObj.lng) {
          this.map.setView([nuevoObj.lat, nuevoObj.lng], 18, { animate: true });
        }
        this.cerrarModalPaciente();
        Swal.fire({
          icon: 'success',
          title: '¡Paciente Registrado!',
          text: `${nombreCompleto} ha sido registrado y georreferenciado en el mapa.`,
          confirmButtonColor: '#7A192B'
        });
      }
    });
  }

  abrirEnGoogleMaps(lat: number, lng: number, direccion: string) {
    if (lat && lng) {
      window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
    } else if (direccion) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`, '_blank');
    }
  }

  copiarDireccion(texto: string) {
    if (!texto) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(() => {
        this.mostrarToast('Copiado', 'Dirección copiada al portapapeles', 'success', 2000);
      }).catch(() => this.fallbackCopiarDireccion(texto));
    } else {
      this.fallbackCopiarDireccion(texto);
    }
  }

  private fallbackCopiarDireccion(texto: string) {
    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    this.mostrarToast('Copiado', 'Dirección copiada al portapapeles', 'success', 2000);
  }

  private aplicarFiltroZona() {
    if (!this.pacientesOriginal || this.pacientesOriginal.length === 0) return;

    let pacientesFiltrados = [...this.pacientesOriginal];

    if (this.manzanaFiltro && this.manzanaFiltro !== '' && this.manzanaFiltro !== 'TODAS LAS ZONAS') {
      const zonaUpper = this.manzanaFiltro.toUpperCase();
      pacientesFiltrados = pacientesFiltrados.filter((p: any) => {
        const direccion = (p.direccion || '').toUpperCase();
        const colonia = (p.colonia || '').toUpperCase();
        return direccion.includes(zonaUpper) || colonia.includes(zonaUpper);
      });
    }

    this.pacientes = pacientesFiltrados;
    this.agregarMarcadoresPacientes();

    // ⭐ ABRIR POPUP DEL PRIMER PACIENTE DE LA ZONA SELECCIONADA
    setTimeout(() => {
      this.abrirPopupDelPrimerPaciente();
    }, 800);
  }

  private actualizarMarcadoresConFiltros() {
    if (this.pacientes.length === 0) return;
    this.agregarMarcadoresPacientes();
  }

  private agregarPacienteAlCalendario(paciente: any) {
    const visitaData: VisitaData = {
      pacienteId: paciente.id,
      nombre: paciente.nombre,
      telefono: paciente.telefonoFijo || paciente.telefonoCelular || '',
      direccion: paciente.direccion || '',
      curp: paciente.curp || '',
      colonia: paciente.colonia || ''
    };

    this.calendarioService.setVisitaData(visitaData);
    this.router.navigate(['/calendario'], { queryParams: { pacienteId: paciente.id } });

    this.mostrarToast('Paciente agregado al calendario', `${paciente.nombre} listo para programar visita`, 'success', 1000);
  }

  private limpiarDireccion(direccion: string): string {
    if (!direccion) return 'Dirección no disponible';

    let limpia = direccion.replace(/\|/g, ', ');

    limpia = limpia
      .replace(/,?\s*LEON\s*,?\s*GTO\.?$/i, '')
      .replace(/,?\s*LEON\s*\|?\s*GTO\.?$/i, '')
      .replace(/\|?\s*GTO\.?$/i, '')
      .replace(/LEON\s*\|?\s*GTO\.?$/i, '')
      .replace(/LEON,\s*GTO\.?$/i, '')
      .replace(/GTO\.?$/i, '')
      .replace(/MEXICO\.?$/i, '')
      .replace(/LEON$/i, '')
      .replace(/GTO$/i, '');

    limpia = limpia
      .replace(/COL\.\s*/gi, '')
      .replace(/FRACC\.\s*/gi, '')
      .replace(/FRACCIONAMIENTO\s*/gi, '');

    limpia = limpia.replace(/CP\s*\d{5}/gi, '');

    limpia = limpia
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*,\s*/g, ', ')
      .trim();

    limpia = limpia
      .replace(/^FRAC\.?\s*/i, '')
      .replace(/^COL\.?\s*/i, '');

    if (limpia.length < 3) {
      return direccion;
    }

    return limpia;
  }

  private obtenerColonia(direccion: string, coloniaOriginal: string): string {
    if (coloniaOriginal && coloniaOriginal.length > 2 && coloniaOriginal !== 'Colonia no disponible') {
      return coloniaOriginal;
    }

    if (!direccion) return 'Sin colonia';

    let colonia = '';

    const partesPipe = direccion.split('|');
    if (partesPipe.length >= 2) {
      colonia = partesPipe[1].trim();
    }

    if (!colonia || colonia.length < 2) {
      const partesComa = direccion.split(',');
      if (partesComa.length >= 2) {
        colonia = partesComa[1].trim();
      }
    }

    if (!colonia || colonia.length < 2) {
      const matchCol = direccion.match(/COL\.?\s*([^,|]+)/i);
      if (matchCol && matchCol[1]) {
        colonia = matchCol[1].trim();
      }
    }
    if (!colonia || colonia.length < 2) {
      const matchFrac = direccion.match(/FRACC\.?\s*([^,|]+)/i);
      if (matchFrac && matchFrac[1]) {
        colonia = matchFrac[1].trim();
      }
    }

    colonia = colonia
      .replace(/COL\.\s*/gi, '')
      .replace(/FRACC\.\s*/gi, '')
      .replace(/FRACCIONAMIENTO\s*/gi, '')
      .replace(/CP\s*\d{5}/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (colonia.length > 30) {
      colonia = colonia.substring(0, 28) + '…';
    }

    if (!colonia || colonia.length < 2) {
      colonia = 'Sin colonia';
    }

    return colonia;
  }

  // ⭐⭐⭐ POPUP - GENERAR HTML CON DISEÑO PREMIUM ⭐⭐⭐
  private generarPopupHTML(paciente: any, color: string, estatusLower: string, nombreCompleto: string, direccionLimpia: string, coloniaMostrar: string): string {
    const esDiscapacidad = paciente.programa === 'DISCAPACIDAD' || paciente.programa?.includes('DIS');
    const esReferido = paciente.programa === 'REFERIDO' || paciente.programa?.includes('REF');

    let p = {
      main: '#7A192B',
      dark: '#54101D',
      badgeBg: 'rgba(255, 255, 255, 0.2)',
      badgeBorder: 'rgba(255, 255, 255, 0.3)',
      iconBg: '#FDF2F4',
      iconColor: '#7A192B'
    };

    if (esDiscapacidad) {
      p = { main: '#6B21A8', dark: '#4C1D95', badgeBg: 'rgba(255, 255, 255, 0.2)', badgeBorder: 'rgba(255, 255, 255, 0.3)', iconBg: '#FAF5FF', iconColor: '#6B21A8' };
    } else if (esReferido) {
      p = { main: '#0284C7', dark: '#0369A1', badgeBg: 'rgba(255, 255, 255, 0.2)', badgeBorder: 'rgba(255, 255, 255, 0.3)', iconBg: '#F0F9FF', iconColor: '#0284C7' };
    }

    const isFinado = estatusLower === 'finado';
    const isVisitado = estatusLower === 'visitado' || estatusLower === 'completada';
    const isRechazo = estatusLower === 'rechazo' || estatusLower === 'incidencia';

    let st = { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B', icon: 'fa-clock', text: paciente.estatus || 'Pendiente' };
    if (isVisitado) {
      st = { bg: '#DCFCE7', color: '#166534', dot: '#22C55E', icon: 'fa-check-circle', text: 'Completado' };
    } else if (isRechazo) {
      st = { bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444', icon: 'fa-triangle-exclamation', text: 'Incidencia' };
    } else if (isFinado) {
      st = { bg: '#F1F5F9', color: '#475569', dot: '#64748B', icon: 'fa-skull', text: 'Finado' };
    }

    const partesNombre = nombreCompleto.split(' ').filter(Boolean);
    let iniciales = 'CU';
    if (partesNombre.length >= 2) {
      iniciales = `${partesNombre[0][0]}${partesNombre[1][0]}`.toUpperCase();
    } else if (partesNombre.length === 1 && partesNombre[0].length >= 2) {
      iniciales = partesNombre[0].substring(0, 2).toUpperCase();
    }

    const nombreEscapado = nombreCompleto.replace(/'/g, "\\'");
    const telefonoEscapado = (paciente.telefono || '').replace(/'/g, "\\'");
    const direccionEscapada = direccionLimpia.replace(/'/g, "\\'");
    const curpEscapado = (paciente.curp || '').replace(/'/g, "\\'");
    const coloniaEscapada = coloniaMostrar.replace(/'/g, "\\'");
    const seccionEscapada = (paciente.seccion || '').replace(/'/g, "\\'");

    return `
    <div class="cuidalia-pop">
      <!-- HEADER -->
      <div class="cp-header" style="background: linear-gradient(135deg, ${p.main} 0%, ${p.dark} 100%);">
        <div class="cp-top-bar">
          <div class="cp-badges">
            <span class="cp-badge cp-badge-prog" style="background:${p.badgeBg}; border: 1px solid ${p.badgeBorder};">
              <i class="fas ${esDiscapacidad ? 'fa-wheelchair' : (esReferido ? 'fa-user-nurse' : 'fa-user-shield')}"></i>
              ${paciente.programa || 'PAM'}
            </span>
            ${paciente.seccion ? `<span class="cp-badge cp-badge-sec">Sec. ${paciente.seccion}</span>` : ''}
            ${this.hayFiltrosActivos() ? `<span class="cp-badge cp-badge-filtrado"><i class="fas fa-filter"></i> Filtrado</span>` : ''}
          </div>
          ${paciente.id ? `<span class="cp-id-tag"><i class="fas fa-hashtag"></i>${paciente.id}</span>` : ''}
        </div>

        <div class="cp-profile">
          <div class="cp-avatar">${iniciales}</div>
          <div class="cp-profile-info">
            <h4 class="cp-name" title="${nombreEscapado}">${nombreCompleto}</h4>
            <div class="cp-status-pill" style="background: ${st.bg}; color: ${st.color};">
              <span class="cp-dot" style="background: ${st.dot};"></span>
              <i class="fas ${st.icon}"></i>
              <span>${st.text}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- BODY CARDS -->
      <div class="cp-body">
        <!-- Tarjeta Ubicación -->
        <div class="cp-card">
          <div class="cp-card-icon" style="background: ${p.iconBg}; color: ${p.iconColor};">
            <i class="fas fa-location-dot"></i>
          </div>
          <div class="cp-card-details">
            <span class="cp-card-label">UBICACIÓN</span>
            <span class="cp-colonia" title="${coloniaEscapada}">${coloniaMostrar}</span>
            <span class="cp-direccion" title="${direccionEscapada}">${direccionLimpia}</span>
          </div>
        </div>

        <!-- Tarjeta Teléfono -->
        <div class="cp-card">
          <div class="cp-card-icon" style="background: ${p.iconBg}; color: ${p.iconColor};">
            <i class="fas fa-phone"></i>
          </div>
          <div class="cp-card-details">
            <span class="cp-card-label">TELÉFONO</span>
            <span class="cp-telefono">${paciente.telefono ? paciente.telefono : '<em style="color:#94a3b8; font-style:normal;">Sin número registrado</em>'}</span>
          </div>
        </div>

        ${paciente.finado ? `
        <div class="cp-finado-banner">
          <i class="fas fa-skull"></i>
          <span>Paciente finado</span>
        </div>` : ''}
      </div>

      <!-- FOOTER ACTIONS -->
      <div class="cp-footer">
        <button class="cp-btn cp-btn-agendar" style="background: linear-gradient(135deg, ${p.main} 0%, ${p.dark} 100%);"
          onclick="window.dispatchEvent(new CustomEvent('agregarAlCalendario', { detail: {
            pacienteId: ${paciente.id},
            nombre: '${nombreEscapado}',
            telefono: '${telefonoEscapado}',
            direccion: '${direccionEscapada}',
            curp: '${curpEscapado}',
            colonia: '${coloniaEscapada}'
          } }))">
          <i class="fas fa-calendar-plus"></i>
          <span>Agendar</span>
        </button>

        <button class="cp-btn cp-btn-reporte" style="color: ${p.main}; border-color: ${p.main};"
          onclick="window.dispatchEvent(new CustomEvent('reportarIncidencia', { detail: {
            pacienteId: ${paciente.id},
            nombre: '${nombreEscapado}',
            telefono: '${telefonoEscapado}',
            direccion: '${direccionEscapada}',
            curp: '${curpEscapado}',
            colonia: '${coloniaEscapada}',
            seccion: '${seccionEscapada}'
          } }))">
          <i class="fas fa-flag"></i>
          <span>Reporte</span>
        </button>
      </div>
    </div>
  `;
  }

  // ⭐⭐⭐ ABRIR POPUP DEL PRIMER PACIENTE ⭐⭐⭐
  private abrirPopupDelPrimerPaciente() {
    if (!this.map) {
      console.warn('⚠️ Mapa no disponible');
      return;
    }

    if (this.pacientes.length === 0) {
      console.warn('⚠️ No hay pacientes para mostrar');
      return;
    }

    const primero = this.pacientes[0];
    if (!primero.lat || !primero.lng) {
      console.warn('⚠️ El primer paciente no tiene coordenadas');
      return;
    }

    console.log(`🔍 Abriendo popup para: ${primero.nombre} (ID: ${primero.id})`);

    // Centrar el mapa en el primer paciente
    this.map.setView([primero.lat, primero.lng], 17);

    // Esperar a que los marcadores estén listos
    setTimeout(() => {
      let popupAbierto = false;
      let intentos = 0;
      const maxIntentos = 10;

      const intentarAbrirPopup = () => {
        if (popupAbierto || intentos >= maxIntentos) {
          if (!popupAbierto) {
            console.warn('⚠️ No se pudo abrir el popup después de varios intentos');
          }
          return;
        }

        intentos++;
        console.log(`🔍 Intento ${intentos} de ${maxIntentos} para abrir popup...`);

        // Buscar en marcadores principales
        for (const marker of this.marcadoresPacientes) {
          try {
            const popup = marker.getPopup();
            if (popup) {
              const content = popup.getContent();
              if (content && typeof content === 'string' && content.includes(`"pacienteId":${primero.id}`)) {
                marker.openPopup();
                popupAbierto = true;
                console.log(`✅ Popup abierto para: ${primero.nombre}`);
                return;
              }
            }
          } catch (e) { }
        }

        // Buscar en cluster
        if (!popupAbierto && this.clusterGroup && typeof this.clusterGroup.eachLayer === 'function') {
          try {
            this.clusterGroup.eachLayer((layer: any) => {
              if (popupAbierto) return;
              try {
                if (layer instanceof L.Marker) {
                  const popup = layer.getPopup();
                  if (popup) {
                    const content = popup.getContent();
                    if (content && typeof content === 'string' && content.includes(`"pacienteId":${primero.id}`)) {
                      layer.openPopup();
                      popupAbierto = true;
                      console.log(`✅ Popup abierto desde cluster para: ${primero.nombre}`);
                    }
                  }
                }
              } catch (e) { }
            });
          } catch (e) { }
        }

        // Fallback
        if (!popupAbierto && this.marcadoresPacientes.length > 0) {
          try {
            this.marcadoresPacientes[0].openPopup();
            popupAbierto = true;
            console.log('✅ Popup abierto (fallback)');
            return;
          } catch (e) { }
        }

        if (!popupAbierto && intentos < maxIntentos) {
          setTimeout(intentarAbrirPopup, 300);
        }
      };

      intentarAbrirPopup();

    }, 500);
  }

  // ⭐⭐⭐ AGREGAR MARCADORES DE PACIENTES ⭐⭐⭐
  agregarMarcadoresPacientes(ajustarZoom: boolean = true) {
    if (!this.map) {
      console.warn('⚠️ Mapa no inicializado');
      return;
    }

    this.limpiarMarcadoresPacientes();

    if (this.pacientes.length === 0) {
      console.warn('⚠️ No hay pacientes para mostrar');
      return;
    }

    const hayFiltrosPerfil = this.filtrosPerfiles.adulto || this.filtrosPerfiles.discapacitado || this.filtrosPerfiles.referido || (this.filtrosPerfiles as any).finado;
    const hayFiltrosRiesgo = this.filtrosRiesgos.g1 || this.filtrosRiesgos.g2 ||
      this.filtrosRiesgos.g3 || this.filtrosRiesgos.g4;
    const hayFiltros = hayFiltrosPerfil || hayFiltrosRiesgo;

    const esBusqueda = this.pacientes.length < 50;

    if (typeof (L as any).markerClusterGroup === 'function') {
      this.clusterGroup = (L as any).markerClusterGroup({
        maxClusterRadius: 40,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster: any) => {
          const childCount = cluster.getChildCount();
          let color = '#6c5ce7';
          let size = 40;

          if (childCount < 10) {
            color = '#00b894';
            size = 35;
          } else if (childCount < 30) {
            color = '#fdcb6e';
            size = 40;
          } else if (childCount < 100) {
            color = '#e17055';
            size = 45;
          } else {
            color = '#6c5ce7';
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
    } else {
      this.clusterGroup = {
        addLayer: (layer: any) => { this.map?.addLayer(layer); },
        addTo: (map: any) => { },
        getBounds: () => { return null; }
      };
    }

    let marcadoresAgregados = 0;
    const markers: L.Marker[] = [];
    this.coordsPacientesFiltrados = [];

    this.pacientes.forEach((paciente) => {
      if (!paciente.lat || !paciente.lng || paciente.lat === 0 || paciente.lng === 0) {
        return;
      }

      const color = this.obtenerColorPaciente(paciente);

      let cumpleFiltros = true;

      if (hayFiltrosPerfil) {
        const programa = (paciente.programa || '').toUpperCase();
        const estatusUpper = (paciente.estatus || '').toUpperCase();
        const esAdulto = programa === 'PAM' || programa.includes('ADULTO');
        const esDiscapacitado = programa === 'DISCAPACIDAD' || programa.includes('DIS');
        const esReferido = programa === 'REFERIDO' || programa.includes('REF');
        const esFinado = estatusUpper === 'FINADO' || Boolean(paciente.finado);

        const cumplePerfil =
          (this.filtrosPerfiles.adulto && esAdulto) ||
          (this.filtrosPerfiles.discapacitado && esDiscapacitado) ||
          (this.filtrosPerfiles.referido && esReferido) ||
          ((this.filtrosPerfiles as any).finado && esFinado);

        if (!cumplePerfil) {
          cumpleFiltros = false;
        }
      }

      if (hayFiltrosRiesgo && cumpleFiltros) {
        const estatus = (paciente.estatus || '').toUpperCase();
        const riesgo = this.asignarRiesgo(estatus);
        const cumpleRiesgo =
          (this.filtrosRiesgos.g1 && riesgo === 'g1') ||
          (this.filtrosRiesgos.g2 && riesgo === 'g2') ||
          (this.filtrosRiesgos.g3 && riesgo === 'g3') ||
          (this.filtrosRiesgos.g4 && riesgo === 'g4');

        if (!cumpleRiesgo) {
          cumpleFiltros = false;
        }
      }

      if (cumpleFiltros) {
        this.coordsPacientesFiltrados.push(L.latLng(paciente.lat, paciente.lng));
      }

      const size = esBusqueda ? 38 : 28;
      const fontSize = esBusqueda ? 18 : 12;
      const borderWidth = esBusqueda ? 4 : 3;

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
              background: ${cumpleFiltros ? color : '#cccccc'};
              width: ${size}px;
              height: ${size}px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: ${fontSize}px;
              border: ${borderWidth}px solid ${cumpleFiltros ? 'white' : '#999'};
              box-shadow: 0 2px 12px rgba(0,0,0,0.3);
              cursor: pointer;
              opacity: ${cumpleFiltros ? 1 : 0.25};
              ${!cumpleFiltros && hayFiltros ? 'filter: grayscale(0.8);' : ''}
          ">
              <i class="fas ${icon}"></i>
          </div>`,
        className: `custom-marker ${cumpleFiltros ? 'filter-active' : 'filter-inactive'}`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2)]
      });

      const nombreCompleto = paciente.nombre || 'Nombre no disponible';
      const direccionLimpia = this.limpiarDireccion(paciente.direccion || '');
      const coloniaMostrar = this.obtenerColonia(paciente.direccion || '', paciente.colonia || '');

      const popupContent = this.generarPopupHTML(paciente, color, estatusLower, nombreCompleto, direccionLimpia, coloniaMostrar);

      const marker = L.marker([paciente.lat, paciente.lng], {
        icon: markerIcon,
        zIndexOffset: cumpleFiltros ? 100 : 0
      })
        .bindPopup(popupContent, {
          maxWidth: 380,
          minWidth: 280,
          className: 'paciente-popup',
          autoPan: true,
          autoPanPadding: [20, 20]
        });

      if (this.clusterGroup && typeof this.clusterGroup.addLayer === 'function') {
        this.clusterGroup.addLayer(marker);
      } else {
        this.map?.addLayer(marker);
      }

      markers.push(marker);
      marcadoresAgregados++;
    });

    if (marcadoresAgregados > 0) {
      if (this.clusterGroup && typeof this.clusterGroup.addTo === 'function') {
        this.clusterGroup.addTo(this.map);
      }

      this.marcadoresPacientes = markers;
      console.log(`✅ ${marcadoresAgregados} marcadores agregados al mapa`);

      if (ajustarZoom) {
        try {
          if (this.clusterGroup && typeof this.clusterGroup.getBounds === 'function') {
            const bounds = this.clusterGroup.getBounds();
            if (bounds && bounds.isValid()) {
              this.map.fitBounds(bounds, { padding: [80, 80] });
            }
          }
        } catch (e) {
          console.warn('No se pudo ajustar el mapa a los marcadores');
        }
      }
    }

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
    }, 100);

    // ⭐ EVENT LISTENERS
    if (this._eventListener) {
      window.removeEventListener('agregarAlCalendario', this._eventListener);
    }

    this._eventListener = (event: any) => {
      this.ngZone.run(() => {
        const data = event.detail;
        const paciente = {
          id: data.pacienteId,
          nombre: data.nombre,
          telefonoFijo: data.telefono,
          telefonoCelular: data.telefono,
          direccion: data.direccion,
          curp: data.curp,
          colonia: data.colonia
        };
        localStorage.setItem('pacienteSeleccionado', JSON.stringify(paciente));
        this.router.navigate(['/calendario'], {
          queryParams: {
            pacienteId: paciente.id,
            abrirModal: 'true'
          }
        });
        this.mostrarToast('📅 Calendario', `Programando visita para ${paciente.nombre}`, 'success');
      });
    };

    window.addEventListener('agregarAlCalendario', this._eventListener);

    if (this._incidenciaListener) {
      window.removeEventListener('reportarIncidencia', this._incidenciaListener);
    }

    this._incidenciaListener = (event: any) => {
      this.ngZone.run(() => {
        const data = event.detail;
        const pacienteData = {
          id: data.pacienteId,
          nombre: data.nombre,
          telefono: data.telefono,
          direccion: data.direccion,
          curp: data.curp || '',
          colonia: data.colonia || '',
          seccion: data.seccion || ''
        };
        localStorage.setItem('incidenciaPaciente', JSON.stringify(pacienteData));
        this.router.navigate(['/incidencias']);
      });
    };

    window.addEventListener('reportarIncidencia', this._incidenciaListener);
  }

  limpiarMarcadoresPacientes() {
    console.log('🧹 Limpiando marcadores...');

    if (this.map) {
      this.map.closePopup();

      if (this.clusterGroup) {
        try { this.map.removeLayer(this.clusterGroup); } catch (e) { }
        this.clusterGroup = null;
      }

      this.marcadoresPacientes.forEach(marker => {
        if (this.map) {
          try { this.map.removeLayer(marker); } catch (e) { }
        }
      });

      this.map.eachLayer((layer: any) => {
        if (layer instanceof L.Marker || layer instanceof L.MarkerClusterGroup) {
          try { this.map?.removeLayer(layer); } catch (e) { }
        }
      });
    }

    this.marcadoresPacientes = [];
    this.clusterGroup = null;

    if (this._eventListener) {
      window.removeEventListener('agregarAlCalendario', this._eventListener);
      this._eventListener = null;
    }
    if (this._incidenciaListener) {
      window.removeEventListener('reportarIncidencia', this._incidenciaListener);
      this._incidenciaListener = null;
    }
  }

  private obtenerColorPaciente(paciente: any): string {
    const hayFiltrosPerfil = this.filtrosPerfiles.adulto || this.filtrosPerfiles.discapacitado || this.filtrosPerfiles.referido;
    const hayFiltrosRiesgo = this.filtrosRiesgos.g1 || this.filtrosRiesgos.g2 ||
      this.filtrosRiesgos.g3 || this.filtrosRiesgos.g4;

    if (hayFiltrosPerfil) {
      const programa = (paciente.programa || '').toUpperCase();
      if (this.filtrosPerfiles.adulto && (programa === 'PAM' || programa.includes('ADULTO'))) {
        return '#00b894';
      }
      if (this.filtrosPerfiles.discapacitado && (programa === 'DISCAPACIDAD' || programa.includes('DIS'))) {
        return '#6c5ce7';
      }
      if (this.filtrosPerfiles.referido && (programa === 'REFERIDO' || programa.includes('REF'))) {
        return '#0984e3';
      }
    }

    if (hayFiltrosRiesgo) {
      const estatus = (paciente.estatus || '').toUpperCase();
      const riesgo = this.asignarRiesgo(estatus);
      if (this.filtrosRiesgos.g1 && riesgo === 'g1') return '#00b894';
      if (this.filtrosRiesgos.g2 && riesgo === 'g2') return '#fdcb6e';
      if (this.filtrosRiesgos.g3 && riesgo === 'g3') return '#e17055';
      if (this.filtrosRiesgos.g4 && riesgo === 'g4') return '#d63031';
    }

    const estatus = (paciente.estatus || '').toUpperCase();
    if (this.coloresEstatus[estatus]) {
      return this.coloresEstatus[estatus];
    }

    return '#6c5ce7';
  }

  private asignarRiesgo(estatus: string): string {
    const e = estatus.toUpperCase();
    if (e === 'VISITADO' || e === 'COMPLETADA') return 'g1';
    if (e === 'PENDIENTE' || e === 'SIN VISITA') return 'g2';
    if (e === 'RECHAZO' || e === 'INCIDENCIA') return 'g3';
    if (e === 'FINADO') return 'g4';
    return 'g2';
  }

  // ⭐⭐⭐ BÚSQUEDA DE DIRECCIÓN ⭐⭐⭐
  buscarDireccion() {
    if (this.busquedaEnProgreso) {
      console.log('⏳ Búsqueda en progreso, ignorando nueva solicitud...');
      return;
    }

    const query = this.searchQuery?.trim();
    if (!query) {
      this.mostrarToast('Error', 'Ingresa una dirección para buscar', 'warning');
      return;
    }

    this.busquedaEnProgreso = true;
    this.isSearching = true;
    this.cdr.detectChanges();

    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    const backupOriginal = [...this.pacientesOriginal];

    this.http.get(`${this.apiUrl}/pacientes/buscar?direccion=${encodeURIComponent(query)}`).subscribe({
      next: (response: any) => {
        console.log('📦 Respuesta de búsqueda en BD:', response);

        let pacientes = response || [];
        const pacientesConCoords = pacientes.filter((p: any) =>
          p.lat && p.lng && p.lat !== 0 && p.lng !== 0
        );

        if (pacientesConCoords.length > 0) {
          this.mostrarPacientesEncontrados(pacientesConCoords, backupOriginal, query);
          this.busquedaEnProgreso = false;
          this.isSearching = false;
          this.cdr.detectChanges();
          return;
        }

        const queryUpper = query.toUpperCase();
        const locales = backupOriginal.filter((p: any) => {
          const dir = (p.direccion || '').toUpperCase();
          const colonia = (p.colonia || '').toUpperCase();
          return dir.includes(queryUpper) || colonia.includes(queryUpper);
        });

        if (locales.length > 0) {
          this.mostrarPacientesEncontrados(locales, backupOriginal, query);
          this.busquedaEnProgreso = false;
          this.isSearching = false;
          this.cdr.detectChanges();
          return;
        }

        console.log('🌍 No se encontraron pacientes, buscando ubicación con geocoding...');
        this.buscarUbicacionPorDireccion(query);

      },
      error: (error) => {
        console.error('❌ Error en búsqueda de pacientes:', error);

        const queryUpper = this.searchQuery.toUpperCase();
        const locales = backupOriginal.filter((p: any) => {
          const dir = (p.direccion || '').toUpperCase();
          const colonia = (p.colonia || '').toUpperCase();
          return dir.includes(queryUpper) || colonia.includes(queryUpper);
        });

        if (locales.length > 0) {
          this.mostrarPacientesEncontrados(locales, backupOriginal, query);
          this.busquedaEnProgreso = false;
          this.isSearching = false;
          this.cdr.detectChanges();
          return;
        }

        console.log('🌍 Buscando ubicación con geocoding (fallback)...');
        this.buscarUbicacionPorDireccion(query);
      }
    });
  }

  private mostrarPacientesEncontrados(pacientes: any[], backupOriginal: any[], query: string) {
    const idsExistentes = new Set();
    const finalPacientes: any[] = [];

    pacientes.forEach((p: any) => {
      if (!idsExistentes.has(p.id)) {
        idsExistentes.add(p.id);
        finalPacientes.push(p);
      }
    });

    console.log(`✅ Mostrando ${finalPacientes.length} pacientes encontrados`);

    this.pacientes = finalPacientes;

    const zonasSet = new Set<string>();
    finalPacientes.forEach((p: any) => {
      const colonia = p.colonia || this.extraerColonia(p.direccion);
      if (colonia && colonia.length > 2) {
        zonasSet.add(colonia.toUpperCase().trim());
      }
    });

    if (zonasSet.size > 0) {
      const nuevasZonas = Array.from(zonasSet).sort();
      this.manzanasDisponibles = nuevasZonas;

      const nuevosColores: { [key: string]: string } = {};
      nuevasZonas.forEach((zona, index) => {
        const color = this.coloresDisponibles[index % this.coloresDisponibles.length];
        nuevosColores[zona] = color;
      });
      this.coloresManzanas = nuevosColores;

      this.store.dispatch(AppActions.setColoresManzanas({ colores: nuevosColores }));
      this.store.dispatch(AppActions.setManzanasDisponibles({ manzanas: nuevasZonas }));
    }

    this.agregarMarcadoresPacientes();

    // ⭐ ABRIR POPUP AUTOMÁTICAMENTE DEL PRIMER PACIENTE ENCONTRADO
    setTimeout(() => {
      this.abrirPopupDelPrimerPaciente();
    }, 800);
  }

  private buscarUbicacionPorDireccion(query: string) {
    this.mostrarToast('Buscando ubicación', `Buscando "${query}" en el mapa...`, 'info', 1000);

    const geocodingUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=mx`;

    this.http.get(geocodingUrl).subscribe({
      next: (results: any) => {
        console.log('🌍 Resultados de geocoding:', results);

        if (results && results.length > 0) {
          const result = results[0];
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);

          if (!isNaN(lat) && !isNaN(lon)) {
            this.mostrarMarcadorUbicacion({
              lat: lat,
              lon: lon,
              display_name: result.display_name || query
            });

            this.mostrarToast('Ubicación encontrada', `📍 ${result.display_name || query}`, 'success', 3000);
            this.busquedaEnProgreso = false;
            this.isSearching = false;
            this.cdr.detectChanges();
            return;
          }
        }

        this.mostrarToast('No encontrado', `No se encontró "${query}" en el mapa`, 'warning', 3000);

        this.pacientes = [...this.pacientesOriginal];
        this.agregarMarcadoresPacientes();

        this.busquedaEnProgreso = false;
        this.isSearching = false;
        this.cdr.detectChanges();

      },
      error: (error) => {
        console.error('❌ Error en geocoding:', error);

        this.mostrarToast('Error', 'No se pudo encontrar la ubicación', 'error', 3000);

        this.pacientes = [...this.pacientesOriginal];
        this.agregarMarcadoresPacientes();

        this.busquedaEnProgreso = false;
        this.isSearching = false;
        this.cdr.detectChanges();
      }
    });
  }

  private mostrarMarcadorUbicacion(result: any) {
    if (!this.map) return;

    if (this.searchMarker) {
      try { this.map.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    const searchIcon = L.divIcon({
      html: `<div style="
        background: #7E101F;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 22px;
        border: 4px solid white;
        box-shadow: 0 0 0 6px rgba(126, 16, 31, 0.25), 0 4px 24px rgba(0,0,0,0.3);
        animation: searchPulseMarker 1.8s ease-in-out infinite;
        z-index: 9999;
        pointer-events: auto;
      ">
        <i class="fas fa-map-pin"></i>
      </div>
      <style>
        @keyframes searchPulseMarker {
          0% { transform: scale(1); box-shadow: 0 0 0 6px rgba(126, 16, 31, 0.25); }
          50% { transform: scale(1.15); box-shadow: 0 0 0 16px rgba(126, 16, 31, 0.08); }
          100% { transform: scale(1); box-shadow: 0 0 0 6px rgba(126, 16, 31, 0.25); }
        }
      </style>`,
      className: 'search-marker',
      iconSize: [48, 48],
      iconAnchor: [24, 24],
      popupAnchor: [0, -24]
    });

    const searchPopupContent = `
      <div style="
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 340px;
        min-width: 280px;
        padding: 0;
        background: #ffffff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.10);
        border: 1px solid rgba(0, 0, 0, 0.04);
        animation: ppSlideIn 0.3s ease;
      ">
        <div style="
          background: linear-gradient(135deg, #7E101F, #5B0C16);
          padding: 16px 20px;
          color: white;
          display: flex;
          align-items: center;
          gap: 12px;
        ">
          <div style="
            width: 40px;
            height: 40px;
            background: rgba(255,255,255,0.12);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            flex-shrink: 0;
            border: 1px solid rgba(255,255,255,0.10);
          ">
            <i class="fas fa-search-location"></i>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 14px; font-weight: 700;">📍 Ubicación encontrada</div>
            <div style="font-size: 11px; opacity: 0.7; line-height: 1.3;">No hay pacientes registrados aquí</div>
          </div>
        </div>

        <div style="padding: 16px 20px;">
          <div style="
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 10px 14px;
            background: #F8F7F6;
            border-radius: 10px;
            margin-bottom: 10px;
          ">
            <i class="fas fa-location-dot" style="color: #7E101F; font-size: 14px; margin-top: 2px;"></i>
            <span style="font-size: 13px; color: #333; line-height: 1.4; word-break: break-word;">
              ${result.display_name || 'Dirección no disponible'}
            </span>
          </div>

          <div style="
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: #999;
            background: #F5F5F5;
            padding: 6px 14px;
            border-radius: 8px;
          ">
            <i class="fas fa-crosshairs" style="color: #7E101F; font-size: 10px;"></i>
            <span>Lat: ${result.lat.toFixed(6)}, Lng: ${result.lon.toFixed(6)}</span>
          </div>
        </div>

        <div style="padding: 0 20px 16px 20px;">
          <button id="btnRegistrarPacienteBusqueda" style="
            width: 100%;
            padding: 11px 16px;
            background: linear-gradient(135deg, #7A192B 0%, #5E1220 100%);
            color: #ffffff;
            border: none;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            box-shadow: 0 4px 14px rgba(122, 25, 43, 0.35);
            transition: all 0.2s ease;
          ">
            <i class="fas fa-user-plus" style="color: #D4AF37; font-size: 14px;"></i>
            <span>Registrar Paciente Aquí</span>
          </button>
        </div>
      </div>
    `;

    this.searchMarker = L.marker([result.lat, result.lon], {
      icon: searchIcon,
      zIndexOffset: 10000
    })
      .bindPopup(searchPopupContent, {
        maxWidth: 340,
        className: 'search-popup',
        autoClose: false,
        closeOnClick: false
      })
      .addTo(this.map);

    setTimeout(() => {
      if (this.searchMarker) {
        this.searchMarker.openPopup();
      }
      const btn = document.getElementById('btnRegistrarPacienteBusqueda');
      if (btn) {
        btn.onclick = () => {
          this.ngZone.run(() => {
            const rawDir = result.display_name || '';
            const partes = rawDir.split(',').map((p: string) => p.trim());
            let numero = '';
            let calle = '';
            let colonia = '';
            let cp = '';

            // Detectar si el primer fragmento es un número
            if (partes.length > 0) {
              if (/^\d+$/.test(partes[0])) {
                numero = partes[0];
                calle = partes[1] || '';
                colonia = partes[2] || '';
              } else {
                calle = partes[0] || '';
                colonia = partes[1] || '';
              }
            }

            // Buscar código postal de 5 dígitos
            for (const p of partes) {
              if (/^\d{5}$/.test(p)) {
                cp = p;
                break;
              }
            }

            this.abrirModalPaciente(result.lat, result.lon, rawDir, calle, numero, colonia, cp);
          });
        };
      }
    }, 300);

    if (this.map) {
      this.map.setView([result.lat, result.lon], 16);
    }
  }


  getMap(): L.Map | null {
    return this.map;
  }

  limpiarBusqueda() {
    this.searchQuery = '';
    this.isSearching = false;
    this.busquedaEnProgreso = false;

    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    if (this.map) {
      this.map.closePopup();
    }

    if (this.pacientesOriginal && this.pacientesOriginal.length > 0) {
      this.pacientes = [...this.pacientesOriginal];

      const zonasSet = new Set<string>();
      this.pacientesOriginal.forEach((p: any) => {
        const colonia = p.colonia || this.extraerColonia(p.direccion);
        if (colonia && colonia.length > 2) {
          zonasSet.add(colonia.toUpperCase().trim());
        }
      });

      if (zonasSet.size > 0) {
        const nuevasZonas = Array.from(zonasSet).sort();
        this.manzanasDisponibles = nuevasZonas;

        const nuevosColores: { [key: string]: string } = {};
        nuevasZonas.forEach((zona, index) => {
          const color = this.coloresDisponibles[index % this.coloresDisponibles.length];
          nuevosColores[zona] = color;
        });
        this.coloresManzanas = nuevosColores;

        this.store.dispatch(AppActions.setColoresManzanas({ colores: nuevosColores }));
        this.store.dispatch(AppActions.setManzanasDisponibles({ manzanas: nuevasZonas }));
      }

      this.agregarMarcadoresPacientes();
    } else {
      this.cargarPacientesDirectamente();
    }

    this.cdr.detectChanges();
  }

  hayFiltrosActivos(): boolean {
    const hayPerfil = this.filtrosPerfiles.adulto || this.filtrosPerfiles.discapacitado || this.filtrosPerfiles.referido || (this.filtrosPerfiles as any).finado;
    const hayRiesgo = this.filtrosRiesgos.g1 || this.filtrosRiesgos.g2 || this.filtrosRiesgos.g3 || this.filtrosRiesgos.g4;
    return Boolean(hayPerfil || hayRiesgo);
  }

  mostrarToast(titulo: string, mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'info', duracion: number = 1000) {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
      this.toastTimeout = null;
    }

    const toastsAnteriores = document.querySelectorAll('.custom-toast-map');
    toastsAnteriores.forEach(el => el.remove());

    const config = {
      success: { color: '#00b894', bgColor: '#e6f5f0', icon: 'fa-check-circle' },
      error: { color: '#e17055', bgColor: '#fee8e4', icon: 'fa-exclamation-circle' },
      info: { color: '#0984e3', bgColor: '#e6f0fa', icon: 'fa-info-circle' },
      warning: { color: '#fdcb6e', bgColor: '#fff8e6', icon: 'fa-exclamation-triangle' }
    };
    const cfg = config[tipo];

    const toastId = ++this.toastIdCounter;

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
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        borderLeft: `5px solid ${cfg.color}`,
        overflow: 'hidden',
        minWidth: '320px',
        maxWidth: '450px',
        opacity: '1',
        transform: 'translateX(0)',
        transition: 'all 0.3s ease'
      },
      className: `custom-toast-map toast-${toastId}`
    }).showToast();

    this.toastTimeout = setTimeout(() => {
      const toastElement = document.querySelector(`.custom-toast-map.toast-${toastId}`) as HTMLElement;
      if (toastElement) {
        toastElement.innerHTML = `
          <div style="display: flex; align-items: stretch; gap: 0; min-height: 70px;">
            <div style="background: ${cfg.bgColor}; padding: 18px 16px; display: flex; align-items: center; justify-content: center; min-width: 60px; flex-shrink: 0;">
              <i class="fas ${cfg.icon}" style="font-size: 24px; color: ${cfg.color};"></i>
            </div>
            <div style="padding: 16px 20px 16px 16px; flex: 1; display: flex; flex-direction: column; justify-content: center;">
              <div style="font-weight: 700; font-size: 15px; color: #1a1a1a; margin-bottom: 4px; line-height: 1.2;">${titulo}</div>
              <div style="font-size: 13px; color: #555; line-height: 1.4; white-space: pre-line;">${mensaje}</div>
            </div>
            <button onclick="this.closest('.custom-toast-map').remove()" style="background: none; border: none; color: #ccc; cursor: pointer; padding: 8px 16px; font-size: 16px; transition: color 0.2s; flex-shrink: 0;">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `;

        setTimeout(() => {
          if (toastElement && toastElement.parentNode) {
            toastElement.style.opacity = '0';
            toastElement.style.transform = 'translateX(50px)';
            setTimeout(() => {
              if (toastElement.parentNode) {
                toastElement.remove();
              }
            }, 300);
          }
        }, duracion - 300);
      }
      this.toastTimeout = null;
    }, 100);
  }
}