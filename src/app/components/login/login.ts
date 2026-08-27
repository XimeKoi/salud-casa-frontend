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
  // ============================================
  // PROPIEDADES DEL FORMULARIO
  // ============================================
  username: string = '';
  password: string = '';
  errorMsg: string = '';
  loading: boolean = false;

  // NUEVAS PROPIEDADES (AGREGADAS)
  showPassword: boolean = false;
  rememberMe: boolean = false;

  private apiUrl = environment.apiUrl;

  constructor(
    private router: Router,
    private store: Store<{ app: AppState }>,
    private http: HttpClient
  ) {
    console.log('🌍 [Login] API URL:', this.apiUrl);
  }

  // ============================================
  // MÉTODO PRINCIPAL DE LOGIN
  // ============================================
  login() {
    // Validar que los campos no estén vacíos
    if (!this.username || !this.password) {
      this.errorMsg = 'Ingrese CURP y contraseña';
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

          console.log('✅ Login exitoso:', userData);
          console.log('📌 Recordar sesión:', this.rememberMe);

          // Guardar en localStorage si "Recordar sesión" está activado
          if (this.rememberMe) {
            localStorage.setItem('rememberMe', 'true');
          } else {
            localStorage.removeItem('rememberMe');
          }

          // Dispatch de acción para NgRx
          this.store.dispatch(AppActions.loginSuccess({
            user: { username: userData.username },
            role: userData.role,
            userData: userData
          }));

          // Guardar datos en localStorage
          localStorage.setItem('rol', userData.role);
          localStorage.setItem('userData', JSON.stringify(userData));

          // Redirigir según el rol
          if (userData.role === 'distrital') {
            this.router.navigate(['/dashboard-distrital']);
          } else {
            this.router.navigate(['/dashboard']);
          }
        } else {
          this.errorMsg = response.message || 'CURP o contraseña incorrectos';
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('❌ Error de conexión:', err);
        this.errorMsg = 'Error de conexión con el servidor. ¿El backend está corriendo?';
      }
    });
  }

  // ============================================
  // MOSTRAR/OCULTAR CONTRASEÑA (NUEVO MÉTODO)
  // ============================================
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  // ============================================
  // RECUPERAR CONTRASEÑA
  // ============================================
  olvidasteContrasena(event: Event) {
    event.preventDefault();
    Swal.fire({
      icon: 'info',
      title: 'Recuperación de contraseña',
      text: 'La funcionalidad de recuperación de contraseña estará disponible próximamente.',
      footer: 'Por favor, contacta al administrador del sistema para restablecer tu contraseña.',
      confirmButtonColor: '#8a2038',
      confirmButtonText: 'Entendido',
      background: '#ffffff',
      iconColor: '#8a2038',
      customClass: {
        title: 'swal-title-custom',
        confirmButton: 'swal-button-custom',
        popup: 'swal-popup-custom'
      }
    });
  }

  // ============================================
  // AVISO DE PRIVACIDAD
  // ============================================
  avisoPrivacidad(event: Event) {
    event.preventDefault();
    Swal.fire({
      icon: 'info',
      title: 'Aviso de privacidad',
      html: `
        <div style="text-align: left; max-height: 400px; overflow-y: auto; padding: 0 10px; font-size: 13px; line-height: 1.6; color: #444; font-family: 'Segoe UI', 'Montserrat', sans-serif;">
          <p style="font-weight: 700; color: #8a2038; font-size: 15px; margin-bottom: 4px; text-align: center;">
            CUIDALIA
          </p>
          <p style="font-weight: 600; color: #8B6914; font-size: 12px; margin-bottom: 6px; text-align: center;">
            Cercanía que cuida · Atención Domiciliaria Integral
          </p>
          <hr style="border: 0.5px solid #eee; margin: 10px 0;">
          <p style="margin-bottom: 10px;">
            La plataforma <strong style="color: #8a2038;">Cuidalia</strong> tiene como objetivo
            acercar servicios de salud, seguimiento médico y cuidado humanizado directamente a los hogares,
            garantizando el bienestar integral y la atención oportuna de cada persona.
          </p>
          <p style="margin-bottom: 10px;">
            En cumplimiento con la <strong>normativa de protección de datos personales</strong>,
            te informamos que:
          </p>
          <ul style="margin: 8px 0 12px 0; padding-left: 20px; list-style: disc;">
            <li style="margin-bottom: 6px;">
              Los datos personales recabados son utilizados <strong>exclusivamente</strong>
              para fines de atención médica, prevención y seguimiento de salud.
            </li>
            <li style="margin-bottom: 6px;">
              Toda la información es <strong>estrictamente confidencial</strong> y está protegida
              con los más altos estándares de seguridad y privacidad clínica.
            </li>
            <li style="margin-bottom: 6px;">
              Los profesionales de la salud y pacientes tienen derecho a <strong>acceder, rectificar y proteger</strong>
              sus datos en todo momento.
            </li>
            <li style="margin-bottom: 6px;">
              La información solo es accesible por personal clínico y de coordinación autorizado.
            </li>
          </ul>
          <p style="margin-bottom: 8px;">
            <strong>Coordinación y Soporte:</strong>
            <span style="color: #8a2038; font-weight: 600;">Equipo Cuidalia</span>
          </p>
          <p style="font-size: 11px; color: #999; border-top: 1px solid #eee; padding-top: 8px; text-align: center;">
            Última actualización: Junio 2026
          </p>
        </div>
      `,
      width: 550,
      confirmButtonColor: '#8a2038',
      confirmButtonText: 'Aceptar y Entendido',
      background: '#ffffff',
      iconColor: '#8a2038',
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