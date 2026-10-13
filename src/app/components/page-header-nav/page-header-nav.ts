// src/app/components/page-header-nav/page-header-nav.ts

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuService } from '../../services/menu.service';

@Component({
  selector: 'app-page-header-nav',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './page-header-nav.html',
  styleUrls: ['./page-header-nav.scss']
})
export class PageHeaderNavComponent {
  @Input() showMenu: boolean = true;
  @Input() showMap: boolean = true;
  @Input() mapLabel: string = 'Mapa';
  @Input() menuLabel: string = 'Menú';

  constructor(public menuService: MenuService) {}

  abrirMenu() {
    this.menuService.abrirMenu();
  }

  irAlMapa() {
    this.menuService.irAlMapa();
  }
}

