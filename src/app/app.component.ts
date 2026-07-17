// src/app/app.component.ts

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet],
    templateUrl: './app.html',     // ✅ CORRECTO
    styleUrls: ['./app.scss']      // ✅ CORRECTO
})
export class AppComponent {
    title = 'fronty-main';
}