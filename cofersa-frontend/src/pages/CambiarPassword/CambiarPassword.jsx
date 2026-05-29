import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';

const CambiarPassword = () => {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!actual || !nueva || !confirm) {
      setMsg({ type: 'danger', text: 'Todos los campos son obligatorios.' });
      return;
    }
    if (nueva.length < 6) {
      setMsg({ type: 'danger', text: 'La nueva contraseña debe tener al menos 6 caracteres.' });
      return;
    }
    if (nueva !== confirm) {
      setMsg({ type: 'danger', text: 'La nueva contraseña y la confirmación no coinciden.' });
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      // Supabase updateUser updates the password of the currently logged-in user
      const { error } = await supabase.auth.updateUser({
        password: nueva
      });

      if (error) throw error;

      setMsg({ type: 'success', text: 'Contraseña actualizada correctamente.' });
      setActual('');
      setNueva('');
      setConfirm('');
    } catch (err) {
      console.error('Error al cambiar contraseña:', err);
      setMsg({ type: 'danger', text: err.message || 'Error al actualizar la contraseña.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Mi Contraseña" active="cambiar_pw">
      <h1>Cambiar Mi Contraseña</h1>
      
      <div className="card" style={{ maxWidth: '480px' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Contraseña Actual *</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Tu contraseña actual"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label>Nueva Contraseña * (mínimo 6 caracteres)</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Nueva contraseña"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label>Confirmar Nueva Contraseña *</label>
            <input 
              type="password" 
              className="form-control" 
              placeholder="Repite la nueva contraseña"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
            />
          </div>
          
          {msg && (
            <div style={{ marginBottom: '10px' }}>
              <div className={`alert alert-${msg.type}`}>{msg.text}</div>
            </div>
          )}
          
          <div className="actions-bar">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar Contraseña'}
            </button>
            <Link to="/" className={`btn btn-outline ${loading ? 'disabled' : ''}`} style={{ pointerEvents: loading ? 'none' : 'auto' }}>
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default CambiarPassword;
