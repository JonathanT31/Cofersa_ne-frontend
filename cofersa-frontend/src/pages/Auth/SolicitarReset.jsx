import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const SolicitarReset = () => {
  const [username, setUsername] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username) {
      setMsg({ type: 'danger', text: 'Ingresa tu usuario.' });
      return;
    }

    setLoading(true);
    setMsg(null);
    try {
      const response = await fetch('/api/solicitar-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const result = await response.json();
      if (result.ok) {
        setMsg({ type: 'success', text: 'Solicitud registrada. Un administrador la atenderá pronto.' });
        setUsername('');
      } else {
        setMsg({ type: 'danger', text: result.error || 'Error al solicitar reseteo' });
      }
    } catch (e) {
      setMsg({ type: 'danger', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Solicitar Reseteo">
      <div className="login-container">
        <div className="login-card">
          <h1>COFERSA</h1>
          <div className="subtitle">Solicitud de Reseteo de Contraseña</div>
          {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label>Usuario (sin @cofersa.cr)</label>
              <input type="text" className="form-control" value={username} onChange={e => setUsername(e.target.value)} placeholder="tu.usuario" required autoFocus />
            </div>
            <button type="submit" className="btn btn-primary w-100" style={{ padding: '12px', fontSize: '15px' }} disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar Solicitud de Reseteo'}
            </button>
          </form>
          <div style={{ marginTop: '14px' }}>
            <Link to="/login" style={{ fontSize: '13px', color: '#1a5276' }}>← Volver al inicio de sesión</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SolicitarReset;
