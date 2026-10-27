import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { MenuService } from '../../services/menu.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrls: ['./header.scss']
})
export class HeaderComponent implements OnInit, OnDestroy {
  sidebarOpen = false;
  cantidadNotificaciones = 3;
  esRutaMapa = true;

  // Estado de conexión y PWA
  isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  isStandalone = false;
  deferredPrompt: any = null;
  canInstall = false;
  isIos = false;
  private onlineListener?: () => void;
  private offlineListener?: () => void;

  private menuSub?: Subscription;
  private routerSub?: Subscription;

  constructor(
    private router: Router,
    public menuService: MenuService,
    private cdr: ChangeDetectorRef
  ) {
    this.calcularEsRutaMapa();
    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.actualizarEsRutaMapa();
    });
  }

  ngOnInit() {
    this.menuSub = this.menuService.sidebarOpen.subscribe(open => {
      this.sidebarOpen = open;
      this.cdr.markForCheck();
    });

    if (typeof window !== 'undefined') {
      this.isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;

      const ua = window.navigator.userAgent.toLowerCase();
      this.isIos = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;

      this.onlineListener = () => {
        this.isOnline = true;
        this.cdr.markForCheck();
      };
      this.offlineListener = () => {
        this.isOnline = false;
        this.cdr.markForCheck();
      };

      window.addEventListener('online', this.onlineListener);
      window.addEventListener('offline', this.offlineListener);

      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        this.deferredPrompt = e;
        this.canInstall = true;
        this.cdr.markForCheck();
      });
    }
  }

  instalarApp() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choice: any) => {
        if (choice && choice.outcome === 'accepted') {
          this.canInstall = false;
        }
        this.deferredPrompt = null;
      });
    } else if (this.isIos) {
      alert('Para instalar en iPhone/iPad: toca el botón Compartir de Safari y luego "Agregar a pantalla de inicio"');
    } else {
      alert('Para instalar en tu teléfono: abre el menú del navegador (3 puntos) y selecciona "Instalar aplicación" o "Agregar a pantalla principal"');
    }
  }

  ngOnDestroy() {
    this.menuSub?.unsubscribe();
    this.routerSub?.unsubscribe();
    if (typeof window !== 'undefined') {
      if (this.onlineListener) window.removeEventListener('online', this.onlineListener);
      if (this.offlineListener) window.removeEventListener('offline', this.offlineListener);
    }
  }

  private calcularEsRutaMapa(): boolean {
    const rawUrl = this.router.url.split('?')[0].replace(/\/+$/, '');
    this.esRutaMapa = rawUrl === '/dashboard' || rawUrl === '';
    return this.esRutaMapa;
  }

  private actualizarEsRutaMapa() {
    this.calcularEsRutaMapa();
    this.cdr.markForCheck();
  }

  toggleSidebar() {
    this.menuService.toggleMenu();
  }

  closeSidebar() {
    this.menuService.cerrarMenu();
  }

  navigateTo(section: string) {
    console.log(`Navegando a: ${section}`);
    this.closeSidebar();
    switch (section) {
      case 'dashboard':
        this.router.navigate(['/dashboard']);
        break;
      case 'dashboard-salud':
        this.router.navigate(['/dashboard-salud']);
        break;
      case 'notificaciones':
        this.router.navigate(['/notificaciones']);
        break;
      case 'pacientes':
        this.router.navigate(['/pacientes']);
        break;
      case 'incidencias':
        this.router.navigate(['/incidencias']);
        break;
      case 'perfil':
        this.router.navigate(['/perfil']);
        break;
      case 'calendario':
        this.router.navigate(['/calendario']);
        break;
      default:
        this.router.navigate(['/dashboard']);
    }
  }

  mostrarNotificaciones() {
    this.router.navigate(['/notificaciones']);
    this.closeSidebar();
  }

  irAPerfil() {
    this.router.navigate(['/perfil']);
    this.closeSidebar();
  }

  irAlMapa() {
    this.router.navigate(['/dashboard']);
    this.closeSidebar();
  }

  logout() {
    console.log('Cerrando sesión...');
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    localStorage.removeItem('userData');
    localStorage.removeItem('isAuthenticated');
    this.router.navigate(['/login']);
  }
}