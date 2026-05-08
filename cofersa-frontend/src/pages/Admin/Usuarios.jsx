import React, { useState } from 'react';
import Layout from '../../components/layout/Layout';

const initialUsers = [
  { id: 1, username: 'j.perez', nombre: 'Juan', apellido: 'Perez', email: 'jperez@cofersa.cr', role: 'vendedor', supervisor_id: 2, status: 'activo' },
  { id: 2, username: 's.lopez', nombre: 'Sofia', apellido: 'Lopez', email: 'slopez@cofersa.cr', role: 'supervisor', supervisor_id: null, status: 'activo' },
  { id: 3, username: 'admin', nombre: 'Admin', apellido: 'Prueba', email: 'admin@cofersa.cr', role: 'admin', supervisor_id: null, status: 'activo' }
];

const mockSupervisors = [
  { id: 2, nombre: 'Sofia', apellido: 'Lopez' }
];

const Usuarios = () => {
  const [users, setUsers] = useState(initialUsers);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newRole, setNewRole] = useState('vendedor');

  const handleDelete = (id) => {
    if (window.confirm('¿Eliminar usuario?')) {
      setUsers(users.filter(u => u.id !== id));
    }
  };

  const handleChange = (id, field, value) => {
    setUsers(users.map(u => u.id === id ? { ...u, [field]: value } : u));
  };

  const handleBlur = (e) => {
    const el = e.target;
    el.style.borderColor = '#27ae60';
    setTimeout(() => { if (el) el.style.borderColor = ''; }, 1000);
  };

  return (
    <Layout title="Usuarios" active="usuarios">
      <h1>Gestión de Usuarios</h1>
      
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <button className="btn btn-success btn-sm" onClick={() => setShowNewForm(true)}>+ Nuevo Usuario</button>
          <form style={{ display: 'flex', gap: '10px', alignItems: 'center' }} onSubmit={e => e.preventDefault()}>
            <input type="file" accept=".xlsx,.csv" className="form-control" style={{ maxWidth: '300px' }} />
            <button type="button" className="btn btn-primary btn-sm">Importar Usuarios</button>
          </form>
        </div>
        
        {showNewForm && (
          <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
            <h3>Nuevo Usuario</h3>
            <div className="grid-3">
              <div className="form-group"><label>Usuario</label><input type="text" className="form-control" placeholder="sin @cofersa.cr" /></div>
              <div className="form-group"><label>Nombre</label><input type="text" className="form-control" /></div>
              <div className="form-group"><label>Apellido</label><input type="text" className="form-control" /></div>
            </div>
            <div className="grid-3">
              <div className="form-group"><label>Email</label><input type="email" className="form-control" /></div>
              <div className="form-group">
                <label>Rol</label>
                <select className="form-control" value={newRole} onChange={e => setNewRole(e.target.value)}>
                  <option value="vendedor">Vendedor</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="gerente_ventas">Gte. Ventas</option>
                  <option value="compras">Compras</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group"><label>Contraseña</label><input type="text" className="form-control" defaultValue="Cofersa123!" /></div>
            </div>
            {newRole === 'vendedor' && (
              <div className="grid-3">
                <div className="form-group">
                  <label>Supervisor <span style={{ color: 'var(--danger)' }}>*</span> (requerido para vendedores)</label>
                  <select className="form-control">
                    <option value="">-- Seleccione supervisor --</option>
                    {mockSupervisors.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
                  </select>
                </div>
              </div>
            )}
            <button className="btn btn-success" onClick={() => setShowNewForm(false)}>Crear Usuario</button>
            <button className="btn btn-outline" style={{ marginLeft: '8px' }} onClick={() => setShowNewForm(false)}>Cancelar</button>
          </div>
        )}
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: '12px' }}>
            <thead>
              <tr>
                <th>#</th><th>Usuario</th><th>Nombre</th><th>Apellido</th><th>Email</th><th>Rol</th><th>Supervisor</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td><input type="text" className="form-control" value={u.username} onChange={e => handleChange(u.id, 'username', e.target.value)} onBlur={handleBlur} style={{ width: '100px' }} /></td>
                  <td><input type="text" className="form-control" value={u.nombre} onChange={e => handleChange(u.id, 'nombre', e.target.value)} onBlur={handleBlur} style={{ width: '100px' }} /></td>
                  <td><input type="text" className="form-control" value={u.apellido} onChange={e => handleChange(u.id, 'apellido', e.target.value)} onBlur={handleBlur} style={{ width: '100px' }} /></td>
                  <td><input type="email" className="form-control" value={u.email} onChange={e => handleChange(u.id, 'email', e.target.value)} onBlur={handleBlur} style={{ width: '160px' }} /></td>
                  <td>
                    <select className="form-control" value={u.role} onChange={e => handleChange(u.id, 'role', e.target.value)} onBlur={handleBlur} style={{ width: '110px' }}>
                      {['vendedor','supervisor','gerente_ventas','compras','admin'].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="form-control" value={u.supervisor_id || ''} onChange={e => handleChange(u.id, 'supervisor_id', e.target.value ? parseInt(e.target.value) : null)} onBlur={handleBlur} style={{ width: '130px' }}>
                      <option value="">N/A</option>
                      {mockSupervisors.map(s => <option key={s.id} value={s.id}>{s.nombre} {s.apellido}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="form-control" value={u.status} onChange={e => handleChange(u.id, 'status', e.target.value)} onBlur={handleBlur} style={{ width: '80px' }}>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-warning btn-sm" onClick={() => window.confirm(`Resetear password a Cofersa123! para ${u.username}?`)}>Reset PW</button>
                    <button className="btn btn-danger btn-sm" style={{ marginLeft: '4px' }} onClick={() => handleDelete(u.id)}>✕</button>
                  </td>
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
