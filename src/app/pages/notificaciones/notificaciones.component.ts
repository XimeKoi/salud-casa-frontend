// src/app/pages/notificaciones/notificaciones.component.ts

import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NotificacionesService, Notificacion } from '../../services/notificaciones.service';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-notificaciones',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './notificaciones.component.html',
  styleUrls: ['./notificaciones.component.scss']
})
export class NotificacionesComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  notificaciones: Notificacion[] = [];
  notificacionesFiltradas: Notificacion[] = [];
  contador: any = { total: 0, noLeidas: 0, urgentes: 0 };
  cargando: boolean = true;
  cargandoMas: boolean = false;
  filtroActual: string = 'todas';
  private subscriptions: Subscription[] = [];
  hasMore: boolean = true;
  totalItems: number = 0;
  private paginaActual: number = 1;
  private pageSize: number = 10;
  private todasLasNotificaciones: Notificacion[] = [];
  private notificacionEliminando: boolean = false;

  // ⭐ VARIABLES PARA SELECCIÓN MÚLTIPLE
  notificacionesSeleccionadas: number[] = [];
  modalEliminarMultipleVisible: boolean = false;
  notificacionesAEliminarMultiple: any[] = [];

  // ⭐ VARIABLES PARA MODAL DE ELIMINACIÓN INDIVIDUAL
  modalEliminarVisible: boolean = false;
  notificacionAEliminar: any = null;

  constructor(
    private notificacionesService: NotificacionesService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    console.log('🔄 Iniciando notificaciones...');
    this.cargarNotificaciones();
    this.escucharNotificaciones();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      if (this.scrollContainer) {
        this.scrollContainer.nativeElement.addEventListener('scroll', () => {
          this.onContainerScroll();
        });
      }
    }, 500);
  }

  // ⭐ GETTERS PARA SELECCIÓN MÚLTIPLE
  get todasSeleccionadas(): boolean {
    return this.notificacionesFiltradas.length > 0 &&
      this.notificacionesFiltradas.every(n => this.notificacionesSeleccionadas.includes(n.id));
  }

  get algunasSeleccionadas(): boolean {
    return this.notificacionesSeleccionadas.length > 0 &&
      !this.todasSeleccionadas;
  }

  onContainerScroll() {
    if (!this.scrollContainer) return;

    const element = this.scrollContainer.nativeElement;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;

    if (scrollTop + clientHeight >= scrollHeight - 200 && this.hasMore && !this.cargandoMas) {
      this.cargarMasNotificaciones();
    }
  }

  cargarNotificaciones() {
    console.log('📡 Cargando notificaciones...');
    this.cargando = true;
    this.paginaActual = 1;
    this.todasLasNotificaciones = [];

    this.notificacionesService.obtenerNotificaciones().subscribe({
      next: (response: any) => {
        let data: Notificacion[] = [];

        if (response && response.data && Array.isArray(response.data)) {
          data = response.data;
        } else if (Array.isArray(response)) {
          data = response;
        }

        console.log('📊 Notificaciones recibidas:', data?.length || 0);

        if (data && data.length > 0) {
          this.todasLasNotificaciones = data;
          this.totalItems = data.length;
          this.hasMore = data.length > this.pageSize;
          this.mostrarPagina(1);
          localStorage.setItem('notificacionesCache', JSON.stringify(data));
        } else {
          this.todasLasNotificaciones = [];
          this.notificaciones = [];
          this.totalItems = 0;
          this.hasMore = false;
        }

        this.aplicarFiltro();
        this.cargando = false;
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        console.error('❌ Error:', error);
        const cached = localStorage.getItem('notificacionesCache');
        if (cached) {
          try {
            const data = JSON.parse(cached);
            if (data && data.length > 0) {
              this.todasLasNotificaciones = data;
              this.totalItems = data.length;
              this.hasMore = data.length > this.pageSize;
              this.mostrarPagina(1);
              this.aplicarFiltro();
              this.cargando = false;
              this.cdr.detectChanges();
            }
          } catch (e) {
            console.error('Error al cargar caché:', e);
          }
        }
        this.cargando = false;
        this.cdr.detectChanges();
      }
    });
  }

  mostrarPagina(page: number) {
    const start = (page - 1) * this.pageSize;
    const end = Math.min(start + this.pageSize, this.todasLasNotificaciones.length);
    this.notificaciones = this.todasLasNotificaciones.slice(start, end);
    this.paginaActual = page;
    this.hasMore = end < this.todasLasNotificaciones.length;
    console.log(`📄 Mostrando página ${page}: ${this.notificaciones.length} notificaciones`);
    this.aplicarFiltro();
  }

  cargarMasNotificaciones() {
    if (this.cargandoMas || !this.hasMore) return;

    console.log('🔄 Cargando página siguiente...');
    this.cargandoMas = true;

    setTimeout(() => {
      this.paginaActual++;
      this.mostrarPagina(this.paginaActual);
      this.cargandoMas = false;
      this.cdr.detectChanges();
    }, 500);
  }

  async limpiarTodasNotificaciones() {
    if (this.todasLasNotificaciones.length === 0) return;

    const result = await Swal.fire({
      title: '¿Eliminar todas las notificaciones?',
      html: `
        <div style="text-align: left; padding: 10px 0;">
          <p style="font-size: 14px; color: #555; margin-bottom: 12px;">
            Esta acción eliminará permanentemente <strong style="color: #701f2f;">${this.todasLasNotificaciones.length}</strong> notificaciones.
          </p>
          <div style="background: #fff3e0; border-radius: 8px; padding: 12px; border-left: 4px solid #e67e22;">
            <i class="fas fa-exclamation-triangle" style="color: #e67e22; margin-right: 8px;"></i>
            <span style="font-size: 13px; color: #555;">Esta acción no se puede deshacer.</span>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
            <span style="background: #e3f2fd; padding: 4px 12px; border-radius: 20px; font-size: 12px; color: #1565c0;">
              <i class="fas fa-circle" style="color: #1565c0; font-size: 8px; margin-right: 4px;"></i>
              ${this.contador.noLeidas} no leídas
            </span>
            <span style="background: #e8f5e9; padding: 4px 12px; border-radius: 20px; font-size: 12px; color: #2e7d32;">
              <i class="fas fa-circle" style="color: #2e7d32; font-size: 8px; margin-right: 4px;"></i>
              ${this.todasLasNotificaciones.length - this.contador.noLeidas} leídas
            </span>
            <span style="background: #ffebee; padding: 4px 12px; border-radius: 20px; font-size: 12px; color: #c62828;">
              <i class="fas fa-circle" style="color: #c62828; font-size: 8px; margin-right: 4px;"></i>
              ${this.contador.urgentes} urgentes
            </span>
          </div>
        </div>
      `,
      icon: 'warning',
      iconColor: '#c62828',
      showCancelButton: true,
      confirmButtonColor: '#c62828',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, eliminar todas',
      cancelButtonText: 'Cancelar',
      background: '#ffffff',
      customClass: {
        popup: 'swal-popup-custom',
        title: 'swal-title-custom',
        confirmButton: 'swal-button-danger',
        cancelButton: 'swal-button-cancel'
      },
      reverseButtons: true
    });

    if (result.isConfirmed) {
      await this.ejecutarEliminacionTodas();
    }
  }

  async ejecutarEliminacionTodas() {
    this.notificacionEliminando = true;
    const ids = this.todasLasNotificaciones.map(n => n.id);
    let eliminadas = 0;
    const total = ids.length;

    Swal.fire({
      title: 'Eliminando notificaciones...',
      html: `
        <div style="padding: 10px 0;">
          <div style="margin-bottom: 12px;">
            <i class="fas fa-spinner fa-pulse" style="font-size: 32px; color: #701f2f;"></i>
          </div>
          <div style="background: #f8f4f0; border-radius: 8px; padding: 10px; margin-bottom: 8px;">
            <span style="font-size: 14px; color: #555;">
              Progreso: <strong style="color: #701f2f;">${eliminadas}</strong> de <strong style="color: #701f2f;">${total}</strong>
            </span>
          </div>
          <div style="width: 100%; height: 6px; background: #f0ece8; border-radius: 4px; overflow: hidden;">
            <div id="progress-bar" style="width: 0%; height: 100%; background: #701f2f; border-radius: 4px; transition: width 0.3s;"></div>
          </div>
        </div>
      `,
      showConfirmButton: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        ids.forEach((id, index) => {
          setTimeout(() => {
            this.notificacionesService.eliminarNotificacion(id).subscribe({
              next: () => {
                eliminadas++;
                const progress = (eliminadas / total) * 100;
                const progressBar = document.getElementById('progress-bar');
                if (progressBar) {
                  progressBar.style.width = progress + '%';
                }

                const html = Swal.getHtmlContainer();
                if (html) {
                  const span = html.querySelector('span strong:first-child');
                  if (span) span.textContent = eliminadas.toString();
                }

                if (eliminadas === total) {
                  Swal.close();
                  this.todasLasNotificaciones = [];
                  this.notificaciones = [];
                  this.notificacionesFiltradas = [];
                  this.totalItems = 0;
                  this.hasMore = false;
                  this.contador = { total: 0, noLeidas: 0, urgentes: 0 };
                  localStorage.removeItem('notificacionesCache');
                  this.notificacionEliminando = false;
                  this.cdr.detectChanges();

                  Swal.fire({
                    icon: 'success',
                    title: '¡Todas las notificaciones eliminadas!',
                    text: `Se eliminaron ${total} notificaciones correctamente.`,
                    confirmButtonColor: '#701f2f',
                    confirmButtonText: 'Entendido',
                    timer: 3000,
                    timerProgressBar: true
                  });
                }
              },
              error: (err) => {
                console.error('Error al eliminar notificación:', err);
                if (eliminadas === total - 1) {
                  Swal.close();
                  this.notificacionEliminando = false;
                  Swal.fire({
                    icon: 'error',
                    title: 'Error al eliminar',
                    text: 'Algunas notificaciones no se pudieron eliminar. Intenta de nuevo.',
                    confirmButtonColor: '#c62828'
                  });
                }
              }
            });
          }, index * 100);
        });
      }
    });
  }

  escucharNotificaciones() {
    this.subscriptions.push(
      this.notificacionesService.getNotificaciones().subscribe({
        next: (data: any) => {
          if (data && data.length > 0 && !this.notificacionEliminando) {
            this.todasLasNotificaciones = data;
            this.totalItems = data.length;
            this.hasMore = data.length > this.pageSize;
            this.mostrarPagina(1);
            localStorage.setItem('notificacionesCache', JSON.stringify(data));
            this.cargando = false;
            this.cdr.detectChanges();
          }
        }
      })
    );

    this.subscriptions.push(
      this.notificacionesService.getContador().subscribe({
        next: (data: any) => {
          if (data) {
            this.contador = data;
            this.cdr.detectChanges();
          }
        }
      })
    );
  }

  // ⭐ TOGGLE LEÍDA / NO LEÍDA
  toggleLeida(notificacion: Notificacion) {
    const nuevoEstado = !notificacion.leida;

    // Cambiar visualmente primero
    notificacion.leida = nuevoEstado;

    // Actualizar contador
    if (nuevoEstado) {
      if (this.contador.noLeidas > 0) {
        this.contador.noLeidas--;
      }
    } else {
      this.contador.noLeidas++;
    }

    // Actualizar en la lista original
    const original = this.todasLasNotificaciones.find(n => n.id === notificacion.id);
    if (original) original.leida = nuevoEstado;

    // Guardar en localStorage
    localStorage.setItem('notificacionesCache', JSON.stringify(this.todasLasNotificaciones));

    this.cdr.detectChanges();

    // Llamar al servicio
    this.notificacionesService.cambiarEstado(notificacion.id, nuevoEstado).subscribe({
      next: () => {
        console.log(`✅ Notificación ${notificacion.id} cambiada a ${nuevoEstado ? 'leída' : 'no leída'}`);
      },
      error: (error: any) => {
        console.error('Error al cambiar estado:', error);
        // Revertir el cambio si hay error
        notificacion.leida = !nuevoEstado;
        if (original) original.leida = !nuevoEstado;
        if (nuevoEstado) {
          this.contador.noLeidas++;
        } else {
          this.contador.noLeidas--;
        }
        this.cdr.detectChanges();
      }
    });
  }

  // ⭐ MARCAR COMO LEÍDA (MANTENIDO POR COMPATIBILIDAD)
  marcarLeida(notificacion: Notificacion) {
    this.toggleLeida(notificacion);
  }

  marcarTodasLeidas() {
    if (this.contador.noLeidas === 0) return;

    Swal.fire({
      title: '¿Marcar todas como leídas?',
      text: `Hay ${this.contador.noLeidas} notificaciones sin leer.`,
      icon: 'question',
      iconColor: '#1976d2',
      showCancelButton: true,
      confirmButtonColor: '#1976d2',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, marcar todas',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.notificacionesService.marcarTodasLeidas().subscribe({
          next: () => {
            this.notificaciones.forEach(n => n.leida = true);
            this.todasLasNotificaciones.forEach(n => n.leida = true);
            this.contador.noLeidas = 0;
            this.cdr.detectChanges();

            Swal.fire({
              icon: 'success',
              title: '¡Todas las notificaciones marcadas como leídas!',
              timer: 2000,
              showConfirmButton: false
            });
          },
          error: (error: any) => console.error('Error:', error)
        });
      }
    });
  }

  // ⭐ ELIMINAR NOTIFICACIÓN INDIVIDUAL
  eliminarNotificacion(id: number) {
    this.notificacionesService.eliminarNotificacion(id).subscribe({
      next: () => {
        this.todasLasNotificaciones = this.todasLasNotificaciones.filter(n => n.id !== id);
        this.notificaciones = this.notificaciones.filter(n => n.id !== id);
        this.totalItems = this.todasLasNotificaciones.length;
        this.hasMore = this.todasLasNotificaciones.length > this.pageSize;
        localStorage.setItem('notificacionesCache', JSON.stringify(this.todasLasNotificaciones));
        this.aplicarFiltro();
        this.cdr.detectChanges();
      },
      error: (error: any) => console.error('Error:', error)
    });
  }

  cambiarFiltro(filtro: string) {
    this.filtroActual = filtro;
    this.aplicarFiltro();
    this.cdr.detectChanges();
  }

  aplicarFiltro() {
    if (this.filtroActual === 'noLeidas') {
      this.notificacionesFiltradas = this.notificaciones.filter(n => !n.leida);
    } else if (this.filtroActual === 'urgentes') {
      this.notificacionesFiltradas = this.notificaciones.filter(n => n.prioridad === 'urgente');
    } else {
      this.notificacionesFiltradas = [...this.notificaciones];
    }
  }

  // ⭐ TOGGLE SELECCIÓN INDIVIDUAL
  toggleSeleccion(id: number) {
    const index = this.notificacionesSeleccionadas.indexOf(id);
    if (index > -1) {
      this.notificacionesSeleccionadas.splice(index, 1);
    } else {
      this.notificacionesSeleccionadas.push(id);
    }
  }

  // ⭐ TOGGLE SELECCIONAR TODAS
  toggleSeleccionarTodas(event: any) {
    const checked = event.target.checked;
    if (checked) {
      this.notificacionesSeleccionadas = this.notificacionesFiltradas.map(n => n.id);
    } else {
      this.notificacionesSeleccionadas = [];
    }
  }

  // ⭐ VERIFICAR SI UNA NOTIFICACIÓN ESTÁ SELECCIONADA
  isSeleccionada(id: number): boolean {
    return this.notificacionesSeleccionadas.includes(id);
  }

  // ⭐ ELIMINAR SELECCIONADAS
  eliminarSeleccionadas() {
    if (this.notificacionesSeleccionadas.length === 0) return;

    const notificaciones = this.notificacionesFiltradas.filter(n =>
      this.notificacionesSeleccionadas.includes(n.id)
    );
    this.notificacionesAEliminarMultiple = notificaciones;
    this.modalEliminarMultipleVisible = true;
  }

  // ⭐ CERRAR MODAL ELIMINAR MÚLTIPLE
  cerrarModalEliminarMultiple() {
    this.modalEliminarMultipleVisible = false;
    this.notificacionesAEliminarMultiple = [];
  }

  // ⭐ EJECUTAR ELIMINAR MÚLTIPLE
  ejecutarEliminarMultiple() {
    const ids = this.notificacionesSeleccionadas;
    let eliminadas = 0;

    ids.forEach((id, index) => {
      setTimeout(() => {
        this.notificacionesService.eliminarNotificacion(id).subscribe({
          next: () => {
            eliminadas++;
            this.todasLasNotificaciones = this.todasLasNotificaciones.filter(n => n.id !== id);
            this.notificaciones = this.notificaciones.filter(n => n.id !== id);

            if (eliminadas === ids.length) {
              this.notificacionesSeleccionadas = [];
              this.totalItems = this.todasLasNotificaciones.length;
              this.hasMore = this.todasLasNotificaciones.length > this.pageSize;
              localStorage.setItem('notificacionesCache', JSON.stringify(this.todasLasNotificaciones));
              this.aplicarFiltro();
              this.cdr.detectChanges();
              this.cerrarModalEliminarMultiple();

              Swal.fire({
                icon: 'success',
                title: '¡Notificaciones eliminadas!',
                text: `Se eliminaron ${ids.length} notificaciones correctamente.`,
                confirmButtonColor: '#701f2f',
                confirmButtonText: 'Entendido',
                timer: 2500,
                timerProgressBar: true
              });
            }
          },
          error: (err) => {
            console.error('Error al eliminar notificación:', err);
            if (eliminadas === ids.length - 1) {
              this.cerrarModalEliminarMultiple();
              Swal.fire({
                icon: 'error',
                title: 'Error al eliminar',
                text: 'Algunas notificaciones no se pudieron eliminar. Intenta de nuevo.',
                confirmButtonColor: '#c62828'
              });
            }
          }
        });
      }, index * 150);
    });
  }

  // ⭐ ABRIR MODAL DE CONFIRMACIÓN INDIVIDUAL
  confirmarEliminar(notificacion: any) {
    this.notificacionAEliminar = notificacion;
    this.modalEliminarVisible = true;
  }

  // ⭐ CERRAR MODAL DE ELIMINACIÓN INDIVIDUAL
  cerrarModalEliminar() {
    this.modalEliminarVisible = false;
    this.notificacionAEliminar = null;
  }

  // ⭐ EJECUTAR ELIMINACIÓN INDIVIDUAL
  ejecutarEliminar() {
    if (this.notificacionAEliminar) {
      this.eliminarNotificacion(this.notificacionAEliminar.id);
      this.cerrarModalEliminar();
    }
  }

  // ⭐ MÉTODOS DE UTILIDAD
  getPrioridadClass(prioridad: string): string {
    const clases: { [key: string]: string } = {
      'urgente': 'prioridad-urgente',
      'alta': 'prioridad-alta',
      'media': 'prioridad-media',
      'baja': 'prioridad-baja'
    };
    return clases[prioridad] || 'prioridad-media';
  }

  getPrioridadTexto(prioridad: string): string {
    const textos: { [key: string]: string } = {
      'urgente': 'Urgente',
      'alta': 'Alta',
      'media': 'Media',
      'baja': 'Baja'
    };
    return textos[prioridad] || prioridad;
  }

  getTipoIcono(tipo: string): string {
    const iconos: { [key: string]: string } = {
      'paciente': 'fa-user',
      'incidencia': 'fa-exclamation-triangle',
      'visita': 'fa-calendar-check',
      'calendario': 'fa-calendar-alt',
      'captura': 'fa-camera',
      'sistema': 'fa-server',
      'emergencia': 'fa-ambulance',
      'recordatorio': 'fa-clock'
    };
    return iconos[tipo] || 'fa-bell';
  }

  getTipoTexto(tipo: string): string {
    const textos: { [key: string]: string } = {
      'paciente': 'Paciente',
      'incidencia': 'Incidencia',
      'visita': 'Visita',
      'calendario': 'Calendario',
      'captura': 'Captura',
      'sistema': 'Sistema',
      'emergencia': 'Emergencia',
      'recordatorio': 'Recordatorio'
    };
    return textos[tipo] || tipo;
  }

  getFechaFormateada(fecha: string): string {
    if (!fecha) return 'Reciente';
    const date = new Date(fecha);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Ahora mismo';
    if (minutes < 60) return `Hace ${minutes} min`;
    if (hours < 24) return `Hace ${hours} h`;
    if (days < 7) return `Hace ${days} d`;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
}