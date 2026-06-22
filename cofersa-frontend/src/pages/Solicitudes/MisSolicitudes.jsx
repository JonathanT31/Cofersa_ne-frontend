import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const EstadoBadge = ({ estado }) => {
  let className = 'badge ';
  let label = estado;
  
  switch (estado) {
    case 'pendiente':
      className += 'badge-pending';
      label = 'Pendiente';
      break;
    case 'en_revision':
    case 'escalada':
      className += 'badge-warning';
      label = estado === 'en_revision' ? 'En Revisión' : 'Escalada';
      break;
    case 'aprobada':
      className += 'badge-approved';
      label = 'Aprobada';
      break;
    case 'parcialmente_aprobada':
      className += 'badge-warning';
      label = 'Parcialmente Aprob.';
      break;
    case 'rechazada':
    case 'cancelada':
      className += 'badge-rejected';
      label = estado.charAt(0).toUpperCase() + estado.slice(1);
      break;
    default:
      className += 'badge-pending';
  }

  return <span className={className}>{label}</span>;
};

const MisSolicitudes = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAlert, setShowAlert] = useState(false);

  useEffect(() => {
    if (location.state?.emailSent) {
      setShowAlert(true);
      const timer = setTimeout(() => {
        setShowAlert(false);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [location]);

  useEffect(() => {
    if (user) fetchSolicitudes();
  }, [user]);

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('solicitudes')
        .select('*')
        .eq('vendedor_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setSolicitudes(data || []);
    } catch (err) {
      console.error('Error fetching solicitudes:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Mis Solicitudes" active="mis">
      {showAlert && (
        <div style={{
          padding: '12px 20px',
          backgroundColor: '#e0f2fe',
          color: '#0369a1',
          borderLeft: '4px solid #0284c7',
          borderRadius: '6px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📧</span>
            <span><strong>¡Solicitud enviada con éxito!</strong> Se ha realizado un envío de correo de notificación.</span>
          </div>
          <button 
            onClick={() => setShowAlert(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#0369a1',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 'bold',
              padding: '0 4px'
            }}
          >
            ✕
          </button>
        </div>
      )}
      <h1>Mis Solicitudes</h1>
      <div className="card">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Folio/ID</th>
                <th>Cliente</th>
                <th>Pedido</th>
                <th className="text-right">Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center">Cargando...</td></tr>
              ) : solicitudes.length > 0 ? (
                solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/solicitud/${s.id}`}>{s.folio || `#${s.id}`}</Link>
                    </td>
                    <td>{s.cliente_nombre}</td>
                    <td>{s.numero_pedido || '—'}</td>
                    <td className="text-right"><EstadoBadge estado={s.estado} /></td>
                    <td>{s.created_at?.substring(0, 16)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center">No hay solicitudes registradas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default MisSolicitudes;
