import { supabase } from './supabaseClient';

// Tipos de notificación soportados (deben coincidir con los del backend).
export const TIPOS_NOTIFICACION = {
  SOLICITUD_ENVIADA: 'solicitud_enviada',
  SOLICITUD_APROBADA: 'solicitud_aprobada',
  SOLICITUD_CANCELADA: 'solicitud_cancelada',
  CAMBIO_PASSWORD: 'cambio_password',
  LOGIN_ALERTA: 'login_alerta',
};

/**
 * Inserta una notificación in-app para un usuario.
 * Las notificaciones de solicitudes las crea el backend; aquí se crean las de
 * eventos del lado del cliente (inicio de sesión, cambio de contraseña).
 */
export async function crearNotificacion({
  userId,
  tipo,
  titulo,
  mensaje = null,
  entityType = null,
  entityId = null,
  url = null,
}) {
  if (!userId || !tipo || !titulo) return;
  try {
    const { error } = await supabase.from('notificaciones').insert({
      user_id: userId,
      tipo,
      titulo,
      mensaje,
      entity_type: entityType,
      entity_id: entityId,
      url,
      leida: false,
    });
    if (error) throw error;
  } catch (e) {
    // No interrumpir el flujo del usuario si la notificación falla.
    console.error('Error creando notificación:', e);
  }
}

/** Lista las notificaciones de un usuario (más recientes primero). */
export async function listarNotificaciones(userId, limit = 100) {
  const { data, error } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/** Marca una notificación como leída. */
export async function marcarLeida(id) {
  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', id);
  if (error) throw error;
}

/** Marca todas las notificaciones no leídas de un usuario como leídas. */
export async function marcarTodasLeidas(userId) {
  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('user_id', userId)
    .eq('leida', false);
  if (error) throw error;
}
