import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent implements OnInit {
  private swUpdate = inject(SwUpdate, { optional: true });

  title = 'Cuidalia';
  mostrarSplash = signal<boolean>(true);
  splashAnimandoSalida = signal<boolean>(false);
  splashProgreso = signal<number>(10);
  splashEstadoTexto = signal<string>('Iniciando plataforma médica...');

  ngOnInit() {
    this.iniciarSecuenciaSplash();
    this.configurarActualizacionPWA();
  }

  private configurarActualizacionPWA() {
    if (!this.swUpdate || !this.swUpdate.isEnabled) return;

    console.log('🔄 [PWA] Service Worker activo, escuchando actualizaciones...');

    // 1. Cuando una nueva versión esté lista, activar inmediatamente y recargar
    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        console.log('🚀 [PWA] ¡Nueva versión lista! Activando y recargando aplicación...');
        this.swUpdate!.activateUpdate().then(() => {
          if ('caches' in window) {
            caches.keys().then(names => {
              for (const name of names) {
                caches.delete(name);
              }
            });
          }
          window.location.reload();
        });
      });

    // 2. Comprobar actualizaciones de inmediato al iniciar
    this.swUpdate.checkForUpdate().catch(err => {
      console.warn('⚠️ [PWA] Error al comprobar actualización inicial:', err);
    });

    // 3. Comprobar actualización cada vez que el usuario regresa a la app (visibilidad cambiada)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.swUpdate && this.swUpdate.isEnabled) {
        this.swUpdate.checkForUpdate().catch(() => {});
      }
    });

    // 4. Verificación periódica cada 45 segundos
    setInterval(() => {
      if (this.swUpdate && this.swUpdate.isEnabled) {
        this.swUpdate.checkForUpdate().catch(() => {});
      }
    }, 45000);
  }

  iniciarSecuenciaSplash() {
    const intervalo = setInterval(() => {
      this.splashProgreso.update(p => {
        if (p < 38) {
          this.splashEstadoTexto.set('Cargando módulos operativos...');
          return p + 14;
        } else if (p < 72) {
          this.splashEstadoTexto.set('Sincronizando expedientes de salud...');
          return p + 16;
        } else if (p < 95) {
          this.splashEstadoTexto.set('¡Cercanía que cuida!');
          return p + 12;
        } else {
          clearInterval(intervalo);
          this.finalizarSplash();
          return 100;
        }
      });
    }, 200);
  }

  finalizarSplash() {
    setTimeout(() => {
      this.splashAnimandoSalida.set(true);
      setTimeout(() => {
        this.mostrarSplash.set(false);
      }, 650);
    }, 450);
  }

  omitirSplash() {
    this.splashAnimandoSalida.set(true);
    setTimeout(() => {
      this.mostrarSplash.set(false);
    }, 350);
  }
}
