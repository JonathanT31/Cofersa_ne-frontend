import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../api/supabaseClient';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 1. Manejo de Sesión Principal
  useEffect(() => {
    // Check active session on mount
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
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
        console.error('Excepción crítica al verificar sesión:', err);
        // Si hay una excepción grave, intentamos limpiar el almacenamiento para evitar bloqueos
        localStorage.removeItem('supabase.auth.token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Failsafe absoluto: forzar fin de carga después de 3 segundos sí o sí
    const failSafeTimer = setTimeout(() => {
      setLoading((prevLoading) => {
        if (prevLoading) {
          console.warn('Failsafe activado: forzando fin de carga.');
          return false;
        }
        return prevLoading;
      });
    }, 3000);

    // Listen for auth changes
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
  }, []); // <-- Array vacío, solo se ejecuta al montar

  // 2. Auto Logout por Inactividad
  useEffect(() => {
    let autoLogoutTimer;

    const resetAutoLogout = () => {
      clearTimeout(autoLogoutTimer);
      if (!user) return; // No iniciar timer si no hay usuario

      // Auto logout después de 2 horas (7200000 ms) de inactividad
      autoLogoutTimer = setTimeout(async () => {
        console.log('Sesión expirada por inactividad.');
        await supabase.auth.signOut();
        setUser(null);
      }, 7200000); 
    };

    // Agregar listeners para inactividad
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleUserActivity = () => {
      resetAutoLogout();
    };

    if (user) {
      resetAutoLogout();
      events.forEach(event => window.addEventListener(event, handleUserActivity));
    }

    return () => {
      clearTimeout(autoLogoutTimer);
      if (user) {
        events.forEach(event => window.removeEventListener(event, handleUserActivity));
      }
    };
  }, [user]); // Solo se re-ejecuta cuando cambia el usuario

  const fetchProfile = async (authUser) => {
    if (!authUser) return;

    try {
      // 1. Intentar cargar desde localStorage como caché inicial rápida
      const cachedProfileStr = localStorage.getItem(`profile_${authUser.id}`);
      let cachedProfile = null;
      if (cachedProfileStr) {
        try {
          cachedProfile = JSON.parse(cachedProfileStr);
        } catch (e) {
          console.error('Error al parsear perfil en caché:', e);
        }
      }

      // Si tenemos perfil en caché y no hay un usuario cargado, lo inicializamos para evitar demoras
      setUser(prev => {
        if (!prev && cachedProfile) {
          return { ...authUser, ...cachedProfile };
        }
        return prev;
      });

      // 2. Hacer la consulta real a la base de datos
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle();

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2500)
      );

      const { data, error } = await Promise.race([profilePromise, timeoutPromise]);
      
      if (error || !data) {
        // Mantener el estado previo si ya existe para evitar degradar el rol a 'vendedor'
        setUser(prev => {
          if (prev && prev.id === authUser.id && prev.role) {
            return prev;
          }
          if (cachedProfile) {
            return { ...authUser, ...cachedProfile };
          }
          return {
            ...authUser,
            role: authUser.user_metadata?.role || 'vendedor',
            nombre: authUser.user_metadata?.full_name?.split(' ')[0] || 'Usuario'
          };
        });
      } else {
        // Actualizar la caché local
        localStorage.setItem(`profile_${authUser.id}`, JSON.stringify(data));
        setUser({ ...authUser, ...data });
      }
    } catch (err) {
      setUser(prev => {
        if (prev && prev.id === authUser.id && prev.role) {
          return prev;
        }
        const cachedProfileStr = localStorage.getItem(`profile_${authUser.id}`);
        if (cachedProfileStr) {
          try {
            const cachedProfile = JSON.parse(cachedProfileStr);
            return { ...authUser, ...cachedProfile };
          } catch (e) {}
        }
        return {
          ...authUser,
          role: authUser.user_metadata?.role || 'vendedor',
          nombre: authUser.user_metadata?.full_name?.split(' ')[0] || 'Usuario'
        };
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
    if (user?.id) {
      localStorage.removeItem(`profile_${user.id}`);
    }
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
