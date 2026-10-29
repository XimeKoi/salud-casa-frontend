// src/app/components/map/map.ts

import { Component, OnInit, AfterViewInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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
import '../../../leaflet-init';
import * as L from 'leaflet';
import 'leaflet.markercluster';

// ⭐ Garantizar que Leaflet y MarkerCluster estén disponibles globalmente
if (typeof window !== 'undefined') {
  (window as any).L = (window as any).L || L;
}
import Swal from 'sweetalert2';
import { Router } from '@angular/router';
import { CalendarioService, VisitaData } from '../../services/calendario.service';
import { VisitasHoyService } from '../../services/visitas-hoy.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { timeout } from 'rxjs';

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
  obteniendoUbicacion: boolean = false;
  accuracyCircle: L.Circle | null = null;
  capaManzanaSeleccionada: L.Circle | null = null;
  capaProximidad: L.Circle | null = null;
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
    lng: null,
    estatusVital: 'vivo',
    finado: false,
    fechaFinado: '',
    numVisita: 1,
    discapacidades: {
      motriz: false,
      visual: false,
      auditiva: false,
      intelectual: false,
      psicosocial: false
    }
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
  private pacientesLayerGroup: L.FeatureGroup | null = null;
  private grupoTodasLasZonas: L.FeatureGroup | null = null;
  private map: L.Map | null = null;

  // 🏠 STREET VIEW FACHADA
  public mostrarModalStreetView: boolean = false;
  public streetViewPaciente: any = null;
  public streetViewUrl: SafeResourceUrl | null = null;
  public streetViewExternalUrl: string = '';
  private _streetViewListener: ((event: any) => void) | null = null;

  // 🗺️ CONTROL DE CAPAS ESTILO GOOGLE MAPS
  public capaActualTipo: 'estandar' | 'hibrido' | 'satelite' | 'relieve' | 'osm' = 'estandar';
  public mostrarMenuCapas: boolean = false;
  private currentTileLayer: L.TileLayer | null = null;
  private baseLayers: { [key: string]: L.TileLayer } = {};

  private coloresEstatus: { [key: string]: string } = {
    'VISITADO': '#2e7d32',
    'COMPLETADA': '#2e7d32',
    'COMPLETADO': '#2e7d32',
    'PENDIENTE': '#FFC107',
    'SIN VISITA': '#FFC107',
    'RECHAZO': '#DC2626',
    'RECHAZADO': '#DC2626',
    'INCIDENCIA': '#E65100',
    'CAMBIO DE DOMICILIO': '#8E24AA',
    'CAMBIO_DOMICILIO': '#8E24AA',
    'FINADO': '#6c757d'
  };

  private colorDefault: string = '#6c5ce7';
  private pacientesOriginal: any[] = [];
  private _eventListener: ((event: any) => void) | null = null;
  private _incidenciaListener: ((event: any) => void) | null = null;
  private _editarPacienteListener: ((event: any) => void) | null = null;
  private _toggleVisitaHoyListener: ((event: any) => void) | null = null;
  private _planHoyActualizadoListener: ((event: any) => void) | null = null;
  private _enfocarPacienteListener: ((event: any) => void) | null = null;
  private _resizeListener: (() => void) | null = null;

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
    private http: HttpClient,
    public visitasHoyService: VisitasHoyService,
    private sanitizer: DomSanitizer
  ) {
    console.log('🏗️ [MapComponent] Constructor ejecutado');
    console.log('🌍 [MapComponent] API URL:', this.apiUrl);
    try {
      const userStr = localStorage.getItem('userData');
      if (userStr) {
        const userObj = JSON.parse(userStr);
        this.idEnfermera = userObj.id_personal_enfermeria || userObj.id || 1;
      }
    } catch (e) { }

    // 🏠 EXPONER FUNCIÓN GLOBAL STREET VIEW INMEDIATAMENTE
    (window as any).__abrirStreetViewPaciente = (pacienteId: any, lat?: any, lng?: any) => {
      this.ngZone.run(() => {
        const idNum = Number(pacienteId);
        let p = this.pacientes.find((x: any) => Number(x.id) === idNum);
        if (!p && this.pacientesOriginal) {
          p = this.pacientesOriginal.find((x: any) => Number(x.id) === idNum);
        }

        let pLat = (lat !== undefined && lat !== null && lat !== 0 && lat !== '0') ? Number(lat) : (p?.lat ? Number(p.lat) : 0);
        let pLng = (lng !== undefined && lng !== null && lng !== 0 && lng !== '0') ? Number(lng) : (p?.lng ? Number(p.lng) : 0);
        let pNom = (p as any)?.nombreCompleto || p?.nombre || 'Paciente #' + idNum;
        let pDir = p?.direccion || '';
        let pCol = p?.colonia || '';

        console.log('🏠 [StreetView] Solicitado:', { idNum, pLat, pLng, pNom, pDir });
        this.abrirModalStreetView(pLat, pLng, pNom, pDir, pCol);
      });
    };
  }

  cargarPacientesDirectamente(forceRefresh: boolean = false) {
    if (this.loadingPacientes) return;

    try {
      const userStr = localStorage.getItem('userData');
      if (userStr) {
        const userObj = JSON.parse(userStr);
        this.idEnfermera = userObj.id_personal_enfermeria || userObj.id || 1;
      }
    } catch (e) { }

    console.log('🔄 [MapComponent] Cargando pacientes para enfermera:', this.idEnfermera);
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

    const cacheBuster = forceRefresh ? `?_t=${Date.now()}` : '';
    this.http.get(`${this.apiUrl}/pacientes/enfermera/${this.idEnfermera}${cacheBuster}`).subscribe({
      next: (data: any) => {
        console.log('✅ Pacientes recibidos:', data?.length || 0);
        this.pacientesMapService.setPacientesCache(data);
        if (data && Array.isArray(data) && data.length > 0) {
          try {
            localStorage.setItem('cuidalia_map_pacientes_' + this.idEnfermera, JSON.stringify(data));
          } catch (e) {}
        }

        const pacientesConCoords = data.filter((p: any) =>
          p.lat && p.lng && p.lat !== 0 && p.lng !== 0
        );

        this.pacientes = pacientesConCoords;
        this.pacientesOriginal = [...pacientesConCoords];

        const zonasSet = new Set<string>();
        data.forEach((p: any) => {
          let zona = this.determinarZona(p);
          if (zona) {
            zonasSet.add(zona);
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
          this.agregarMarcadoresPacientes(false);
          this.dibujarTodasLasZonas();
          this.enfocarZonaConMasPacientes(false);
        }

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.warn('⚠️ Error de conexión cargando pacientes en mapa, buscando en caché local...', error);
        let dataOffline = [];
        try {
          const mapCache = localStorage.getItem('cuidalia_map_pacientes_' + this.idEnfermera);
          if (mapCache) {
            dataOffline = JSON.parse(mapCache);
          } else {
            const rawCache = localStorage.getItem('cuidalia_pacientes_raw_' + this.idEnfermera);
            if (rawCache) dataOffline = JSON.parse(rawCache);
          }
        } catch (e) {}

        if (dataOffline && dataOffline.length > 0) {
          console.log(`📶 [Offline Mapa] Mostrando ${dataOffline.length} pacientes guardados localmente`);
          this.pacientesMapService.setPacientesCache(dataOffline);
          const pacientesConCoords = dataOffline.filter((p: any) =>
            p.lat && p.lng && p.lat !== 0 && p.lng !== 0
          );
          this.pacientes = pacientesConCoords;
          this.pacientesOriginal = [...pacientesConCoords];

          const zonasSet = new Set<string>();
          dataOffline.forEach((p: any) => {
            let zona = this.determinarZona(p);
            if (zona) zonasSet.add(zona);
          });
          if (zonasSet.size === 0) zonasSet.add('TODAS LAS ZONAS');
          this.manzanasDisponibles = Array.from(zonasSet).sort();

          this.coloresManzanas = {};
          this.manzanasDisponibles.forEach((zona, index) => {
            const color = this.coloresDisponibles[index % this.coloresDisponibles.length];
            this.coloresManzanas[zona] = color;
          });

          this.loadingPacientes = false;
          this.datosCargados = true;
          if (this.mapInicializado) {
            this.limpiarMarcadoresPacientes();
            this.agregarMarcadoresPacientes(false);
            this.dibujarTodasLasZonas();
            this.enfocarZonaConMasPacientes(false);
          }
          this.mostrarToast('Modo sin conexión', `Mostrando ${pacientesConCoords.length} pacientes guardados`, 'info');
          this.cdr.detectChanges();
          return;
        }

        this.loadingPacientes = false;
        this.mostrarToast('Sin conexión', 'No hay datos guardados para mostrar sin internet', 'error');
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

    window.addEventListener('filtrarPorProximidad', (event: any) => {
      if (event.detail) {
        this.activarFiltroProximidadEnMapa(event.detail);
      }
    });

    window.addEventListener('limpiarProximidad', () => {
      this.limpiarCapaProximidad();
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
          this.agregarMarcadoresPacientes(false);
          this.dibujarTodasLasZonas();
          this.enfocarZonaConMasPacientes(false);
        }
      }, 800);
    }, 300);

    this._resizeListener = () => {
      if (this.map) {
        this.map.invalidateSize();
      }
    };
    window.addEventListener('resize', this._resizeListener);
    window.addEventListener('orientationchange', this._resizeListener);
  }

  ngOnDestroy() {
    console.log('💀 [MapComponent] ngOnDestroy');
    if (this._resizeListener) {
      window.removeEventListener('resize', this._resizeListener);
      window.removeEventListener('orientationchange', this._resizeListener);
      this._resizeListener = null;
    }
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
    if (this._editarPacienteListener) {
      window.removeEventListener('editarPacientePopup', this._editarPacienteListener);
      this._editarPacienteListener = null;
    }
    if (this.grupoTodasLasZonas) {
      try { this.map?.removeLayer(this.grupoTodasLasZonas); } catch (e) { }
      this.grupoTodasLasZonas = null;
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

    if ((mapElement as any)._leaflet_id) {
      (mapElement as any)._leaflet_id = null;
    }

    try {
      console.log('🗺️ Inicializando mapa...');

      this.map = L.map('leafletMap', {
        center: [this.centerLat, this.centerLng],
        zoom: this.currentZoom,
        minZoom: 3,
        maxZoom: 20,
        zoomControl: true,
        fadeAnimation: true,
        zoomAnimation: true,
        attributionControl: true,
        preferCanvas: true
      });

      this.mapService.setMap(this.map);

      // 🛰️ CAPAS ESTILO GOOGLE MAPS (ESTÁNDAR, HÍBRIDO, SATÉLITE, RELIEVE Y OSM)
      this.baseLayers = {
        estandar: L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          attribution: '&copy; Google Maps'
        }),
        hibrido: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          attribution: '&copy; Google Maps Satélite'
        }),
        satelite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 19,
          attribution: '&copy; Maxar & Esri World Imagery'
        }),
        relieve: L.tileLayer('https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', {
          maxZoom: 20,
          attribution: '&copy; Google Maps Terreno'
        }),
        osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        })
      };

      const tipoGuardado = (localStorage.getItem('cuidalia_capa_mapa') as any) || 'estandar';
      this.capaActualTipo = this.baseLayers[tipoGuardado] ? tipoGuardado : 'estandar';
      this.currentTileLayer = this.baseLayers[this.capaActualTipo];
      this.currentTileLayer.addTo(this.map);

      this.map.on('click', () => {
        if (this.mostrarMenuCapas) {
          this.mostrarMenuCapas = false;
          this.cdr.detectChanges();
        }
      });

      if (!this.pacientesLayerGroup) {
        this.pacientesLayerGroup = L.featureGroup();
      }
      this.pacientesLayerGroup.addTo(this.map);
      this.mapInicializado = true;
      console.log('✅ Mapa y grupo de pacientes inicializados');

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

      try {
        if (this.pacientes && this.pacientes.length > 0) {
          this.agregarMarcadoresPacientes(false);
          this.enfocarZonaConMasPacientes(false);
        }
        this.dibujarTodasLasZonas();
      } catch (markersErr) {
        console.warn('⚠️ Error al agregar marcadores/zonas iniciales:', markersErr);
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
    return this.obtenerColonia(direccion);
  }

  recargarPacientes() {
    console.log('🔄 Recargando pacientes desde el servidor...');
    this.mostrarToast('Actualizando', 'Sincronizando pacientes...', 'info', 1200);

    // Limpiar caches de la API del navegador para evitar datos viejos
    if ('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(k => {
          if (k.includes('pacientes') || k.includes('cuidalia-api') || k.includes('api')) {
            caches.delete(k);
          }
        });
      });
    }

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
  // ⭐⭐⭐ DIBUJAR TODAS LAS ZONAS AUTOMÁTICAMENTE AL INICIAR EL MAPA ⭐⭐⭐
  dibujarTodasLasZonas() {
    if (!this.map || !this.mapInicializado) return;

    if (this.grupoTodasLasZonas) {
      try { this.map.removeLayer(this.grupoTodasLasZonas); } catch (e) { }
      this.grupoTodasLasZonas = null;
    }

    const pacientesBase = (this.pacientesOriginal && this.pacientesOriginal.length > 0)
      ? this.pacientesOriginal
      : this.pacientes;

    if (!pacientesBase || pacientesBase.length === 0) return;

    // Agrupar pacientes por zona/colonia
    const zonasMap = new Map<string, any[]>();
    pacientesBase.forEach((p: any) => {
      const z = this.obtenerColonia(p.direccion || '', p.colonia || '').toUpperCase().trim();
      if (z && z !== '' && z !== 'SIN COLONIA') {
        if (!zonasMap.has(z)) {
          zonasMap.set(z, []);
        }
        zonasMap.get(z)!.push(p);
      }
    });

    if (zonasMap.size === 0) return;

    this.grupoTodasLasZonas = L.featureGroup();

    zonasMap.forEach((pacs, zona) => {
      const pacsConCoords = pacs.filter((p: any) => p.lat && p.lng && p.lat !== 0 && p.lng !== 0);
      if (pacsConCoords.length === 0) return;

      const latLngs = pacsConCoords.map((p: any) => L.latLng(p.lat, p.lng));
      const bounds = L.latLngBounds(latLngs);
      const center = bounds.getCenter();

      let maxDistance = 0;
      latLngs.forEach((ll: any) => {
        const d = center.distanceTo(ll);
        if (d > maxDistance) maxDistance = d;
      });

      const radius = Math.max(maxDistance * 1.05, 260);
      const color = (this.coloresManzanas && this.coloresManzanas[zona]) ? this.coloresManzanas[zona] : '#7E101F';

      const circle = L.circle(center, {
        radius: radius,
        color: color,
        fillColor: color,
        fillOpacity: 0.12,
        weight: 2.5,
        dashArray: '6, 6'
      });

      const tooltipContent = `<div class="zona-badge-tag" style="
        background: #ffffff;
        border-left: 4px solid ${color};
        color: #1e293b;
        padding: 3px 8px;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 800;
        box-shadow: 0 3px 10px rgba(0,0,0,0.2);
        display: inline-flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
      ">
        <span style="color: ${color};"><i class="fas fa-layer-group"></i></span>
        <span>${zona}</span>
        <span style="background: ${color}; color: #ffffff; padding: 1px 5px; border-radius: 10px; font-size: 9.5px;">${pacsConCoords.length}</span>
      </div>`;

      circle.bindTooltip(tooltipContent, {
        permanent: true,
        direction: 'center',
        className: 'zona-leaflet-tooltip'
      });

      circle.on('click', () => {
        this.ngZone.run(() => {
          this.activarColoniaEnMapa({
            nombre: zona,
            colonia: zona,
            pacientes: pacsConCoords,
            color: color
          });
        });
      });

      this.grupoTodasLasZonas!.addLayer(circle);
    });

    if (this.grupoTodasLasZonas && this.map) {
      this.grupoTodasLasZonas.addTo(this.map);
      if (typeof (this.grupoTodasLasZonas as any).bringToBack === 'function') {
        (this.grupoTodasLasZonas as any).bringToBack();
      }
      console.log(`✅ Visualizadas ${zonasMap.size} zonas territoriales en el mapa`);
    }
  }

  // ⭐⭐⭐ ENFOCAR AUTOMÁTICAMENTE LA ZONA CON MAYOR CANTIDAD DE PACIENTES ⭐⭐⭐
  enfocarZonaConMasPacientes(animar: boolean = false) {
    if (!this.map || !this.mapInicializado) {
      console.warn('⚠️ No se puede enfocar zona: mapa no inicializado');
      return;
    }

    const pacientesBase = (this.pacientesOriginal && this.pacientesOriginal.length > 0)
      ? this.pacientesOriginal
      : this.pacientes;

    if (!pacientesBase || pacientesBase.length === 0) {
      console.log('ℹ️ No hay pacientes disponibles para enfocar zona');
      return;
    }

    // 1. Agrupar coordenadas por zona y recopilar todas las coordenadas válidas
    const zonasMap = new Map<string, L.LatLng[]>();
    const allCoords: L.LatLng[] = [];

    pacientesBase.forEach((p: any) => {
      const lat = parseFloat(p.lat);
      const lng = parseFloat(p.lng);
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;
      const coord = L.latLng(lat, lng);
      allCoords.push(coord);

      const zona = this.determinarZona(p) || this.obtenerColonia(p.direccion || '', p.colonia || '') || 'Zona General';
      if (!zonasMap.has(zona)) {
        zonasMap.set(zona, []);
      }
      zonasMap.get(zona)!.push(coord);
    });

    if (allCoords.length === 0) {
      console.warn('⚠️ No hay coordenadas válidas para enfocar zona');
      return;
    }

    // 2. Encontrar la zona con más pacientes
    let topZona = '';
    let maxPacientes = -1;
    let topCoords: L.LatLng[] = [];

    zonasMap.forEach((coords, zona) => {
      if (coords.length > maxPacientes) {
        maxPacientes = coords.length;
        topZona = zona;
        topCoords = coords;
      }
    });

    console.log(`📍 [Enfocar Zona] Zona top con más pacientes: "${topZona}" (${maxPacientes} pacientes de ${allCoords.length} totales)`);

    // Si la zona con mayor número tiene al menos el 35% de los pacientes o al menos 3 pacientes, enfocar esa concentración principal;
    // de lo contrario o si los pacientes abarcan varias colonias, enfocar la vista en todos los pacientes
    let coordsToFocus = (topCoords.length >= 3 || topCoords.length >= allCoords.length * 0.35)
      ? topCoords
      : allCoords;

    if (coordsToFocus.length > 0) {
      try {
        const bounds = L.latLngBounds(coordsToFocus);
        if (bounds.isValid()) {
          this.map.fitBounds(bounds, {
            padding: [60, 60],
            maxZoom: 16,
            animate: animar
          });
          const centro = bounds.getCenter();
          this.centerLat = centro.lat;
          this.centerLng = centro.lng;
          this.currentZoom = this.map.getZoom();
          this.cdr.detectChanges();
        }
      } catch (err) {
        console.warn('⚠️ Error al ajustar bounds de la zona con más pacientes:', err);
      }
    }
  }

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

    this.limpiarCapaProximidad();

    if (this.grupoTodasLasZonas) {
      try { this.map?.removeLayer(this.grupoTodasLasZonas); } catch (e) { }
      this.grupoTodasLasZonas = null;
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
    this.limpiarCapaProximidad();
    this.ultimaManzanaSeleccionada = null;
    this.pacientes = [...this.pacientesOriginal];
    this.aplicarFiltrosYEnfocar();
    this.dibujarTodasLasZonas();
  }

  // ⭐ ACTIVAR FILTRO POR PROXIMIDAD GPS (GEOCERCA)
  activarFiltroProximidadEnMapa(detail: any) {
    if (!this.map || !this.mapInicializado) {
      console.warn('⚠️ Mapa no disponible para activar proximidad');
      return;
    }

    const { userLat, userLng, radioMetros, pacientes, count } = detail;

    // Limpiar capas de colonias y proximidad previas
    if (this.capaManzanaSeleccionada) {
      try { this.map?.removeLayer(this.capaManzanaSeleccionada); } catch (e) { }
      this.capaManzanaSeleccionada = null;
    }
    this.limpiarCapaProximidad();

    const pacsConCoords = (pacientes || []).filter((p: any) =>
      p.lat && p.lng && p.lat !== 0 && p.lng !== 0
    );

    this.pacientes = pacsConCoords;
    this.agregarMarcadoresPacientes(false);

    if (userLat && userLng) {
      this.mostrarMarcadorUbicacionActual(userLat, userLng);

      const r = radioMetros || 1000;
      this.capaProximidad = L.circle([userLat, userLng], {
        radius: r,
        color: '#0284c7',
        fillColor: '#38bdf8',
        fillOpacity: 0.12,
        weight: 2,
        dashArray: '6, 6'
      });

      const kmTxt = (r / 1000).toFixed(1);
      this.capaProximidad.bindTooltip(`<b>🎯 Radio de Proximidad (${kmTxt} km)</b><br>${pacsConCoords.length} pacientes dentro`, {
        permanent: false,
        direction: 'top'
      });

      this.capaProximidad.addTo(this.map);

      if (typeof (this.capaProximidad as any).bringToBack === 'function') {
        (this.capaProximidad as any).bringToBack();
      }

      if (pacsConCoords.length > 0) {
        const latLngs = pacsConCoords.map((p: any) => L.latLng(p.lat, p.lng));
        latLngs.push(L.latLng(userLat, userLng));
        const bounds = L.latLngBounds(latLngs);
        this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17, animate: true });
      } else {
        this.map.setView([userLat, userLng], 15, { animate: true });
      }
    }

    this.mostrarToast('🎯 Modo Proximidad', `${count ?? pacsConCoords.length} pacientes encontrados en el radio de atención.`, 'info', 3000);
  }

  limpiarCapaProximidad() {
    if (this.capaProximidad) {
      try {
        this.map?.removeLayer(this.capaProximidad);
      } catch (e) { }
      this.capaProximidad = null;
    }
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
          this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17, animate: true });
        }
      } else {
        this.mostrarToast('Sin pacientes', 'No se encontraron pacientes con este filtro en la zona seleccionada.', 'info', 2200);
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

  // ⭐ BÚSQUEDA CON GEOLOCALIZACIÓN Y MODAL DE REGISTRO AUTOMÁTICO
  obtenerUbicacionActualYRegistrar() {
    if (this.obteniendoUbicacion) return;

    if (!navigator.geolocation) {
      this.mostrarToast('Error', 'Tu tableta o navegador no soporta geolocalización', 'error', 3000);
      return;
    }

    this.obteniendoUbicacion = true;
    this.mostrarToast('📍 Obteniendo GPS', 'Detectando coordenadas del domicilio...', 'info', 3000);
    this.cdr.detectChanges();

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        if (this.map) {
          this.map.setView([lat, lng], 18, { animate: true });
        }

        this.mostrarMarcadorUbicacionActual(lat, lng, accuracy);

        this.mostrarToast('📍 GPS fijado', 'Identificando calle y colonia...', 'info', 2000);

        const direccionData = await this.obtenerDireccionDesdeCoordenadas(lat, lng);

        this.obteniendoUbicacion = false;

        if (direccionData) {
          this.abrirModalGuardarPaciente(lat, lng, {
            calle: direccionData.calle || '',
            numero: direccionData.numero || '',
            colonia: direccionData.colonia || '',
            cp: direccionData.cp || '',
            direccion: direccionData.direccionCompleta || ''
          });
          const textoCalle = direccionData.calle ? `${direccionData.calle}. ` : '';
          this.mostrarToast('✅ Domicilio detectado', `${textoCalle}Completa los datos del paciente.`, 'success', 3500);
        } else {
          this.abrirModalGuardarPaciente(lat, lng, null);
          this.mostrarToast('📍 Coordenadas listas', 'Completa los datos del paciente.', 'info', 3500);
        }
        this.cdr.detectChanges();
      },
      (error) => {
        console.error('❌ Error de geolocalización:', error);
        this.obteniendoUbicacion = false;
        this.cdr.detectChanges();

        let errorMsg = 'No se pudo obtener tu ubicación GPS.';
        if (error.code === 1) {
          errorMsg = 'Permiso de GPS denegado. Permite el acceso a la ubicación en tu tableta.';
        } else if (error.code === 2) {
          errorMsg = 'Ubicación GPS no disponible en este momento.';
        } else if (error.code === 3) {
          errorMsg = 'Tiempo de espera agotado al conectar con el GPS.';
        }

        this.mostrarToast('Aviso de ubicación', errorMsg, 'warning', 4000);

        // Aún con error de GPS, abrimos el modal con las coordenadas actuales para no bloquear al enfermero
        const fallbackLat = this.centerLat || 21.1165;
        const fallbackLng = this.centerLng || -101.6865;
        this.abrirModalGuardarPaciente(fallbackLat, fallbackLng, null);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  }

  // Alias para mantener compatibilidad
  buscarDireccionConEntrecalles() {
    this.obtenerUbicacionActualYRegistrar();
  }

  private mostrarMarcadorUbicacionActual(lat: number, lng: number, accuracy?: number) {
    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }
    if (this.accuracyCircle) {
      try { this.map?.removeLayer(this.accuracyCircle); } catch (e) { }
      this.accuracyCircle = null;
    }

    const myIcon = L.divIcon({
      html: `
        <div class="gps-pulse-wrapper">
          <div class="gps-pulse-ring"></div>
          <div class="gps-pulse-dot">
            <i class="fas fa-location-arrow"></i>
          </div>
        </div>
      `,
      className: 'current-pos-icon',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    this.searchMarker = L.marker([lat, lng], { icon: myIcon, zIndexOffset: 1000 });
    const accText = accuracy && accuracy > 0 ? ` (±${Math.round(accuracy)}m)` : '';
    this.searchMarker.bindTooltip(`📍 Domicilio actual${accText}`, {
      permanent: false,
      direction: 'top',
      offset: [0, -18]
    });

    if (this.map) {
      this.searchMarker.addTo(this.map);

      if (accuracy && accuracy > 0 && accuracy < 500) {
        this.accuracyCircle = L.circle([lat, lng], {
          radius: Math.min(accuracy, 120),
          color: '#0284c7',
          fillColor: '#38bdf8',
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: '4, 4'
        }).addTo(this.map);
      }
    }
  }

  private async obtenerDireccionDesdeCoordenadas(lat: number, lng: number): Promise<any> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18&accept-language=es`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'CuidaliaApp/1.0', 'Accept-Language': 'es' }
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data && data.address) {
        const addr = data.address;
        const calle = (addr.road || addr.street || addr.pedestrian || addr.footway || addr.path || addr.residential || '').toUpperCase();
        const numero = addr.house_number || '';
        let colonia = (addr.suburb || addr.neighbourhood || addr.residential || addr.district || addr.quarter || addr.city_district || addr.subdivision || '').toUpperCase();

        if (!colonia && data.display_name) {
          colonia = this.pacientesMapService.extraerColonia(data.display_name).toUpperCase();
        }

        const cp = addr.postcode || '';
        const ciudad = (addr.city || addr.town || addr.village || addr.municipality || 'León').toUpperCase();
        const estado = (addr.state || addr.region || 'Guanajuato').toUpperCase();
        const direccionCompleta = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        return { calle, numero, colonia, cp, ciudad, estado, direccionCompleta, displayName: data.display_name };
      }
      return null;
    } catch (e) {
      console.warn('⚠️ Error en reverse geocoding:', e);
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
    const calleLimpia = (calle || '').trim().toUpperCase();
    const coloniaLimpia = (colonia || (this.distritoActual ? this.distritoActual.nombre : '') || '').trim().toUpperCase();
    const cpLimpio = (cp || '').trim();
    const numLimpio = (numero || '').trim();

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
      colonia: coloniaLimpia,
      calle: calleLimpia,
      numero: numLimpio,
      cp: cpLimpio,
      lat: lat || this.centerLat,
      lng: lng || this.centerLng,
      estatusVital: 'vivo',
      finado: false,
      fechaFinado: '',
      numVisita: 1,
      discapacidades: {
        motriz: false,
        visual: false,
        auditiva: false,
        intelectual: false,
        psicosocial: false
      }
    };
    this.actualizarDireccionCompleta();
    this.mostrarModalPaciente = true;
    this.cdr.detectChanges();
  }

  onEstatusVivoNuevoPaciente() {
    this.nuevoPaciente.estatusVital = 'vivo';
    this.nuevoPaciente.finado = false;
    if (this.nuevoPaciente.estatus === 'FINADO') {
      this.nuevoPaciente.estatus = 'PENDIENTE';
    }
    this.cdr.detectChanges();
  }

  onEstatusFinadoNuevoPaciente() {
    this.nuevoPaciente.estatusVital = 'finado';
    this.nuevoPaciente.finado = true;
    this.nuevoPaciente.estatus = 'FINADO';
    if (!this.nuevoPaciente.fechaFinado) {
      this.nuevoPaciente.fechaFinado = new Date().toISOString().split('T')[0];
    }
    this.cdr.detectChanges();
  }

  toggleDiscapacidadNuevoPaciente(tipo: 'motriz' | 'visual' | 'auditiva' | 'intelectual' | 'psicosocial') {
    if (this.nuevoPaciente.finado || this.nuevoPaciente.estatusVital === 'finado') {
      return;
    }
    if (!this.nuevoPaciente.discapacidades) {
      this.nuevoPaciente.discapacidades = {
        motriz: false,
        visual: false,
        auditiva: false,
        intelectual: false,
        psicosocial: false
      };
    }
    this.nuevoPaciente.discapacidades[tipo] = !this.nuevoPaciente.discapacidades[tipo];

    const algunaActiva = Object.values(this.nuevoPaciente.discapacidades).some(v => !!v);
    if (algunaActiva) {
      this.nuevoPaciente.programa = 'DISCAPACIDAD';
    } else if (this.nuevoPaciente.programa === 'DISCAPACIDAD') {
      this.nuevoPaciente.programa = 'PAM';
    }
    this.cdr.detectChanges();
  }

  ajustarNumVisitaNuevoPaciente(delta: number) {
    const actual = Number(this.nuevoPaciente.numVisita) || 1;
    const nuevo = Math.max(1, actual + delta);
    this.nuevoPaciente.numVisita = nuevo;
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

    const primerNombre = this.nuevoPaciente.nombre.trim();
    const apPaterno = this.nuevoPaciente.apellidoPaterno.trim();
    const apMaterno = (this.nuevoPaciente.apellidoMaterno || '').trim();
    const nombreCompleto = `${primerNombre} ${apPaterno} ${apMaterno}`.trim();
    const tel = (this.nuevoPaciente.telefonoCelular || this.nuevoPaciente.telefonoFijo || '').trim();
    const curp = (this.nuevoPaciente.curp || '').trim().toUpperCase();

    // Normalizar teléfono en formato internacional mexicano +52 si tiene 10 dígitos (para pasarelas SMS como TextBee)
    let soloDigitos = tel.replace(/\D/g, '');
    let telE164 = soloDigitos;
    if (soloDigitos.length === 10) {
      telE164 = `+52${soloDigitos}`;
    }

    const tieneAlgunaDiscapacidad = !!(
      this.nuevoPaciente.discapacidades?.motriz ||
      this.nuevoPaciente.discapacidades?.visual ||
      this.nuevoPaciente.discapacidades?.auditiva ||
      this.nuevoPaciente.discapacidades?.intelectual ||
      this.nuevoPaciente.discapacidades?.psicosocial
    );

    const esFinado = this.nuevoPaciente.estatusVital === 'finado' || this.nuevoPaciente.estatus === 'FINADO' || !!this.nuevoPaciente.finado;
    const estatusFinal = esFinado ? 'FINADO' : (this.nuevoPaciente.estatus || 'PENDIENTE');
    const programaFinal = tieneAlgunaDiscapacidad ? 'DISCAPACIDAD' : (this.nuevoPaciente.programa || 'PAM');
    const fechaFinadoFinal = esFinado ? (this.nuevoPaciente.fechaFinado || new Date().toISOString().split('T')[0]) : '';
    const numVisitaFinal = Math.max(1, Number(this.nuevoPaciente.numVisita) || 1);

    const pacienteData = {
      ...this.nuevoPaciente,
      nombre: primerNombre, // Solo el nombre para evitar duplicación con apellidoPaterno y apellidoMaterno
      apellidoPaterno: apPaterno,
      apellidoMaterno: apMaterno,
      nombreCompleto: nombreCompleto,
      curp: curp,
      telefono: tel,
      telefonoCelular: this.nuevoPaciente.telefonoCelular || tel,
      telefonoFijo: this.nuevoPaciente.telefonoFijo || '',
      telefonoE164: telE164,
      idEnfermera: this.idEnfermera,
      estatus: estatusFinal,
      programa: programaFinal,
      estatusVital: esFinado ? 'finado' : 'vivo',
      finado: esFinado,
      fechaFinado: fechaFinadoFinal,
      numVisita: numVisitaFinal,
      discapacidadMotriz: !!this.nuevoPaciente.discapacidades?.motriz,
      discapacidadVisual: !!this.nuevoPaciente.discapacidades?.visual,
      discapacidadAuditiva: !!this.nuevoPaciente.discapacidades?.auditiva,
      discapacidadIntelectual: !!this.nuevoPaciente.discapacidades?.intelectual,
      discapacidadPsicosocial: !!this.nuevoPaciente.discapacidades?.psicosocial,
      discapacidades: {
        motriz: !!this.nuevoPaciente.discapacidades?.motriz,
        visual: !!this.nuevoPaciente.discapacidades?.visual,
        auditiva: !!this.nuevoPaciente.discapacidades?.auditiva,
        intelectual: !!this.nuevoPaciente.discapacidades?.intelectual,
        psicosocial: !!this.nuevoPaciente.discapacidades?.psicosocial
      }
    };

    this.http.post(`${this.apiUrl}/pacientes`, pacienteData).subscribe({
      next: (response: any) => {
        this.pacienteGuardando = false;
        const nuevoId = response?.id || response?.paciente?.id || response?.data?.id || (response && typeof response === 'object' && response.insertId) || Date.now();
        const numLat = parseFloat(String(pacienteData.lat || this.centerLat || 21.1165));
        const numLng = parseFloat(String(pacienteData.lng || this.centerLng || -101.6865));

        const pacienteGuardado: any = {
          ...pacienteData,
          id: nuevoId,
          lat: numLat,
          lng: numLng,
          nombre: primerNombre,
          apellidoPaterno: apPaterno,
          apellidoMaterno: apMaterno,
          nombreCompleto: nombreCompleto,
          telefono: tel,
          telefonoCelular: this.nuevoPaciente.telefonoCelular || tel,
          telefonoFijo: this.nuevoPaciente.telefonoFijo || '',
          curp: curp,
          calle: pacienteData.calle || '',
          numero: pacienteData.numero || '',
          colonia: pacienteData.colonia || 'LEÓN',
          direccion: pacienteData.direccion || `${pacienteData.calle || ''} #${pacienteData.numero || ''}, ${pacienteData.colonia || ''}`.trim(),
          estatus: estatusFinal,
          programa: programaFinal,
          finado: esFinado,
          estatusVital: esFinado ? 'finado' : 'vivo'
        };

        // 1. Agregar inmediatamente al inicio de pacientesOriginal y pacientes locales
        const idxOrig = this.pacientesOriginal.findIndex((p: any) => p.id === nuevoId);
        if (idxOrig >= 0) {
          this.pacientesOriginal[idxOrig] = pacienteGuardado;
        } else {
          this.pacientesOriginal.unshift(pacienteGuardado);
        }

        const idxPac = this.pacientes.findIndex((p: any) => p.id === nuevoId);
        if (idxPac >= 0) {
          this.pacientes[idxPac] = pacienteGuardado;
        } else {
          this.pacientes.unshift(pacienteGuardado);
        }

        // 2. Persistir de inmediato en caché local para búsquedas y modo sin conexión
        try {
          localStorage.setItem('cuidalia_map_pacientes_' + this.idEnfermera, JSON.stringify(this.pacientesOriginal));
          localStorage.setItem('cuidalia_pacientes_raw_' + this.idEnfermera, JSON.stringify(this.pacientesOriginal));
        } catch (e) { }

        // 3. Notificar al servicio compartido de pacientes
        this.pacientesMapService.setPacientesCache(this.pacientesOriginal);

        // 4. Agregar a zonas disponibles si es nueva colonia
        const coloniaNueva = (pacienteGuardado.colonia || '').toUpperCase().trim();
        if (coloniaNueva && !this.manzanasDisponibles.includes(coloniaNueva)) {
          this.manzanasDisponibles = [...this.manzanasDisponibles, coloniaNueva].sort();
          if (!this.coloresManzanas[coloniaNueva]) {
            const nuevoColor = this.coloresDisponibles[this.manzanasDisponibles.indexOf(coloniaNueva) % this.coloresDisponibles.length];
            this.coloresManzanas = { ...this.coloresManzanas, [coloniaNueva]: nuevoColor };
          }
          this.store.dispatch(AppActions.setColoresManzanas({ colores: this.coloresManzanas }));
          this.store.dispatch(AppActions.setManzanasDisponibles({ manzanas: this.manzanasDisponibles }));
        }

        // 5. Dibujar marcadores y enfocar al nuevo paciente en el mapa
        this.agregarMarcadoresPacientes(false);
        if (this.map && numLat && numLng) {
          this.map.setView([numLat, numLng], 17);
        }

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
        console.warn('⚠️ Guardando localmente en mapa tras aviso:', error);
        this.pacienteGuardando = false;

        const nuevoId = Date.now();
        const numLat = parseFloat(String(pacienteData.lat || this.centerLat || 21.1165));
        const numLng = parseFloat(String(pacienteData.lng || this.centerLng || -101.6865));

        const nuevoObj: PacienteMap = {
          id: nuevoId,
          nombre: nombreCompleto,
          apellidoPaterno: this.nuevoPaciente.apellidoPaterno || '',
          apellidoMaterno: this.nuevoPaciente.apellidoMaterno || '',
          curp: curp,
          telefono: tel,
          telefonoFijo: this.nuevoPaciente.telefonoFijo || '',
          telefonoCelular: this.nuevoPaciente.telefonoCelular || tel,
          programa: programaFinal,
          estatus: estatusFinal,
          seccion: '277',
          genero: 'M',
          direccion: this.nuevoPaciente.direccion || `${this.nuevoPaciente.calle} ${this.nuevoPaciente.numero || ''}, ${this.nuevoPaciente.colonia || ''}`,
          colonia: this.nuevoPaciente.colonia || 'LEÓN',
          lat: numLat,
          lng: numLng,
          discapacidades: {
            motriz: !!this.nuevoPaciente.discapacidades?.motriz,
            visual: !!this.nuevoPaciente.discapacidades?.visual,
            auditiva: !!this.nuevoPaciente.discapacidades?.auditiva,
            intelectual: !!this.nuevoPaciente.discapacidades?.intelectual,
            psicosocial: !!this.nuevoPaciente.discapacidades?.psicosocial
          },
          finado: esFinado,
          fechaFinado: fechaFinadoFinal
        };

        this.pacientesOriginal.unshift(nuevoObj);
        this.pacientes.unshift(nuevoObj);

        try {
          localStorage.setItem('cuidalia_map_pacientes_' + this.idEnfermera, JSON.stringify(this.pacientesOriginal));
          localStorage.setItem('cuidalia_pacientes_raw_' + this.idEnfermera, JSON.stringify(this.pacientesOriginal));
        } catch (e) { }

        this.pacientesMapService.setPacientesCache(this.pacientesOriginal);
        this.agregarMarcadoresPacientes(false);
        if (this.map && nuevoObj.lat && nuevoObj.lng) {
          this.map.setView([nuevoObj.lat, nuevoObj.lng], 17, { animate: true });
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

    // Separar referencias si existen con pipe o Refs.:
    let dirSinRefs = direccion;
    if (direccion.includes('|')) {
      dirSinRefs = direccion.split('|')[0].trim();
    } else if (/Refs\.?:/i.test(direccion)) {
      const idx = direccion.search(/Refs\.?:/i);
      dirSinRefs = direccion.substring(0, idx).trim();
    }

    let limpia = dirSinRefs
      .replace(/,?\s*LEON\s*,?\s*GUANAJUATO.*$/i, '')
      .replace(/,?\s*LEON\s*,?\s*GTO.*$/i, '')
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
      .replace(/\s+,/g, ',')
      .replace(/,\s*-[0-9]*\s*,/g, ',')
      .replace(/,\s*-[0-9]*\s*$/g, '')
      .replace(/,\s*-\s*\d*$/g, '')
      .replace(/,\s*-$/g, '')
      .replace(/\s+/g, ' ')
      .replace(/,\s*,/g, ',')
      .replace(/,\s*,\s*/g, ', ')
      .trim();

    limpia = limpia
      .replace(/^FRAC\.?\s*/i, '')
      .replace(/^COL\.?\s*/i, '')
      .replace(/,\s*$/, '');

    if (limpia.length < 3) {
      return dirSinRefs || direccion;
    }

    return limpia;
  }

  private extraerReferencias(direccion: string): string {
    if (!direccion) return '';
    let refs = '';
    if (direccion.includes('|')) {
      refs = direccion.split('|').slice(1).join(' | ').trim();
    } else if (/Refs\.?:/i.test(direccion)) {
      const idx = direccion.search(/Refs\.?:/i);
      refs = direccion.substring(idx).trim();
    }
    return refs.replace(/^Refs\.?:\s*/i, '').replace(/^Refs:\s*/i, '').trim();
  }

  private obtenerColonia(direccion: string, coloniaOriginal?: string): string {
    if (coloniaOriginal && coloniaOriginal.length > 2) {
      const cUpper = coloniaOriginal.toUpperCase().trim();
      if (!cUpper.includes('DISPONIBLE') &&
          !cUpper.includes('SIN COLONIA') &&
          !/^#|^\d+$/i.test(coloniaOriginal.trim()) &&
          !cUpper.startsWith('REFS')) {
        let limpia = coloniaOriginal
          .replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (limpia.length > 30) limpia = limpia.substring(0, 28) + '…';
        return limpia || coloniaOriginal;
      }
    }

    if (!direccion) return 'Sin colonia';

    let dirSinRefs = direccion;
    if (direccion.includes('|')) {
      dirSinRefs = direccion.split('|')[0].trim();
    } else if (/Refs\.?:/i.test(direccion)) {
      const idx = direccion.search(/Refs\.?:/i);
      dirSinRefs = direccion.substring(0, idx).trim();
    }

    // 1. Buscar coincidencias con palabras clave COLONIA, FRACC, etc.
    const matchCol = dirSinRefs.match(/(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+([^,\|]+)/i);
    if (matchCol && matchCol[1]) {
      const cand = matchCol[1].trim().replace(/CP\s*\d{5}/gi, '').trim();
      if (cand.length > 2 && !/^#|^\d+$/i.test(cand) && !/^(?:LEON|GTO|GUANAJUATO|LEON\s*,\s*GTO)$/i.test(cand) && cand !== '-') {
        let limpia = cand;
        if (limpia.length > 30) limpia = limpia.substring(0, 28) + '…';
        return limpia;
      }
    }

    // 2. Limpiar sufijos
    let limpiaDir = dirSinRefs
      .replace(/,\s*LEON\s*,?\s*GUANAJUATO.*$/i, '')
      .replace(/,\s*LEON\s*,?\s*GTO.*$/i, '')
      .replace(/,\s*LEON$/i, '')
      .replace(/,\s*GTO$/i, '')
      .trim();

    const partes = limpiaDir.split(',').map(s => s.trim()).filter(Boolean);
    const numIdx = partes.findIndex(p => /^#|^\d+$/i.test(p));

    if (numIdx !== -1 && numIdx + 1 < partes.length) {
      let postNum = partes.slice(numIdx + 1);
      if (postNum.length > 1 && /^[-]?\d+$/.test(postNum[0])) {
        postNum = postNum.slice(1);
      }
      let col = postNum.join(', ').trim();
      col = col
        .replace(/^[-\d]+,\s*/, '')
        .replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '')
        .trim();
      if (col && col.length > 2 && !/^#|^\d+$/i.test(col) && !/^(?:LEON|GTO|GUANAJUATO|LEON\s*,\s*GTO)$/i.test(col) && col !== '-') {
        if (col.length > 30) col = col.substring(0, 28) + '…';
        return col;
      }
    }

    if (partes.length >= 2) {
      const ultima = partes[partes.length - 1].trim()
        .replace(/^[-\d]+,\s*/, '')
        .replace(/^(?:COLONIA|COL\.|FRACCIONAMIENTO|FRACC\.|RESIDENCIAL|BARRIO|LOCALIDAD)\s+/i, '')
        .trim();
      if (ultima.length > 2 && !/^#|^\d+$/i.test(ultima) && !/^(?:LEON|GTO|GUANAJUATO|LEON\s*,\s*GTO)$/i.test(ultima) && ultima !== '-') {
        if (ultima.length > 30) return ultima.substring(0, 28) + '…';
        return ultima;
      }
    }

    // 3. Inferencia inteligente por calle o referencias
    const dUpper = (direccion || '').toUpperCase();
    if (dUpper.includes('MANANTIAL')) return 'EL MANANTIAL';
    if (dUpper.includes('VICTORIA')) return 'RESIDENCIAL VICTORIA';
    if (dUpper.includes('CONSUELO') || dUpper.includes('OBREGON GONZALES') || dUpper.includes('TELLEZ CRUCES') || dUpper.includes('CORRALES AYALA')) return 'SAN JOSE DEL CONSUELO';
    if (dUpper.includes('VALLE DE SAN JOSE')) return 'REAL DE SAN JOSE';
    if (dUpper.includes('AZAHARES') || dUpper.includes('NARANJO')) return 'LOS NARANJOS';
    if (dUpper.includes('SAN LAZARO') || dUpper.includes('SAN BENIGNO') || dUpper.includes('SANTA ROSA')) return 'SANTA ROSA DE LIMA';
    if (dUpper.includes('VALLE DE SEÑORA') || dUpper.includes('BISMUTO') || dUpper.includes('OSMIO') || dUpper.includes('ACTINIO')) return 'VALLE DE SEÑORA';

    return 'Sin colonia';
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

  limpiarNombreDuplicado(nombre: string, apP?: string, apM?: string): string {
    if (!nombre) return 'Nombre no disponible';
    let n = nombre.trim();
    const p = (apP || '').trim();
    const m = (apM || '').trim();

    // Si tiene "APELLIDO_P APELLIDO_M NOMBRE APELLIDO_P APELLIDO_M" o duplicación al inicio y al final
    if (p && m) {
      const patronInicio = new RegExp(`^${p}\\s+${m}\\s+`, 'i');
      const patronFin = new RegExp(`\\s+${p}\\s+${m}$`, 'i');
      if (patronInicio.test(n) && patronFin.test(n)) {
        n = n.replace(patronInicio, '').trim();
      }
    } else if (p) {
      const patronInicio = new RegExp(`^${p}\\s+`, 'i');
      const patronFin = new RegExp(`\\s+${p}$`, 'i');
      if (patronInicio.test(n) && patronFin.test(n)) {
        n = n.replace(patronInicio, '').trim();
      }
    }

    // Deduplicar tokens consecutivos o repetidos en el nombre
    const tokens = n.split(/\s+/).filter(Boolean);
    const uniqueTokens: string[] = [];
    tokens.forEach(token => {
      const upper = token.toUpperCase();
      const occurrences = tokens.filter(t => t.toUpperCase() === upper).length;
      if (occurrences > 1 && uniqueTokens.some(t => t.toUpperCase() === upper)) {
        return;
      }
      uniqueTokens.push(token);
    });
    return uniqueTokens.join(' ');
  }

  // ⭐⭐⭐ POPUP - GENERAR HTML CON DISEÑO PREMIUM ⭐⭐⭐
  private generarPopupHTML(paciente: any, color: string, estatusLower: string, nombreCompleto: string, direccionLimpia: string, coloniaMostrar: string): string {
    const programaUpper = (paciente.programa || '').toUpperCase();
    const esDiscapacidad = programaUpper === 'PCD' || programaUpper.includes('PCD') ||
      programaUpper === 'DISCAPACIDAD' || programaUpper.includes('DIS') ||
      Boolean(paciente.discapacidades?.motriz || paciente.discapacidades?.visual ||
        paciente.discapacidades?.auditiva || paciente.discapacidades?.intelectual ||
        paciente.discapacidades?.psicosocial);
    const esReferido = programaUpper === 'REFERIDO' || programaUpper.includes('REF');

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
    const isVisitado = estatusLower === 'visitado' || estatusLower === 'completada' || estatusLower === 'completado';
    const isRechazo = estatusLower === 'rechazo' || estatusLower === 'rechazado';
    const isIncidencia = estatusLower === 'incidencia';
    const isCambioDom = estatusLower === 'cambio de domicilio' || estatusLower === 'cambio_domicilio';

    let st = { bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B', icon: 'fa-clock', text: paciente.estatus || 'Pendiente' };
    if (isVisitado) {
      st = { bg: '#DCFCE7', color: '#166534', dot: '#22C55E', icon: 'fa-check-circle', text: 'Completado' };
    } else if (isRechazo) {
      st = { bg: '#FEE2E2', color: '#991B1B', dot: '#EF4444', icon: 'fa-ban', text: 'Rechazado' };
    } else if (isIncidencia) {
      st = { bg: '#FFF7ED', color: '#C2410C', dot: '#F97316', icon: 'fa-triangle-exclamation', text: 'Incidencia' };
    } else if (isCambioDom) {
      st = { bg: '#FAF5FF', color: '#6B21A8', dot: '#A855F7', icon: 'fa-truck-moving', text: 'Cambio Domicilio' };
    } else if (isFinado) {
      st = { bg: '#F1F5F9', color: '#475569', dot: '#64748B', icon: 'fa-skull', text: 'Finado' };
    }

    const nombreLimpio = this.limpiarNombreDuplicado(nombreCompleto, paciente.apellidoPaterno, paciente.apellidoMaterno);
    const partesNombre = nombreLimpio.split(' ').filter(Boolean);
    let iniciales = 'CU';
    if (partesNombre.length >= 2) {
      iniciales = `${partesNombre[0][0]}${partesNombre[1][0]}`.toUpperCase();
    } else if (partesNombre.length === 1 && partesNombre[0].length >= 2) {
      iniciales = partesNombre[0].substring(0, 2).toUpperCase();
    }

    const telefonoMostrar = paciente.telefonoCelular || paciente.telefonoFijo || paciente.telefono || '';
    const curpMostrar = paciente.curp || '';

    const nombreEscapado = nombreLimpio.replace(/'/g, "\\'");
    const telefonoEscapado = telefonoMostrar.replace(/'/g, "\\'");
    const direccionEscapada = direccionLimpia.replace(/'/g, "\\'");
    const curpEscapado = curpMostrar.replace(/'/g, "\\'");
    const coloniaEscapada = coloniaMostrar.replace(/'/g, "\\'");
    const seccionEscapada = (paciente.seccion || '').replace(/'/g, "\\'");
    const referenciasMostrar = this.extraerReferencias(paciente.direccion || '');
    const referenciasEscapada = referenciasMostrar.replace(/'/g, "\\'");
    const zonaMostrar = this.determinarZona(paciente);
    const zonaEscapada = zonaMostrar.replace(/'/g, "\\'");

    const tieneCoords = paciente.lat && paciente.lng && paciente.lat !== 0 && paciente.lng !== 0;
    const urlRuta = tieneCoords
      ? `https://www.google.com/maps/dir/?api=1&destination=${paciente.lat},${paciente.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((paciente.direccion || paciente.nombre) + ', León, Gto')}`;

    const estaEnPlan = this.visitasHoyService.estaEnPlanHoy(paciente.id);

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
        <div class="cp-card cp-card-ubicacion">
          <div class="cp-card-icon" style="background: ${p.iconBg}; color: ${p.iconColor};">
            <i class="fas fa-location-dot"></i>
          </div>
          <div class="cp-card-details">
            <div class="cp-card-header-line">
              <span class="cp-card-label">UBICACIÓN</span>
              <span class="cp-zona-chip" title="Zona: ${zonaEscapada}">
                <i class="fas fa-layer-group"></i> ${zonaEscapada}
              </span>
            </div>
            <div class="cp-colonia" title="${coloniaEscapada}">${coloniaMostrar}</div>
            <div class="cp-direccion" title="${direccionEscapada}">${direccionLimpia}</div>
            ${referenciasMostrar ? `
            <div class="cp-referencias-box" title="${referenciasEscapada}">
              <span class="cp-ref-lbl"><i class="fas fa-signs-post"></i> Ref:</span>
              <span class="cp-ref-txt">${referenciasEscapada}</span>
            </div>` : ''}
          </div>
        </div>

        <!-- Botón Fachada 360° -->
        <button type="button" class="cp-btn-fachada-360"
          onclick="window.__abrirStreetViewPaciente(${paciente.id}, ${paciente.lat || 0}, ${paciente.lng || 0})"
          title="Ver fachada de la casa en Street View 360°">
          <div class="fachada-content-left">
            <div class="fachada-icon-circle">
              <i class="fas fa-street-view"></i>
            </div>
            <div class="fachada-text-group">
              <span class="fachada-title">Fachada 360°</span>
              <span class="fachada-subtitle">Ver casa de frente</span>
            </div>
          </div>
          <div class="fachada-badge-pill">
            <span>360°</span>
            <i class="fas fa-arrow-up-right-from-square"></i>
          </div>
        </button>

        <!-- Tarjeta Teléfono -->
        <div class="cp-card cp-card-telefono">
          <div class="cp-card-icon cp-icon-tel">
            <i class="fas fa-phone"></i>
          </div>
          <div class="cp-card-details">
            <span class="cp-card-label">TELÉFONO DE CONTACTO</span>
            <div class="cp-telefono-content">
              ${telefonoMostrar ? `<a href="tel:${telefonoMostrar}" class="cp-tel-link" title="Llamar a ${telefonoMostrar}"><i class="fas fa-phone-volume"></i> <span>${telefonoMostrar}</span></a>` : '<span class="cp-sin-tel">Sin número registrado</span>'}
            </div>
          </div>
        </div>

        ${paciente.finado ? `
        <div class="cp-finado-banner">
          <i class="fas fa-cross"></i>
          <span>Paciente finado (Defunción)</span>
        </div>` : ''}
      </div>

      <!-- FOOTER ACTIONS -->
      <div class="cp-footer">
        <!-- ⭐ BOTÓN DIRECTO: MI RUTA DE HOY ⭐ -->
        <button class="cp-btn cp-btn-ruta-hoy ${estaEnPlan ? 'en-ruta' : ''}"
          id="btn-pop-ruta-${paciente.id}"
          onclick="window.__togglePacienteRuta(${paciente.id})"
          title="${estaEnPlan ? 'Quitar de mis visitas de hoy' : 'Agregar a mis visitas de hoy'}">
          <i class="fas ${estaEnPlan ? 'fa-check-circle' : 'fa-star'}"></i>
          <span>${estaEnPlan ? '✓ En Mi Ruta de Hoy' : '+ Agregar a Ruta de Hoy'}</span>
        </button>

        <div class="cp-footer-secondary">
          <button class="cp-btn-sec cp-btn-agendar"
            onclick="window.dispatchEvent(new CustomEvent('agregarAlCalendario', { detail: {
              pacienteId: ${paciente.id},
              nombre: '${nombreEscapado}',
              telefono: '${telefonoEscapado}',
              direccion: '${direccionEscapada}',
              curp: '${curpEscapado}',
              colonia: '${coloniaEscapada}'
            } }))" title="Agendar cita en calendario">
            <i class="fas fa-calendar-plus"></i>
            <span>Agendar</span>
          </button>

          <button class="cp-btn-sec cp-btn-reporte"
            onclick="window.dispatchEvent(new CustomEvent('reportarIncidencia', { detail: {
              pacienteId: ${paciente.id},
              nombre: '${nombreEscapado}',
              telefono: '${telefonoEscapado}',
              direccion: '${direccionEscapada}',
              curp: '${curpEscapado}',
              colonia: '${coloniaEscapada}',
              seccion: '${seccionEscapada}',
              lat: ${paciente.lat || 0},
              lng: ${paciente.lng || 0}
            } }))" title="Reportar incidencia o alerta médica">
            <i class="fas fa-triangle-exclamation"></i>
            <span>Reporte</span>
          </button>

          <button class="cp-btn-sec cp-btn-editar"
            onclick="window.dispatchEvent(new CustomEvent('editarPacientePopup', { detail: {
              pacienteId: ${paciente.id}
            } }))" title="Editar dirección, colonia, teléfonos y estado">
            <i class="fas fa-pen-to-square"></i>
            <span>Editar</span>
          </button>
        </div>
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
                if (layer && (layer._icon || layer.options?.icon || typeof layer.getPopup === 'function')) {
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

  // ⭐⭐⭐ CREACIÓN DE GRUPO DE CLÚSTERES DE ALTO RENDIMIENTO (60 FPS MÓVIL) ⭐⭐⭐
  private crearClusterGroup(): any {
    try {
      const win = typeof window !== 'undefined' ? (window as any) : null;
      const LeafletLib = win?.L || L;
      const clusterFn = LeafletLib.markerClusterGroup
        || (L as any).markerClusterGroup
        || win?.L?.markerClusterGroup;

      const ClusterClass = LeafletLib.MarkerClusterGroup
        || (L as any).MarkerClusterGroup
        || win?.L?.MarkerClusterGroup;

      const clusterConfig: any = {
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        spiderfyDistanceMultiplier: 1.5,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        removeOutsideVisibleBounds: true,
        chunkedLoading: true,
        chunkInterval: 100,
        chunkDelay: 20,
        animate: true,
        iconCreateFunction: (cluster: any) => {
          const childCount = cluster.getChildCount();
          let color = '#7E101F';
          let shadow = 'rgba(126, 16, 31, 0.45)';
          let size = 42;

          if (childCount < 10) {
            color = '#10B981';
            shadow = 'rgba(16, 185, 129, 0.45)';
            size = 36;
          } else if (childCount < 30) {
            color = '#F59E0B';
            shadow = 'rgba(245, 158, 11, 0.45)';
            size = 40;
          } else if (childCount < 100) {
            color = '#FF6B55';
            shadow = 'rgba(255, 107, 85, 0.5)';
            size = 46;
          } else {
            color = '#520D2F';
            shadow = 'rgba(82, 13, 47, 0.6)';
            size = 52;
          }

          return LeafletLib.divIcon({
            html: `<div class="cuidalia-cluster-bubble" style="
              background: ${color};
              width: ${size}px;
              height: ${size}px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: 800;
              font-family: 'Plus Jakarta Sans', sans-serif;
              font-size: ${size > 42 ? 15 : 13}px;
              border: 3px solid #FFFFFF;
              box-shadow: 0 4px 14px ${shadow}, 0 2px 6px rgba(0,0,0,0.25);
            ">${childCount}</div>`,
            className: 'cuidalia-marker-cluster-icon',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2]
          });
        }
      };

      if (typeof clusterFn === 'function') {
        console.log('✅ Utilizando markerClusterGroup de Leaflet');
        return clusterFn(clusterConfig);
      }

      if (typeof ClusterClass === 'function') {
        console.log('✅ Instanciando new MarkerClusterGroup de Leaflet');
        return new ClusterClass(clusterConfig);
      }
    } catch (err) {
      console.warn('⚠️ Error al crear markerClusterGroup:', err);
    }

    console.warn('⚠️ markerClusterGroup no disponible o falló, usando fallback directo');
    return {
      addLayer: (layer: any) => { this.map?.addLayer(layer); },
      addTo: (map: any) => { },
      getBounds: () => null,
      eachLayer: (fn: any) => { },
      zoomToShowLayer: (layer: any, cb: any) => { if (cb) cb(); }
    };
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

    if (!this.pacientesLayerGroup) {
      this.pacientesLayerGroup = L.featureGroup();
    }
    if (this.map && !this.map.hasLayer(this.pacientesLayerGroup)) {
      this.pacientesLayerGroup.addTo(this.map);
    }

    let marcadoresAgregados = 0;
    const markers: L.Marker[] = [];
    this.coordsPacientesFiltrados = [];
    const coordFreq = new Map<string, number>();

    this.pacientes.forEach((paciente) => {
      if (!paciente.lat || !paciente.lng || paciente.lat === 0 || paciente.lng === 0) {
        return;
      }

      const programa = (paciente.programa || '').toUpperCase();
      const estatusUpper = (paciente.estatus || '').toUpperCase();
      const estatusLower = (paciente.estatus || '').toLowerCase();
      const esFinado = estatusUpper === 'FINADO' || Boolean(paciente.finado) || Boolean(paciente.fechaFinado);

      const tieneDiscapacidad = Boolean(
        paciente.discapacidades?.motriz ||
        paciente.discapacidades?.visual ||
        paciente.discapacidades?.auditiva ||
        paciente.discapacidades?.intelectual ||
        paciente.discapacidades?.psicosocial
      );
      const esDiscapacitado = !esFinado && (
        tieneDiscapacidad ||
        programa === 'PCD' ||
        programa.includes('PCD') ||
        programa === 'DISCAPACIDAD' ||
        programa.includes('DIS')
      );

      const esAdulto = !esFinado && !esDiscapacitado && (
        programa === 'PAM' ||
        programa.includes('PAM') ||
        programa.includes('ADULTO') ||
        programa.includes('MAYOR')
      );

      const esReferido = !esFinado && (
        programa === 'REFERIDO' ||
        programa.includes('REF')
      );

      let cumpleFiltros = true;

      if (hayFiltrosPerfil) {
        const cumplePerfil =
          (this.filtrosPerfiles.adulto && esAdulto) ||
          (this.filtrosPerfiles.discapacitado && esDiscapacitado) ||
          (this.filtrosPerfiles.referido && esReferido) ||
          (Boolean((this.filtrosPerfiles as any).finado) && esFinado);

        if (!cumplePerfil) {
          cumpleFiltros = false;
        }
      }

      if (hayFiltrosRiesgo && cumpleFiltros) {
        const riesgo = this.asignarRiesgo(estatusUpper);
        const cumpleRiesgo =
          (this.filtrosRiesgos.g1 && riesgo === 'g1') ||
          (this.filtrosRiesgos.g2 && riesgo === 'g2') ||
          (this.filtrosRiesgos.g3 && riesgo === 'g3') ||
          (this.filtrosRiesgos.g4 && riesgo === 'g4');

        if (!cumpleRiesgo) {
          cumpleFiltros = false;
        }
      }

      // ⭐ SI HAY FILTROS ACTIVOS Y NO CUMPLE, EXCLUIR PARA MÁXIMA VELOCIDAD Y LIMPIEZA
      if (hayFiltros && !cumpleFiltros) {
        return;
      }

      this.coordsPacientesFiltrados.push(L.latLng(paciente.lat, paciente.lng));

      const estaEnPlanHoy = this.visitasHoyService.estaEnPlanHoy(paciente.id);

      // ⭐ DEFINICIÓN VISUAL DEL MARCADOR
      let markerIcon: L.DivIcon;
      let zIndexOffset = 0;

      if (hayFiltros && cumpleFiltros) {
        // ⭐⭐⭐ SUPER RESALTADO PARA PACIENTES QUE CUMPLEN EL FILTRO ⭐⭐⭐
        const size = 46;
        const fontSize = 18;
        let bgGradient = 'linear-gradient(135deg, #3B82F6, #1D4ED8)';
        let glowColor = 'rgba(59, 130, 246, 0.75)';
        let iconFinal = 'fa-user';
        let badgeText = '';
        let badgeBg = '#2563EB';

        if (esFinado) {
          bgGradient = 'linear-gradient(135deg, #1E293B, #0F172A)';
          glowColor = 'rgba(239, 68, 68, 0.85)';
          iconFinal = 'fa-skull';
          badgeText = 'FINADO';
          badgeBg = '#DC2626';
        } else if (esDiscapacitado) {
          bgGradient = 'linear-gradient(135deg, #8B5CF6, #6D28D9)';
          glowColor = 'rgba(139, 92, 246, 0.85)';
          iconFinal = 'fa-wheelchair';
          badgeText = 'PCD';
          badgeBg = '#7C3AED';
        } else if (esAdulto) {
          bgGradient = 'linear-gradient(135deg, #06B6D4, #0284C7)';
          glowColor = 'rgba(6, 182, 212, 0.85)';
          iconFinal = 'fa-person-cane';
          badgeText = 'ADULTO';
          badgeBg = '#0284C7';
        } else if (esReferido) {
          bgGradient = 'linear-gradient(135deg, #3B82F6, #1D4ED8)';
          glowColor = 'rgba(59, 130, 246, 0.85)';
          iconFinal = 'fa-share-nodes';
          badgeText = 'REFERIDO';
          badgeBg = '#2563EB';
        } else if (estatusLower === 'visitado' || estatusLower === 'completada' || estatusLower === 'completado') {
          bgGradient = 'linear-gradient(135deg, #10B981, #059669)';
          glowColor = 'rgba(16, 185, 129, 0.8)';
          iconFinal = 'fa-check-circle';
          badgeText = badgeText || 'VISITADO';
          badgeBg = badgeBg || '#059669';
        } else if (estatusLower === 'rechazo' || estatusLower === 'rechazado') {
          bgGradient = 'linear-gradient(135deg, #EF4444, #991B1B)';
          glowColor = 'rgba(239, 68, 68, 0.85)';
          iconFinal = 'fa-ban';
          badgeText = badgeText || 'RECHAZADO';
          badgeBg = badgeBg || '#DC2626';
        } else if (estatusLower === 'incidencia') {
          bgGradient = 'linear-gradient(135deg, #F97316, #C2410C)';
          glowColor = 'rgba(249, 115, 22, 0.85)';
          iconFinal = 'fa-triangle-exclamation';
          badgeText = badgeText || 'INCIDENCIA';
          badgeBg = badgeBg || '#EA580C';
        } else if (estatusLower === 'cambio de domicilio' || estatusLower === 'cambio_domicilio') {
          bgGradient = 'linear-gradient(135deg, #A855F7, #7E22CE)';
          glowColor = 'rgba(168, 85, 247, 0.85)';
          iconFinal = 'fa-truck-moving';
          badgeText = badgeText || 'CAMBIO DOM';
          badgeBg = badgeBg || '#7E22CE';
        } else if (estatusLower === 'finado') {
          bgGradient = 'linear-gradient(135deg, #64748B, #334155)';
          glowColor = 'rgba(100, 116, 139, 0.85)';
          iconFinal = 'fa-skull';
          badgeText = badgeText || 'FINADO';
          badgeBg = badgeBg || '#334155';
        } else {
          bgGradient = 'linear-gradient(135deg, #F59E0B, #D97706)';
          glowColor = 'rgba(245, 158, 11, 0.8)';
          iconFinal = 'fa-clock';
        }

        if (estaEnPlanHoy) {
          iconFinal = 'fa-star';
        }

        const badgeHtml = badgeText
          ? `<div style="position: absolute; top: -11px; left: 50%; transform: translateX(-50%); background: ${badgeBg}; color: #ffffff; font-size: 9px; font-weight: 800; padding: 1.5px 7px; border-radius: 9px; border: 1.5px solid #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.35); white-space: nowrap; letter-spacing: 0.6px;">${badgeText}</div>`
          : '';

        markerIcon = L.divIcon({
          html: `<div class="marker-super-resaltado" style="
                position: relative;
                background: ${bgGradient};
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #ffffff;
                font-size: ${fontSize}px;
                border: 3.5px solid #ffffff;
                --pulse-color: ${glowColor};
                box-shadow: 0 0 0 6px ${glowColor}, 0 6px 20px rgba(0, 0, 0, 0.45);
                cursor: pointer;
            ">
                ${badgeHtml}
                <i class="fas ${iconFinal}"></i>
            </div>`,
          className: 'custom-marker filter-active marker-highlight-active',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          popupAnchor: [0, -(size / 2)]
        });

        zIndexOffset = estaEnPlanHoy ? 10100 : 10000;

      } else if (hayFiltros && !cumpleFiltros) {
        // ⭐ ATENUADO MÍNIMO PARA NO FILTRADOS CUANDO HAY FILTRO ACTIVO ⭐
        markerIcon = L.divIcon({
          html: `<div style="
                background: #94a3b8;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                opacity: 0.12;
                border: 1px solid #cbd5e1;
                cursor: pointer;
            "></div>`,
          className: 'custom-marker filter-inactive',
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          popupAnchor: [0, -6]
        });

        zIndexOffset = 0;

      } else {
        // ⭐ MODO NORMAL SIN FILTROS ACTIVOS ⭐
        const color = this.obtenerColorPaciente(paciente);
        const size = esBusqueda ? 38 : 28;
        const fontSize = esBusqueda ? 18 : 12;
        const borderWidth = esBusqueda ? 4 : 3;

        let icon = 'fa-user';
        if (estatusLower === 'pendiente' || estatusLower === 'sin visita') {
          icon = 'fa-clock';
        } else if (estatusLower === 'visitado' || estatusLower === 'completada' || estatusLower === 'completado') {
          icon = 'fa-check-circle';
        } else if (estatusLower === 'rechazo' || estatusLower === 'rechazado') {
          icon = 'fa-ban';
        } else if (estatusLower === 'incidencia') {
          icon = 'fa-triangle-exclamation';
        } else if (estatusLower === 'cambio de domicilio' || estatusLower === 'cambio_domicilio') {
          icon = 'fa-truck-moving';
        } else if (estatusLower === 'finado') {
          icon = 'fa-skull';
        }

        const glowBorder = estaEnPlanHoy
          ? '3.5px solid #F59E0B'
          : `${borderWidth}px solid white`;
        const glowShadow = estaEnPlanHoy
          ? 'box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.5), 0 3px 14px rgba(0,0,0,0.35);'
          : 'box-shadow: 0 2px 12px rgba(0,0,0,0.3);';
        const iconFinal = estaEnPlanHoy ? 'fa-star' : icon;

        markerIcon = L.divIcon({
          html: `<div style="
                background: ${color};
                width: ${size}px;
                height: ${size}px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: ${fontSize}px;
                border: ${glowBorder};
                ${glowShadow}
                cursor: pointer;
            ">
                <i class="fas ${iconFinal}"></i>
            </div>`,
          className: `custom-marker ${estaEnPlanHoy ? 'marker-en-ruta-hoy' : ''}`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          popupAnchor: [0, -(size / 2)]
        });

        zIndexOffset = estaEnPlanHoy ? 600 : 50;
      }

      const colorForPopup = this.obtenerColorPaciente(paciente);
      const nombreCompleto = paciente.nombre || 'Nombre no disponible';
      const direccionLimpia = this.limpiarDireccion(paciente.direccion || '');
      const coloniaMostrar = this.obtenerColonia(paciente.direccion || '', paciente.colonia || '');

      const popupContent = this.generarPopupHTML(paciente, colorForPopup, estatusLower, nombreCompleto, direccionLimpia, coloniaMostrar);

      // ⭐ PREVENCIÓN DE MARCACIONES ENCIMADAS EN COORDENADAS IDÉNTICAS O MUY CERCANAS
      const keyCoord = `${paciente.lat.toFixed(4)},${paciente.lng.toFixed(4)}`;
      const repeticion = coordFreq.get(keyCoord) || 0;
      coordFreq.set(keyCoord, repeticion + 1);

      let latAjustada = paciente.lat;
      let lngAjustada = paciente.lng;

      if (repeticion > 0) {
        // Distribución uniforme de girasol / roseta (Ángulo Dorado ~137.5°)
        // Separa los puntos ~20 metros para que NUNCA se tapen ni se encimen
        const phi = 2.3999632;
        const angulo = repeticion * phi;
        const radio = 0.00018 * Math.sqrt(repeticion);
        latAjustada += Math.sin(angulo) * radio;
        lngAjustada += Math.cos(angulo) * radio;
      }

      const marker = L.marker([latAjustada, lngAjustada], {
        icon: markerIcon,
        zIndexOffset: zIndexOffset
      })
        .bindPopup(popupContent, {
          maxWidth: 380,
          minWidth: 280,
          className: 'paciente-popup',
          autoPan: true,
          autoPanPadding: [20, 20]
        });

      (marker as any)._pacienteId = paciente.id;

      if (this.pacientesLayerGroup) {
        this.pacientesLayerGroup.addLayer(marker);
      } else {
        this.map?.addLayer(marker);
      }

      markers.push(marker);
      marcadoresAgregados++;
    });

    if (marcadoresAgregados > 0) {
      this.marcadoresPacientes = markers;
      console.log(`✅ ${marcadoresAgregados} marcadores de pacientes agregados y visibles en el mapa`);

      if (ajustarZoom) {
        try {
          if (this.pacientesLayerGroup && typeof this.pacientesLayerGroup.getBounds === 'function') {
            const bounds = this.pacientesLayerGroup.getBounds();
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
          seccion: data.seccion || '',
          lat: data.lat || 0,
          lng: data.lng || 0
        };
        localStorage.setItem('incidenciaPaciente', JSON.stringify(pacienteData));
        this.router.navigate(['/incidencias']);
      });
    };

    window.addEventListener('reportarIncidencia', this._incidenciaListener);

    if (this._editarPacienteListener) {
      window.removeEventListener('editarPacientePopup', this._editarPacienteListener);
    }
    this._editarPacienteListener = (event: any) => {
      this.ngZone.run(() => {
        const data = event.detail;
        this.router.navigate(['/pacientes'], { queryParams: { editarId: data.pacienteId } });
      });
    };
    window.addEventListener('editarPacientePopup', this._editarPacienteListener);
    if (this._streetViewListener) {
      window.removeEventListener('abrirStreetView', this._streetViewListener);
    }
    this._streetViewListener = (event: any) => {
      this.ngZone.run(() => {
        const d = event.detail || {};
        this.abrirModalStreetView(d.lat, d.lng, d.nombre, d.direccion, d.colonia);
      });
    };
    window.addEventListener('abrirStreetView', this._streetViewListener);

    // ⭐ EXPONER TOGGLE RÁPIDO Y SEGURO A NIVEL GLOBAL
    (window as any).__togglePacienteRuta = (pacienteId: number) => {
      this.ngZone.run(() => {
        const idNum = Number(pacienteId);
        let p = this.pacientes.find((x: any) => Number(x.id) === idNum);
        if (!p && this.pacientesOriginal) {
          p = this.pacientesOriginal.find((x: any) => Number(x.id) === idNum);
        }
        if (p) {
          this.togglePacienteRutaHoy(p);
        } else {
          this.togglePacienteRutaHoy({ id: idNum, nombre: 'Paciente #' + idNum });
        }
      });
    };

    // ⭐ ESCUCHAR ACCIONES DE "MI RUTA DE HOY" ⭐
    if (this._toggleVisitaHoyListener) {
      window.removeEventListener('toggleVisitaHoy', this._toggleVisitaHoyListener);
    }

    this._toggleVisitaHoyListener = (event: any) => {
      this.ngZone.run(() => {
        const p = event.detail;
        if (p) {
          this.togglePacienteRutaHoy(p);
        }
      });
    };

    window.addEventListener('toggleVisitaHoy', this._toggleVisitaHoyListener);

    if (this._planHoyActualizadoListener) {
      window.removeEventListener('planHoyActualizado', this._planHoyActualizadoListener);
    }

    this._planHoyActualizadoListener = () => {
      this.ngZone.run(() => {
        this.actualizarEstilosMarcadoresRutaHoy();
      });
    };

    window.addEventListener('planHoyActualizado', this._planHoyActualizadoListener);

    if (this._enfocarPacienteListener) {
      window.removeEventListener('enfocarPacienteMapa', this._enfocarPacienteListener);
    }
    if (this._streetViewListener) {
      window.removeEventListener('abrirStreetView', this._streetViewListener);
    }

    this._enfocarPacienteListener = (event: any) => {
      this.ngZone.run(() => {
        const { pacienteId, lat, lng } = event.detail;
        if (lat && lng && this.map) {
          const m = this.marcadoresPacientes.find((marker: any) => marker._pacienteId === pacienteId);
          if (m && this.clusterGroup && typeof this.clusterGroup.zoomToShowLayer === 'function') {
            this.clusterGroup.zoomToShowLayer(m, () => {
              m.openPopup();
            });
          } else {
            this.map.flyTo([lat, lng], 18, { animate: true, duration: 1.2 });
            setTimeout(() => {
              if (m) {
                m.openPopup();
              }
            }, 1300);
          }
        }
      });
    };

    window.addEventListener('enfocarPacienteMapa', this._enfocarPacienteListener);
  }

  limpiarMarcadoresPacientes() {
    console.log('🧹 Limpiando marcadores...');

    if (this.map) {
      this.map.closePopup();

      if (this.pacientesLayerGroup) {
        try { this.pacientesLayerGroup.clearLayers(); } catch (e) { }
      }

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
        if (layer instanceof L.TileLayer) {
          return;
        }
        if (layer === this.searchMarker) {
          return;
        }
        if (layer && (layer._icon || layer.options?.icon || typeof layer.getAllChildMarkers === 'function')) {
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
    if (this._toggleVisitaHoyListener) {
      window.removeEventListener('toggleVisitaHoy', this._toggleVisitaHoyListener);
      this._toggleVisitaHoyListener = null;
    }
    if (this._planHoyActualizadoListener) {
      window.removeEventListener('planHoyActualizado', this._planHoyActualizadoListener);
      this._planHoyActualizadoListener = null;
    }
    if (this._enfocarPacienteListener) {
      window.removeEventListener('enfocarPacienteMapa', this._enfocarPacienteListener);
      this._enfocarPacienteListener = null;
    }
    delete (window as any).__togglePacienteRuta;
  }

  // ⭐ ABRIR MODAL DE MI RUTA DE HOY
  abrirMiRutaHoy() {
    window.dispatchEvent(new CustomEvent('abrirMiRutaHoy'));
  }

  // ⭐ ACCIÓN CENTRALIZADA PARA AGREGAR/QUITAR PACIENTES DE LA RUTA DE HOY
  togglePacienteRutaHoy(p: any) {
    if (!p) return;
    const pacId = Number(p.id || p.pacienteId);
    const agregado = this.visitasHoyService.togglePaciente(p);

    if (agregado) {
      this.mostrarToast('⭐ Agregado a tu Ruta', `${p.nombre || 'Paciente'} fue sumado a tu lista de visitas.`, 'success', 2200);
    } else {
      this.mostrarToast('Ruta Actualizada', `${p.nombre || 'Paciente'} fue removido de tu lista.`, 'info', 2000);
    }

    // 1. Actualizar el botón en el popup abierto dinámicamente sin cerrarlo
    const popBtn = (document.getElementById(`btn-pop-ruta-${pacId}`) || document.querySelector('.paciente-popup .cp-btn-ruta-hoy')) as HTMLElement;
    if (popBtn) {
      if (agregado) {
        popBtn.classList.add('en-ruta');
        popBtn.setAttribute('title', 'Quitar de mis visitas de hoy');
        popBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>✓ En Mi Ruta de Hoy</span>';
      } else {
        popBtn.classList.remove('en-ruta');
        popBtn.setAttribute('title', 'Agregar a mis visitas de hoy');
        popBtn.innerHTML = '<i class="fas fa-star"></i><span>+ Agregar a Ruta de Hoy</span>';
      }
    }

    // 2. Actualizar marcador individual en el mapa (estrella y halo) sin cerrar popup
    this.actualizarMarcadorIndividualRutaHoy(pacId, agregado, p);
  }

  // ⭐ ACTUALIZAR MARCADOR INDIVIDUAL AL AGREGAR/QUITAR DE LA RUTA DE HOY
  actualizarMarcadorIndividualRutaHoy(pacId: number, estaEnPlan: boolean, fallbackPaciente?: any) {
    if (!this.marcadoresPacientes || this.marcadoresPacientes.length === 0) return;
    const marker = this.marcadoresPacientes.find((m: any) => Number(m._pacienteId) === pacId);
    if (!marker) return;

    const pacienteObj = this.pacientes.find((x: any) => Number(x.id) === pacId) || fallbackPaciente;
    if (!pacienteObj) return;

    const color = this.obtenerColorPaciente(pacienteObj);
    const size = this.pacientes.length < 50 ? 38 : 28;
    const fontSize = this.pacientes.length < 50 ? 18 : 12;
    const iconFinal = estaEnPlan ? 'fa-star' : 'fa-user';
    const glowBorder = estaEnPlan ? '3.5px solid #F59E0B' : '3px solid white';
    const glowShadow = estaEnPlan
      ? 'box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.5), 0 3px 14px rgba(0,0,0,0.35);'
      : 'box-shadow: 0 2px 12px rgba(0,0,0,0.3);';

    const newIcon = L.divIcon({
      html: `<div style="
            background: ${color};
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: ${fontSize}px;
            border: ${glowBorder};
            ${glowShadow}
            cursor: pointer;
        ">
            <i class="fas ${iconFinal}"></i>
        </div>`,
      className: `custom-marker filter-active ${estaEnPlan ? 'marker-en-ruta-hoy' : ''}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -(size / 2)]
    });

    marker.setIcon(newIcon);
    marker.setZIndexOffset(estaEnPlan ? 600 : 100);

    const nombreCompleto = pacienteObj.nombre || 'Nombre no disponible';
    const direccionLimpia = this.limpiarDireccion(pacienteObj.direccion || '');
    const coloniaMostrar = this.obtenerColonia(pacienteObj.direccion || '', pacienteObj.colonia || '');
    const estatusLower = (pacienteObj.estatus || '').toLowerCase();
    const popupContent = this.generarPopupHTML(pacienteObj, color, estatusLower, nombreCompleto, direccionLimpia, coloniaMostrar);
    marker.setPopupContent(popupContent);
  }

  // ⭐ SINCRONIZAR VISUALMENTE TODOS LOS MARCADORES CUANDO CAMBIA EL PLAN DE HOY
  actualizarEstilosMarcadoresRutaHoy() {
    if (!this.marcadoresPacientes || this.marcadoresPacientes.length === 0) return;
    const size = this.pacientes.length < 50 ? 38 : 28;
    const fontSize = this.pacientes.length < 50 ? 18 : 12;

    this.marcadoresPacientes.forEach((marker: any) => {
      const pacId = Number(marker._pacienteId);
      if (!pacId) return;
      const estaEnPlan = this.visitasHoyService.estaEnPlanHoy(pacId);
      const pacienteObj = this.pacientes.find((x: any) => Number(x.id) === pacId);
      if (!pacienteObj) return;

      const color = this.obtenerColorPaciente(pacienteObj);
      const iconFinal = estaEnPlan ? 'fa-star' : 'fa-user';
      const glowBorder = estaEnPlan ? '3.5px solid #F59E0B' : '3px solid white';
      const glowShadow = estaEnPlan
        ? 'box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.5), 0 3px 14px rgba(0,0,0,0.35);'
        : 'box-shadow: 0 2px 12px rgba(0,0,0,0.3);';

      const newIcon = L.divIcon({
        html: `<div style="
              background: ${color};
              width: ${size}px;
              height: ${size}px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: ${fontSize}px;
              border: ${glowBorder};
              ${glowShadow}
              cursor: pointer;
          ">
              <i class="fas ${iconFinal}"></i>
          </div>`,
        className: `custom-marker filter-active ${estaEnPlan ? 'marker-en-ruta-hoy' : ''}`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2)]
      });

      marker.setIcon(newIcon);
      marker.setZIndexOffset(estaEnPlan ? 600 : 100);

      const nombreCompleto = pacienteObj.nombre || 'Nombre no disponible';
      const direccionLimpia = this.limpiarDireccion(pacienteObj.direccion || '');
      const coloniaMostrar = this.obtenerColonia(pacienteObj.direccion || '', pacienteObj.colonia || '');
      const estatusLower = (pacienteObj.estatus || '').toLowerCase();
      const popupContent = this.generarPopupHTML(pacienteObj, color, estatusLower, nombreCompleto, direccionLimpia, coloniaMostrar);
      marker.setPopupContent(popupContent);
    });
  }

  private obtenerColorPaciente(paciente: any): string {
    const hayFiltrosPerfil = this.filtrosPerfiles.adulto || this.filtrosPerfiles.discapacitado || this.filtrosPerfiles.referido || (this.filtrosPerfiles as any).finado;
    const hayFiltrosRiesgo = this.filtrosRiesgos.g1 || this.filtrosRiesgos.g2 ||
      this.filtrosRiesgos.g3 || this.filtrosRiesgos.g4;

    const programa = (paciente.programa || '').toUpperCase();
    const estatusUpper = (paciente.estatus || '').toUpperCase();

    if (hayFiltrosPerfil) {
      if ((this.filtrosPerfiles as any).finado && (estatusUpper === 'FINADO' || paciente.finado || Boolean(paciente.fechaFinado))) {
        return '#dc2626';
      }
      if (this.filtrosPerfiles.discapacitado && (programa === 'PCD' || programa.includes('PCD') || programa === 'DISCAPACIDAD' || programa.includes('DIS') || Boolean(paciente.discapacidades?.motriz || paciente.discapacidades?.visual || paciente.discapacidades?.auditiva || paciente.discapacidades?.intelectual || paciente.discapacidades?.psicosocial))) {
        return '#7c3aed';
      }
      if (this.filtrosPerfiles.adulto && (programa === 'PAM' || programa.includes('PAM') || programa.includes('ADULTO') || programa.includes('MAYOR'))) {
        return '#0284c7';
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

  // ⭐⭐⭐ BÚSQUEDA DE DIRECCIÓN INTELIGENTE ⭐⭐⭐
  buscarDireccion() {
    // Si había una búsqueda colgada, desbloquearla inmediatamente
    if (this.busquedaEnProgreso) {
      console.warn('⏳ Búsqueda previa en progreso, reiniciando para la nueva búsqueda...');
      this.busquedaEnProgreso = false;
      this.isSearching = false;
    }

    const query = this.searchQuery?.trim();
    if (!query) {
      this.mostrarToast('Error', 'Ingresa el nombre o dirección del paciente para buscar', 'warning');
      return;
    }

    this.busquedaEnProgreso = true;
    this.isSearching = true;
    this.cdr.detectChanges();

    // ⏱️ TIMEOUT DE SEGURIDAD ABSOLUTO: Nunca permitir que el spinner se quede activo más de 4.5 segundos
    const safetyTimeout = setTimeout(() => {
      if (this.isSearching || this.busquedaEnProgreso) {
        console.warn('⏱️ Timeout de seguridad de búsqueda alcanzado, restableciendo estado');
        this.isSearching = false;
        this.busquedaEnProgreso = false;
        this.cdr.detectChanges();
      }
    }, 4500);

    const terminarBusqueda = () => {
      clearTimeout(safetyTimeout);
      this.busquedaEnProgreso = false;
      this.isSearching = false;
      this.cdr.detectChanges();
    };

    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    const backupOriginal = (this.pacientesOriginal && this.pacientesOriginal.length > 0)
      ? [...this.pacientesOriginal]
      : [...this.pacientes];

    // Normalizador en español: quita acentos, signos de puntuación redundantes y normaliza mayúsculas
    const normalizar = (txt: string): string => {
      if (!txt) return '';
      return String(txt)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .trim();
    };

    const queryNorm = normalizar(query);
    const queryTokens = queryNorm
      .split(/[\s,#.-]+/)
      .filter((t: string) => t.length > 0);

    // 1. BÚSQUEDA LOCAL ULTRA-RÁPIDA EN MEMORIA
    // Coincidencia con nombre, apellidos, dirección, curp, teléfono, número, colonia, id
    const exactPatients = backupOriginal.filter((p: any) => {
      const pNombre = normalizar(`${p.nombre || ''} ${p.apellidoPaterno || ''} ${p.apellidoMaterno || ''}`);
      const pCompleto = normalizar(p.nombreCompleto || '');
      const pCurp = normalizar(p.curp || '');
      const pTel = String(p.telefonoCelular || p.telefonoFijo || p.telefono || '').replace(/\D/g, '');
      const pCalle = normalizar(p.calle || '');
      const pNum = String(p.numero || '').trim();
      const pColonia = normalizar(p.colonia || '');
      const pDir = normalizar(p.direccion || '');
      const pRef = normalizar(p.referencias || p.referenciasViales || '');
      const pId = String(p.id || '');

      const fullString = `${pNombre} ${pCompleto} ${pCurp} ${pTel} ${pCalle} ${pNum} ${pColonia} ${pDir} ${pRef} ${pId}`;

      // A) Coincidencia directa con la frase completa normalizada
      if (fullString.includes(queryNorm)) return true;
      if (pNombre.includes(queryNorm) || pCompleto.includes(queryNorm)) return true;
      if (pDir.includes(queryNorm) || pCalle.includes(queryNorm)) return true;

      // B) Búsqueda por teléfono
      const queryTelDigits = queryNorm.replace(/\D/g, '');
      if (queryTelDigits.length >= 4 && pTel.includes(queryTelDigits)) return true;

      // C) Búsqueda multi-palabra: todos los tokens ingresados deben encontrarse en el paciente
      if (queryTokens.length > 1) {
        const todosCoinciden = queryTokens.every((tok: string) => fullString.includes(tok));
        if (todosCoinciden) return true;
      }

      return false;
    });

    if (exactPatients.length > 0) {
      console.log(`✅ Paciente(s) encontrado(s) en memoria: ${exactPatients.length}`);
      this.mostrarPacientesEncontrados(exactPatients, backupOriginal, query);
      terminarBusqueda();
      return;
    }

    // 2. Si no se encontró en memoria local, buscar en la base de datos
    console.log(`🔍 Paciente no encontrado localmente, consultando backend para "${query}"...`);
    this.http.get<any[]>(`${this.apiUrl}/pacientes/buscar?direccion=${encodeURIComponent(query)}`)
      .pipe(timeout(3500))
      .subscribe({
        next: (backendPatients: any[]) => {
          if (backendPatients && backendPatients.length > 0) {
            const validCoords = backendPatients.filter((p: any) => p.lat && p.lng && p.lat !== 0 && p.lng !== 0);
            if (validCoords.length > 0) {
              console.log(`✅ Pacientes encontrados en backend: ${validCoords.length}`);
              validCoords.forEach((bp: any) => {
                if (!this.pacientesOriginal.some((o: any) => o.id === bp.id)) {
                  this.pacientesOriginal.push(bp);
                }
              });
              this.mostrarPacientesEncontrados(validCoords, backupOriginal, query);
              terminarBusqueda();
              return;
            }
          }

          // 3. Fallback: Si no hay resultados en BD
          this.resolverFallbackBusqueda(query, queryNorm, queryTokens, backupOriginal, terminarBusqueda);
        },
        error: () => {
          this.resolverFallbackBusqueda(query, queryNorm, queryTokens, backupOriginal, terminarBusqueda);
        }
      });
  }

  private resolverFallbackBusqueda(
    query: string,
    queryNorm: string,
    queryTokens: string[],
    backupOriginal: any[],
    terminarBusqueda: () => void
  ) {
    // Detectar si la búsqueda tiene apariencia de calle / dirección geográfica en León
    const esDireccionVial = /(?:CALLE|AVENIDA|AV|BLVD|BOULEVARD|CTO|CIRCUITO|ANDADOR|AND|PRIVADA|PRIV|PROL|COLONIA|COL|FRACCIONAMIENTO|#|\b\d{2,}\b)/i.test(query);

    if (!esDireccionVial) {
      // Es una búsqueda por nombre de persona, folio o teléfono que no se encontró en la BD
      this.mostrarToast('No encontrado', `No se encontró el paciente "${query}"`, 'warning', 3000);
      terminarBusqueda();
      return;
    }

    // Si parece dirección, intentar buscar punto geográfico con OpenStreetMap con timeout estricto
    this.buscarUbicacionGeograficaOSM(query, terminarBusqueda);
  }

  private buscarUbicacionGeograficaOSM(query: string, onConcluir: () => void) {
    this.mostrarToast('Buscando ubicación', `Buscando "${query}" en el mapa...`, 'info', 1200);

    const cleanQuery = query.toLowerCase().includes('león') || query.toLowerCase().includes('leon')
      ? query
      : `${query}, León, Guanajuato, Mexico`;
    const geocodingUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=1&countrycodes=mx`;

    this.http.get(geocodingUrl).pipe(timeout(3000)).subscribe({
      next: (results: any) => {
        if (results && results.length > 0 && !isNaN(parseFloat(results[0].lat))) {
          const res = results[0];
          const lat = parseFloat(res.lat);
          const lon = parseFloat(res.lon);
          const colonia = this.inferirColoniaDeCalle(query);

          this.mostrarMarcadorUbicacion({
            lat: lat,
            lon: lon,
            display_name: `${query.toUpperCase()}${colonia ? ', ' + colonia : ''}, LEÓN, GTO.`,
            calle: query,
            numero: '',
            colonia: colonia
          });
          this.concluirBusquedaExitosa(query);
          onConcluir();
          return;
        }

        this.fallbackUbicacionPorPacientesCercanos(query, onConcluir);
      },
      error: () => {
        this.fallbackUbicacionPorPacientesCercanos(query, onConcluir);
      }
    });
  }

  private mostrarPacientesEncontrados(pacientes: any[], backupOriginal: any[], query: string) {
    this.busquedaEnProgreso = false;
    this.isSearching = false;
    this.cdr.detectChanges();

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

    this.agregarMarcadoresPacientes(false);

    // Centrar mapa de inmediato en los pacientes encontrados
    const conCoords = finalPacientes.filter((p: any) => p.lat && p.lng && p.lat !== 0 && p.lng !== 0);
    if (conCoords.length > 0 && this.map) {
      if (conCoords.length === 1) {
        this.map.setView([conCoords[0].lat, conCoords[0].lng], 17);
      } else {
        const bounds = L.latLngBounds(conCoords.map((p: any) => L.latLng(p.lat, p.lng)));
        if (bounds.isValid()) {
          this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
        }
      }
    }

    // Abrir popup automáticamente del primer paciente encontrado
    setTimeout(() => {
      this.abrirPopupDelPrimerPaciente();
    }, 400);
  }

  private inferirColoniaDeCalle(street: string): string {
    if (!street) return '';
    const stUpper = street.toUpperCase().trim();
    const pacienteCercano = this.pacientesOriginal.find((p: any) => {
      const dir = (p.direccion || '').toUpperCase();
      const col = (p.colonia || '').toUpperCase();
      const c = (p.calle || '').toUpperCase();
      return (c && c.includes(stUpper)) || dir.includes(stUpper);
    });
    return pacienteCercano?.colonia || (pacienteCercano ? this.extraerColonia(pacienteCercano.direccion) : '') || '';
  }

  private fallbackUbicacionPorPacientesCercanos(query: string, onConcluir?: () => void) {
    const stUpper = query.toUpperCase().trim();
    const pacienteCercano = this.pacientesOriginal.find((p: any) => {
      const dir = (p.direccion || '').toUpperCase();
      const c = (p.calle || '').toUpperCase();
      return (c && c.includes(stUpper)) || dir.includes(stUpper);
    });

    if (pacienteCercano && pacienteCercano.lat && pacienteCercano.lng) {
      const col = pacienteCercano.colonia || this.extraerColonia(pacienteCercano.direccion);
      this.mostrarMarcadorUbicacion({
        lat: pacienteCercano.lat + 0.00015,
        lon: pacienteCercano.lng + 0.00015,
        display_name: `${query.toUpperCase()}${col ? ', ' + col : ''}, LEÓN, GTO.`,
        calle: query,
        numero: '',
        colonia: col
      });
      this.concluirBusquedaExitosa(query);
      if (onConcluir) onConcluir();
      return;
    }

    this.mostrarToast('No encontrado', `No se encontró "${query}" en el mapa`, 'warning', 3000);
    this.busquedaEnProgreso = false;
    this.isSearching = false;
    this.cdr.detectChanges();
    if (onConcluir) onConcluir();
  }

  private concluirBusquedaExitosa(query: string) {
    this.mostrarToast('Ubicación encontrada', `📍 ${query.toUpperCase()}`, 'success', 3000);
    // Mantener los pacientes originales en el mapa para referencia visual alrededor del punto
    this.pacientes = [...this.pacientesOriginal];
    this.agregarMarcadoresPacientes();
    this.busquedaEnProgreso = false;
    this.isSearching = false;
    this.cdr.detectChanges();
  }

  private mostrarMarcadorUbicacion(result: any) {
    if (!this.map) return;

    if (this.searchMarker) {
      try { this.map.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    const searchIcon = L.divIcon({
      html: `<div style="
        background: #520D2F;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 20px;
        border: 3.5px solid white;
        box-shadow: 0 0 0 6px rgba(255, 107, 85, 0.35), 0 6px 24px rgba(0,0,0,0.35);
        animation: searchPulseMarker 1.8s ease-in-out infinite;
        z-index: 9999;
        pointer-events: auto;
      ">
        <i class="fas fa-location-dot" style="color: #FF6B55;"></i>
      </div>
      <style>
        @keyframes searchPulseMarker {
          0% { transform: scale(1); box-shadow: 0 0 0 6px rgba(255, 107, 85, 0.35); }
          50% { transform: scale(1.12); box-shadow: 0 0 0 16px rgba(255, 107, 85, 0.1); }
          100% { transform: scale(1); box-shadow: 0 0 0 6px rgba(255, 107, 85, 0.35); }
        }
      </style>`,
      className: 'search-marker',
      iconSize: [48, 48],
      iconAnchor: [24, 24],
      popupAnchor: [0, -24]
    });

    const searchPopupContent = `
      <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; max-width: 310px; width: 100%;">
        <div style="
          background: linear-gradient(135deg, #520D2F 0%, #38061F 100%);
          color: white;
          padding: 13px 15px;
          border-radius: 12px 12px 0 0;
          display: flex;
          align-items: center;
          gap: 10px;
        ">
          <div style="
            width: 36px;
            height: 36px;
            background: rgba(255,255,255,0.15);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            flex-shrink: 0;
            color: #FF6B55;
          ">
            <i class="fas fa-location-crosshairs"></i>
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 13px; font-weight: 800; color: #FFFFFF;">Ubicación Encontrada</div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.85); line-height: 1.2;">Punto disponible en mapa</div>
          </div>
        </div>

        <div style="padding: 12px 14px;">
          <div style="
            display: flex;
            align-items: flex-start;
            gap: 8px;
            padding: 9px 12px;
            background: #FAF6F4;
            border: 1px solid #EBDCD5;
            border-radius: 8px;
            margin-bottom: 8px;
          ">
            <i class="fas fa-location-dot" style="color: #520D2F; font-size: 13px; margin-top: 2px;"></i>
            <span style="font-size: 12px; color: #1F1018; font-weight: 700; line-height: 1.35; word-break: break-word;">
              ${result.display_name || 'Dirección no disponible'}
            </span>
          </div>

          <div style="
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 10.5px;
            color: #7A6972;
            background: #F2ECE8;
            padding: 5px 10px;
            border-radius: 6px;
          ">
            <i class="fas fa-crosshairs" style="color: #FF6B55; font-size: 10px;"></i>
            <span>Lat: ${result.lat.toFixed(5)}, Lng: ${result.lon.toFixed(5)}</span>
          </div>
        </div>

        <div style="padding: 0 14px 14px 14px;">
          <button id="btnRegistrarPacienteBusqueda" style="
            width: 100%;
            padding: 10px 14px;
            background: linear-gradient(135deg, #7D174A 0%, #520D2F 100%);
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 12.5px;
            font-weight: 800;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            box-shadow: 0 4px 12px rgba(82, 13, 47, 0.3);
            transition: all 0.2s ease;
          ">
            <i class="fas fa-user-plus" style="color: #FF6B55; font-size: 13px;"></i>
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
        maxWidth: 320,
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
            const calle = result.calle || '';
            const numero = result.numero || '';
            const colonia = result.colonia || '';
            const dir = result.display_name || '';
            this.abrirModalPaciente(result.lat, result.lon, dir, calle, numero, colonia, '');
          });
        };
      }
    }, 300);

    if (this.map) {
      this.map.setView([result.lat, result.lon], 18);
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

    if (this.accuracyCircle) {
      try { this.map?.removeLayer(this.accuracyCircle); } catch (e) { }
      this.accuracyCircle = null;
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

  // 🗺️ GESTIÓN DE CAPAS DE MAPA
  toggleMenuCapas(): void {
    this.mostrarMenuCapas = !this.mostrarMenuCapas;
    this.cdr.detectChanges();
  }

  cambiarCapaMapa(tipo: 'estandar' | 'hibrido' | 'satelite' | 'relieve' | 'osm'): void {
    if (!this.map || !this.baseLayers[tipo]) return;

    if (this.currentTileLayer) {
      try { this.map.removeLayer(this.currentTileLayer); } catch (e) { }
    }

    this.capaActualTipo = tipo;
    this.currentTileLayer = this.baseLayers[tipo];
    this.currentTileLayer.addTo(this.map);
    this.currentTileLayer.bringToBack();

    try {
      localStorage.setItem('cuidalia_capa_mapa', tipo);
    } catch (e) {}

    // Garantizar que los pacientes sigan presentes y en primer plano visual
    if (!this.pacientes || this.pacientes.length === 0) {
      if (this.pacientesOriginal && this.pacientesOriginal.length > 0) {
        this.pacientes = [...this.pacientesOriginal];
      }
    }

    if (!this.pacientesLayerGroup) {
      this.pacientesLayerGroup = L.featureGroup();
    }
    if (!this.map.hasLayer(this.pacientesLayerGroup)) {
      this.pacientesLayerGroup.addTo(this.map);
    }

    // Re-renderizar marcadores y asegurarse de que estén en primer plano visual
    this.agregarMarcadoresPacientes(false);
    if (this.pacientesLayerGroup && typeof (this.pacientesLayerGroup as any).bringToFront === 'function') {
      (this.pacientesLayerGroup as any).bringToFront();
    }

    // Redibujar zonas
    this.dibujarTodasLasZonas();

    // Enfocar inmediatamente en donde están concentrados todos los pacientes
    this.enfocarZonaConMasPacientes(false);

    // Ajuste adicional en el siguiente tick para garantizar teselas y vista perfectas
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize(false);
        this.enfocarZonaConMasPacientes(false);
        if (this.pacientesLayerGroup && typeof (this.pacientesLayerGroup as any).bringToFront === 'function') {
          (this.pacientesLayerGroup as any).bringToFront();
        }
      }
    }, 60);

    this.mostrarToast('Capa de Mapa', `Vista cambiada a ${this.obtenerNombreCapa(tipo)}`, 'info', 1600);
    this.mostrarMenuCapas = false;
    this.cdr.detectChanges();
  }

  obtenerNombreCapa(tipo: string): string {
    switch (tipo) {
      case 'estandar': return 'Google Calles (Estándar)';
      case 'hibrido': return 'Satélite con Calles (Híbrido)';
      case 'satelite': return 'Satélite de Alta Resolución';
      case 'relieve': return 'Relieve y Terreno';
      case 'osm': return 'OpenStreetMap Clásico';
      default: return tipo;
    }
  }


  // 🏠 STREET VIEW FACHADA
  abrirModalStreetView(lat: number, lng: number, nombre: string, direccion: string, colonia: string): void {
    const numLat = Number(lat);
    const numLng = Number(lng);

    if (!numLat || !numLng || isNaN(numLat) || isNaN(numLng) || (numLat === 0 && numLng === 0)) {
      if (direccion) {
        this.mostrarToast('Buscando fachada', 'Abriendo ubicación por dirección...', 'info', 1500);
        const query = encodeURIComponent(`${direccion}, ${colonia || ''}, León, Guanajuato, Mexico`);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
        return;
      }
      Swal.fire({
        icon: 'info',
        title: 'Sin coordenadas exactas',
        text: 'Este paciente aún no cuenta con coordenadas GPS verificadas ni dirección registrada.',
        confirmButtonColor: '#7e101f'
      });
      return;
    }

    this.streetViewPaciente = { lat: numLat, lng: numLng, nombre, direccion, colonia };
    const embedUrl = `https://maps.google.com/maps?q=&layer=c&cbll=${numLat},${numLng}&cbp=11,0,0,0,0&output=svembed`;
    this.streetViewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl);
    this.streetViewExternalUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${numLat},${numLng}`;
    this.mostrarModalStreetView = true;
    this.cdr.detectChanges();
  }

  cerrarModalStreetView(): void {
    this.mostrarModalStreetView = false;
    this.streetViewUrl = null;
    this.streetViewPaciente = null;
    this.cdr.detectChanges();
  }

  abrirStreetViewApp(): void {
    if (this.streetViewExternalUrl) {
      window.open(this.streetViewExternalUrl, '_blank');
    }
  }

}
