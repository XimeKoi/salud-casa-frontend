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

export interface ColoniaInfo {
  id: string;
  nombre: string;
  totalPacientes: number;
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
  busquedaColonia: string = '';
  colonias: ColoniaInfo[] = [];

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
    private pacientesMapService: PacientesMapService
  ) {
    this.anioActivo$ = this.store.select(selectAnioActivo);
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
    const mapa = new Map<string, PacienteMap[]>();

    pacientes.forEach(p => {
      const nombreColonia = this.extraerColonia(p);
      if (!mapa.has(nombreColonia)) {
        mapa.set(nombreColonia, []);
      }
      mapa.get(nombreColonia)!.push(p);
    });

    const listaColonias: ColoniaInfo[] = [];
    let colorIdx = 0;
    const coloresStore: { [key: string]: string } = {};

    mapa.forEach((pacs, nombre) => {
      const color = this.coloresDisponibles[colorIdx % this.coloresDisponibles.length];
      colorIdx++;

      listaColonias.push({
        id: nombre,
        nombre: nombre,
        totalPacientes: pacs.length,
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

  private extraerColonia(p: PacienteMap): string {
    const colUpper = (p.colonia || '').toUpperCase().trim();
    if (colUpper && colUpper.length > 2 && !colUpper.includes('DISPONIBLE') && !colUpper.includes('SIN COLONIA')) {
      for (const conocida of this.coloniasConocidas) {
        if (colUpper.includes(conocida) || conocida.includes(colUpper)) {
          return this.formatearNombreColonia(conocida);
        }
      }
      return this.formatearNombreColonia(p.colonia.trim());
    }

    const dirUpper = (p.direccion || '').toUpperCase();
    for (const conocida of this.coloniasConocidas) {
      if (dirUpper.includes(conocida)) {
        return this.formatearNombreColonia(conocida);
      }
    }

    return 'Santa Rosa de Lima';
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
    this.cdr.detectChanges();
  }

  private actualizarVisibilidadSidebar() {
    const url = this.router.url.split('?')[0];
    this.mostrarSidebar = url === '/' || url === '' || url === '/dashboard';
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}