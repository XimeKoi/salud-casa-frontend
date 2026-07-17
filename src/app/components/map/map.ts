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

// ⭐ DECLARAR TOASTIFY
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

  filtrosPerfiles = { adulto: false, discapacitado: false, referido: false };
  filtrosRiesgos = { g1: false, g2: false, g3: false, g4: false };

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

  private colorDefault: string = '#1976d2';
  private pacientesOriginal: any[] = [];
  private _eventListener: ((event: any) => void) | null = null;
  private _incidenciaListener: ((event: any) => void) | null = null;
  private apiUrl = 'http://localhost:3000';
  private idEnfermera: number = 1;
  private datosCargados: boolean = false;

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
    this.distritoActual = this.distritoService.getDistritoActual();
    this.centerLat = this.distritoActual.lat;
    this.centerLng = this.distritoActual.lng;
    this.currentZoom = this.distritoActual.zoom;

    if (this.distritoActual.secciones) {
      this.seccionesPermitidas = this.distritoActual.secciones;
    }

    this.distritoSubscription = this.distritoService.distrito$.subscribe((distrito: Distrito) => {
      console.log('📌 [MapComponent] Distrito cambiado:', distrito.nombre);
      this.distritoActual = distrito;
      this.centerLat = distrito.lat;
      this.centerLng = distrito.lng;
      this.currentZoom = distrito.zoom;

      if (distrito.secciones) {
        this.seccionesPermitidas = distrito.secciones;
      }

      if (this.map) {
        this.recargarMapaPorDistrito();
      }
    });

    this.subscriptions.push(
      this.store.select(selectManzanaSeleccionada).subscribe(manzana => {
        console.log('📍 [Map] Manzana seleccionada cambiada:', manzana);
        this.manzanaFiltro = manzana || '';
        if (this.mapInicializado && this.pacientesOriginal.length > 0) {
          this.aplicarFiltroZona();
        }
      })
    );

    this.subscriptions.push(
      this.store.select(selectFiltrosPerfiles).subscribe(perfiles => {
        console.log('🎨 Filtros de perfiles recibidos en mapa:', perfiles);
        this.filtrosPerfiles = perfiles;
        if (this.mapInicializado && this.pacientes.length > 0) {
          this.actualizarMarcadoresConFiltros();
        }
      })
    );

    this.subscriptions.push(
      this.store.select(selectFiltrosRiesgos).subscribe(riesgos => {
        console.log('🎨 Filtros de riesgos recibidos en mapa:', riesgos);
        this.filtrosRiesgos = riesgos;
        if (this.mapInicializado && this.pacientes.length > 0) {
          this.actualizarMarcadoresConFiltros();
        }
      })
    );
  }

  // src/app/components/map/map.ts
  // ⭐ AGREGAR ESTOS MÉTODOS

  // ⭐ NUEVO: Recargar con forceRefresh
  cargarPacientesDirectamente(forceRefresh: boolean = false) {
    if (this.loadingPacientes) return;

    console.log('🔄 [MapComponent] Cargando pacientes directamente del backend...');
    this.loadingPacientes = true;

    // ⭐ FORZAR REFRESH DEL CACHE
    if (forceRefresh) {
      this.pacientesMapService.refreshPacientes();
    }

    // ⭐ LIMPIAR BÚSQUEDA
    this.searchQuery = '';
    this.isSearching = false;
    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    this.http.get(`${this.apiUrl}/pacientes/enfermera/${this.idEnfermera}`).subscribe({
      next: (data: any) => {
        console.log('✅ [MapComponent] Pacientes recibidos:', data?.length || 0);

        let pacientes = data;
        console.log(`📊 [MapComponent] Total pacientes: ${pacientes.length}`);

        // ⭐ ACTUALIZAR CACHE DEL SERVICIO
        this.pacientesMapService.setPacientesCache(pacientes);

        // ⭐ FILTRAR SOLO LOS QUE TIENEN COORDENADAS VÁLIDAS
        const pacientesConCoords = pacientes.filter((p: any) =>
          p.lat && p.lng && p.lat !== 0 && p.lng !== 0
        );
        console.log(`📍 [MapComponent] Pacientes con coordenadas: ${pacientesConCoords.length}`);

        // ⭐ LOG PARA GUZMÁN
        const guzman = pacientes.find((p: any) =>
          p.nombre?.toLowerCase().includes('guzmán') ||
          p.apellidoPaterno?.toLowerCase().includes('guzmán')
        );
        if (guzman) {
          console.log('🔍 [MapComponent] GUZMÁN encontrado:', {
            id: guzman.id,
            nombre: guzman.nombre,
            programa: guzman.programa,
            estatus: guzman.estatus,
            discapacidades: guzman.discapacidades,
            lat: guzman.lat,
            lng: guzman.lng
          });
        }

        this.pacientes = pacientesConCoords;
        this.pacientesOriginal = [...pacientesConCoords];

        // ⭐ GENERAR ZONAS
        const zonasSet = new Set<string>();
        pacientes.forEach((p: any) => {
          let colonia = p.colonia || this.extraerColonia(p.direccion);
          if (colonia && colonia.length > 2) {
            colonia = colonia.toUpperCase().trim();
            zonasSet.add(colonia);
          }
        });

        const todasLasZonas = Array.from(zonasSet)
          .sort((a, b) => a.localeCompare(b))
          .map(zona => zona.charAt(0).toUpperCase() + zona.slice(1).toLowerCase());

        console.log(`📍 ${todasLasZonas.length} zonas disponibles`);

        if (todasLasZonas.length > 0) {
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
        }

        this.loadingPacientes = false;
        this.datosCargados = true;

        if (this.mapInicializado) {
          this.agregarMarcadoresPacientes();
          if (this.pacientes.length > 0) {
            this.mostrarToast('Éxito', `${this.pacientes.length} pacientes cargados en el mapa`, 'success');
          }
        }

        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('❌ [MapComponent] Error cargando pacientes:', error);
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

    // ⭐ ESCUCHAR EVENTO DE RECARGA DESDE CAPTURA
    window.addEventListener('recargarMapa', (event: any) => {
      console.log('🔄 Recargando mapa desde evento de captura...');
      this.cargarPacientesDirectamente();
    });
  }

  ngAfterViewInit() {
    console.log('👀 [MapComponent] ngAfterViewInit');
    setTimeout(() => {
      console.log('🗺️ [MapComponent] Inicializando mapa...');
      this.inicializarMapa();
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
  }

  // ⭐ ============================================
  // ⭐ LIMPIAR SELECCIÓN DE ZONA
  // ⭐ ============================================

  limpiarSeleccionZona() {
    console.log('🧹 [Map] Limpiando selección de zona');
    this.store.dispatch(AppActions.setManzanaSeleccionada({ manzana: '' }));
    this.manzanaFiltro = '';
    this.cdr.detectChanges();
  }

  // ⭐ ============================================
  // ⭐ INICIALIZAR MAPA
  // ⭐ ============================================

  private inicializarMapa() {
    if (this.map) {
      console.log('🗺️ [MapComponent] Mapa ya inicializado');
      return;
    }

    const mapElement = document.getElementById('leafletMap');
    if (!mapElement) {
      console.error('❌ [MapComponent] Elemento #leafletMap no encontrado');
      setTimeout(() => this.inicializarMapa(), 500);
      return;
    }

    try {
      console.log('🗺️ [MapComponent] Inicializando mapa...');

      this.map = L.map('leafletMap', {
        center: [this.centerLat, this.centerLng],
        zoom: this.currentZoom,
        zoomControl: true,
        fadeAnimation: true,
        zoomAnimation: true,
        attributionControl: true
      });

      // ⭐⭐⭐ REGISTRAR EL MAPA EN EL SERVICIO ⭐⭐⭐
      this.mapService.setMap(this.map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(this.map);

      this.clusterGroup = (L as any).markerClusterGroup({
        maxClusterRadius: 40,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: (cluster: any) => {
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

      this.clusterGroup.addTo(this.map);
      this.mapInicializado = true;
      console.log('✅ [MapComponent] Mapa inicializado correctamente');

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
      console.error('❌ [MapComponent] Error al inicializar el mapa:', error);
      this.mostrarToast('Error', 'Error al inicializar el mapa', 'error');
    }
  }

  // ⭐ ============================================
  // ⭐ RECARGAR MAPA POR DISTRITO
  // ⭐ ============================================

  recargarMapaPorDistrito() {
    if (this.distritoActual && this.map) {
      console.log(`🔄 [MapComponent] Recargando mapa para: ${this.distritoActual.nombre}`);
      this.map.setView([this.distritoActual.lat, this.distritoActual.lng], this.distritoActual.zoom);
      this.cargarPacientesDirectamente();
    }
  }

  // ⭐ ============================================
  // ⭐ CARGAR PACIENTES DIRECTAMENTE
  // ⭐ ============================================


  private extraerColonia(direccion: string): string {
    if (!direccion) return '';
    const partes = direccion.split(',');
    if (partes.length >= 2) {
      const colonia = partes[1].trim();
      return colonia.replace(/COL\./g, '').replace(/COLONIA/g, '').trim();
    }
    return '';
  }

  // ⭐ ============================================
  // ⭐ RECARGAR PACIENTES (BOTÓN)
  // ⭐ ============================================

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
    this.cargarPacientesDirectamente();
  }

  actualizarPacientes() {
    this.cargarPacientesDirectamente();
  }

  // ⭐ ============================================
  // ⭐ APLICAR FILTRO DE ZONA
  // ⭐ ============================================

  private aplicarFiltroZona() {
    if (!this.pacientesOriginal || this.pacientesOriginal.length === 0) {
      this.cargarPacientesDirectamente();
      return;
    }

    let pacientesFiltrados = [...this.pacientesOriginal];

    if (this.manzanaFiltro && this.manzanaFiltro !== '') {
      const zonaUpper = this.manzanaFiltro.toUpperCase();
      pacientesFiltrados = pacientesFiltrados.filter((p: any) => {
        const direccion = (p.direccion || '').toUpperCase();
        const colonia = (p.colonia || '').toUpperCase();
        return direccion.includes(zonaUpper) || colonia.includes(zonaUpper);
      });
      console.log(`📍 Filtrando por zona: ${this.manzanaFiltro} -> ${pacientesFiltrados.length} pacientes`);
    }

    this.pacientes = pacientesFiltrados;

    if (this.pacientes.length === 0) {
      this.mostrarToast('Sin pacientes', 'No hay pacientes en esta zona', 'warning');
    }

    this.agregarMarcadoresPacientes();
  }

  // ⭐ ============================================
  // ⭐ ACTUALIZAR MARCADORES CON FILTROS
  // ⭐ ============================================

  private actualizarMarcadoresConFiltros() {
    if (this.pacientes.length === 0) return;
    this.agregarMarcadoresPacientes();
  }

  // ⭐ ============================================
  // ⭐ AGREGAR PACIENTE AL CALENDARIO
  // ⭐ ============================================

  private agregarPacienteAlCalendario(paciente: any) {
    console.log('📅 Agregando paciente al calendario:', paciente);

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

    this.mostrarToast('Paciente agregado al calendario', `${paciente.nombre} listo para programar visita`, 'success', 3000);
  }

  // ⭐ ============================================
  // ⭐ AGREGAR MARCADORES DE PACIENTES
  // ⭐ ============================================

  // src/app/components/map/map.ts

  agregarMarcadoresPacientes() {
    if (!this.map) {
      console.warn('⚠️ Mapa no inicializado');
      return;
    }

    this.limpiarMarcadoresPacientes();

    console.log(`📍 Agregando ${this.pacientes.length} marcadores al mapa`);

    if (this.pacientes.length === 0) {
      console.warn('⚠️ No hay pacientes para mostrar');
      return;
    }

    const hayFiltrosPerfil = this.filtrosPerfiles.adulto || this.filtrosPerfiles.discapacitado || this.filtrosPerfiles.referido;
    const hayFiltrosRiesgo = this.filtrosRiesgos.g1 || this.filtrosRiesgos.g2 ||
      this.filtrosRiesgos.g3 || this.filtrosRiesgos.g4;
    const hayFiltros = hayFiltrosPerfil || hayFiltrosRiesgo;

    const esBusqueda = this.pacientes.length < 50;
    const abrirPopup = esBusqueda && this.pacientes.length <= 10;

    this.clusterGroup = (L as any).markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster: any) => {
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

    let marcadoresAgregados = 0;
    const markers: L.Marker[] = [];

    this.pacientes.forEach((paciente) => {
      if (!paciente.lat || !paciente.lng || paciente.lat === 0 || paciente.lng === 0) {
        return;
      }

      const color = this.obtenerColorPaciente(paciente);

      let cumpleFiltros = true;

      if (hayFiltrosPerfil) {
        const programa = (paciente.programa || '').toUpperCase();
        const esAdulto = programa === 'PAM' || programa.includes('ADULTO');
        const esDiscapacitado = programa === 'DISCAPACIDAD' || programa.includes('DIS');
        const esReferido = programa === 'REFERIDO' || programa.includes('REF');

        const cumplePerfil =
          (this.filtrosPerfiles.adulto && esAdulto) ||
          (this.filtrosPerfiles.discapacitado && esDiscapacitado) ||
          (this.filtrosPerfiles.referido && esReferido);

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

      const size = esBusqueda ? 38 : 28;
      const fontSize = esBusqueda ? 18 : 12;
      const borderWidth = esBusqueda ? 4 : 3;

      let opacity = 1;
      let scale = 1;
      let glowEffect = '';

      if (hayFiltros) {
        if (!cumpleFiltros) {
          opacity = 0.25;
          scale = 0.7;
        } else {
          glowEffect = `
                    box-shadow: 0 0 0 4px ${color}40, 0 0 20px ${color}60;
                    animation: filterPulse 1.5s ease-in-out infinite;
                `;
        }
      }

      const finalSize = Math.round(size * scale);
      const finalFontSize = Math.round(fontSize * scale);

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
                width: ${finalSize}px;
                height: ${finalSize}px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: ${finalFontSize}px;
                border: ${borderWidth}px solid ${cumpleFiltros ? 'white' : '#999'};
                box-shadow: 0 2px 12px rgba(0,0,0,0.3);
                cursor: pointer;
                transition: transform 0.2s;
                opacity: ${opacity};
                ${glowEffect}
                ${!cumpleFiltros && hayFiltros ? 'filter: grayscale(0.8);' : ''}
                ${esBusqueda && cumpleFiltros ? 'animation: searchPulse 1.5s ease-in-out infinite;' : ''}
            ">
                <i class="fas ${icon}"></i>
            </div>
            ${esBusqueda && cumpleFiltros ? `<style>
                @keyframes searchPulse {
                    0% { transform: scale(1); box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
                    50% { transform: scale(1.15); box-shadow: 0 2px 24px rgba(0,0,0,0.5); }
                    100% { transform: scale(1); box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
                }
            </style>` : ''}
            ${hayFiltros && cumpleFiltros ? `<style>
                @keyframes filterPulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 4px ${color}40; }
                    50% { transform: scale(1.05); box-shadow: 0 0 0 8px ${color}60, 0 0 20px ${color}40; }
                    100% { transform: scale(1); box-shadow: 0 0 0 4px ${color}40; }
                }
            </style>` : ''}`,
        className: `custom-marker ${cumpleFiltros ? 'filter-active' : 'filter-inactive'}`,
        iconSize: [finalSize, finalSize],
        iconAnchor: [finalSize / 2, finalSize / 2],
        popupAnchor: [0, -(finalSize / 2)]
      });

      const nombreCompleto = paciente.apellidoPaterno || paciente.apellidoMaterno ?
        `${paciente.apellidoPaterno || ''} ${paciente.apellidoMaterno || ''} ${paciente.nombre || ''}`.trim() :
        paciente.nombre || 'Nombre no disponible';

      let telefonoCompleto = 'No disponible';
      if (paciente.telefonoFijo && paciente.telefonoCelular) {
        telefonoCompleto = `${paciente.telefonoFijo} / ${paciente.telefonoCelular}`;
      } else if (paciente.telefonoCelular) {
        telefonoCompleto = `${paciente.telefonoCelular}`;
      } else if (paciente.telefonoFijo) {
        telefonoCompleto = `${paciente.telefonoFijo}`;
      }

      // ⭐ ESCAPAR CARACTERES ESPECIALES PARA EVITAR ERRORES EN EL POPUP
      const nombreEscapado = this.escapeHtml(nombreCompleto);
      const direccionEscapada = this.escapeHtml(paciente.direccion || 'Dirección no disponible');
      const telefonoEscapado = this.escapeHtml(telefonoCompleto);
      const curpEscapado = this.escapeHtml(paciente.curp || '');
      const coloniaEscapada = this.escapeHtml(paciente.colonia || 'Sin colonia');
      const programaEscapado = this.escapeHtml(paciente.programa || 'Sin programa');
      const estatusEscapado = this.escapeHtml(paciente.estatus || 'Pendiente');
      const seccionEscapada = this.escapeHtml(paciente.seccion || '');

      // ⭐ ⭐ ⭐ POPUP COMPLETO CON BOTONES SIEMPRE VISIBLES ⭐ ⭐ ⭐
      const popupContent = `
            <div style="font-family: 'Montserrat', 'Segoe UI', sans-serif; max-width: 340px; min-width: 300px; padding: 4px 0;">
                <!-- HEADER -->
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 2px solid #f0ece8;">
                    <div style="width: 44px; height: 44px; border-radius: 50%; background: ${cumpleFiltros ? color : '#cccccc'}; display: flex; align-items: center; justify-content: center; color: white; font-size: 20px; flex-shrink: 0; opacity: ${cumpleFiltros ? 1 : 0.5};">
                        <i class="fas fa-user-circle"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 700; font-size: 15px; color: #701f2f; line-height: 1.2;">${nombreEscapado}</div>
                        <div style="font-size: 11px; color: #999;">
                            ${programaEscapado} ${seccionEscapada ? '· Sec: ' + seccionEscapada : ''}
                        </div>
                        <div style="font-size: 10px; color: ${cumpleFiltros ? color : '#999'}; font-weight: 600; margin-top: 2px;">
                            <i class="fas fa-map-pin"></i> ${coloniaEscapada}
                        </div>
                    </div>
                </div>

                <!-- INFORMACIÓN DEL PACIENTE -->
                <div style="font-size: 12px; color: #333; line-height: 1.6;">
                    <div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 4px;">
                        <i class="fas fa-map-marker-alt" style="color: #701f2f; width: 16px; margin-top: 2px; flex-shrink: 0; font-size: 13px;"></i>
                        <span style="word-break: break-word; font-size: 12px;">${direccionEscapada}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px;">
                        <i class="fas fa-phone" style="color: #701f2f; width: 16px; flex-shrink: 0; font-size: 13px;"></i>
                        <span style="font-size: 12px; word-break: break-all;">${telefonoEscapado}</span>
                    </div>
                    ${curpEscapado ? `
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                        <i class="fas fa-id-card" style="color: #701f2f; width: 16px; flex-shrink: 0; font-size: 13px;"></i>
                        <span style="font-size: 11px; color: #666; word-break: break-all; font-weight: 500;">CURP: ${curpEscapado}</span>
                    </div>
                    ` : `
                    <div style="display: flex; align-items: center; gap: 6px; margin-top: 2px;">
                        <i class="fas fa-id-card" style="color: #999; width: 16px; flex-shrink: 0; font-size: 13px;"></i>
                        <span style="font-size: 11px; color: #999;">Sin CURP registrado</span>
                    </div>
                    `}
                </div>

                <!-- ESTATUS -->
                <div style="margin-top: 8px; display: flex; gap: 6px; flex-wrap: wrap;">
                    <span style="display: inline-block; background: ${estatusLower === 'pendiente' ? '#fff3e0' : estatusLower === 'visitado' ? '#e8f5e9' : estatusLower === 'rechazo' ? '#ffebee' : '#f0ece8'}; color: ${estatusLower === 'pendiente' ? '#e67e22' : estatusLower === 'visitado' ? '#2e7d32' : estatusLower === 'rechazo' ? '#c62828' : '#6c757d'}; padding: 3px 12px; border-radius: 14px; font-size: 11px; font-weight: 700;">
                        <i class="fas ${estatusLower === 'pendiente' ? 'fa-clock' : estatusLower === 'visitado' ? 'fa-check-circle' : estatusLower === 'rechazo' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                        ${estatusEscapado}
                    </span>
                    <span style="display: inline-block; background: #f0ece8; color: #666; padding: 3px 12px; border-radius: 14px; font-size: 11px; font-weight: 600;">
                        <i class="fas fa-hashtag"></i> ID: ${paciente.id || 'N/A'}
                    </span>
                </div>

                <!-- ⭐ BOTONES - SIEMPRE VISIBLES ⭐ -->
                <div style="margin-top: 14px; padding-top: 12px; border-top: 2px solid #f0ece8; display: flex; flex-direction: column; gap: 8px;">
                    
                    <!-- BOTÓN AGENDAR VISITA -->
                    <button onclick="window.dispatchEvent(new CustomEvent('agregarAlCalendario', { 
                        detail: { 
                            pacienteId: ${paciente.id}, 
                            nombre: '${nombreEscapado.replace(/'/g, "\\'")}', 
                            telefono: '${telefonoEscapado.replace(/'/g, "\\'")}', 
                            direccion: '${direccionEscapada.replace(/'/g, "\\'")}', 
                            curp: '${curpEscapado.replace(/'/g, "\\'")}', 
                            colonia: '${coloniaEscapada.replace(/'/g, "\\'")}' 
                        } 
                    }))" 
                        style="background: #701f2f; color: white; border: none; padding: 10px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.3s; width: 100%; font-family: 'Montserrat', sans-serif; box-shadow: 0 2px 8px rgba(112, 31, 47, 0.3);" 
                        onmouseover="this.style.background='#8b2e4a'; this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 16px rgba(112, 31, 47, 0.4)';" 
                        onmouseout="this.style.background='#701f2f'; this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(112, 31, 47, 0.3)';">
                        <i class="fas fa-calendar-plus"></i> Agendar Visita
                    </button>

                    <!-- BOTÓN REPORTAR INCIDENCIA -->
                    <button onclick="window.dispatchEvent(new CustomEvent('reportarIncidencia', { 
                        detail: { 
                            pacienteId: ${paciente.id}, 
                            nombre: '${nombreEscapado.replace(/'/g, "\\'")}', 
                            telefono: '${telefonoEscapado.replace(/'/g, "\\'")}', 
                            direccion: '${direccionEscapada.replace(/'/g, "\\'")}', 
                            curp: '${curpEscapado.replace(/'/g, "\\'")}', 
                            colonia: '${coloniaEscapada.replace(/'/g, "\\'")}', 
                            seccion: '${seccionEscapada.replace(/'/g, "\\'")}' 
                        } 
                    }))" 
                        style="background: #e67e22; color: white; border: none; padding: 10px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.3s; width: 100%; font-family: 'Montserrat', sans-serif; box-shadow: 0 2px 8px rgba(230, 126, 34, 0.3);" 
                        onmouseover="this.style.background='#d35400'; this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 16px rgba(230, 126, 34, 0.4)';" 
                        onmouseout="this.style.background='#e67e22'; this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(230, 126, 34, 0.3)';">
                        <i class="fas fa-exclamation-triangle"></i> Reportar Incidencia
                    </button>
                </div>

                <!-- FOOTER -->
                <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #f0ece8; display: flex; justify-content: center;">
                    <span style="font-size: 9px; color: #bbb; font-weight: 400; letter-spacing: 0.3px;">SALUD CASA POR CASA</span>
                </div>
            </div>
        `;

      const tooltipContent = `
            <div style="font-family: 'Montserrat', sans-serif; padding: 6px 12px; text-align: center; min-width: 100px;">
                <div style="font-weight: 700; font-size: 13px; color: ${cumpleFiltros ? '#701f2f' : '#999'};">${nombreEscapado}</div>
                <div style="font-size: 11px; color: ${cumpleFiltros ? color : '#999'}; font-weight: 600;">${paciente.estatus || 'Pendiente'}</div>
                ${hayFiltros && !cumpleFiltros ? '<div style="font-size: 9px; color: #c62828;">(Filtrado)</div>' : ''}
            </div>
        `;

      const marker = L.marker([paciente.lat, paciente.lng], {
        icon: markerIcon,
        zIndexOffset: cumpleFiltros ? 100 : 0
      })
        .bindPopup(popupContent, {
          maxWidth: 380,
          minWidth: 300,
          className: 'paciente-popup',
          autoPan: true,
          autoPanPadding: [20, 20]
        })
        .bindTooltip(tooltipContent, {
          permanent: esBusqueda && cumpleFiltros,
          direction: 'top',
          className: 'paciente-tooltip',
          offset: [0, -8]
        });

      if (abrirPopup && cumpleFiltros) {
        setTimeout(() => {
          marker.openPopup();
        }, 500);
      }

      marker.on('click', () => {
        marker.openPopup();
      });

      this.clusterGroup.addLayer(marker);
      markers.push(marker);
      marcadoresAgregados++;
    });

    if (marcadoresAgregados > 0) {
      this.clusterGroup.addTo(this.map);
      this.marcadoresPacientes = markers;

      console.log(`✅ ${marcadoresAgregados} marcadores agregados al mapa con cluster`);

      try {
        const bounds = this.clusterGroup.getBounds();
        if (bounds.isValid()) {
          this.map.fitBounds(bounds, { padding: [80, 80] });
        }
      } catch (e) {
        console.warn('No se pudo ajustar el mapa a los marcadores');
      }
    } else {
      console.warn('⚠️ No se pudieron agregar marcadores (todos sin coordenadas)');
    }

    // ⭐ ESCUCHAR EVENTOS DE LOS BOTONES
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
        this.agregarPacienteAlCalendario(paciente);
      });
    };

    window.addEventListener('agregarAlCalendario', this._eventListener);

    if (this._incidenciaListener) {
      window.removeEventListener('reportarIncidencia', this._incidenciaListener);
    }

    this._incidenciaListener = (event: any) => {
      this.ngZone.run(() => {
        const data = event.detail;
        console.log('📋 Reportando incidencia para:', data);

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

  // ⭐ FUNCIÓN PARA ESCAPAR HTML Y EVITAR INYECCIÓN
  escapeHtml(text: string): string {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  limpiarMarcadoresPacientes() {
    if (this.map) {
      if (this.clusterGroup) {
        this.map.removeLayer(this.clusterGroup);
        this.clusterGroup = null;
      }
      this.marcadoresPacientes.forEach(marker => {
        if (this.map) {
          this.map.removeLayer(marker);
        }
      });
    }
    this.marcadoresPacientes = [];

    if (this._eventListener) {
      window.removeEventListener('agregarAlCalendario', this._eventListener);
      this._eventListener = null;
    }
    if (this._incidenciaListener) {
      window.removeEventListener('reportarIncidencia', this._incidenciaListener);
      this._incidenciaListener = null;
    }
  }

  // ⭐ ============================================
  // ⭐ OBTENER COLOR DEL PACIENTE
  // ⭐ ============================================

  private obtenerColorPaciente(paciente: any): string {
    const hayFiltrosPerfil = this.filtrosPerfiles.adulto || this.filtrosPerfiles.discapacitado || this.filtrosPerfiles.referido;
    const hayFiltrosRiesgo = this.filtrosRiesgos.g1 || this.filtrosRiesgos.g2 ||
      this.filtrosRiesgos.g3 || this.filtrosRiesgos.g4;

    if (hayFiltrosPerfil) {
      const programa = (paciente.programa || '').toUpperCase();
      if (this.filtrosPerfiles.adulto && (programa === 'PAM' || programa.includes('ADULTO'))) {
        return '#2e7d32';
      }
      if (this.filtrosPerfiles.discapacitado && (programa === 'DISCAPACIDAD' || programa.includes('DIS'))) {
        return '#7B1FA2';
      }
      if (this.filtrosPerfiles.referido && (programa === 'REFERIDO' || programa.includes('REF'))) {
        return '#1565C0';
      }
    }

    if (hayFiltrosRiesgo) {
      const estatus = (paciente.estatus || '').toUpperCase();
      const riesgo = this.asignarRiesgo(estatus);
      if (this.filtrosRiesgos.g1 && riesgo === 'g1') return '#4CAF50';
      if (this.filtrosRiesgos.g2 && riesgo === 'g2') return '#FFC107';
      if (this.filtrosRiesgos.g3 && riesgo === 'g3') return '#FF9800';
      if (this.filtrosRiesgos.g4 && riesgo === 'g4') return '#D32F2F';
    }

    const estatus = (paciente.estatus || '').toUpperCase();
    if (this.coloresEstatus[estatus]) {
      return this.coloresEstatus[estatus];
    }

    return this.colorDefault;
  }

  private asignarRiesgo(estatus: string): string {
    const e = estatus.toUpperCase();
    if (e === 'VISITADO' || e === 'COMPLETADA') return 'g1';
    if (e === 'PENDIENTE' || e === 'SIN VISITA') return 'g2';
    if (e === 'RECHAZO' || e === 'INCIDENCIA') return 'g3';
    if (e === 'FINADO') return 'g4';
    return 'g2';
  }

  // ⭐ ============================================
  // ⭐ BÚSQUEDA DE DIRECCIÓN - CORREGIDA
  // ⭐ ============================================

  buscarDireccion() {
    const query = this.searchQuery?.trim();
    if (!query) {
      this.mostrarToast('Error', 'Ingresa una dirección para buscar', 'warning');
      return;
    }

    this.isSearching = true;
    this.cdr.detectChanges();

    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    const pacientesOriginales = [...this.pacientesOriginal];

    this.http.get(`${this.apiUrl}/pacientes/buscar?direccion=${encodeURIComponent(query)}`).subscribe({
      next: (response: any) => {
        console.log('📦 Respuesta de búsqueda en BD:', response);

        let pacientes = response || [];

        if (pacientes && pacientes.length > 0) {
          const pacientesConCoords = pacientes.filter((p: any) => p.lat && p.lng && p.lat !== 0 && p.lng !== 0);

          if (pacientesConCoords.length > 0) {
            // ⭐ EXTRAER CALLE, NÚMERO Y COLONIA DE LA BÚSQUEDA
            const numeroMatch = query.match(/\d+/);
            const numero = numeroMatch ? numeroMatch[0] : null;
            let calleSinNumero = query.replace(/\d+/g, '').replace(/#/g, '').replace(/\./g, '').trim().toUpperCase();
            calleSinNumero = calleSinNumero.replace(/\s+/g, ' ').trim();

            // ⭐ EXTRAER LA COLONIA DE LA BÚSQUEDA
            const queryParts = query.split(',');
            const coloniaBuscada = queryParts.length > 1 ? queryParts[1].trim().toUpperCase() : '';

            console.log(`🔍 Buscando: Calle="${calleSinNumero}", Número="${numero}", Colonia="${coloniaBuscada}"`);

            let finalPacientes: any[] = pacientesConCoords;

            // ⭐ FILTRAR POR CALLE + NÚMERO
            if (numero && calleSinNumero.length > 2) {
              // ⭐ PASO 1: Filtrar por calle
              const conCalle = pacientesConCoords.filter((p: any) => {
                const dirUpper = (p.direccion || '').toUpperCase();
                return dirUpper.includes(calleSinNumero);
              });

              console.log(`📋 Pacientes con calle "${calleSinNumero}": ${conCalle.length}`);

              if (conCalle.length > 0) {
                // ⭐ PASO 2: Filtrar por número exacto
                finalPacientes = conCalle.filter((p: any) => {
                  const dirUpper = (p.direccion || '').toUpperCase();
                  return dirUpper.includes(`#${numero}`) ||
                    dirUpper.includes(` ${numero} `) ||
                    dirUpper.includes(` ${numero},`) ||
                    dirUpper.includes(` ${numero}.`) ||
                    dirUpper.includes(`-${numero}`);
                });

                console.log(`📋 Pacientes con calle + número exacto: ${finalPacientes.length}`);

                // ⭐ Si no hay coincidencia exacta, usar los de la calle
                if (finalPacientes.length === 0) {
                  finalPacientes = conCalle;
                  console.log(`⚠️ No hay coincidencia exacta, usando ${conCalle.length} pacientes de la calle`);
                }
              } else {
                // ⭐ Si no hay pacientes con la calle, buscar solo por número
                finalPacientes = pacientesConCoords.filter((p: any) => {
                  const dirUpper = (p.direccion || '').toUpperCase();
                  return dirUpper.includes(`#${numero}`) ||
                    dirUpper.includes(` ${numero} `) ||
                    dirUpper.includes(`-${numero}`);
                });
                console.log(`📋 Pacientes solo por número: ${finalPacientes.length}`);
              }

              // ⭐ PASO 3: Si hay múltiples resultados, priorizar por colonia
              if (finalPacientes.length > 1) {
                // ⭐ ORDENAR: primero los que tienen la colonia exacta
                finalPacientes.sort((a: any, b: any) => {
                  const dirA = (a.direccion || '').toUpperCase();
                  const dirB = (b.direccion || '').toUpperCase();

                  // ⭐ Verificar si la colonia está en la dirección
                  const aTieneColonia = coloniaBuscada ? dirA.includes(coloniaBuscada) : true;
                  const bTieneColonia = coloniaBuscada ? dirB.includes(coloniaBuscada) : true;

                  // ⭐ Priorizar los que tienen la colonia exacta
                  if (aTieneColonia && !bTieneColonia) return -1;
                  if (!aTieneColonia && bTieneColonia) return 1;

                  // ⭐ Si ambos tienen o no tienen la colonia, priorizar el que tiene la calle exacta
                  const aExacto = dirA.includes(calleSinNumero) ? 1 : 0;
                  const bExacto = dirB.includes(calleSinNumero) ? 1 : 0;
                  return bExacto - aExacto;
                });

                // ⭐ Si el primero tiene la colonia exacta, mostrar solo ese
                const primero = finalPacientes[0];
                const dirPrimero = (primero.direccion || '').toUpperCase();

                if (coloniaBuscada && dirPrimero.includes(coloniaBuscada)) {
                  finalPacientes = [primero];
                  console.log(`✅ Mostrando solo el más relevante: ${primero.nombre} (ID: ${primero.id})`);
                } else {
                  console.log(`⚠️ Mostrando ${finalPacientes.length} pacientes (sin colonia clara)`);
                }
              }
            }

            if (finalPacientes.length === 0) {
              this.mostrarToast('Sin resultados', `No se encontró "${query}"`, 'warning');
              this.isSearching = false;
              this.cdr.detectChanges();
              return;
            }

            console.log(`✅ Mostrando ${finalPacientes.length} pacientes`);

            this.pacientes = finalPacientes;
            this.pacientesOriginal = [...finalPacientes];

            // ⭐ ACTUALIZAR ZONAS
            const zonasSet = new Set<string>();
            this.pacientes.forEach((p: any) => {
              const colonia = p.colonia || this.extraerColonia(p.direccion);
              if (colonia) {
                zonasSet.add(colonia);
              }
            });
            this.manzanasDisponibles = Array.from(zonasSet).sort();

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

            this.agregarMarcadoresPacientes();

            const primero = finalPacientes[0];
            if (this.map && primero.lat && primero.lng) {
              this.map.setView([primero.lat, primero.lng], 16);
            }

            let mensaje = `${finalPacientes.length} paciente(s) encontrado(s)`;
            if (finalPacientes.length === 1) {
              mensaje = `1 paciente encontrado en "${query}"`;
            }

            this.mostrarToast('📍 Pacientes encontrados', mensaje, 'success');

            this.isSearching = false;
            this.cdr.detectChanges();
            return;
          } else {
            this.mostrarToast('Sin coordenadas', 'Los pacientes encontrados no tienen ubicación registrada', 'warning');
            this.isSearching = false;
            this.cdr.detectChanges();
            return;
          }
        }

        console.log('🌍 No hay pacientes en BD, buscando ubicación con AWS Location...');

        this.pacientes = pacientesOriginales;
        this.pacientesOriginal = [...pacientesOriginales];

        this.http.get(`${this.apiUrl}/geocode?direccion=${encodeURIComponent(query)}`).subscribe({
          next: (geoResponse: any) => {
            if (geoResponse && geoResponse.success && geoResponse.lat && geoResponse.lng) {
              this.mostrarMarcadorUbicacion({
                lat: geoResponse.lat,
                lon: geoResponse.lng,
                display_name: geoResponse.display_name || query
              });
              this.mostrarToast('📍 Dirección Ubicada', `Se encontró: ${geoResponse.display_name || query}`, 'success');
            } else {
              this.mostrarToast('Sin resultados', `No pudimos encontrar "${query}"`, 'warning');
            }
            this.isSearching = false;
            this.cdr.detectChanges();
          },
          error: (geoError) => {
            console.error('❌ Error en AWS Location:', geoError);
            this.mostrarToast('Error', 'No se pudo conectar con el servicio de ubicación', 'error');
            this.isSearching = false;
            this.cdr.detectChanges();
          }
        });
      },
      error: (error) => {
        console.error('❌ Error buscando en BD:', error);
        this.pacientes = pacientesOriginales;
        this.pacientesOriginal = [...pacientesOriginales];
        this.isSearching = false;
        this.cdr.detectChanges();
      }
    });
  }

  // ⭐ BÚSQUEDA AVANZADA
  buscarDireccionConEntrecalles() {
    this.buscarDireccion();
  }

  // ⭐ ============================================
  // ⭐ MOSTRAR MARCADOR DE UBICACIÓN
  // ⭐ ============================================

  private mostrarMarcadorUbicacion(result: any) {
    if (!this.map) return;

    if (this.searchMarker) {
      try { this.map.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    const searchIcon = L.divIcon({
      html: `<div style="
        background: #1565C0;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 22px;
        border: 4px solid white;
        box-shadow: 0 0 0 6px rgba(21, 101, 192, 0.3), 0 4px 20px rgba(0,0,0,0.4);
        animation: searchPulse 1.5s ease-in-out infinite;
        z-index: 9999;
        pointer-events: auto;
      ">
        <i class="fas fa-search-location"></i>
      </div>
      <style>
        @keyframes searchPulse {
          0% { transform: scale(1); box-shadow: 0 0 0 6px rgba(21, 101, 192, 0.3); }
          50% { transform: scale(1.15); box-shadow: 0 0 0 12px rgba(21, 101, 192, 0.1); }
          100% { transform: scale(1); box-shadow: 0 0 0 6px rgba(21, 101, 192, 0.3); }
        }
      </style>`,
      className: 'search-marker',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22]
    });

    const popupContent = `
      <div style="font-family: 'Montserrat', sans-serif; max-width: 320px; padding: 8px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: #1565C0; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px; flex-shrink: 0;">
            <i class="fas fa-search-location"></i>
          </div>
          <div>
            <div style="font-weight: 700; font-size: 15px; color: #1565C0;">📍 Ubicación buscada</div>
            <div style="font-size: 12px; color: #666; word-break: break-word;">${result.display_name || 'Dirección no encontrada'}</div>
          </div>
        </div>
        <div style="font-size: 11px; color: #999; border-top: 1px solid #f0ece8; padding-top: 8px; margin-top: 4px;">
          <i class="fas fa-crosshairs"></i> Lat: ${result.lat.toFixed(6)}, Lng: ${result.lon.toFixed(6)}
        </div>
        <div style="margin-top: 6px; font-size: 11px; color: #e67e22; background: #fff3e0; padding: 6px 10px; border-radius: 8px;">
          <i class="fas fa-info-circle"></i> No se encontraron pacientes en esta dirección
        </div>
      </div>
    `;

    this.searchMarker = L.marker([result.lat, result.lon], {
      icon: searchIcon,
      zIndexOffset: 10000
    })
      .bindPopup(popupContent, {
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
    }, 500);

    if (this.map) {
      this.map.setView([result.lat, result.lon], 16);
    }

    console.log('📍 Marcador de ubicación mostrado en:', result.lat, result.lon);
  }

  // ⭐ ============================================
  // ⭐ GETTER PARA EL MAPA
  // ⭐ ============================================

  getMap(): L.Map | null {
    return this.map;
  }

  // ⭐ ============================================
  // ⭐ LIMPIAR BÚSQUEDA
  // ⭐ ============================================

  limpiarBusqueda() {
    console.log('🧹 [Map] Limpiando búsqueda...');

    this.searchQuery = '';
    this.isSearching = false;

    if (this.searchMarker) {
      try { this.map?.removeLayer(this.searchMarker); } catch (e) { }
      this.searchMarker = null;
    }

    if (this.pacientesOriginal && this.pacientesOriginal.length > 0) {
      this.pacientes = [...this.pacientesOriginal];
      this.agregarMarcadoresPacientes();
      this.mostrarToast('📍 Vista completa', 'Mostrando todos los pacientes', 'info');
    } else {
      this.cargarPacientesDirectamente();
    }

    this.cdr.detectChanges();
  }

  // ⭐ ============================================
  // ⭐ MOSTRAR TOAST
  // ⭐ ============================================

  mostrarToast(titulo: string, mensaje: string, tipo: 'success' | 'error' | 'info' | 'warning' = 'info', duracion: number = 3000) {
    const toastsAnteriores = document.querySelectorAll('.custom-toast-map');
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
      className: 'custom-toast-map'
    }).showToast();

    setTimeout(() => {
      const toastElement = document.querySelector('.custom-toast-map') as HTMLElement;
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
            <button onclick="this.closest('.custom-toast-map').remove()" style="background: none; border: none; color: #bbb; cursor: pointer; padding: 8px 12px; font-size: 16px; transition: color 0.2s;">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `;
      }
    }, 50);
  }
}