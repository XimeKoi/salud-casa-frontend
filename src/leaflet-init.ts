// src/leaflet-init.ts
// ⭐ Garantizar que Leaflet esté registrado en window antes de que cualquier plugin (como markercluster) se ejecute

import * as L from 'leaflet';

if (typeof window !== 'undefined') {
  (window as any).L = L;
}

export default L;
export { L };
