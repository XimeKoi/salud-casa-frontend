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
  selectManzanasDisponibles,
  selectColoresManzanas
} from '../../store/app.selectors';
import { HeaderComponent } from '../header/header';
import { AdminModalComponent } from '../admin-modal/admin-modal';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, AdminModalComponent, FormsModule],
  templateUrl: './layout.html',
  styleUrls: ['./layout.scss']
})
export class LayoutComponent implements OnInit, OnDestroy {
  anioActivo$: Observable<string>;
  manzanaSeleccionada: string = '';
  manzanasDisponibles: string[] = [];
  coloresManzanas: { [key: string]: string } = {};
  busquedaQuery: string = '';

  // ⭐ Controla si se muestra el sidebar completo
  mostrarSidebar: boolean = true;

  get ObjectKeys() {
    return Object.keys;
  }

  private coloresCache: { [key: string]: string } = {};
  private coloresAsignadosIniciales: boolean = false;
  private subscriptions: Subscription[] = [];
  private zonasCargadas: boolean = false;

  // ⭐ NOMBRES CORTO PARA ZONAS - LISTA COMPLETA
  private nombresZonas: { [key: string]: string } = {
    'ALBARRADONES': 'Albarradones',
    'ARBOLEDAS DE SAN JOSE': 'Arboledas S.J.',
    'BALCONES DE LA PRESA': 'Balcones Presa',
    'BARRIO SAN JUAN DE DIOS': 'Bº San Juan',
    'BISMOTO': 'Bismoto',
    'CAMINO REAL DE LA JOYA': 'Camino Real',
    'CAÑADA DEL REAL': 'Cañada Real',
    'CUMBRES DE LAS HILAMAS': 'Cumbres',
    'DEL BOSQUE': 'Del Bosque',
    'DURAZNAL': 'Duraznal',
    'EL MANANTIAL': 'El Manantial',
    'FRACC. EL MANANTIAL': 'Frac. Manantial',
    'FRACC. GRANJENO PLUS': 'Granjeno +',
    'FRACC. LEON 1': 'León I',
    'FRACC. LEON II': 'León II',
    'FRACC. NUEVO SAN NICOLAS': 'San Nicolás',
    'FRACC. RESIDENCIAL RENTERIA': 'Rentería',
    'FRACC. SAN PEDRO PLUS': 'San Pedro +',
    'FRACCIONAMIENTO DE LOS NARANJOS': 'Los Naranjos',
    'FRACCIONAMIENTO DEL BOSQUE': 'Del Bosque',
    'FRACCIONAMIENTO INDUSTRIA DEL NORTE': 'Ind. Norte',
    'FRACCIONAMIENTO LOS PIRULES': 'Los Pirules',
    'FRACCIONAMIENTO MARSOL': 'Marsol',
    'FRACCIONAMIENTO MISION DE DAN JOSE': 'Misión Dan José',
    'FRACCIONAMIENTO MISION DE SAM JOSE': 'Misión Sam José',
    'FRACCIONAMIENTO MISION DE SAN JOSE': 'Misión San José',
    'FRACCIONAMIENTO MISION DE SANTA FE': 'Misión Santa Fe',
    'FRACCIONAMIENTO MISION DEL CARMEN': 'Misión Carmen',
    'FRACCIONAMIENTO MISIOM ANTIGUA DE LA FLORIDA': 'Misión Florida',
    'FRACCIONAMIENTO REAL DE SAN JOSE': 'Real San José',
    'FRACCIONAMIENTO REALNDE SAN JOSE': 'Real San José',
    'FRACCIONAMIENTO VALLE DE LA PRESA': 'Valle Presa',
    'FRACCIONAMIENTO VALLE DE SEÑORA': 'Valle Señora',
    'FRACCIONAMIENTO VALLE DEL MAGUEY': 'Valle Maguey',
    'FRACCIONAMIENTO VILLA SUR LEON': 'Villa Sur',
    'FRANCCIONAMIENTO VIBAR': 'Vibar',
    'HIDALGO DEL VALLE': 'Hidalgo V.',
    'JARDINES DE JEREZ': 'Jardines Jerez',
    'JARDINES DE LOS NARANJOS': 'Jardines Naranjos',
    'JARDINES DE ORIENTE': 'Jardines Ote',
    'JARDINES DE SAN JUAN': 'Jardines S. Juan',
    'JARDINES DEL MORAL': 'Jardines Moral',
    'LA BRISA': 'La Brisa',
    'LA MODERNA': 'La Moderna',
    'LA SELVA': 'La Selva',
    'LAS HUERTAS': 'Las Huertas',
    'LEON': 'León',
    'LEON II': 'León II',
    'LEON MODERNO': 'León Moderno',
    'LOCALIDAD ALFARO': 'Alfaro',
    'LOCALIDAD VILLAS DE BARCELO': 'Villas Barcelo',
    'LOMAS DE SAN JOSE DE LA JOYA': 'Lomas S.J.',
    'LOS FRAYLES DE REAL DE SAN JOSE': 'Los Frayles',
    'LOS NARANJOS': 'Los Naranjos',
    'MANANTIAL': 'Manantial',
    'MISION DE LA JOYA': 'Misión Joya',
    'MISION DE SAM JOSE': 'Misión Sam José',
    'MISION DE SAN JOSE': 'Misión San José',
    'NUEVO SAN NICOLAS - MANANTIAL DEL NILO': 'San Nicolás',
    'OBREGON': 'Obregón',
    'PASEO DE LA CASTELLANA': 'Paseo Castellana',
    'PASEO DEL MOLINO': 'Paseo Molino',
    'PEÑITAS': 'Peñitas',
    'POMPA': 'Pompa',
    'PRIVANZA': 'Privanza',
    'QUINTA SAN LORENZO': 'Qta. San Lorenzo',
    'REAL DE LOS NARANJOS': 'Real Naranjos',
    'REAL DE SAN JOSE': 'Real San José',
    'RESIDENCIAL PLATINO': 'Platino',
    'RESIDENCIAL RENTERIA': 'Rentería',
    'RESIDENCIAL VICTORIA': 'Victoria',
    'RINCON DE LOS NARANJOS': 'Rincón Naranjos',
    'SAN BENIGNO': 'San Benigno',
    'SAN FRANCISCO DE ASIS': 'San Francisco',
    'SAN IGNACIO': 'San Ignacio',
    'SAN ISIDRO': 'San Isidro',
    'SAN JOSE DE CEMENTOS': 'San José C.',
    'SAN JOSE DEL CONSUELO': 'San José C.',
    'SAN JOSE DEL CONSUELO 2': 'San José C. 2',
    'SAN LAZARO': 'San Lázaro',
    'SAN MARTIN': 'San Martín',
    'SAN PEDRO DE LOS HERNANDEZ': 'San Pedro Hdz',
    'SAN PEDRO PLUS': 'San Pedro +',
    'SANTA ROSA DE LIMA': 'Santa Rosa',
    'SANTA ROSA DE LIMA IVEG': 'Santa Rosa IVEG',
    'SANTO TOMAS DE AQUINO': 'Santo Tomás',
    'SIN COLONIA': 'Sin Colonia',
    'STA. ROSA': 'Santa Rosa',
    'STA. ROSA DE LIMA': 'Santa Rosa',
    'STA. ROSA DE LIMA IVEG': 'Santa Rosa IVEG',
    'VALLE DE JEREZ 2DA SECCION': 'Valle Jerez',
    'VALLE DE SAN JOSE': 'Valle San José',
    'VALLE DE SEÑORA': 'Valle Señora',
    'ZONA CENTRO': 'Zona Centro'
  };

