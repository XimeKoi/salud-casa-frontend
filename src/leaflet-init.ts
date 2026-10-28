// src/leaflet-init.ts
// ⭐ Registrar Leaflet en window para plugins globales (como Leaflet MarkerCluster)

import * as L from 'leaflet';

if (typeof window !== 'undefined') {
  const win = window as any;
  if (!win.L) {
    win.L = { ...L };
  } else {
    try {
      Object.assign(win.L, L);
    } catch (e) {
      console.warn('⚠️ No se pudo asignar L a win.L:', e);
    }
  }
}

export default L;
export { L };
