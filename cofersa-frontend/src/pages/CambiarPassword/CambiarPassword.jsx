import React, { useState } from 'react';
import { formatCRC, formatPct, EstadoBadge } from "../../components/common/UIComponents";
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const CambiarPassword = () => {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!actual || !nueva || !confirm) {
      setMsg({ type: 'danger', text: 'Todos los campos son requeridos.' });
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
      const response = await fetch('/api/cambiar-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual, nueva })
      });
      const result = await response.json();
      if (result.ok) {
        setMsg({ type: 'success', text: 'Contraseña actualizada correctamente.' });
        setActual(''); setNueva(''); setConfirm('');
      } else {
        setMsg({ type: 'danger', text: result.error || 'Error al cambiar contraseña' });
      }
    } catch (e) {
      setMsg({ type: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Mi Contraseña" active="cambiar_pw">
      <h1>Cambiar Mi Contraseña</h1>
      {msg && <div className={`alert alert-${msg.type}`} style={{ maxWidth: '480px' }}>{msg.text}</div>}
      <div className="card" style={{ maxWidth: '480px' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Contraseña Actual *</label>
            <input type="password" class="form-control" value={actual} onChange={e => setActual(e.target.value)} placeholder="Tu contraseña actual" required />
          </div>
          <div className="form-group">
            <label>Nueva Contraseña *</label>
            <input type="password" class="form-control" value={nueva} onChange={e => setNueva(e.target.value)} placeholder="Mínimo 6 caracteres" required />
          </div>
          <div className="form-group">
            <label>Confirmar Nueva Contraseña *</label>
            <input type="password" class="form-control" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repite la nueva contraseña" required />
          </div>
          <div className="actions-bar" style={{ gap: '8px' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Guardando...' : 'Guardar Nueva Contraseña'}</button>
            <Link to="/" className="btn btn-outline">Cancelar</Link>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default CambiarPassword;
