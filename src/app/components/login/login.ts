// src/app/components/login/login.ts

import { Component, OnInit } from '@angular/core';
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
export class LoginComponent implements OnInit {
  // ============================================
  // PROPIEDADES DEL FORMULARIO
  // ============================================
  username: string = '';
  password: string = '';
  errorMsg: string = '';
  loading: boolean = false;

  showPassword: boolean = false;
  rememberMe: boolean = false;

  // PWA Instalación
  deferredPrompt: any = null;
  canInstallPwa: boolean = false;
  isIos: boolean = false;
  isStandalone: boolean = false;

  private apiUrl = environment.apiUrl;

  constructor(
    private router: Router,
    private store: Store<{ app: AppState }>,
    private http: HttpClient
  ) {
    console.log('🌍 [Login] API URL:', this.apiUrl);
  }

  ngOnInit(): void {
    // Detectar si la app ya está instalada / corriendo como PWA standalone
    if (typeof window !== 'undefined') {
      this.isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;

      const userAgent = window.navigator.userAgent.toLowerCase();
      this.isIos = /iphone|ipad|ipod/.test(userAgent) && !(window as any).MSStream;

      // Capturar evento PWA en Android / Chrome / Edge
      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        this.deferredPrompt = e;
        this.canInstallPwa = true;
        console.log('📲 [PWA] Evento beforeinstallprompt capturado, botón de instalación listo.');
      });

