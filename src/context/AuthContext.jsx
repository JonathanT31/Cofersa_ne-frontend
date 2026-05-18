import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. Manejo del temporizador de inactividad (depende de [user])
  useEffect(() => {
    if (!user) return;

    let autoLogoutTimer;

    const resetAutoLogout = () => {
      clearTimeout(autoLogoutTimer);
      // Auto logout después de 2 horas (7200000 ms) de inactividad
      autoLogoutTimer = setTimeout(async () => {
        console.log('Sesión expirada por inactividad.');
        await supabase.auth.signOut();
        setUser(null);
      }, 7200000); 
    };

    const handleUserActivity = () => {
      resetAutoLogout();
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, handleUserActivity));

    resetAutoLogout(); // Iniciar temporizador al montar/cambiar usuario

    return () => {
      clearTimeout(autoLogoutTimer);
      events.forEach(event => window.removeEventListener(event, handleUserActivity));
    };
  }, [user]);

  // 2. Inicialización de sesión y escucha de cambios de autenticación (se ejecuta SOLO una vez al montar)
  useEffect(() => {
    // 1. Verificar sesión activa al montar con un tiempo de espera de 2 segundos para evitar bloqueos
    const checkSession = async () => {
      try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Límite de tiempo de sesión excedido')), 2000)
        );

        const { data: { session }, error } = await Promise.race([sessionPromise, timeoutPromise]);
        
        if (error) {
          console.error('Error al obtener sesión (posible caché corrupta):', error);
          await supabase.auth.signOut(); // Limpiar caché
          setUser(null);
          return;
        }

        if (session) {
          await fetchProfile(session.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Excepción crítica o timeout al verificar sesión:', err);
        // Limpiamos todo el almacenamiento relacionado con auth-token de Supabase para evitar bloqueos
        try {
          localStorage.removeItem('supabase.auth.token');
          Object.keys(localStorage).forEach(key => {
            if (key.includes('auth-token') || key.startsWith('sb-')) {
              localStorage.removeItem(key);
            }
          });
        } catch (storageErr) {
          console.error('Error limpiando localStorage:', storageErr);
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Failsafe absoluto: forzar fin de carga después de 3 segundos sí o sí
    const failSafeTimer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setUser(null);
      } else if (session) {
        await fetchProfile(session.user);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      clearTimeout(failSafeTimer);
    };
  }, []);

  const fetchProfile = async (authUser) => {
    if (!authUser) return;

    try {
      // Timeout agresivo de 2 segundos para no bloquear al usuario
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      );

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
