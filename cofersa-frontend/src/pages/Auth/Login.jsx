import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor, ingresa tu usuario y contraseña.');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const userRes = await fetch('/api/me');
        if (userRes.ok) {
           const userData = await userRes.json();
           login(userData.user);
           const from = location.state?.from?.pathname || '/';
           navigate(from, { replace: true });
        } else {
           setError('Error al validar sesión. Verifique sus credenciales.');
        }
      } else {
        setError('Usuario o contraseña incorrectos.');
      }
    } catch (e) {
      setError('Error de conexión: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <title>Ingresar - COFERSA NE</title>
      <div className="login-container">
        <div className="login-card">
          <h1>COFERSA</h1>
          <div className="subtitle">Sistema de Negociación Especial</div>
          {error && <div className="alert alert-danger">{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Usuario</label>
              <input type="text" name="username" className="form-control" placeholder="usuario (sin @cofersa.cr)" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input type="password" name="password" className="form-control" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary w-100" style={{ padding: '12px', fontSize: '16px', marginTop: '10px' }} disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
          <div style={{ marginTop: '16px', borderTop: '1px solid #eee', paddingTop: '14px' }}>
            <Link to="/solicitar-reset" style={{ fontSize: '13px', color: '#888', textDecoration: 'none' }}>
              ¿Olvidaste tu contraseña? <span style={{ color: '#1a5276', fontWeight: 600 }}>Solicitar reseteo</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
