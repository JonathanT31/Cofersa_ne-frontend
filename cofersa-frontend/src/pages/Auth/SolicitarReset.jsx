import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const SolicitarReset = () => {
  const [username, setUsername] = useState('');
  const [msg, setMsg] = useState(null);

  const handleSolicitar = () => {
    const trimmedUser = username.trim();
    if (!trimmedUser) {
      setMsg({ type: 'danger', text: 'Ingresa tu usuario.' });
      return;
    }
    
    // Simular llamada a la API
    setMsg({ type: 'success', text: 'Solicitud registrada. Un administrador la atenderá pronto.' });
    setUsername('');
  };

  return (
    <>
      <title>Solicitar Reseteo - COFERSA NE</title>
      <div className="login-container">
        <div className="login-card">
          <h1>COFERSA</h1>
          <div className="subtitle">Recuperación de Contraseña</div>
          
          <div className="form-group">
            <label>Usuario (sin @cofersa.cr)</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="tu.usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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
          >
            Enviar Solicitud de Reseteo
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
