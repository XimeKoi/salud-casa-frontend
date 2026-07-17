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
  // ⭐ FILTROS
  filtrosPerfiles: { adulto: boolean; discapacitado: boolean; referido: boolean };
  filtrosRiesgos: { g1: boolean; g2: boolean; g3: boolean; g4: boolean };
}

// ⭐ ZONAS DE EJEMPLO PARA CARGA INICIAL
const zonasIniciales: string[] = (() => {
  try {
    const guardadas = localStorage.getItem('zonas_disponibles');
    if (guardadas) {
      const zonas: string[] = JSON.parse(guardadas);
      if (zonas && zonas.length > 0) {
        return zonas;
      }
    }
  } catch (e) {
    console.error('Error cargando zonas iniciales:', e);
  }
  return [
    'Santa Rosa de Lima',
    'San José del Consuelo',
    'El Manantial',
    'Valle de San José',
    'Residencial Rentería',
    'Residencial Platino',
    'Cumbres de las Hilamas',
    'Villa Sur León',
    'La Selva 2',
    'León II',
    'La Moderna',
    'San Pedro Plus'
  ];
})();

// ⭐ COLORES DE EJEMPLO
const coloresEjemplo: { [key: string]: string } = {};
const coloresBase: string[] = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#FF8A5C', '#A29BFE', '#FD79A8', '#00B894',
  '#E17055', '#6C5CE7'
];

// ⭐ TIPADO EXPLÍCITO PARA EL FOREACH
zonasIniciales.forEach((zona: string, index: number) => {
  coloresEjemplo[zona] = coloresBase[index % coloresBase.length];
});

export const initialState: AppState = {
  anioActivo: '2024',
  distritoF: null,
  municipio: null,
  seccionSeleccionada: null,
  manzanaSeleccionada: null,
  manzanasDisponibles: zonasIniciales,
  coloresManzanas: coloresEjemplo,
  modoPanel: 'electoral',
  isAdminModalOpen: false,
  userRole: null,
  userData: null,
  isAuthenticated: false,
  // ⭐ FILTROS INICIALES
  filtrosPerfiles: { adulto: false, discapacitado: false, referido: false },
  filtrosRiesgos: { g1: false, g2: false, g3: false, g4: false }
};