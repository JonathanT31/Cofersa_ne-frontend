import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor, ingresa tu usuario y contraseña.');
      return;
    }
    
    // Simular inicio de sesión por ahora - luego la API se encargará de esto
    let mockRole = 'vendedor';
    if (username.includes('admin')) mockRole = 'admin';
    else if (username.includes('super')) mockRole = 'supervisor';
    else if (username.includes('compra')) mockRole = 'compras';
    
    login({
      id: 1,
      username: username,
      nombre: username.split('.')[0].toUpperCase(),
      apellido: 'Prueba',
      role: mockRole
    });
    
    // Redirigir a la página que intentaban visitar, o al inicio
    const from = location.state?.from?.pathname || '/';
    navigate(from, { replace: true });
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
              <input 
                type="text" 
                className="form-control" 
                placeholder="usuario (sin @cofersa.cr)" 
                required 
                autoFocus 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
              />
            </div>
            <button type="submit" className="btn btn-primary w-100" style={{ padding: '12px', fontSize: '16px', marginTop: '10px' }}>
              Ingresar
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
