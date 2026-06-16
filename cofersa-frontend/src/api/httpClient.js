export const httpClient = async (url, options = {}) => {
  // Configuración por defecto
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Ejemplo: Inyectar token de sesión si existe
  const token = localStorage.getItem('session_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  return response.json();
};
