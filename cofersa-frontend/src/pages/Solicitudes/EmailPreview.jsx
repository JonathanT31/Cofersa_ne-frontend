import React, { useState, useEffect } from 'react';
import { formatCRC, formatPct, EstadoBadge } from "../../components/common/UIComponents";
import { useParams, Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

const EmailPreview = () => {
  const { id } = useParams();
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchEmailPreview = async () => {
      try {
        const response = await fetch(`/email/preview/${id}`);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const html = await response.text();
        setHtmlContent(html);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchEmailPreview();
  }, [id]);

  if (loading) {
    return (
      <Layout title="Vista Previa de Correo">
        <div style={{ textAlign: 'center', padding: '40px' }}>Cargando vista previa...</div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Error">
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <h1 style={{ color: 'var(--danger)' }}>Error</h1>
          <p style={{ margin: '20px 0' }}>{error}</p>
          <Link to={`/solicitud/${id}`} className="btn btn-primary">Volver a la solicitud</Link>
        </div>
      </Layout>
    );
  }

  return (
    <>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, background: '#1a5276', color: 'white',
        padding: '10px 20px', display: 'flex', gap: 12, alignItems: 'center', zIndex: 9999,
        fontFamily: 'Arial,sans-serif', fontSize: '13px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}>
        <span style={{ fontWeight: 700, flex: 1 }}>Vista Previa del Correo</span>
        <button onClick={() => window.print()}
          style={{ background: 'white', color: '#1a5276', border: 'none', padding: '6px 14px',
                   borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>🖨 Imprimir / PDF</button>
        <Link to={`/solicitud/${id}`}
          style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '6px 14px',
                   borderRadius: '4px', textDecoration: 'none' }}>← Volver a Solicitud</Link>
      </div>
      <div style={{ height: '48px' }}></div>
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </>
  );
};

export default EmailPreview;
