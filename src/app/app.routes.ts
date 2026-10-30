import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { LayoutComponent } from './components/layout/layout';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { PerfilComponent } from './pages/perfil/perfil.component';
import { NotificacionesComponent } from './pages/notificaciones/notificaciones.component';
import { IncidenciasComponent } from './pages/incidencias/incidencias.component';
import { PacientesComponent } from './pages/pacientes/pacientes.component';
import { CalendarioPageComponent } from './pages/calendario/calendario-page.component';
import { DashboardSaludComponent } from './pages/dashboard-salud/dashboard-salud.component';
import { EnlaceDashboardComponent } from './pages/enlace/dashboard/enlace-dashboard.component';
import { EnlaceEnfermerasComponent } from './pages/enlace/enfermeras/enlace-enfermeras.component';
import { EnlaceRendimientoComponent } from './pages/enlace/rendimiento/enlace-rendimiento.component';
import { EnlacePacientesComponent } from './pages/enlace/pacientes/enlace-pacientes.component';
import { EnlaceIncidenciasComponent } from './pages/enlace/incidencias/enlace-incidencias.component';
import { authGuard, publicGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [publicGuard]
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard-distrital', redirectTo: 'enlace/dashboard', pathMatch: 'full' },
      { path: 'enlace', redirectTo: 'enlace/dashboard', pathMatch: 'full' },
      { path: 'enlace/dashboard', component: EnlaceDashboardComponent },
      { path: 'enlace/enfermeras', component: EnlaceEnfermerasComponent },
      { path: 'enlace/rendimiento', component: EnlaceRendimientoComponent },
      { path: 'enlace/pacientes', component: EnlacePacientesComponent },
      { path: 'enlace/incidencias', component: EnlaceIncidenciasComponent },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'dashboard-salud', component: DashboardSaludComponent },
      { path: 'notificaciones', component: NotificacionesComponent },
      { path: 'perfil', component: PerfilComponent },
      { path: 'pacientes', component: PacientesComponent },
      { path: 'incidencias', component: IncidenciasComponent },
      { path: 'calendario', component: CalendarioPageComponent },
    ]
  },
  { path: '**', redirectTo: 'login' }
];