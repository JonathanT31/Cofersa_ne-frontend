import React, { useState } from 'react';
import Layout from '../../components/layout/Layout';

const Configuracion = () => {
  const [config, setConfig] = useState({
    smtp_host: 'smtp.gmail.com',
    smtp_port: '587',
    smtp_user: 'sistema@cofersa.cr',
    smtp_password: 'app-password-1234',
    smtp_from: 'negociacionespecial@cofersa.cr',
    email_ne_team: 'aprobaciones@cofersa.cr',
    app_name: 'COFERSA NE',
    base_url: 'http://localhost:8080'
  });

  const [msg, setMsg] = useState(null);

  const handleChange = (e) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleSave = (e) => {
    e.preventDefault();
    setMsg({ type: 'success', text: 'Configuración guardada' });
    setTimeout(() => setMsg(null), 3000);
  };

  return (
    <Layout title="Configuración" active="config">
      <h1>Configuración del Sistema</h1>
      
      <div className="card">
        <form onSubmit={handleSave}>
          {Object.keys(config).map((key) => (
            <div className="form-group" key={key}>
              <label>{key}</label>
              <input 
                type={key.includes('password') ? 'password' : 'text'} 
                className="form-control" 
                name={key} 
                value={config[key]} 
                onChange={handleChange} 
              />
            </div>
          ))}
          <button type="submit" className="btn btn-primary">Guardar Configuración</button>
        </form>
        {msg && (
          <div style={{ marginTop: '10px' }}>
            <div className={`alert alert-${msg.type}`}>{msg.text}</div>
          </div>
        )}
      </div>
      
      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-header">Configuración de Correo con Google Workspace</div>
        <p>Para enviar correos desde la app, configure:</p>
        <ol style={{ paddingLeft: '20px', lineHeight: 2 }}>
          <li>Active "Acceso de apps menos seguras" o genere una <strong>App Password</strong> en su cuenta Google Workspace.</li>
          <li>En Google Admin → Security → App Access, permita SMTP relay si es necesario.</li>
          <li>Configure smtp_host: <code>smtp.gmail.com</code>, smtp_port: <code>587</code></li>
          <li>smtp_user: su email de Google Workspace (ej: <code>sistema@cofersa.cr</code>)</li>
          <li>smtp_password: la App Password generada (16 caracteres)</li>
          <li>smtp_from: email remitente (ej: <code>negociacionespecial@cofersa.cr</code>)</li>
        </ol>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <div className="card-header">Integración con Google Sheets</div>
        <p>Para exportar datos a Google Sheets automáticamente:</p>
        <ol style={{ paddingLeft: '20px', lineHeight: 2 }}>
          <li>Cree un Google Sheet destino y compártalo con permisos de edición.</li>
          <li>En Google Sheets, vaya a Extensiones → Apps Script.</li>
          <li>Cree un Web App que reciba datos POST en formato JSON.</li>
          <li>Publique como Web App y copie la URL del deployment.</li>
          <li>Configure el webhook en base_url/api/export/gsheet.</li>
        </ol>
        <p>Alternativamente, puede exportar CSV desde la sección Exportar y pegarlo en Google Sheets.</p>
      </div>
    </Layout>
  );
};

export default Configuracion;
