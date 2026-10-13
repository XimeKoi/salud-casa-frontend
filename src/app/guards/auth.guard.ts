// src/app/guards/auth.guard.ts

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);

  // Verificar si hay sesión activa en localStorage
  const userData = localStorage.getItem('userData');
  const rol = localStorage.getItem('rol');
  const token = localStorage.getItem('token');
  const isAuthFlag = localStorage.getItem('isAuthenticated') === 'true';

  const checkVal = (v: string | null) => Boolean(v && v !== 'null' && v !== 'undefined' && v.trim() !== '');
  const estaAutenticado = isAuthFlag || checkVal(userData) || checkVal(rol) || checkVal(token);

  if (estaAutenticado) {
    return true;
  }

  // Si no está autenticado, redirigir al login
  console.warn('⛔ Acceso denegado. Redirigiendo a /login desde:', state.url);
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url }
  });
};

export const publicGuard: CanActivateFn = () => {
  const router = inject(Router);

  const userData = localStorage.getItem('userData');
  const rol = localStorage.getItem('rol');
  const token = localStorage.getItem('token');
  const isAuthFlag = localStorage.getItem('isAuthenticated') === 'true';

  const checkVal = (v: string | null) => Boolean(v && v !== 'null' && v !== 'undefined' && v.trim() !== '');
  const estaAutenticado = isAuthFlag || checkVal(userData) || checkVal(rol) || checkVal(token);

  // Si el usuario ya inició sesión e intenta ir a /login, llevarlo al dashboard
  if (estaAutenticado) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
