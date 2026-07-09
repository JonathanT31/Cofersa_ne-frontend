import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const PasswordResets = () => {
  const [resets, setResets] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();

  // Filter & Pagination States
  const [filterSearch, setFilterSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

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

  // Client-side filtering logic
  const filteredResets = resets.filter(r => {
    const searchLower = filterSearch.toLowerCase().trim();
    const matchesSearch = !searchLower ||
      (r.username || '').toLowerCase().includes(searchLower) ||
      (r.nombre_completo || '').toLowerCase().includes(searchLower) ||
      (r.email || '').toLowerCase().includes(searchLower) ||
      (r.role || '').toLowerCase().includes(searchLower);

    const matchesEstado = !filterEstado || r.estado === filterEstado;

    return matchesSearch && matchesEstado;
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentResets = filteredResets.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredResets.length / itemsPerPage);

  const pendientesCount = resets.filter(r => r.estado === 'pendiente').length;

  return (
    <Layout title="Reseteos PW" active="pwresets">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ margin: 0 }}>Reseteos de Contraseña</h1>
          <span className="badge badge-pending">{pendientesCount} pendientes</span>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchResets}>Actualizar</button>
      </div>
      
      {/* Barra de Filtros */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        marginBottom: '20px', 
        flexWrap: 'wrap', 
        alignItems: 'center', 
        background: '#f8fafc', 
        padding: '15px', 
        borderRadius: '8px', 
        border: '1px solid #e2e8f0' 
      }}>
        <div className="form-group" style={{ margin: 0, minWidth: '180px', flex: '1 1 auto' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Buscar Usuario / Nombre / Email</label>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Buscar..." 
            value={filterSearch} 
            onChange={e => { setFilterSearch(e.target.value); setCurrentPage(1); }}
            style={{ height: '36px', minHeight: '36px' }}
          />
        </div>

        <div className="form-group" style={{ margin: 0, minWidth: '150px' }}>
          <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Estado</label>
          <select 
            className="form-control" 
            value={filterEstado} 
            onChange={e => { setFilterEstado(e.target.value); setCurrentPage(1); }}
            style={{ height: '36px', minHeight: '36px' }}
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="atendida">Atendida</option>
            <option value="rechazada">Rechazada</option>
          </select>
        </div>

        <div style={{ alignSelf: 'flex-end' }}>
          <button 
            className="btn btn-outline btn-sm" 
            onClick={() => { setFilterSearch(''); setFilterEstado(''); setCurrentPage(1); }}
            style={{ height: '36px', padding: '0 16px', display: 'flex', alignItems: 'center' }}
          >
            Limpiar Filtros
          </button>
        </div>
      </div>

      <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '10px', fontWeight: 500 }}>
        {!loading && `Mostrando ${filteredResets.length} de ${resets.length} solicitudes.`}
      </div>

      <div className="card">
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
              {loading ? (
                <tr><td colSpan="7" className="text-center" style={{ padding: '20px' }}>Cargando solicitudes...</td></tr>
              ) : currentResets.map(r => (
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
              {!loading && filteredResets.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center color-muted" style={{ padding: '20px' }}>Sin solicitudes registradas con los filtros aplicados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '15px' }}>
          <button 
            className="btn btn-outline btn-sm" 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
          >
            Anterior
          </button>
          <span style={{ fontSize: '13px' }}>Página {currentPage} de {totalPages}</span>
          <button 
            className="btn btn-outline btn-sm" 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Siguiente
          </button>
        </div>
      )}
    </Layout>
  );
};

export default PasswordResets;
