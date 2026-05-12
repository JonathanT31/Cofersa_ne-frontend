export const API_BASE_URL = '/api'; // Use relative path for Vercel

export const ENDPOINTS = {
  auth: {
    login: `${API_BASE_URL}/auth/login`,
  },
  solicitudes: {
    base: `${API_BASE_URL}/solicitudes`,
    create: `${API_BASE_URL}/solicitudes`,
  },
  catalogo: {
    buscar: `${API_BASE_URL}/infocompras`,
    marcas: `${API_BASE_URL}/marcas`,
  },
  dashboard: {
    stats: `${API_BASE_URL}/dashboard/stats`,
  },
  admin: {
    reglas: `${API_BASE_URL}/reglas`,
    presupuesto: `${API_BASE_URL}/presupuesto`,
    usuarios: `${API_BASE_URL}/usuarios`,
  }
};
