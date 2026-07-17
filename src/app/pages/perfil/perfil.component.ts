// src/app/pages/perfil/perfil.component.ts

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState } from '../../store/app.state';
import { selectUserData } from '../../store/app.selectors';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './perfil.component.html',
  styleUrls: ['./perfil.component.scss'],
  host: {
    'style': 'display: block; height: 100%; width: 100%;'
  }
})
export class PerfilComponent implements OnInit {
  datosUsuario: any = null;
  esMujer: boolean = true;
  cargando: boolean = true;
  private apiUrl = 'http://localhost:3000';

  constructor(
    private router: Router,
    private store: Store<{ app: AppState }>,
    private cdr: ChangeDetectorRef,
    private http: HttpClient
  ) { }

  ngOnInit() {
    console.log('🔍 [PERFIL] ngOnInit - INICIADO');

    // ⭐ 1. INTENTAR DEL STORE
    this.store.select(selectUserData).subscribe((userData: any) => {
      if (userData) {
        console.log('✅ [PERFIL] Datos desde STORE:', userData);
        this.datosUsuario = userData;
        this.detectarGenero();
        this.cargando = false;
        this.cdr.detectChanges();
        return;
      }

      // ⭐ 2. SI NO HAY EN EL STORE, INTENTAR DEL LOCALSTORAGE
      const storedUser = localStorage.getItem('userData');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          console.log('✅ [PERFIL] Datos desde localStorage:', user);
          this.datosUsuario = user;
          this.detectarGenero();
          this.cargando = false;
          this.cdr.detectChanges();
          return;
        } catch (e) {
          console.error('Error parseando localStorage:', e);
        }
      }

      // ⭐ 3. SI NO HAY EN NINGÚN LADO, CARGAR DEL BACKEND
      console.log('🔄 [PERFIL] Cargando desde el backend...');
      this.http.get(`${this.apiUrl}/personal/1`).subscribe({
        next: (data: any) => {
          console.log('✅ [PERFIL] Datos desde BACKEND:', data);
          this.datosUsuario = {
            id: data.id,
            nombre: data.nombre_completo || data.nombre,
            nivelAcademico: data.nivel_academico,
            municipio: data.municipio,
            region: data.region,
            entidad: data.entidad,
            zona: data.zona,
            zs: data.zs,
            idInterno: data.id_interno,
            curp: data.curp,
            noCedula: data.no_cedula,
            telefono: data.telefono
          };
          this.detectarGenero();
          this.cargando = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error cargando del backend:', error);
          this.cargando = false;
          this.cdr.detectChanges();
        }
      });
    });
  }

  detectarGenero() {
    const nombre = this.datosUsuario?.nombre || '';
    const nombreUpper = nombre.toUpperCase();

    const nombresFemeninos = ['MARIA', 'ANA', 'LAURA', 'ELVIA', 'SUSANA', 'CLAUDIA', 'MARICELA', 'REYNA', 'LUZ', 'JACQUELINE', 'YATANA', 'DIANA', 'ARACELI', 'GLORIA', 'MIRIAM', 'KARLA', 'NANCY', 'MONICA', 'ADRIANA', 'DULCE', 'BEATRIZ', 'JESSICA', 'BRENDA', 'FATIMA', 'ALEJANDRA', 'MARISOL', 'NORMA', 'HAZEL', 'DAMARIS', 'JOSEFINA', 'KAREN', 'XIMENA', 'YOLANDA'];

    this.esMujer = nombresFemeninos.some(n => nombreUpper.includes(n));
    console.log('🔍 [PERFIL] ¿Es mujer?', this.esMujer);
  }

  volverAlMapa() {
    this.router.navigate(['/dashboard']);
  }
}