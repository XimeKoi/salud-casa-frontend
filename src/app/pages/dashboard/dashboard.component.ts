// src/app/pages/dashboard/dashboard.component.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MapComponent } from '../../components/map/map';
import { InfoPanelComponent } from '../../components/info-panel/info-panel';

console.log('🔍 [dashboard] Cargando DashboardComponent...');

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MapComponent,
    InfoPanelComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  infoPanelMobileOpen: boolean = false;

  constructor() {
    console.log('🏗️ [DashboardComponent] Constructor ejecutado');
  }

  toggleInfoPanelMobile() {
    this.infoPanelMobileOpen = !this.infoPanelMobileOpen;
  }

  cerrarInfoPanelMobile() {
    this.infoPanelMobileOpen = false;
  }
}