import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { useAuth } from '../../context/AuthContext';
import {
  listarNotificaciones,
  marcarLeida,
  marcarTodasLeidas,
} from '../../api/notificacionesService';

// Etiqueta y color (clase de badge existente) por tipo de notificación.
const TIPO_META = {
  solicitud_enviada:   { label: 'Solicitud enviada',    badge: 'badge-review' },
  solicitud_aprobada:  { label: 'Solicitud aprobada',   badge: 'badge-approved' },
  solicitud_cancelada: { label: 'Solicitud cancelada',  badge: 'badge-rejected' },
  cambio_password:     { label: 'Cambio de contraseña', badge: 'badge-escalated' },
  login_alerta:        { label: 'Inicio de sesión',     badge: 'badge-draft' },
};

const FILTROS = [
  { key: 'todas', label: 'Todas' },
  { key: 'no_leidas', label: 'No leídas' },
];

const Notificaciones = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notis, setNotis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('todas');

  useEffect(() => {
    if (user?.id) fetchNotis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchNotis = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const data = await listarNotificaciones(user.id);
      setNotis(data);
    } catch (error) {
      console.error('Error cargando notificaciones:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAbrir = async (noti) => {
    try {
      if (!noti.leida) {
        await marcarLeida(noti.id);
        setNotis((prev) =>
          prev.map((n) => (n.id === noti.id ? { ...n, leida: true } : n))
        );
      }
    } catch (e) {
      console.error('Error marcando como leída:', e);
    }
    if (noti.url) navigate(noti.url);
  };

  const handleMarcarTodas = async () => {
    try {
      await marcarTodasLeidas(user.id);
      setNotis((prev) => prev.map((n) => ({ ...n, leida: true })));
    } catch (e) {
      console.error('Error marcando todas como leídas:', e);
    }
  };

  const noLeidas = notis.filter((n) => !n.leida).length;
  const visibles = filtro === 'no_leidas' ? notis.filter((n) => !n.leida) : notis;

  return (
    <Layout title="Notificaciones" active="notificaciones">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <h1 style={{ margin: 0 }}>Notificaciones</h1>
        <span className="badge badge-review">{noLeidas} sin leer</span>
      </div>

      <div className="card" style={{ marginTop: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {FILTROS.map((f) => (
              <button
                key={f.key}
                className={`btn btn-sm ${filtro === f.key ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setFiltro(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn btn-outline btn-sm" onClick={fetchNotis}>Actualizar</button>
            <button className="btn btn-primary btn-sm" onClick={handleMarcarTodas} disabled={noLeidas === 0}>
              Marcar todas como leídas
            </button>
          </div>
        </div>

        {loading && <p style={{ fontSize: '13px', color: '#888' }}>Cargando notificaciones...</p>}

        {!loading && visibles.length === 0 && (
          <p style={{ fontSize: '13px', color: '#888', textAlign: 'center', padding: '20px 0' }}>
            No hay notificaciones para mostrar.
          </p>
        )}

        {!loading && visibles.map((noti) => {
          const meta = TIPO_META[noti.tipo] || { label: noti.tipo, badge: 'badge-draft' };
          return (
            <div
              key={noti.id}
              onClick={() => handleAbrir(noti)}
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                padding: '12px',
                borderRadius: '6px',
                marginBottom: '8px',
                border: '1px solid #eef1f5',
                background: noti.leida ? '#fff' : '#f3f8fd',
                cursor: noti.url ? 'pointer' : 'default',
              }}
            >
              {!noti.leida && (
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#1a5276', marginTop: '6px', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, marginLeft: noti.leida ? '20px' : '0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>{noti.titulo}</span>
                  <span className={`badge ${meta.badge}`}>{meta.label}</span>
                </div>
                {noti.mensaje && (
                  <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>{noti.mensaje}</div>
                )}
                <div style={{ fontSize: '11px', color: '#999', marginTop: '6px' }}>
                  {new Date(noti.created_at).toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Layout>
  );
};

export default Notificaciones;
