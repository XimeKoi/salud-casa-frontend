// src/app/store/app.reducer.ts

import { createReducer, on } from '@ngrx/store';
import { AppState, initialState } from './app.state';
import * as AppActions from './app.actions';

export const appReducer = createReducer(
  initialState,

  // Map Actions
  on(AppActions.setAnioActivo, (state, { anio }) => ({
    ...state,
    anioActivo: anio
  })),

  on(AppActions.setDistritoF, (state, { distrito }) => ({
    ...state,
    distritoF: distrito,
    municipio: null,
    seccionSeleccionada: null,
    manzanaSeleccionada: null
  })),

  on(AppActions.setMunicipio, (state, { municipio }) => ({
    ...state,
    municipio,
    seccionSeleccionada: null,
    manzanaSeleccionada: null
  })),

  on(AppActions.setSeccionSeleccionada, (state, { seccion }) => ({
    ...state,
    seccionSeleccionada: seccion,
    manzanaSeleccionada: null
  })),

  on(AppActions.setManzanaSeleccionada, (state, { manzana }) => ({
    ...state,
    manzanaSeleccionada: manzana
  })),

  on(AppActions.setManzanasDisponibles, (state, { manzanas }) => ({
    ...state,
    manzanasDisponibles: manzanas
  })),

  on(AppActions.setColoresManzanas, (state, { colores }) => ({
    ...state,
    coloresManzanas: colores
  })),

  // UI Actions
  on(AppActions.setModoPanel, (state, { modo }) => ({
    ...state,
    modoPanel: modo
  })),

  on(AppActions.toggleAdminModal, (state, { isOpen }) => ({
    ...state,
    isAdminModalOpen: isOpen
  })),

  // Auth Actions
  on(AppActions.loginSuccess, (state, { user, role, userData }) => ({
    ...state,
    userRole: role,
    userData: userData || null,
    isAuthenticated: true
  })),

  on(AppActions.logout, (state) => ({
    ...state,
    userRole: null,
    userData: null,
    isAuthenticated: false,
    isAdminModalOpen: false,
    distritoF: null,
    municipio: null,
    seccionSeleccionada: null,
    manzanaSeleccionada: null,
    manzanasDisponibles: [],
    coloresManzanas: {},
    filtrosPerfiles: { adulto: false, discapacitado: false, referido: false },
    filtrosRiesgos: { g1: false, g2: false, g3: false, g4: false }
  })),

  // ⭐ FILTROS - PERFILES
  on(AppActions.setFiltrosPerfiles, (state, { perfiles }) => ({
    ...state,
    filtrosPerfiles: perfiles
  })),

  // ⭐ FILTROS - RIESGOS
  on(AppActions.setFiltrosRiesgos, (state, { riesgos }) => ({
    ...state,
    filtrosRiesgos: riesgos
  }))
);