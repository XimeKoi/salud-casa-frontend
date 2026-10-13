// src/app/services/menu.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class MenuService {
  private sidebarOpen$ = new BehaviorSubject<boolean>(false);
  sidebarOpen = this.sidebarOpen$.asObservable();

  constructor(private router: Router) {
    if (typeof window !== 'undefined') {
      window.addEventListener('abrirMenuGlobal', () => this.abrirMenu());
      window.addEventListener('cerrarMenuGlobal', () => this.cerrarMenu());
      window.addEventListener('toggleMenuGlobal', () => this.toggleMenu());
    }
  }

  get isOpen(): boolean {
    return this.sidebarOpen$.value;
  }

  toggleMenu() {
    this.sidebarOpen$.next(!this.sidebarOpen$.value);
  }

  abrirMenu() {
    this.sidebarOpen$.next(true);
  }

  cerrarMenu() {
    this.sidebarOpen$.next(false);
  }

  irAlMapa() {
    this.cerrarMenu();
    this.router.navigate(['/dashboard']);
  }
}

