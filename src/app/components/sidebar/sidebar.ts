// src/app/components/sidebar/sidebar.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { AppState } from '../../store/app.state';
import * as AppActions from '../../store/app.actions';
import { selectAnioActivo, selectModoPanel } from '../../store/app.selectors';
import { DataService } from '../../services/data';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss'
})
export class SidebarComponent implements OnInit {
  modoPanel$: Observable<string>;
  anioActivo$: Observable<string>;

  distritos: string[] = [];
  municipios: string[] = [];
  secciones: string[] = [];
  manzanas: string[] = [];

  constructor(
    private store: Store<{ app: AppState }>,
    private dataService: DataService
  ) {
    this.modoPanel$ = this.store.select(selectModoPanel);
    this.anioActivo$ = this.store.select(selectAnioActivo);
  }

  ngOnInit() {
    this.dataService.getDistritosList().subscribe((distritos: string[]) => {
      this.distritos = distritos;
    });
  }

  setModo(modo: 'electoral' | 'operativo') {
    this.store.dispatch(AppActions.setModoPanel({ modo }));
  }

  onDistritoChange(event: any) {
    const distrito = event.target.value;
    this.store.dispatch(AppActions.setDistritoF({ distrito }));

    if (distrito) {
      this.dataService.getMunicipiosPorDistrito(distrito).subscribe((muns: string[]) => {
        this.municipios = muns;
        this.secciones = [];
        this.manzanas = [];
      });
    } else {
      this.municipios = [];
    }
  }

  onMunicipioChange(event: any) {
    const municipio = event.target.value;
    this.store.dispatch(AppActions.setMunicipio({ municipio }));

    if (municipio) {
      this.store.select(state => state.app.distritoF).subscribe((df: any) => {
        if (df) {
          this.dataService.getSecciones(df, municipio).subscribe((secs: string[]) => {
            this.secciones = secs;
          });
          // ⭐ CORREGIDO: AGREGAR SECCION COMO TERCER PARÁMETRO
          this.dataService.getManzanas(df, municipio, '').subscribe((manz: string[]) => {
            this.manzanas = manz;
          });
        }
      }).unsubscribe();
    }
  }

  onAnioChange(event: any) {
    this.store.dispatch(AppActions.setAnioActivo({ anio: event.target.value }));
  }

  onSeccionChange(event: any) {
    this.store.dispatch(AppActions.setSeccionSeleccionada({ seccion: event.target.value }));
  }

  onManzanaChange(event: any) {
    this.store.dispatch(AppActions.setManzanaSeleccionada({ manzana: event.target.value }));
  }
}