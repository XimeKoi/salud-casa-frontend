import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class AppComponent implements OnInit {
  title = 'Cuidalia';
  mostrarSplash = signal<boolean>(true);
  splashAnimandoSalida = signal<boolean>(false);
  splashProgreso = signal<number>(10);
  splashEstadoTexto = signal<string>('Iniciando plataforma médica...');

  ngOnInit() {
    this.iniciarSecuenciaSplash();
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