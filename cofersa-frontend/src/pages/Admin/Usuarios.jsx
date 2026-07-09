import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const Usuarios = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);

  // Form states for new user
  const [newUsername, setNewUsername] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newApellido, setNewApellido] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('vendedor');
  const [newPassword, setNewPassword] = useState('Cofersa123!');
  const [newSupervisorId, setNewSupervisorId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [creating, setCreating] = useState(false);

  // Filter & Pagination States
  const [filterSearch, setFilterSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Fetch users & supervisors from Supabase
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      
      setUsers(data || []);
      setSupervisors((data || []).filter(u => u.role !== 'vendedor' && u.status === 'activo'));
    } catch (err) {
      console.error('Error fetching users:', err);
      setErrorMsg('Error al cargar la lista de usuarios: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Filter and pagination logic
  const filteredUsers = users.filter(u => {
    const searchLower = filterSearch.toLowerCase().trim();
    const matchesSearch = !searchLower || 
      (u.username || '').toLowerCase().includes(searchLower) ||
      (u.nombre || '').toLowerCase().includes(searchLower) ||
      (u.apellido || '').toLowerCase().includes(searchLower) ||
      (u.email || '').toLowerCase().includes(searchLower);
    
    const matchesRole = !filterRole || u.role === filterRole;
    const matchesStatus = !filterStatus || u.status === filterStatus;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);

  // Update specific user field locally and sync with Supabase
  const handleFieldChange = async (userId, field, value) => {
    // Update local state first for fast response
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, [field]: value } : u));
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [field]: value })
        .eq('id', userId);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating user:', err);
      alert('Error al actualizar el usuario: ' + err.message);
      fetchUsers(); // Revert on failure
    }
  };

  // Cell focus loss styling & saving logic for text inputs
  const handleCellBlur = async (user, field, event) => {
    const el = event.target;
    const value = el.value.trim();
    
    if (value === '') {
      alert('El valor no puede estar vacío.');
      el.value = user[field]; // revert input value
      return;
    }

    if (value === user[field]) return; // no change

    try {
      await handleFieldChange(user.id, field, value);
      
      // Visual feedback: brief green border flash
      el.style.borderColor = '#27ae60';
      setTimeout(() => { if (el) el.style.borderColor = ''; }, 1000);
    } catch (err) {
      el.style.borderColor = '#e74c3c';
      setTimeout(() => { if (el) el.style.borderColor = ''; }, 1000);
    }
  };

  // Create new user in Supabase Auth and Profiles table
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!newUsername || !newNombre || !newApellido || !newEmail || !newPassword) {
      setErrorMsg('Por favor completa todos los campos requeridos.');
      return;
    }

    let finalEmail = newEmail.trim();
    if (!finalEmail.includes('@')) {
      finalEmail = `${finalEmail}@cofersa.cr`;
    }

    if (newRole === 'vendedor' && !newSupervisorId) {
      setErrorMsg('Por favor selecciona un supervisor para el vendedor.');
      return;
    }

    try {
      setCreating(true);
      // Enviar solicitud de creación al backend seguro en Python
      // Obtener el token de la sesión activa de Supabase
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/admin/crear-usuario`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: finalEmail,
          password: newPassword,
          username: newUsername.trim(),
          nombre: newNombre.trim(),
          apellido: newApellido.trim(),
          role: newRole,
          supervisor_id: newRole === 'vendedor' ? newSupervisorId : null,
          status: 'activo'
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Error al procesar la creación del usuario en el servidor.');
      }

      const resData = await response.json();
      
      const successDetail = resData.action === 'profile_updated'
        ? `Perfil del usuario ${newUsername} (ya existente globalmente) vinculado y actualizado con éxito.`
        : `Usuario ${newUsername} creado con éxito.`;

      setSuccessMsg(successDetail);
      setShowNewForm(false);
      
      // Reset form fields
      setNewUsername('');
      setNewNombre('');
      setNewApellido('');
      setNewEmail('');
      setNewRole('vendedor');
      setNewPassword('Cofersa123!');
      setNewSupervisorId('');
      
      // Reload list
      fetchUsers();

    } catch (err) {
      console.error('Error creating user:', err);
      setErrorMsg(err.message || 'Error técnico al crear el usuario.');
    } finally {
      setCreating(false);
    }
  };

  // Delete user profile
  const handleDelete = async (userId, username) => {
    if (window.confirm(`¿Está seguro de que desea eliminar a "${username}"? Si tiene solicitudes asociadas, le recomendamos cambiar su estado a "inactivo".`)) {
      try {
        const { error } = await supabase
          .from('profiles')
          .delete()
          .eq('id', userId);
        
        if (error) {
          if (error.code === '23503') { // foreign key violation code
            throw new Error('No se puede eliminar el usuario porque tiene solicitudes u otros registros asociados. Por favor cambie su estado a "inactivo".');
          }
          throw error;
        }
        
        setUsers(prev => prev.filter(u => u.id !== userId));
        alert('Usuario eliminado con éxito.');
      } catch (err) {
        alert(err.message || 'Error al eliminar el usuario.');
      }
    }
  };

  // Reset user password directly by creating an approved password reset request
  const handleResetPassword = async (user) => {
    if (window.confirm(`¿Resetear contraseña a "Cofersa123!" para el usuario ${user.username}?`)) {
      try {
        const { error } = await supabase
          .from('password_reset_requests')
          .insert([{
            user_id: user.id,
            estado: 'atendida',
            resolved_at: new Date().toISOString(),
            resolved_by: currentUser?.id || null,
            nueva_password: 'Cofersa123!'
          }]);

        if (error) throw error;
        alert(`Contraseña de ${user.username} reseteada a "Cofersa123!" con éxito.`);
      } catch (err) {
        alert('Error al resetear la contraseña: ' + err.message);
      }
    }
  };

  return (
    <Layout title="Usuarios" active="usuarios">
      <h1>Gestión de Usuarios</h1>
      
      {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
      {successMsg && <div className="alert alert-success">{successMsg}</div>}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
          <button className="btn btn-success btn-sm" onClick={() => { setShowNewForm(true); setErrorMsg(''); setSuccessMsg(''); }}>
            + Nuevo Usuario
          </button>
        </div>

        {/* Filtros de Búsqueda */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap', background: '#f8f9fa', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px', flex: '1 1 auto' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Buscar Usuario / Nombre / Email</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar..." 
              value={filterSearch} 
              onChange={e => { setFilterSearch(e.target.value); setCurrentPage(1); }}
              style={{ height: '34px', padding: '4px 8px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Filtrar por Rol</label>
            <select 
              className="form-control" 
              value={filterRole} 
              onChange={e => { setFilterRole(e.target.value); setCurrentPage(1); }}
              style={{ height: '34px', padding: '4px 8px' }}
            >
              <option value="">Todos</option>
              {['vendedor','supervisor','gerente_ventas','compras','admin'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Estado</label>
            <select 
              className="form-control" 
              value={filterStatus} 
              onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              style={{ height: '34px', padding: '4px 8px' }}
            >
              <option value="">Todos</option>
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <button 
              className="btn btn-outline btn-sm" 
              onClick={() => { setFilterSearch(''); setFilterRole(''); setFilterStatus(''); setCurrentPage(1); }}
              style={{ height: '34px', padding: '0 12px', display: 'flex', alignItems: 'center' }}
            >
              Limpiar
            </button>
          </div>
        </div>
        
        {showNewForm && (
          <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #ddd' }}>
            <h3 style={{ marginTop: 0 }}>Nuevo Usuario</h3>
            <form onSubmit={handleCreateUser}>
              <div className="grid-3">
                <div className="form-group">
                  <label>Usuario <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="ej: j.perez" 
                    required 
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Nombre <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    value={newNombre}
                    onChange={e => setNewNombre(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Apellido <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input 
                    type="text" 
                    className="form-control" 
                    required 
                    value={newApellido}
                    onChange={e => setNewApellido(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid-3">
                <div className="form-group">
                  <label>Email <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="jperez o jperez@cofersa.cr" 
                    required 
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Rol <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <select className="form-control" value={newRole} onChange={e => setNewRole(e.target.value)}>
                    <option value="vendedor">Vendedor</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="gerente_ventas">Gte. Ventas</option>
                    <option value="compras">Compras</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Contraseña <span style={{ color: 'var(--danger)' }}>*</span></label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
              
              {newRole === 'vendedor' && (
                <div className="grid-3">
                  <div className="form-group">
                    <label>Supervisor <span style={{ color: 'var(--danger)' }}>*</span></label>
                    <select className="form-control" value={newSupervisorId} onChange={e => setNewSupervisorId(e.target.value)}>
                      <option value="">-- Seleccione supervisor --</option>
                      {supervisors.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
                    </select>
                  </div>
                </div>
              )}
              
              <div style={{ marginTop: '12px' }}>
                <button type="submit" className="btn btn-success" disabled={creating}>
                  {creating ? 'Guardando...' : 'Crear Usuario'}
                </button>
                <button type="button" className="btn btn-outline" style={{ marginLeft: '8px' }} onClick={() => setShowNewForm(false)} disabled={creating}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}
        
        {loading ? (
          <div className="text-center" style={{ padding: '40px' }}>Cargando usuarios...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Apellido</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Supervisor</th>
                  <th>Estado</th>
                  <th style={{ width: '130px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {currentUsers.map((u, index) => (
                  <tr key={u.id}>
                    <td>{indexOfFirstItem + index + 1}</td>
                    <td>
                      <input 
                        type="text" 
                        className="form-control" 
                        defaultValue={u.username} 
                        onBlur={e => handleCellBlur(u, 'username', e)} 
                        style={{ width: '100px' }} 
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        className="form-control" 
                        defaultValue={u.nombre} 
                        onBlur={e => handleCellBlur(u, 'nombre', e)} 
                        style={{ width: '100px' }} 
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        className="form-control" 
                        defaultValue={u.apellido} 
                        onBlur={e => handleCellBlur(u, 'apellido', e)} 
                        style={{ width: '100px' }} 
                      />
                    </td>
                    <td>
                      <input 
                        type="email" 
                        className="form-control" 
                        defaultValue={u.email} 
                        onBlur={e => handleCellBlur(u, 'email', e)} 
                        style={{ width: '170px' }} 
                      />
                    </td>
                    <td>
                      <select 
                        className="form-control" 
                        value={u.role} 
                        onChange={e => handleFieldChange(u.id, 'role', e.target.value)} 
                        style={{ width: '110px' }}
                      >
                        {['vendedor','supervisor','gerente_ventas','compras','admin'].map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select 
                        className="form-control" 
                        value={u.supervisor_id || ''} 
                        onChange={e => handleFieldChange(u.id, 'supervisor_id', e.target.value || null)} 
                        disabled={u.role !== 'vendedor'}
                        style={{ width: '130px' }}
                      >
                        <option value="">N/A</option>
                        {supervisors.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
                      </select>
                    </td>
                    <td>
                      <select 
                        className="form-control" 
                        value={u.status} 
                        onChange={e => handleFieldChange(u.id, 'status', e.target.value)} 
                        style={{ width: '90px' }}
                      >
                        <option value="activo">Activo</option>
                        <option value="inactivo">Inactivo</option>
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button 
                          className="btn btn-warning btn-sm" 
                          onClick={() => handleResetPassword(u)}
                          title="Resetear Contraseña a Cofersa123!"
                        >
                          Reset PW
                        </button>
                        <button 
                          className="btn btn-danger btn-sm" 
                          onClick={() => handleDelete(u.id, u.username)}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan="9" className="text-center color-muted" style={{ padding: '20px' }}>
                      No se encontraron usuarios con los filtros aplicados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

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
            <span style={{ fontSize: '13px' }}>Página {currentPage} de {totalPages} ({filteredUsers.length} registros en total)</span>
            <button 
              className="btn btn-outline btn-sm" 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Usuarios;
