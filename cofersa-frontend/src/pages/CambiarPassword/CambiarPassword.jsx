import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabaseClient';
import { crearNotificacion, TIPOS_NOTIFICACION } from '../../api/notificacionesService';

const CambiarPassword = () => {
  const { user } = useAuth();
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
      // 1. Verificar la contraseña actual reautenticando.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: actual,
      });
      if (signInError) {
        setMsg({ type: 'danger', text: 'La contraseña actual no es correcta.' });
        return;
      }

      // 2. Actualizar a la nueva contraseña.
      const { error: updateError } = await supabase.auth.updateUser({ password: nueva });
      if (updateError) throw updateError;

      // 3. Registrar la notificación (visible en la pestaña Notificaciones).
      crearNotificacion({
        userId: user.id,
        tipo: TIPOS_NOTIFICACION.CAMBIO_PASSWORD,
        titulo: 'Cambio de contraseña',
        mensaje: `La contraseña de tu cuenta fue actualizada el ${new Date().toLocaleString()}.`,
      });

      setMsg({ type: 'success', text: 'Contraseña actualizada correctamente.' });
      setActual('');
      setNueva('');
      setConfirm('');
    } catch (err) {
      console.error('Error al cambiar contraseña:', err);
      setMsg({ type: 'danger', text: err.message || 'No se pudo actualizar la contraseña.' });
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
            <Link to="/" className="btn btn-outline">Cancelar</Link>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default CambiarPassword;
