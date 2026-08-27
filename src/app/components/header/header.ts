// src/app/components/header/header.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrls: ['./header.scss']
})
export class HeaderComponent {
  sidebarOpen = false;
  cantidadNotificaciones = 3;

  constructor(private router: Router) { }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar() {
    this.sidebarOpen = false;
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
      case 'captura':
        this.router.navigate(['/captura']);
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

  irACaptura() {
    this.router.navigate(['/captura']);
    this.closeSidebar();
  }

  logout() {
    console.log('Cerrando sesión...');
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    this.router.navigate(['/login']);
  }
}