import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.log('Verificando inicialización del cliente de Supabase:', {
  url: supabaseUrl,
  tieneClave: !!supabaseAnonKey,
  longitudClave: supabaseAnonKey ? supabaseAnonKey.length : 0
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'negociaciones_especiales'
  }
});