  // ⭐ 30 COLORES DIFERENTES
  private coloresDisponibles = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#FF8A5C', '#A29BFE', '#FD79A8', '#00B894',
    '#E17055', '#6C5CE7', '#FDCB6E', '#00CEC9', '#E84393',
    '#0984E3', '#F8A5C2', '#74B9FF', '#55EFC4', '#FDCB6E',
    '#A8E6CF', '#FFB347', '#7EC8E3', '#FF6F61', '#6B5B95',
    '#88B04B', '#F7CAC9', '#92A8D1', '#F5A623', '#9B5DE5'
  ];

  constructor(
    private store: Store<{ app: AppState }>,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.anioActivo$ = this.store.select(selectAnioActivo);
  }

  ngOnInit() {
    console.log('🔄 [Layout] Inicializando...');

    // ⭐ CARGAR TODAS LAS ZONAS DESDE LA LISTA COMPLETA
    this.cargarTodasLasZonas();

    // ⭐ SUSCRIBIRSE A LA ZONA SELECCIONADA
    this.subscriptions.push(
      this.store.select(selectManzanaSeleccionada).subscribe(manzana => {
        this.manzanaSeleccionada = manzana || '';
        this.cdr.detectChanges();
      })
    );

    // ⭐ SUSCRIBIRSE A LOS COLORES
    this.subscriptions.push(
      this.store.select(selectColoresManzanas).subscribe(colores => {
        if (colores && Object.keys(colores).length > 0) {
          this.coloresManzanas = { ...colores };
          this.coloresCache = { ...colores };
          this.cdr.detectChanges();
        }
      })
    );

    // ⭐ SUSCRIBIRSE A LAS ZONAS DISPONIBLES (DESDE MAP.TS)
    this.subscriptions.push(
      this.store.select(selectManzanasDisponibles).subscribe(manzanas => {
        if (manzanas && manzanas.length > 0) {
          this.manzanasDisponibles = this.ordenarZonas(manzanas);
          this.zonasCargadas = true;
          this.guardarZonasEnStorage(this.manzanasDisponibles);
          this.asignarColoresIniciales();
          this.cdr.detectChanges();
          console.log(`✅ [Layout] ${this.manzanasDisponibles.length} zonas actualizadas desde el store`);
        }
      })
    );

    // ⭐ ESCUCHAR CAMBIOS DE RUTA
    this.subscriptions.push(
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe(() => {
        this.actualizarVisibilidadSidebar();
        this.cdr.detectChanges();
      })
    );

    setTimeout(() => {
      this.actualizarVisibilidadSidebar();
      this.cdr.detectChanges();
    }, 100);
  }

  // ⭐ CARGAR TODAS LAS ZONAS DESDE LA LISTA COMPLETA
  private cargarTodasLasZonas() {
    console.log('📋 [Layout] Cargando lista completa de zonas...');

    // ⭐ OBTENER TODAS LAS CLAVES DE nombresZonas
    const todasLasZonas = Object.keys(this.nombresZonas);

    // ⭐ ORDENAR ALFABÉTICAMENTE
    this.manzanasDisponibles = this.ordenarZonas(todasLasZonas);

    // ⭐ ASIGNAR COLORES
    this.asignarColoresIniciales();

    // ⭐ GUARDAR EN STORE
    this.store.dispatch(AppActions.setManzanasDisponibles({
      manzanas: this.manzanasDisponibles
    }));

    // ⭐ GUARDAR EN LOCALSTORAGE
    this.guardarZonasEnStorage(this.manzanasDisponibles);

    console.log(`✅ [Layout] ${this.manzanasDisponibles.length} zonas cargadas desde la lista`);
    this.zonasCargadas = true;
    this.cdr.detectChanges();
  }

  // ⭐ ORDENAR ZONAS ALFABÉTICAMENTE
  // ⭐ MÉTODO PARA ORDENAR ZONAS - CORREGIDO
  private ordenarZonas(zonas: string[]): string[] {
    if (!zonas || zonas.length === 0) return [];

    // ⭐ IMPORTANTE: CREAR UNA COPIA DEL ARRAY ANTES DE ORDENAR
    const copia = [...zonas];

    return copia.sort((a, b) => {
      const nombreA = this.getNombreZona(a).toLowerCase();
      const nombreB = this.getNombreZona(b).toLowerCase();
      return nombreA.localeCompare(nombreB);
    });
  }

  // ⭐ ASIGNAR COLORES A CADA ZONA
  private asignarColoresIniciales() {
    if (this.coloresAsignadosIniciales) return;
    if (this.manzanasDisponibles.length === 0) return;

    const nuevosColores: { [key: string]: string } = {};

    this.manzanasDisponibles.forEach((zona, index) => {
      const color = this.coloresDisponibles[index % this.coloresDisponibles.length];
      nuevosColores[zona] = color;
    });

    this.coloresCache = { ...nuevosColores };
    this.coloresManzanas = { ...nuevosColores };
    this.coloresAsignadosIniciales = true;

    this.store.dispatch(AppActions.setColoresManzanas({
      colores: { ...nuevosColores }
    }));

    console.log(`🎨 [Layout] ${Object.keys(nuevosColores).length} colores asignados`);
  }

  private guardarZonasEnStorage(manzanas: string[]) {
    try {
      localStorage.setItem('zonas_disponibles', JSON.stringify(manzanas));
    } catch (e) {
      console.error('Error guardando zonas:', e);
    }
  }

  private actualizarVisibilidadSidebar() {
    const url = this.router.url;
    this.mostrarSidebar = url === '/' || url === '/dashboard' || url.startsWith('/dashboard');
  }

  // ⭐ OBTENER NOMBRE CORTO DE LA ZONA
  getNombreZona(zonaId: string): string {
    if (!zonaId) return 'Sin nombre';

    const upper = zonaId.toUpperCase();
    for (const [key, value] of Object.entries(this.nombresZonas)) {
      if (upper.includes(key) || key.includes(upper)) {
        return value;
      }
    }

    if (zonaId.length > 25) {
      return zonaId.substring(0, 22) + '…';
    }

    return zonaId;
  }

  // ⭐ OBTENER COLOR DE LA ZONA
  getColorZona(zonaId: string): string {
    if (!zonaId) return '#cccccc';

    if (this.coloresCache[zonaId]) {
      return this.coloresCache[zonaId];
    }

    if (this.coloresManzanas[zonaId]) {
      this.coloresCache[zonaId] = this.coloresManzanas[zonaId];
      return this.coloresCache[zonaId];
    }

    const index = this.manzanasDisponibles.indexOf(zonaId);
    if (index !== -1) {
      const color = this.coloresDisponibles[index % this.coloresDisponibles.length];
      this.coloresCache[zonaId] = color;
      this.coloresManzanas[zonaId] = color;
      return color;
    }

    return '#cccccc';
  }

  isZonaSeleccionada(zonaId: string): boolean {
    return this.manzanaSeleccionada === zonaId;
  }

  onAnioChange(event: any) {
    this.store.dispatch(AppActions.setAnioActivo({ anio: event.target.value }));
  }

  onManzanaChange(event: any) {
    const manzana = event.target.value;
    console.log('📍 [Layout] Cambiando zona a:', manzana);

    const valor = manzana === '' ? '' : manzana;
    this.store.dispatch(AppActions.setManzanaSeleccionada({ manzana: valor }));
    this.manzanaSeleccionada = valor;
    this.cdr.detectChanges();
  }

  btnAplicarFiltros() {
    console.log('🔍 Aplicando filtros...');
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}