// src/app/store/app.state.ts

export interface AppState {
  anioActivo: string;
  distritoF: string | null;
  municipio: string | null;
  seccionSeleccionada: string | null;
  manzanaSeleccionada: string | null;
  manzanasDisponibles: string[];
  coloresManzanas: { [key: string]: string };
  modoPanel: 'electoral' | 'operativo';
  isAdminModalOpen: boolean;
  userRole: string | null;
  userData: any | null;
  isAuthenticated: boolean;
  filtrosPerfiles: { adulto: boolean; discapacitado: boolean; referido: boolean };
  filtrosRiesgos: { g1: boolean; g2: boolean; g3: boolean; g4: boolean };
}

// ⭐ INICIALIZAR CON ARRAY VACÍO - LAS ZONAS SE CARGAN DESDE EL MAPA
export const initialState: AppState = {
  anioActivo: '2024',
  distritoF: null,
  municipio: null,
  seccionSeleccionada: null,
  manzanaSeleccionada: null,
  manzanasDisponibles: [], // ⭐ VACÍO - SE LLENA DESDE EL MAPA
  coloresManzanas: {},
  modoPanel: 'electoral',
  isAdminModalOpen: false,
  userRole: null,
  userData: null,
  isAuthenticated: false,
  filtrosPerfiles: { adulto: false, discapacitado: false, referido: false },
  filtrosRiesgos: { g1: false, g2: false, g3: false, g4: false }
};