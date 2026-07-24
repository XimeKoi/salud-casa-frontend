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

  mostrarSidebar: boolean = true;

  get ObjectKeys() {
    return Object.keys;
  }

  private coloresCache: { [key: string]: string } = {};
  private coloresAsignadosIniciales: boolean = false;
  private subscriptions: Subscription[] = [];

  // ⭐ MAPA DE NOMBRES CORTO PARA ZONAS
  private nombresZonas: { [key: string]: string } = {
    'JARDINES DE LOS NARANJOS': 'Jardines Naranjos',
    'SANTA ROSA DE LIMA': 'Santa Rosa',
    'SANTA ROSA DE LIMA IVEG': 'Santa Rosa IVEG',
    'LOS NARANJOS': 'Los Naranjos',
    'RINCON DE LOS NARANJOS': 'Rincón Naranjos',
    'REAL DE SAN JOSE': 'Real San José',
    'MISION DE SAN JOSE': 'Misión San José',
    'RESIDENCIAL VICTORIA': 'Victoria',
    'SAN JOSE DEL CONSUELO': 'San José C.',
    'EL MANANTIAL': 'El Manantial',
    'VALLE DE SAN JOSE': 'Valle San José',
    'RESIDENCIAL RENTERIA': 'Rentería',
    'RESIDENCIAL PLATINO': 'Platino',
    'CUMBRES DE LAS HILAMAS': 'Cumbres',
    'VILLA SUR LEON': 'Villa Sur',
    'LA SELVA': 'La Selva',
    'LEON II': 'León II',
    'LA MODERNA': 'La Moderna',
    'SAN PEDRO PLUS': 'San Pedro +',
    'SIN COLONIA': 'Sin Colonia'
  };

  private coloresDisponibles = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#FF8A5C', '#A29BFE', '#FD79A8', '#00B894',
    '#E17055', '#6C5CE7', '#FDCB6E', '#00CEC9', '#E84393',
    '#0984E3', '#F8A5C2', '#74B9FF', '#55EFC4', '#FDCB6E'
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

    // ⭐ SUSCRIBIRSE A MANZANAS DISPONIBLES DESDE EL STORE
    this.subscriptions.push(
      this.store.select(selectManzanasDisponibles).subscribe(manzanas => {
        if (manzanas && manzanas.length > 0) {
          // ⭐ ELIMINAR DUPLICADOS USANDO SET
          const uniqueZonas = Array.from(new Set(manzanas));
          const sortedZonas = this.ordenarZonas(uniqueZonas);

          // ⭐ SOLO ACTUALIZAR SI HAY CAMBIOS
          if (JSON.stringify(sortedZonas) !== JSON.stringify(this.manzanasDisponibles)) {
            this.manzanasDisponibles = sortedZonas;
            console.log(`✅ [Layout] ${this.manzanasDisponibles.length} zonas únicas cargadas`);

            // ⭐ ASIGNAR COLORES SI NO EXISTEN
            if (Object.keys(this.coloresManzanas).length === 0) {
              this.asignarColoresIniciales();
            }
            this.cdr.detectChanges();
          }
        }
      })
    );

    // ⭐ SUSCRIBIRSE A COLORES
    this.subscriptions.push(
      this.store.select(selectColoresManzanas).subscribe(colores => {
        if (colores && Object.keys(colores).length > 0) {
          this.coloresManzanas = { ...colores };
          this.coloresCache = { ...colores };
          this.cdr.detectChanges();
        }
      })
    );

    // ⭐ SUSCRIBIRSE A SELECCIÓN DE ZONA
    this.subscriptions.push(
      this.store.select(selectManzanaSeleccionada).subscribe(manzana => {
        this.manzanaSeleccionada = manzana || '';
        this.cdr.detectChanges();
      })
    );

    // ⭐ NAVEGACIÓN
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

  private ordenarZonas(zonas: string[]): string[] {
    if (!zonas || zonas.length === 0) return [];
    const copia = [...zonas];
    return copia.sort((a, b) => {
      const nombreA = this.getNombreZona(a).toLowerCase();
      const nombreB = this.getNombreZona(b).toLowerCase();
      return nombreA.localeCompare(nombreB);
    });
  }

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

  private actualizarVisibilidadSidebar() {
    const url = this.router.url;
    this.mostrarSidebar = url === '/' || url === '/dashboard' || url.startsWith('/dashboard');
  }

  getNombreZona(zonaId: string): string {
    if (!zonaId) return 'Sin nombre';

    // ⭐ BÚSQUEDA EXACTA
    if (this.nombresZonas[zonaId]) {
      return this.nombresZonas[zonaId];
    }

    // ⭐ BÚSQUEDA POR CONTENIDO
    const zonaUpper = zonaId.toUpperCase();
    for (const [key, value] of Object.entries(this.nombresZonas)) {
      if (zonaUpper.includes(key.toUpperCase()) || key.toUpperCase().includes(zonaUpper)) {
        return value;
      }
    }

    // ⭐ ABREVIAR SI ES MUY LARGO
    if (zonaId.length > 25) {
      return zonaId.substring(0, 22) + '…';
    }

    return zonaId;
  }

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
    this.store.dispatch(AppActions.setManzanaSeleccionada({ manzana: manzana || '' }));
    this.manzanaSeleccionada = manzana || '';
    this.cdr.detectChanges();
  }

  btnAplicarFiltros() {
    console.log('🔍 Aplicando filtros...');
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}