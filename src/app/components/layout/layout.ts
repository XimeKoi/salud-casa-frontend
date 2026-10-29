// src/app/components/layout/layout.ts

import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { Store } from '@ngrx/store';
import { Observable, Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AppState } from '../../store/app.state';
import * as AppActions from '../../store/app.actions';
import {
  selectAnioActivo,
  selectManzanaSeleccionada,
  selectColoresManzanas
} from '../../store/app.selectors';
import { HeaderComponent } from '../header/header';
import { AdminModalComponent } from '../admin-modal/admin-modal';
import { FormsModule } from '@angular/forms';
import { PacientesMapService, PacienteMap } from '../../services/pacientes-map.service';
import { VisitasHoyService } from '../../services/visitas-hoy.service';
import Swal from 'sweetalert2';

export interface ColoniaInfo {
  id: string;
  nombre: string;
  totalPacientes: number;
  visitados: number;
  pendientes: number;
  progresoPct: number;
  esCompletada: boolean;
  pacientes: PacienteMap[];
  color: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, AdminModalComponent, FormsModule],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss']
})
export class LayoutComponent implements OnInit, OnDestroy {
  anioActivo$: Observable<string>;
  coloniaSeleccionada: string = '';
  coloresManzanas: { [key: string]: string } = {};

  mostrarSidebar: boolean = true;
  sidebarMobileOpen: boolean = false;
  sidebarCollapsed: boolean = false;
  busquedaColonia: string = '';
  colonias: ColoniaInfo[] = [];
  todosLosPacientes: PacienteMap[] = [];

  // ⭐ ESTADO DE MODO PROXIMIDAD (GEOCERCA)
  modoProximidad: boolean = false;
  cargandoProximidad: boolean = false;
  radioProximidadKm: number = 1;
  pacientesCercanosCount: number = 0;
  ultimaUbicacionUsuario: { lat: number; lng: number } | null = null;

  toggleSidebarMobile() {
    this.sidebarMobileOpen = !this.sidebarMobileOpen;
    this.cdr.detectChanges();
  }

  closeSidebarMobile() {
    this.sidebarMobileOpen = false;
    this.cdr.detectChanges();
  }

