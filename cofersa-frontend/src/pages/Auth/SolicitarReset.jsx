import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';

const SolicitarReset = () => {
  const [username, setUsername] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSolicitar = async () => {
    const trimmedUser = username.trim().toLowerCase();
    if (!trimmedUser) {
      setMsg({ type: 'danger', text: 'Ingresa tu usuario.' });
      return;
    }
    
    setLoading(true);
    setMsg(null);

    try {
      // 1. Buscar al usuario en profiles
      const { data: user, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', trimmedUser)
        .single();

      if (userError || !user) {
        setMsg({ type: 'danger', text: 'Usuario no encontrado en el sistema.' });
        return;
      }

      // 2. Insertar solicitud de reseteo
      const { error: resetError } = await supabase
        .from('password_reset_requests')
        .insert({
          user_id: user.id,
          estado: 'pendiente'
        });

      if (resetError) throw resetError;

      setMsg({ type: 'success', text: 'Solicitud registrada. Un administrador la atenderá pronto.' });
      setUsername('');
    } catch (error) {
      console.error('Error solicitando reseteo:', error);
      setMsg({ type: 'danger', text: 'Error técnico al registrar la solicitud.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <title>Solicitar Reseteo - COFERSA NE</title>
      <div className="login-container">
        <div className="login-card">
          <h1 style={{ color: '#1a5276' }}>COFERSA</h1>
          <div className="subtitle">Recuperación de Contraseña</div>
          
          <div className="form-group">
            <label>Usuario (sin @cofersa.cr)</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="tu.usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>
          
          {msg && (
            <div style={{ marginBottom: '10px' }}>
              <div className={`alert alert-${msg.type}`}>{msg.text}</div>
            </div>
          )}
          
          <button 
            className="btn btn-primary w-100" 
            style={{ padding: '12px', fontSize: '15px' }} 
            onClick={handleSolicitar}
            disabled={loading}
          >
            {loading ? 'Procesando...' : 'Enviar Solicitud de Reseteo'}
          </button>
          
          <div style={{ marginTop: '14px' }}>
            <Link to="/login" style={{ fontSize: '13px', color: '#1a5276' }}>
              ← Volver al inicio de sesión
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default SolicitarReset;
