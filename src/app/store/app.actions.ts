// src/app/store/app.actions.ts

import { createAction, props } from '@ngrx/store';

export const setAnioActivo = createAction(
  '[Map] Set Año Activo',
  props<{ anio: string }>()
);

export const setDistritoF = createAction(
  '[Map] Set Distrito Federal',
  props<{ distrito: string }>()
);

export const setMunicipio = createAction(
  '[Map] Set Municipio',
  props<{ municipio: string }>()
);

export const setSeccionSeleccionada = createAction(
  '[Map] Set Seccion Seleccionada',
  props<{ seccion: string }>()
);

export const setManzanaSeleccionada = createAction(
  '[Map] Set Manzana Seleccionada',
  props<{ manzana: string }>()
);

export const setModoPanel = createAction(
  '[UI] Set Modo Panel',
  props<{ modo: 'electoral' | 'operativo' }>()
);

export const toggleAdminModal = createAction(
  '[UI] Toggle Admin Modal',
  props<{ isOpen: boolean }>()
);

export const loginSuccess = createAction(
  '[Auth] Login Success',
  props<{ user: any, role: string; userData?: any }>()
);

export const setManzanasDisponibles = createAction(
  '[Map] Set Manzanas Disponibles',
  props<{ manzanas: string[] }>()
);

export const setColoresManzanas = createAction(
  '[Map] Set Colores Manzanas',
  props<{ colores: { [key: string]: string } }>()
);

export const logout = createAction('[Auth] Logout');

// ⭐ ACCIONES PARA FILTROS
export const setFiltrosPerfiles = createAction(
  '[Filtros] Set Perfiles',
  props<{ perfiles: { adulto: boolean; discapacitado: boolean; referido: boolean; finado?: boolean } }>()
);

export const setFiltrosRiesgos = createAction(
  '[Filtros] Set Riesgos',
  props<{ riesgos: { g1: boolean; g2: boolean; g3: boolean; g4: boolean } }>()
);