      window.addEventListener('appinstalled', () => {
        this.canInstallPwa = false;
        this.deferredPrompt = null;
        this.isStandalone = true;
        console.log('🎉 [PWA] Aplicación Cuidalia instalada con éxito en el dispositivo.');
      });
    }
  }

  // ============================================
  // INSTALACIÓN DIRECTA DE LA PWA
  // ============================================
  instalarPwa(): void {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult && choiceResult.outcome === 'accepted') {
          console.log('✅ El usuario aceptó instalar Cuidalia');
          this.canInstallPwa = false;
        }
        this.deferredPrompt = null;
      });
    } else if (this.isIos) {
      Swal.fire({
        title: '📲 Cómo instalar en iPhone / iPad',
        html: `
          <div style="text-align: left; font-size: 13.5px; line-height: 1.6; color: #333;">
            <p>Para tener <b>Cuidalia</b> como app en tu pantalla de inicio:</p>
            <ol style="padding-left: 20px; margin-top: 10px;">
              <li>Toca el botón <b>Compartir</b> <i class="fas fa-arrow-up-from-bracket" style="color: #007aff;"></i> (abajo en Safari).</li>
              <li>Desliza hacia abajo y presiona <b>"Agregar a pantalla de inicio"</b> ➕.</li>
              <li>Presiona <b>"Agregar"</b> arriba a la derecha.</li>
            </ol>
            <p style="margin-top: 10px; font-size: 12px; color: #666;">¡Listo! Se creará el ícono en tu pantalla y funcionará sin internet en campo.</p>
          </div>
        `,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#7A192B'
      });
    } else {
      Swal.fire({
        title: '📲 Instalar Cuidalia en tu Teléfono',
        html: `
          <div style="text-align: left; font-size: 13.5px; line-height: 1.6; color: #333;">
            <p>Para instalar la app directamente desde Chrome:</p>
            <ol style="padding-left: 20px; margin-top: 10px;">
              <li>Toca el menú del navegador (los <b>3 puntos</b> <i class="fas fa-ellipsis-vertical"></i> arriba a la derecha).</li>
              <li>Selecciona <b>"Instalar aplicación"</b> o <b>"Agregar a la pantalla principal"</b>.</li>
              <li>Presiona <b>"Instalar"</b>.</li>
            </ol>
            <p style="margin-top: 10px; font-size: 12px; color: #666;">Se descargará el ícono en tu pantalla de inicio y podrás usarla sin conexión.</p>
          </div>
        `,
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#7A192B'
      });
    }
  }

  // ============================================
  // MÉTODO PRINCIPAL DE LOGIN
  // ============================================
  login() {
    const usuarioLimpio = (this.username || '').trim();
    const passwordLimpio = (this.password || '').trim();

    if (!usuarioLimpio || !passwordLimpio) {
      this.errorMsg = 'Ingrese su usuario / CURP y contraseña';
      return;
    }

    this.loading = true;
    this.errorMsg = '';

    this.http.post(`${this.apiUrl}/auth/login`, {
      usuario: usuarioLimpio,
      password: passwordLimpio
    }).subscribe({
      next: (response: any) => {
        this.loading = false;

        if (response.success) {
          const userData = response.user;

          console.log('✅ Login exitoso:', userData);
          console.log('📌 Recordar sesión:', this.rememberMe);

          if (this.rememberMe) {
            localStorage.setItem('rememberMe', 'true');
          } else {
            localStorage.removeItem('rememberMe');
          }

          this.store.dispatch(AppActions.loginSuccess({
            user: { username: userData.username },
            role: userData.role,
            userData: userData
          }));

          localStorage.setItem('isAuthenticated', 'true');
          localStorage.setItem('rol', userData.role);
          localStorage.setItem('userData', JSON.stringify(userData));

          if (userData.role === 'distrital' || userData.role === 'enlace') {
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
        console.warn('⚠️ Error de conexión con el servidor, verificando sesión local offline...', err);

        // ⭐ MODO OFFLINE: Si no hay internet, verificar si el usuario ya inició sesión previamente
        try {
          const userStr = localStorage.getItem('userData');
          if (userStr) {
            const cachedUser = JSON.parse(userStr);
            const matchCurp = (cachedUser.curp || '').toUpperCase() === usuarioLimpio.toUpperCase();
            const matchUser = (cachedUser.username || '').toUpperCase() === usuarioLimpio.toUpperCase();

            if (matchCurp || matchUser) {
              console.log('📶 [Login Offline] Autenticación local offline exitosa:', cachedUser);
              this.store.dispatch(AppActions.loginSuccess({
                user: { username: cachedUser.username },
                role: cachedUser.role,
                userData: cachedUser
              }));
              localStorage.setItem('isAuthenticated', 'true');

              Swal.fire({
                icon: 'info',
                title: 'Modo sin conexión activado',
                text: 'Ingresaste a Cuidalia con tus datos guardados en este dispositivo.',
                timer: 2600,
                showConfirmButton: false,
                confirmButtonColor: '#7A192B'
              });

              if (cachedUser.role === 'distrital' || cachedUser.role === 'enlace') {
                this.router.navigate(['/dashboard-distrital']);
              } else {
                this.router.navigate(['/dashboard']);
              }
              return;
            }
          }
        } catch (e) {
          console.error('Error en validación offline:', e);
        }

        this.errorMsg = 'Sin conexión con el servidor. Revisa tu conexión a internet o verifica que tus credenciales sean correctas.';
      }
    });
  }

  // ============================================
  // MOSTRAR/OCULTAR CONTRASEÑA
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
      iconColor: '#8a2038'
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
            te informamos que los datos recabados son utilizados exclusivamente para fines de atención médica.
          </p>
        </div>
      `,
      width: 550,
      confirmButtonColor: '#8a2038',
      confirmButtonText: 'Aceptar y Entendido',
      background: '#ffffff',
      iconColor: '#8a2038',
      showCloseButton: true
    });
  }

  // ============================================
  // CONTACTAR SOPORTE CLÍNICO
  // ============================================
  contactarSoporte(event: Event) {
    event.preventDefault();
    Swal.fire({
      icon: 'info',
      title: 'Mesa de Ayuda Cuidalia',
      html: `
        <div style="text-align: left; font-size: 13px; line-height: 1.6; color: #444; font-family: 'Montserrat', sans-serif;">
          <p style="margin-bottom: 8px;">
            Si presentas problemas para ingresar o requieres asistencia con tus credenciales:
          </p>
          <div style="background: #FAF2EE; border-left: 4px solid #520D2F; padding: 10px 12px; border-radius: 8px; margin: 10px 0;">
            <p style="margin: 0 0 4px; font-weight: 700; color: #520D2F;">Coordinación y Soporte:</p>
            <p style="margin: 0; color: #666; font-size: 12px;">soportecuidalia@gmail.com</p>
          </div>
        </div>
      `,
      confirmButtonColor: '#520D2F',
      confirmButtonText: 'Entendido',
      background: '#ffffff',
      iconColor: '#520D2F'
    });
  }
}