  toggleSidebarCollapse() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 350);
    this.cdr.detectChanges();
  }

  cerrarSidebar() {
    if (this.sidebarMobileOpen) {
      this.sidebarMobileOpen = false;
    } else {
      this.sidebarCollapsed = true;
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 350);
    }
    this.cdr.detectChanges();
  }

  private coloresCache: { [key: string]: string } = {};
  private subscriptions: Subscription[] = [];

  private coloresDisponibles = [
    '#9F2241', '#235B4E', '#2563eb', '#16a34a', '#d97706',
    '#7c3aed', '#db2777', '#0891b2', '#ea580c', '#4f46e5',
    '#059669', '#ca8a04', '#9333ea', '#e11d48', '#0284c7'
  ];

  private coloniasConocidas = [
    'SANTA ROSA DE LIMA', 'JARDINES DE LOS NARANJOS', 'LOS NARANJOS',
    'RINCON DE LOS NARANJOS', 'MISION DE SAN JOSE', 'REAL DE SAN JOSE',
    'RESIDENCIAL VICTORIA', 'SAN JOSE DEL CONSUELO', 'EL MANANTIAL',
    'VALLE DE SAN JOSE', 'RESIDENCIAL RENTERIA', 'RESIDENCIAL PLATINO',
    'CUMBRES DE LAS HILAMAS', 'VILLA SUR LEON', 'LA SELVA', 'LEON II',
    'LA MODERNA', 'SAN PEDRO PLUS', 'SANTA ROSA DE LIMA IVEG',
    'SAN MARTIN', 'SAN LAZARO', 'QUINTA SAN LORENZO', 'PASEO DE LA CASTELLANA',
    'PASEO DEL MOLINO', 'PEÑITAS', 'OBREGON', 'JARDINES DEL SOL',
    'LA AZTECA', 'ZONA CENTRO'
  ];

  constructor(
    private store: Store<{ app: AppState }>,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private pacientesMapService: PacientesMapService,
    public visitasHoyService: VisitasHoyService
  ) {
    this.anioActivo$ = this.store.select(selectAnioActivo);
  }

  get totalPlanHoy(): number {
    return this.visitasHoyService.totalCount;
  }

  get completadasPlanHoy(): number {
    return this.visitasHoyService.completadasCount;
  }

  abrirMiRutaHoy() {
    window.dispatchEvent(new CustomEvent('abrirMiRutaHoy'));
  }

  ngOnInit() {
    console.log('🔄 [Layout] Inicializando componente y cargando colonias...');

    // 1. Escuchar selección de colonia desde el Store
    this.subscriptions.push(
      this.store.select(selectManzanaSeleccionada).subscribe(coloniaId => {
        this.coloniaSeleccionada = coloniaId || '';
        this.cdr.detectChanges();
      })
    );

    // 2. Escuchar colores
    this.subscriptions.push(
      this.store.select(selectColoresManzanas).subscribe(colores => {
        if (colores && Object.keys(colores).length > 0) {
          this.coloresManzanas = { ...colores };
          this.coloresCache = { ...colores };
          this.cdr.detectChanges();
        }
      })
    );

    // 3. Control de visibilidad del sidebar en rutas
    this.subscriptions.push(
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe(() => {
        this.actualizarVisibilidadSidebar();
        this.cdr.detectChanges();
      })
    );

    this.actualizarVisibilidadSidebar();

    // 4. Cargar y agrupar personas por colonias
    this.cargarYAgruparColonias();
  }

  private cargarYAgruparColonias() {
    this.subscriptions.push(
      this.pacientesMapService.getPacientes().subscribe({
        next: (pacientes: PacienteMap[]) => {
          if (pacientes && pacientes.length > 0) {
            this.agruparPacientesPorColonia(pacientes);
          }
        },
        error: (err) => {
          console.error('❌ Error al obtener pacientes en Layout:', err);
        }
      })
    );
  }

  private agruparPacientesPorColonia(pacientes: PacienteMap[]) {
    this.todosLosPacientes = [...pacientes];
    const mapa = new Map<string, PacienteMap[]>();

    pacientes.forEach(p => {
      const nombreZona = this.determinarZona(p);
      if (!mapa.has(nombreZona)) {
        mapa.set(nombreZona, []);
      }
      mapa.get(nombreZona)!.push(p);
    });

    const listaColonias: ColoniaInfo[] = [];
    let colorIdx = 0;
    const coloresStore: { [key: string]: string } = {};

    mapa.forEach((pacs, nombre) => {
      const color = this.coloresDisponibles[colorIdx % this.coloresDisponibles.length];
      colorIdx++;

      const total = pacs.length;
      const visitados = pacs.filter(p => {
        const st = (p.estatus || '').toUpperCase();
        return st === 'VISITADO' || st === 'COMPLETADA';
      }).length;
      const pendientes = pacs.filter(p => {
        const st = (p.estatus || '').toUpperCase();
        return st === 'PENDIENTE' || st === 'SIN VISITA' || !st;
      }).length;
      const progresoPct = total > 0 ? Math.round((visitados / total) * 100) : 0;
      const esCompletada = visitados > 0 && visitados === total;

      listaColonias.push({
        id: nombre,
        nombre: nombre,
        totalPacientes: total,
        visitados: visitados,
        pendientes: pendientes,
        progresoPct: progresoPct,
        esCompletada: esCompletada,
        pacientes: pacs,
        color: color
      });

      coloresStore[nombre] = color;
    });

    // Ordenar de mayor a menor cantidad de pacientes para máxima visibilidad y usabilidad
    listaColonias.sort((a, b) => b.totalPacientes - a.totalPacientes);

    this.colonias = listaColonias;
    this.coloresCache = { ...coloresStore };
    this.coloresManzanas = { ...coloresStore };

    this.store.dispatch(AppActions.setColoresManzanas({ colores: coloresStore }));
    this.store.dispatch(AppActions.setManzanasDisponibles({
      manzanas: this.colonias.map(c => c.id)
    }));

    this.cdr.detectChanges();
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

  private extraerColonia(p: PacienteMap): string {
    return this.determinarZona(p);
  }

  private formatearNombreColonia(texto: string): string {
    if (!texto) return '';
    return texto
      .toLowerCase()
      .split(' ')
      .map(palabra => {
        if (['de', 'del', 'los', 'la', 'las', 'el', 'y', 'en'].includes(palabra)) {
          return palabra;
        }
        return palabra.charAt(0).toUpperCase() + palabra.slice(1);
      })
      .join(' ');
  }

  get coloniasFiltradas(): ColoniaInfo[] {
    if (!this.busquedaColonia || this.busquedaColonia.trim() === '') {
      return this.colonias;
    }
    const q = this.busquedaColonia.toLowerCase().trim();
    return this.colonias.filter(c =>
      c.nombre.toLowerCase().includes(q)
    );
  }

  get totalPacientes(): number {
    return this.colonias.reduce((acc, curr) => acc + curr.totalPacientes, 0);
  }

  get totalVisitados(): number {
    return this.colonias.reduce((acc, curr) => acc + curr.visitados, 0);
  }

  get totalPendientes(): number {
    return this.colonias.reduce((acc, curr) => acc + curr.pendientes, 0);
  }

  get progresoGlobalPct(): number {
    const total = this.totalPacientes;
    return total > 0 ? Math.round((this.totalVisitados / total) * 100) : 0;
  }

  get topColonias(): ColoniaInfo[] {
    return [...this.colonias]
      .filter(c => c.totalPacientes > 0)
      .sort((a, b) => b.pendientes - a.pendientes || b.totalPacientes - a.totalPacientes)
      .slice(0, 4);
  }

  get coloniaSeleccionadaNombre(): string {
    if (this.modoProximidad) {
      return `Cerca (< ${this.radioProximidadKm} km)`;
    }
    if (!this.coloniaSeleccionada) return '';
    const col = this.colonias.find(c => c.id === this.coloniaSeleccionada);
    return col ? col.nombre : this.coloniaSeleccionada;
  }

  getColorColonia(id: string): string {
    if (!id) return '#9F2241';
    if (this.coloresCache[id]) return this.coloresCache[id];
    const col = this.colonias.find(c => c.id === id);
    return col ? col.color : '#9F2241';
  }

  isColoniaSeleccionada(id: string): boolean {
    return this.coloniaSeleccionada === id;
  }

  seleccionarColonia(id: string) {
    if (this.modoProximidad) {
      this.modoProximidad = false;
      window.dispatchEvent(new CustomEvent('limpiarProximidad'));
    }

    if (this.coloniaSeleccionada === id || id === '') {
      // Deseleccionar o mostrar todas
      this.coloniaSeleccionada = '';
      this.store.dispatch(AppActions.setManzanaSeleccionada({ manzana: '' }));
      window.dispatchEvent(new CustomEvent('limpiarManzanaSeleccionada'));
    } else {
      // Seleccionar colonia
      const col = this.colonias.find(c => c.id === id);
      if (col && col.pacientes.length > 0) {
        this.coloniaSeleccionada = id;
        this.store.dispatch(AppActions.setManzanaSeleccionada({ manzana: id }));

        window.dispatchEvent(new CustomEvent('seleccionarManzana', {
          detail: {
            manzanaId: id,
            nombre: col.nombre,
            colonia: col.nombre,
            pacientes: col.pacientes,
            color: col.color
          }
        }));
      }
    }
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      this.sidebarMobileOpen = false;
    }
    this.cdr.detectChanges();
  }

  // ⭐ MODOS DE PROXIMIDAD GPS
  toggleModoProximidad() {
    if (this.modoProximidad) {
      this.desactivarModoProximidad();
    } else {
      this.activarModoProximidad(this.radioProximidadKm);
    }
  }

  desactivarModoProximidad() {
    this.modoProximidad = false;
    this.coloniaSeleccionada = '';
    this.store.dispatch(AppActions.setManzanaSeleccionada({ manzana: '' }));
    window.dispatchEvent(new CustomEvent('limpiarProximidad'));
    this.cdr.detectChanges();
  }

  activarModoProximidad(radioKm: number = 1) {
    if (!navigator.geolocation) {
      Swal.fire({
        icon: 'warning',
        title: 'Geolocalización no soportada',
        text: 'Tu tableta o navegador no soporta geolocalización GPS.',
        confirmButtonColor: '#701f2f'
      });
      return;
    }

    this.radioProximidadKm = radioKm;
    this.cargandoProximidad = true;
    this.cdr.detectChanges();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.cargandoProximidad = false;
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        this.ultimaUbicacionUsuario = { lat: userLat, lng: userLng };
        this.aplicarProximidadConCoords(userLat, userLng, radioKm);
      },
      (error) => {
        this.cargandoProximidad = false;
        console.error('❌ Error GPS en proximidad:', error);
        Swal.fire({
          icon: 'error',
          title: 'Sin acceso a GPS',
          text: 'No se pudo obtener la posición GPS. Asegúrate de habilitar los permisos de ubicación en tu tableta o navegador.',
          confirmButtonColor: '#701f2f'
        });
        this.cdr.detectChanges();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  cambiarRadioProximidad(radioKm: number) {
    this.radioProximidadKm = radioKm;
    if (this.ultimaUbicacionUsuario) {
      this.aplicarProximidadConCoords(this.ultimaUbicacionUsuario.lat, this.ultimaUbicacionUsuario.lng, radioKm);
    } else {
      this.activarModoProximidad(radioKm);
    }
  }

  private aplicarProximidadConCoords(userLat: number, userLng: number, radioKm: number) {
    const radioMetros = radioKm * 1000;
    const pacsCercanos: PacienteMap[] = [];

    this.todosLosPacientes.forEach(p => {
      if (p.lat && p.lng && p.lat !== 0 && p.lng !== 0) {
        const distKm = this.calcularDistanciaKm(userLat, userLng, p.lat, p.lng);
        if (distKm <= radioKm) {
          pacsCercanos.push(p);
        }
      }
    });

    this.pacientesCercanosCount = pacsCercanos.length;
    this.modoProximidad = true;
    this.coloniaSeleccionada = '';

    window.dispatchEvent(new CustomEvent('filtrarPorProximidad', {
      detail: {
        userLat,
        userLng,
        radioMetros,
        pacientes: pacsCercanos,
        count: pacsCercanos.length
      }
    }));

    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      this.sidebarMobileOpen = false;
    }
    this.cdr.detectChanges();
  }

  calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private actualizarVisibilidadSidebar() {
    const rawUrl = this.router.url.split('?')[0].replace(/\/+$/, '');
    this.mostrarSidebar = rawUrl === '/dashboard' || rawUrl === '';
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}