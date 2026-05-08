import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar localStorage para sesión guardada al cargar
    const savedUser = localStorage.getItem('cofersa_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('cofersa_user');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData) => {
    // Guardar en el estado y en localStorage
    setUser(userData);
    localStorage.setItem('cofersa_user', JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('cofersa_user');
  };

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Cargando sesión...</div>;
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
