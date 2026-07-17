import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class ReloadService {
    private reloadSubject = new Subject<string>();

    reload$ = this.reloadSubject.asObservable();

    // Método para disparar recarga de un módulo específico
    triggerReload(module: string) {
        this.reloadSubject.next(module);
    }

    // Método para recargar todos los módulos
    triggerReloadAll() {
        this.reloadSubject.next('all');
    }
}