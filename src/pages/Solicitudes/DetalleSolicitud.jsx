import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPct = (n) => {
  if (isNaN(n)) return "0.00%";
  return Number(n).toFixed(2) + "%";
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

const DetalleSolicitud = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [sol, setSol] = useState(null);
  const [skus, setSkus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [comentario, setComentario] = useState('');

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      
      // Fetch solicitud with related info
      const { data: sData, error: sError } = await supabase
        .from('solicitudes')
        .select(`
            *,
            vendedor:profiles!vendedor_id(nombre, apellido, email),
            aprobador:profiles!aprobador_actual_id(nombre, apellido)
        `)
        .eq('id', id)
        .single();
      
      if (sError) throw sError;
      setSol(sData);

      // Fetch skus
      const { data: skData, error: skError } = await supabase
        .from('solicitud_skus')
        .select('*')
        .eq('solicitud_id', id);
      
      if (skError) throw skError;
      setSkus(skData || []);

    } catch (err) {
      console.error('Error fetching detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action) => {
    if (!window.confirm(`¿Está seguro de ${action} esta solicitud?`)) return;

    try {
      setSubmitting(true);
      const endpoint = action === 'aprobar' ? '/api/solicitudes/aprobar' : '/api/solicitudes/rechazar';
      
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${endpoint}?sol_id=${id}&user_id=${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'rechazar' ? comentario : { comentario })
      });

      if (!response.ok) throw new Error('Error en el servidor');
      
      alert(`Solicitud ${action} exitosamente.`);
      fetchDetail();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Layout title="Cargando..."><div className="text-center" style={{padding:'50px'}}>Cargando detalle de solicitud...</div></Layout>;
  if (!sol) return <Layout title="No encontrada"><div className="text-center" style={{padding:'50px'}}>Solicitud no encontrada.</div></Layout>;

  return (
    <Layout title={`Solicitud ${sol.folio || sol.id}`} active="mis">
      <div className="page-header">
        <h1>Solicitud {sol.folio || `#${sol.id}`}</h1>
        <div><EstadoBadge estado={sol.estado} /></div>
      </div>

      <div className="card">
        <div className="grid-3">
          <div><strong>Cliente:</strong> {sol.cliente_codigo} — {sol.cliente_nombre}</div>
          <div><strong>Pedido:</strong> {sol.numero_pedido || 'N/A'}</div>
          <div><strong>Vendedor:</strong> {sol.vendedor ? `${sol.vendedor.nombre} ${sol.vendedor.apellido}` : 'Unknown'}</div>
        </div>
        <div className="grid-3" style={{ marginTop: '10px' }}>
          <div><strong>Creada:</strong> {sol.created_at?.substring(0, 16)}</div>
          <div><strong>Nivel Aprobación:</strong> {sol.aprobador_nivel}</div>
          <div><strong>Aprobador Actual:</strong> {sol.aprobador ? `${sol.aprobador.nombre} ${sol.aprobador.apellido}` : 'Sin asignar'}</div>
        </div>
        <div style={{ marginTop: '10px' }}><strong>Justificación:</strong> {sol.justificacion}</div>
        {sol.comentario_aprobador && <div style={{ marginTop: '6px', color: '#e67e22' }}><strong>Comentario del Aprobador:</strong> {sol.comentario_aprobador}</div>}
      </div>

      <h2 style={{ margin: '20px 0 10px' }}>Detalle de Productos</h2>
      <div className="card table-responsive">
        <table>
          <thead>
            <tr>
              <th>Marca</th><th>Código</th><th>Descripción</th><th className="text-right">Cant</th>
              <th className="text-right">P.Base</th><th className="text-right">%Desc</th><th className="text-right">Mto.Desc</th>
            </tr>
          </thead>
          <tbody>
            {skus.map(s => (
              <tr key={s.id}>
                <td>{s.marca}</td>
                <td>{s.codigo_sku}</td>
                <td className="wrap">{s.descripcion}</td>
                <td className="text-right">{s.cantidad}</td>
                <td className="text-right">{formatCRC(s.precio_base)}</td>
                <td className="text-right">{formatPct(s.porcentaje_descuento_sol)}</td>
                <td className="text-right">{formatCRC(s.monto_descuento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sol.estado === 'pendiente' && (user?.role === 'supervisor' || user?.role === 'admin' || user?.role === 'compras') && (
        <div className="card" style={{ marginTop: '20px', border: '2px solid var(--warning)' }}>
          <div className="card-header">Panel de Decisión</div>
          <div className="form-group" style={{ marginTop: '10px' }}>
            <label>Comentario (Opcional para aprobar, requerido para rechazar)</label>
            <textarea 
                className="form-control" 
                rows="2" 
                value={comentario} 
                onChange={e => setComentario(e.target.value)}
                disabled={submitting}
            ></textarea>
          </div>
          <div className="actions-bar">
            <button className="btn btn-success" onClick={() => handleAction('aprobar')} disabled={submitting}>✓ Aprobar Solicitud</button>
            <button className="btn btn-danger" onClick={() => handleAction('rechazar')} disabled={submitting || !comentario.trim()}>✕ Rechazar Solicitud</button>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default DetalleSolicitud;
