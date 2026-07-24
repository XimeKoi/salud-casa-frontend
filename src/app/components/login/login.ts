// src/app/components/login/login.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { HttpClient } from '@angular/common/http';
import Swal from 'sweetalert2';
import { AppState } from '../../store/app.state';
import * as AppActions from '../../store/app.actions';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  username = '';
  password = '';
  errorMsg = '';
  loading = false;

  private apiUrl = environment.apiUrl;

  constructor(
    private router: Router,
    private store: Store<{ app: AppState }>,
    private http: HttpClient
  ) {
    console.log('🌍 [Login] API URL:', this.apiUrl);
  }

  login() {
    if (!this.username || !this.password) {
      this.errorMsg = 'Ingrese usuario y contraseña';
      return;
    }

    this.loading = true;
    this.errorMsg = '';

    this.http.post(`${this.apiUrl}/auth/login`, {
      usuario: this.username,
      password: this.password
    }).subscribe({
      next: (response: any) => {
        this.loading = false;

        if (response.success) {
          const userData = response.user;

          console.log('Login exitoso:', userData);

          this.store.dispatch(AppActions.loginSuccess({
            user: { username: userData.username },
            role: userData.role,
            userData: userData
          }));

          localStorage.setItem('rol', userData.role);
          localStorage.setItem('userData', JSON.stringify(userData));

          if (userData.role === 'distrital') {
            this.router.navigate(['/dashboard-distrital']);
          } else {
            this.router.navigate(['/dashboard']);
          }
        } else {
          this.errorMsg = response.message || 'Usuario o contraseña incorrectos';
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('Error de conexión:', err);
        this.errorMsg = 'Error de conexión con el servidor. ¿El backend está corriendo?';
      }
    });
  }

  olvidasteContrasena(event: Event) {
    event.preventDefault();
    Swal.fire({
      icon: 'info',
      title: '🔐 Recuperación de Contraseña',
      text: 'La funcionalidad de recuperación de contraseña estará disponible próximamente.',
      footer: 'Por favor, contacta al administrador del sistema para restablecer tu contraseña.',
      confirmButtonColor: '#9D2449',
      confirmButtonText: 'Entendido',
      background: '#ffffff',
      iconColor: '#9D2449',
      customClass: {
        title: 'swal-title-custom',
        confirmButton: 'swal-button-custom',
        popup: 'swal-popup-custom'
      }
    });
  }

  avisoPrivacidad(event: Event) {
    event.preventDefault();
    Swal.fire({
      icon: 'info',
      title: '📋 Aviso de Privacidad',
      html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto; padding: 0 10px; font-size: 13px; line-height: 1.6; color: #444; font-family: 'Montserrat', sans-serif;">
          <p style="font-weight: 700; color: #9D2449; font-size: 15px; margin-bottom: 8px; text-align: center;">
            <i class="fas fa-heartbeat" style="color: #9D2449; margin-right: 8px;"></i>
            Salud Casa por Casa
          </p>
          <p style="font-weight: 600; color: #5a3e2e; font-size: 14px; margin-bottom: 6px; text-align: center;">
            Programa de Visitas Domiciliarias
          </p>
          <hr style="border: 0.5px solid #eee; margin: 10px 0;">
          <p style="margin-bottom: 10px;">
            El <strong style="color: #9D2449;">Programa Salud Casa por Casa</strong> tiene como objetivo 
            llevar servicios de salud a los hogares de las comunidades, garantizando el bienestar 
            y la atención médica de las familias mexicanas.
          </p>
          <p style="margin-bottom: 10px;">
            En cumplimiento con la <strong>Ley General de Protección de Datos Personales</strong>, 
            te informamos que:
          </p>
          <ul style="margin: 8px 0 12px 0; padding-left: 20px; list-style: disc;">
            <li style="margin-bottom: 6px;">
              Los datos personales recabados son utilizados <strong>exclusivamente</strong> 
              para fines médicos y de seguimiento de salud.
            </li>
            <li style="margin-bottom: 6px;">
              Toda la información es <strong>confidencial</strong> y está protegida 
              conforme a la normativa aplicable.
            </li>
            <li style="margin-bottom: 6px;">
              Los pacientes tienen derecho a <strong>acceder, rectificar y cancelar</strong> 
              sus datos personales en cualquier momento.
            </li>
            <li style="margin-bottom: 6px;">
              La información solo será compartida con personal autorizado 
              del programa de salud.
            </li>
          </ul>
          <p style="margin-bottom: 8px;">
            <strong>Responsable del tratamiento:</strong> 
            <span style="color: #9D2449; font-weight: 600;">Dirección de Salud Pública</span>
          </p>
          <p style="font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 8px; text-align: center;">
            <i class="fas fa-calendar-alt"></i> Última actualización: Junio 2026
          </p>
        </div>
      `,
      width: 550,
      confirmButtonColor: '#9D2449',
      confirmButtonText: 'Aceptar y Entendido',
      background: '#ffffff',
      iconColor: '#9D2449',
      showCloseButton: true,
      customClass: {
        title: 'swal-title-custom',
        confirmButton: 'swal-button-custom',
        popup: 'swal-popup-custom',
        htmlContainer: 'swal-html-custom'
      }
    });
  }
}