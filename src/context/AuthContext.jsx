import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Check active session on mount
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await fetchProfile(session.user);
        }
      } catch (err) {
        console.error('Error al verificar sesión:', err);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Timeout de seguridad: si después de 5 segundos sigue cargando, forzar el inicio
    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        await fetchProfile(session.user);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (authUser) => {
    if (!authUser) return;

    // Failsafe: Si la consulta a la base de datos tarda más de 3 segundos, 
    // usamos la metadata de la sesión para no bloquear al usuario.
    const profilePromise = supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout fetching profile')), 3000)
    );

    try {
      const { data, error } = await Promise.race([profilePromise, timeoutPromise]);
      
      if (error || !data) {
        setUser({
          ...authUser,
          role: authUser.user_metadata?.role || 'vendedor',
          nombre: authUser.user_metadata?.full_name?.split(' ')[0] || 'Usuario'
        });
      } else {
        setUser({ ...authUser, ...data });
      }
    } catch (err) {
      console.warn('Usando perfil de emergencia por error o timeout:', err.message);
      setUser({
        ...authUser,
        role: authUser.user_metadata?.role || 'vendedor',
        nombre: authUser.user_metadata?.full_name?.split(' ')[0] || 'Usuario'
      });
    }
  };

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    
    // Cargamos el perfil. Si falla, el catch interno de fetchProfile nos salvará.
    await fetchProfile(data.user);
    return data;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'Arial' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #1a5276', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }}></div>
            <p>Cargando sesión...</p>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      ) : children}
    </AuthContext.Provider>
  );
};
