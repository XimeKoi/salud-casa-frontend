// src/environments/environment.prod.ts

export const environment = {
    production: true,
    // ⭐ CAMBIA ESTA URL POR LA DE TU BACKEND EN RAILWAY
    apiUrl: 'https://salud-casa-backend-production.up.railway.app',
    geocodingApiUrl: 'https://salud-casa-backend-production.up.railway.app/geocode',

    // ============================================
    // CONFIGURACIÓN DEL DISTRITO ACTUAL
    // ============================================
    distrito: {
        id: 3,
        nombre: 'Distrito 3',
        lat: 21.1165,
        lng: -101.6865,
        zoom: 15,
        idEnfermera: 1,
    },

    // ============================================
    // LISTA DE DISTRITOS DISPONIBLES
    // ============================================
    distritos: [
        { id: 3, nombre: 'Distrito 3', lat: 21.1165, lng: -101.6865, zoom: 15, idEnfermera: 1 },
    ]
};