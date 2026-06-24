import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const PasswordResets = () => {
  const [resets, setResets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    fetchResets();
  }, []);

  const fetchResets = async () => {
    try {
      setLoading(true);
      // Fetch with join to profiles
      const { data, error } = await supabase
        .from('password_reset_requests')
        .select(`
          *,
          profiles:user_id (username, nombre, apellido, email, role)
        `)
        .order('requested_at', { ascending: false });
      
      if (error) throw error;
      setLogsInState(data);
    } catch (error) {
      console.error('Error fetching resets:', error);
    } finally {
      setLoading(false);
    }
  };

  const setLogsInState = (data) => {
    const formatted = data.map(r => ({
      ...r,
      username: r.profiles?.username,
      nombre_completo: r.profiles ? `${r.profiles.nombre} ${r.profiles.apellido}`.trim() : '',
      email: r.profiles?.email,
      role: r.profiles?.role
    }));
    setResets(formatted);
  };

  const handleApprove = async (id) => {
    try {
      const { error } = await supabase
        .from('password_reset_requests')
        .update({
          estado: 'atendida',
          resolved_at: new Date().toISOString(),
          resolved_by: currentUser.id,
          nueva_password: 'Cofersa123!' // Clave temporal estandarizada
        })
        .eq('id', id);

      if (error) throw error;
      
      window.alert(`Contraseña reseteada a: Cofersa123!\nComuníquela al usuario de forma segura.`);
      fetchResets();
    } catch (error) {
      alert('Error al aprobar: ' + error.message);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm('¿Rechazar esta solicitud?')) return;
    try {
      const { error } = await supabase
        .from('password_reset_requests')
        .update({
          estado: 'rechazada',
          resolved_at: new Date().toISOString(),
          resolved_by: currentUser.id
        })
        .eq('id', id);

      if (error) throw error;
      fetchResets();
    } catch (error) {
      alert('Error al rechazar: ' + error.message);
    }
  };

  const getBadgeClass = (estado) => {
    switch(estado) {
      case 'pendiente': return 'badge-pending';
      case 'atendida': return 'badge-approved';
      case 'rechazada': return 'badge-rejected';
      default: return 'badge-draft';
    }
  };

  const pendientesCount = resets.filter(r => r.estado === 'pendiente').length;

  return (
    <Layout title="Reseteos PW" active="pwresets">
      <div className="page-header">
        <h1>Reseteos de Contraseña</h1>
        <span className="badge badge-pending">{pendientesCount} pendientes</span>
      </div>
      
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
           <p style={{ fontSize: '13px', color: '#666' }}>
             {loading ? 'Cargando solicitudes...' : `Se muestran las últimas solicitudes registradas.`}
           </p>
           <button className="btn btn-outline btn-sm" onClick={fetchResets}>Actualizar</button>
        </div>
        
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Solicitado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {resets.map(r => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.username}</td>
                  <td>{r.nombre_completo}</td>
                  <td>{r.email}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.role}</td>
                  <td><span className={`badge ${getBadgeClass(r.estado)}`}>{r.estado}</span></td>
                  <td style={{ fontSize: '11px' }}>{new Date(r.requested_at).toLocaleString()}</td>
                  <td>
                    {r.estado === 'pendiente' ? (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-success btn-sm" onClick={() => handleApprove(r.id)}>✓ Aprobar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleReject(r.id)}>✕ Rechazar</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#888' }}>
                        Resuelto el {new Date(r.resolved_at).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && resets.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center color-muted" style={{ padding: '20px' }}>Sin solicitudes pendientes</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default PasswordResets;
