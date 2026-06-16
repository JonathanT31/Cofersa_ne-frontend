import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Por favor, ingresa tu correo y contraseña.');
      return;
    }
    
    setLoading(true);
    try {
      // Ensure email has @cofersa.cr if not provided
      let loginEmail = email.trim();
      if (!loginEmail.includes('@')) {
        loginEmail = `${loginEmail}@cofersa.cr`;
      }
      
      await login(loginEmail, password);
      
      // Redirect to target or home
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Error al iniciar sesión. Verifica tus credenciales.');
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
              <label>Correo / Usuario</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="usuario o correo@cofersa.cr" 
                required 
                autoFocus 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="form-group">
              <label>Contraseña</label>
              <input 
                type="password" 
                className="form-control" 
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <button 
              type="submit" 
              className="btn btn-primary w-100" 
              style={{ padding: '12px', fontSize: '16px', marginTop: '10px' }}
              disabled={loading}
            >
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
