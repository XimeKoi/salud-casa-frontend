import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { LayoutComponent } from './components/layout/layout';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { PerfilComponent } from './pages/perfil/perfil.component';
import { NotificacionesComponent } from './pages/notificaciones/notificaciones.component';
import { CapturaComponent } from './pages/captura/captura.component';
import { IncidenciasComponent } from './pages/incidencias/incidencias.component';
import { PacientesComponent } from './pages/pacientes/pacientes.component';
import { CalendarioPageComponent } from './pages/calendario/calendario-page.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'notificaciones', component: NotificacionesComponent },
      { path: 'perfil', component: PerfilComponent },
      { path: 'captura', component: CapturaComponent },
      { path: 'pacientes', component: PacientesComponent },
      { path: 'incidencias', component: IncidenciasComponent },
      { path: 'calendario', component: CalendarioPageComponent },
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];