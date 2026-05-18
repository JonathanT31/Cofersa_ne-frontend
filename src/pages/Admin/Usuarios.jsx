import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { createClient } from '@supabase/supabase-js';

const Usuarios = () => {
  const [users, setUsers] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Estado del formulario
  const [showNewForm, setShowNewForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('vendedor');
  const [supervisorId, setSupervisorId] = useState('');
  const [password, setPassword] = useState('Cofersa123!');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('*')
        .order('nombre', { ascending: true });

      if (fetchErr) throw fetchErr;

      const loadedUsers = data || [];
      setUsers(loadedUsers);
      
      // Filtrar supervisores
      const sups = loadedUsers.filter(u => u.role === 'supervisor');
      setSupervisors(sups);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Error al conectar con Supabase: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDelete = async (id, name) => {
    if (window.confirm(`¿Está seguro de eliminar al usuario "${name}"? Esta acción borrará su perfil en la base de datos.`)) {
      try {
        const { error: deleteErr } = await supabase
          .from('profiles')
          .delete()
          .eq('id', id);

        if (deleteErr) throw deleteErr;

        setUsers(users.filter(u => u.id !== id));
        alert('Perfil eliminado con éxito.');
      } catch (err) {
        console.error('Error deleting profile:', err);
        alert('Error al eliminar: ' + err.message);
      }
    }
  };

  const handleChange = (id, field, value) => {
    setUsers(users.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  const handleFieldBlur = async (userObj, field, value, e) => {
    const el = e.target;
    el.style.borderColor = '#3498db'; // Azul mientras guarda
    
    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ [field]: value })
        .eq('id', userObj.id);

      if (updateErr) throw updateErr;
      
      el.style.borderColor = '#27ae60'; // Verde para éxito
      setTimeout(() => { if (el) el.style.borderColor = ''; }, 1000);

      // Si cambió campos de nombre o rol, refrescar lista de supervisores
      if (field === 'role' || field === 'nombre' || field === 'apellido') {
        const { data } = await supabase.from('profiles').select('*');
        if (data) setSupervisors(data.filter(u => u.role === 'supervisor'));
      }
    } catch (err) {
      console.error('Error updating user field:', err);
      el.style.borderColor = '#e74c3c'; // Rojo para error
      alert('Error al actualizar el campo: ' + err.message);
      fetchUsers(); // Revertir cambios
    }
  };

  const handleResetPassword = async (userEmail) => {
    if (window.confirm(`¿Enviar un correo de restablecimiento de contraseña a ${userEmail}?`)) {
      try {
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(userEmail, {
          redirectTo: `${window.location.origin}/cambiar-password`,
        });
        if (resetErr) throw resetErr;
        alert('Correo de restablecimiento de contraseña enviado con éxito.');
      } catch (err) {
        console.error('Error sending reset email:', err);
        alert('Error al enviar correo: ' + err.message);
      }
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!username || !nombre || !apellido || !email || !password) {
      alert('Por favor complete todos los campos obligatorios.');
      return;
    }

    setCreating(true);
    try {
      // 1. Crear el usuario en Supabase Auth usando un cliente temporal para evitar desloguear al administrador
      const tempSupabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        }
      );

      const { data: authData, error: authErr } = await tempSupabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password,
        options: {
          data: {
            role: role,
            full_name: `${nombre.trim()} ${apellido.trim()}`,
            username: username.trim().toLowerCase()
          }
        }
      });

      if (authErr) throw authErr;

      const newUser = authData.user;
      if (!newUser) {
        throw new Error('No se pudo recuperar el ID del nuevo usuario.');
      }

      // 2. Crear el perfil en la tabla profiles
      const { error: profileErr } = await supabase
        .from('profiles')
        .insert({
          id: newUser.id,
          username: username.trim().toLowerCase(),
          nombre: nombre.trim(),
          apellido: apellido.trim(),
          email: email.trim().toLowerCase(),
          role: role,
          supervisor_id: role === 'vendedor' && supervisorId ? supervisorId : null,
          status: 'activo'
        });

      if (profileErr) {
        console.warn('Advertencia insertando perfil (puede haberse creado por trigger de BD):', profileErr.message);
        // Si ya se creó por un trigger de base de datos, aseguramos que tenga el rol y supervisor correctos
        await supabase
          .from('profiles')
          .update({
            role: role,
            supervisor_id: role === 'vendedor' && supervisorId ? supervisorId : null
          })
          .eq('id', newUser.id);
      }

      alert('¡Usuario creado exitosamente!');
      
      // Restablecer formulario
      setShowNewForm(false);
      setUsername('');
      setNombre('');
      setApellido('');
      setEmail('');
      setRole('vendedor');
      setSupervisorId('');
      setPassword('Cofersa123!');
      
      // Refrescar lista
      fetchUsers();
    } catch (err) {
      console.error('Error creating user:', err);
      alert('Error al crear usuario: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Layout title="Usuarios" active="usuarios">
      <h1>Gestión de Usuarios</h1>
      
      {error && <div className="alert alert-danger" style={{ marginBottom: '15px' }}>{error}</div>}

      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <button className="btn btn-success btn-sm" onClick={() => setShowNewForm(true)}>+ Nuevo Usuario</button>
        </div>
        
        {showNewForm && (
          <form style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px' }} onSubmit={handleCreateUser}>
            <h3>Nuevo Usuario (Supabase Auth)</h3>
            <div className="grid-3">
              <div className="form-group">
                <label>Usuario *</label>
                <input type="text" className="form-control" placeholder="sin @cofersa.cr" value={username} onChange={e => setUsername(e.target.value)} required disabled={creating} />
              </div>
              <div className="form-group">
                <label>Nombre *</label>
                <input type="text" className="form-control" value={nombre} onChange={e => setNombre(e.target.value)} required disabled={creating} />
              </div>
              <div className="form-group">
                <label>Apellido *</label>
                <input type="text" className="form-control" value={apellido} onChange={e => setApellido(e.target.value)} required disabled={creating} />
              </div>
            </div>
            <div className="grid-3">
              <div className="form-group">
                <label>Email *</label>
                <input type="email" className="form-control" placeholder="ejemplo@cofersa.cr" value={email} onChange={e => setEmail(e.target.value)} required disabled={creating} />
              </div>
              <div className="form-group">
                <label>Rol *</label>
                <select className="form-control" value={role} onChange={e => setRole(e.target.value)} disabled={creating}>
                  <option value="vendedor">Vendedor</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="gerente_ventas">Gte. Ventas</option>
                  <option value="compras">Compras</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group">
                <label>Contraseña *</label>
                <input type="text" className="form-control" value={password} onChange={e => setPassword(e.target.value)} required disabled={creating} />
              </div>
            </div>
            {role === 'vendedor' && (
              <div className="grid-3">
                <div className="form-group">
                  <label>Supervisor <span style={{ fontSize: '11px', color: '#777' }}>(opcional)</span></label>
                  <select className="form-control" value={supervisorId} onChange={e => setSupervisorId(e.target.value)} disabled={creating}>
                    <option value="">-- Sin supervisor --</option>
                    {supervisors.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div style={{ marginTop: '10px' }}>
              <button type="submit" className="btn btn-success" disabled={creating}>
                {creating ? 'Creando...' : 'Crear Usuario'}
              </button>
              <button type="button" className="btn btn-outline" style={{ marginLeft: '8px' }} onClick={() => setShowNewForm(false)} disabled={creating}>
                Cancelar
              </button>
            </div>
          </form>
        )}
        
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
            Cargando usuarios desde Supabase...
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ fontSize: '12px' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Apellido</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Supervisor</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr key={u.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <input type="text" className="form-control" value={u.username || ''} onChange={e => handleChange(u.id, 'username', e.target.value)} onBlur={e => handleFieldBlur(u, 'username', u.username, e)} style={{ width: '100px' }} />
                    </td>
                    <td>
                      <input type="text" className="form-control" value={u.nombre || ''} onChange={e => handleChange(u.id, 'nombre', e.target.value)} onBlur={e => handleFieldBlur(u, 'nombre', u.nombre, e)} style={{ width: '100px' }} />
                    </td>
                    <td>
                      <input type="text" className="form-control" value={u.apellido || ''} onChange={e => handleChange(u.id, 'apellido', e.target.value)} onBlur={e => handleFieldBlur(u, 'apellido', u.apellido, e)} style={{ width: '100px' }} />
                    </td>
                    <td>
                      <input type="email" className="form-control" value={u.email || ''} onChange={e => handleChange(u.id, 'email', e.target.value)} onBlur={e => handleFieldBlur(u, 'email', u.email, e)} style={{ width: '160px' }} />
                    </td>
                    <td>
                      <select className="form-control" value={u.role || ''} onChange={e => handleChange(u.id, 'role', e.target.value)} onBlur={e => handleFieldBlur(u, 'role', u.role, e)} style={{ width: '110px' }}>
                        {['vendedor','supervisor','gerente_ventas','compras','admin'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="form-control" value={u.supervisor_id || ''} onChange={e => handleChange(u.id, 'supervisor_id', e.target.value || null)} onBlur={e => handleFieldBlur(u, 'supervisor_id', u.supervisor_id, e)} style={{ width: '130px' }} disabled={u.role !== 'vendedor'}>
                        <option value="">N/A</option>
                        {supervisors.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="form-control" value={u.status || ''} onChange={e => handleChange(u.id, 'status', e.target.value)} onBlur={e => handleFieldBlur(u, 'status', u.status, e)} style={{ width: '80px' }}>
                        <option value="activo">Activo</option>
                        <option value="inactivo">Inactivo</option>
                      </select>
                    </td>
                    <td>
                      <button className="btn btn-warning btn-sm" onClick={() => handleResetPassword(u.email)}>Reset PW</button>
                      <button className="btn btn-danger btn-sm" style={{ marginLeft: '4px' }} onClick={() => handleDelete(u.id, `${u.nombre} ${u.apellido}`)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Usuarios;
