export const API_BASE_URL = 'http://127.0.0.1:5000/api';

export const ENDPOINTS = {
  auth: {
    login: `${API_BASE_URL}/auth/login`,
  },
  solicitudes: {
    base: `${API_BASE_URL}/solicitudes`,
    create: `${API_BASE_URL}/solicitudes/nueva`,
  },
  catalogo: {
    buscar: `${API_BASE_URL}/catalogo/buscar`,
  }
};
