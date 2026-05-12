import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';

const Usuarios = () => {
  const [users, setUsers] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '', nombre: '', apellido: '', email: '', role: 'vendedor', supervisor_id: '', password: 'Cofersa123!'
  });
  const [msg, setMsg] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/usuarios');
      const data = await res.json();
      if (data.ok) {
        setUsers(data.users);
        setSupervisors(data.supervisors);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async () => {
    if (newUser.role === 'vendedor' && !newUser.supervisor_id) {
      setMsg({ type: 'danger', text: 'Los vendedores deben tener un supervisor asignado.' });
      return;
    }
    const res = await fetch('/admin/usuarios/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newUser, action: 'create', id: 0 })
    });
    const result = await res.json();
    if (result.ok) {
      setShowNewForm(false);
      fetchUsers();
      setNewUser({ username: '', nombre: '', apellido: '', email: '', role: 'vendedor', supervisor_id: '', password: 'Cofersa123!' });
    } else {
      setMsg({ type: 'danger', text: result.error || 'Error' });
    }
  };

  const handleUpdate = async (id, field, value) => {
    const res = await fetch('/admin/usuarios/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, field, value })
    });
    return (await res.json()).ok;
  };

  const onBlur = async (e, id, field) => {
    const el = e.target;
    const ok = await handleUpdate(id, field, el.value);
    el.style.borderColor = ok ? '#27ae60' : '#e74c3c';
    setTimeout(() => { if (el) el.style.borderColor = ''; }, 1000);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Desactivar este usuario?')) return;
    const res = await fetch('/admin/usuarios/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if ((await res.json()).ok) fetchUsers();
  };

  const resetPw = async (id, username) => {
    const pw = window.prompt(`Nueva contraseña para ${username}:`, 'Cofersa123!');
    if (!pw) return;
    const ok = await handleUpdate(id, 'password', pw);
    alert(ok ? 'Contraseña actualizada' : 'Error');
  };

  return (
    <Layout title="Usuarios" active="usuarios">
      <h1>Gestión de Usuarios</h1>
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <button className="btn btn-success btn-sm" onClick={() => setShowNewForm(true)}>+ Nuevo Usuario</button>
          <form method="POST" action="/admin/usuarios/import" encType="multipart/form-data" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input type="file" name="file" accept=".xlsx,.csv" className="form-control" style={{ maxWidth: '300px' }} />
            <button type="submit" className="btn btn-primary btn-sm">Importar Usuarios</button>
          </form>
        </div>

        {showNewForm && (
          <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
            <h3>Nuevo Usuario</h3>
            {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
            <div className="grid-3">
              <div className="form-group"><label>Usuario</label><input type="text" className="form-control" value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} placeholder="sin @cofersa.cr" /></div>
              <div className="form-group"><label>Nombre</label><input type="text" className="form-control" value={newUser.nombre} onChange={e => setNewUser({...newUser, nombre: e.target.value})} /></div>
              <div className="form-group"><label>Apellido</label><input type="text" className="form-control" value={newUser.apellido} onChange={e => setNewUser({...newUser, apellido: e.target.value})} /></div>
            </div>
            <div className="grid-3">
              <div className="form-group"><label>Email</label><input type="email" className="form-control" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} /></div>
              <div className="form-group"><label>Rol</label><select className="form-control" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                <option value="vendedor">Vendedor</option><option value="supervisor">Supervisor</option><option value="gerente_ventas">Gte. Ventas</option><option value="compras">Compras</option><option value="admin">Admin</option>
              </select></div>
              <div className="form-group"><label>Contraseña</label><input type="text" className="form-control" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} /></div>
            </div>
            {newUser.role === 'vendedor' && (
              <div className="grid-3">
                <div className="form-group"><label>Supervisor *</label><select className="form-control" value={newUser.supervisor_id} onChange={e => setNewUser({...newUser, supervisor_id: e.target.value})}>
                  <option value="">-- Seleccione --</option>
                  {supervisors.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
                </select></div>
              </div>
            )}
            <button className="btn btn-success" onClick={handleCreate}>Crear Usuario</button>
            <button className="btn btn-outline" style={{ marginLeft: '8px' }} onClick={() => setShowNewForm(false)}>Cancelar</button>
          </div>
        )}

        <div className="table-responsive">
          <table style={{ fontSize: '12px' }}>
            <thead>
              <tr><th>#</th><th>Usuario</th><th>Nombre</th><th>Apellido</th><th>Email</th><th>Rol</th><th>Supervisor</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="9" className="text-center">Cargando...</td></tr> : users.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td><input type="text" className="form-control" value={u.username} onChange={e => setUsers(prev => prev.map(x => x.id === u.id ? {...x, username: e.target.value} : x))} onBlur={e => onBlur(e, u.id, 'username')} style={{ width: '100px' }} /></td>
                  <td><input type="text" className="form-control" value={u.nombre} onChange={e => setUsers(prev => prev.map(x => x.id === u.id ? {...x, nombre: e.target.value} : x))} onBlur={e => onBlur(e, u.id, 'nombre')} style={{ width: '100px' }} /></td>
                  <td><input type="text" className="form-control" value={u.apellido} onChange={e => setUsers(prev => prev.map(x => x.id === u.id ? {...x, apellido: e.target.value} : x))} onBlur={e => onBlur(e, u.id, 'apellido')} style={{ width: '100px' }} /></td>
                  <td><input type="email" className="form-control" value={u.email} onChange={e => setUsers(prev => prev.map(x => x.id === u.id ? {...x, email: e.target.value} : x))} onBlur={e => onBlur(e, u.id, 'email')} style={{ width: '160px' }} /></td>
                  <td><select className="form-control" value={u.role} onChange={e => { setUsers(prev => prev.map(x => x.id === u.id ? {...x, role: e.target.value} : x)); handleUpdate(u.id, 'role', e.target.value); }} style={{ width: '110px' }}>
                    {['vendedor','supervisor','gerente_ventas','compras','admin'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select></td>
                  <td><select className="form-control" value={u.supervisor_id || ''} onChange={e => { setUsers(prev => prev.map(x => x.id === u.id ? {...x, supervisor_id: e.target.value} : x)); handleUpdate(u.id, 'supervisor_id', e.target.value); }} style={{ width: '130px' }}>
                    <option value="">N/A</option>
                    {supervisors.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
                  </select></td>
                  <td><select className="form-control" value={u.status} onChange={e => { setUsers(prev => prev.map(x => x.id === u.id ? {...x, status: e.target.value} : x)); handleUpdate(u.id, 'status', e.target.value); }} style={{ width: '80px' }}>
                    <option value="activo">Activo</option><option value="inactivo">Inactivo</option>
                  </select></td>
                  <td><button className="btn btn-warning btn-sm" onClick={() => resetPw(u.id, u.username)}>Reset PW</button> <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u.id)}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Usuarios;
