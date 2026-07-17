// src/app/store/app.selectors.ts

import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AppState } from './app.state';

export const selectAppState = createFeatureSelector<AppState>('app');

export const selectAnioActivo = createSelector(selectAppState, (state) => state.anioActivo);
export const selectDistritoF = createSelector(selectAppState, (state) => state.distritoF);
export const selectMunicipio = createSelector(selectAppState, (state) => state.municipio);
export const selectSeccionSeleccionada = createSelector(selectAppState, (state) => state.seccionSeleccionada);
export const selectManzanaSeleccionada = createSelector(selectAppState, (state) => state.manzanaSeleccionada);
export const selectManzanasDisponibles = createSelector(selectAppState, (state) => state.manzanasDisponibles || []);
export const selectColoresManzanas = createSelector(selectAppState, (state) => state.coloresManzanas || {});
export const selectModoPanel = createSelector(selectAppState, (state) => state.modoPanel);
export const selectIsAdminModalOpen = createSelector(selectAppState, (state) => state.isAdminModalOpen);
export const selectIsAuthenticated = createSelector(selectAppState, (state) => state.isAuthenticated);
export const selectUserRole = createSelector(selectAppState, (state) => state.userRole);
export const selectUserData = createSelector(selectAppState, (state) => state.userData);

// ⭐ SELECTORS PARA FILTROS
export const selectFiltrosPerfiles = createSelector(
    selectAppState,
    (state) => state.filtrosPerfiles
);

export const selectFiltrosRiesgos = createSelector(
    selectAppState,
    (state) => state.filtrosRiesgos
);