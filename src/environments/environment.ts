export const environment = {
    production: false,
    apiUrl: 'http://localhost:3000',

    // ============================================
    // CONFIGURACIÓN DEL DISTRITO ACTUAL
    // ============================================
    // ✅ DISTRITO ACTIVO: Solo Distrito 3 por ahora
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
    // ⚠️ Por ahora solo se usa el Distrito 3
    // Los demás están comentados para uso futuro
    distritos: [
        // { id: 1, nombre: 'Distrito 1', lat: 21.0000, lng: -101.5000, zoom: 14, idEnfermera: 1 },
        // { id: 2, nombre: 'Distrito 2', lat: 21.0500, lng: -101.6000, zoom: 14, idEnfermera: 1 },
        { id: 3, nombre: 'Distrito 3', lat: 21.1165, lng: -101.6865, zoom: 15, idEnfermera: 1 },
        // { id: 4, nombre: 'Distrito 4', lat: 21.2345, lng: -101.9876, zoom: 14, idEnfermera: 2 },
        // { id: 5, nombre: 'Distrito 5', lat: 21.3000, lng: -102.0000, zoom: 14, idEnfermera: 2 },
    ]
};