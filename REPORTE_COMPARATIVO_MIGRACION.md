# Reporte Comparativo: Migración COFERSA NE

Este reporte detalla las brechas funcionales y técnicas entre la aplicación original en Python (`cofersa_ne`) y la nueva versión en React (`cofersa-frontend`), con el objetivo de finalizar la migración a una arquitectura SPA con Supabase.

## 1. Estado de la Integración con Infocompras

### Aplicación Original (`cofersa_ne`)
- Utiliza un script global (`static/infocompras.js`) que consume un proxy de Google Apps Script.
- Implementa un sistema de caché en `sessionStorage` con un TTL de 4 horas para evitar peticiones redundantes.
- El script permite búsqueda individual y carga masiva por códigos.

### Nueva Versión (`cofersa-frontend`)
- **Situación:** Actualmente utiliza un arreglo de datos simulados (`mockInfocompras`) dentro del componente `NuevaSolicitud.jsx`.
- **Brecha:** No consume el script global ni tiene implementado el servicio de fetching real.
- **Acción:** Se debe crear un servicio en React (e.g., `src/api/infocomprasService.js`) que replique la lógica de fetching y caché, o integrar el script existente como una utilidad.

## 2. Lógica de Negocio y Backend

Gran parte de la lógica crítica aún reside exclusivamente en el código Python de `cofersa_ne`:

- **Cálculo de SLAs:** La función `add_business_hours` en `main.py` calcula los plazos de aprobación considerando el horario laboral (Lun-Vie 07:00-16:30). Esta lógica debe ser migrada a una Edge Function de Supabase o al nuevo backend.
- **Enrutamiento de Aprobaciones:** El flujo complejo de aprobación (Vendedor -> Supervisor -> Compras/Gerencia) basado en límites por marca y presupuesto está implementado en `api_solicitud_crear`.
- **Procesamiento de Archivos:** La lectura de plantillas Excel (`xlsx_reader.py`) para importar reglas, presupuestos y usuarios sin librerías externas. Supabase/Frontend necesitará una alternativa (e.g., `xlsx` library en frontend o procesamiento en backend).
- **Notificaciones por Email:** `email_service.py` maneja el envío de correos HTML para creaciones, aprobaciones, escalaciones y rechazos.

## 3. Comparativa de Módulos y Funcionalidades

| Funcionalidad | Aplicación Original (Python) | Frontend React (Migración) | Estado / Brecha |
| :--- | :--- | :--- | :--- |
| **Login / Auth** | Basado en Sesiones (SQLite) | AuthContext + LocalStorage | Pendiente conectar con Supabase Auth |
| **Nueva Solicitud** | Funcional al 100% | UI completada, Lógica simulada | Falta conexión con API real |
| **Bandeja de Aprob.** | Filtros avanzados por marca/estado | UI básica con datos mock | Falta implementar filtros dinámicos |
| **Dashboard** | KPIs reales, Gráficos, Top 10 | UI diseñada con datos estáticos | Falta conectar con endpoints de stats |
| **Admin: Reglas** | CRUD completo e Importación | UI básica, solo estado local | Requiere persistencia en Supabase |
| **Admin: Presupuesto** | CRUD e Importación con validación | UI básica, solo estado local | Falta lógica de validación de usuarios |
| **Admin: Usuarios** | Gestión completa y Reseteos | UI básica | Pendiente integración con Auth |
| **Auditoría** | Log detallado en DB | Visualización estática | Falta trigger/lógica de inserción |
| **Exportación** | CSV/Excel para Power BI y Admin | Botones sin funcionalidad | Requiere implementación de generación de archivos |

## 4. Endpoints de API Requeridos

Para que el frontend sea funcional con Supabase, se requieren los siguientes endpoints (o sus equivalentes en llamadas directas a Supabase):

1.  **Auth:** `POST /login`, `POST /logout`, `POST /solicitar-reset`
2.  **Solicitudes:**
    *   `GET /api/solicitudes/mis` (Lista para vendedores)
    *   `GET /api/solicitudes/bandeja` (Lista para aprobadores con filtros)
    *   `GET /api/solicitud/:id` (Detalle completo)
    *   `POST /api/solicitud/crear` (Lógica de enrutamiento y SLA)
    *   `POST /api/solicitud/aprobar` (Aprobación parcial/total por SKU)
    *   `POST /api/solicitud/rechazar` / `cancelar`
3.  **Dashboard:** `GET /api/dashboard/stats` (KPIs y datos de gráficos)
4.  **Mantenimiento:** `CRUD` para `/reglas`, `/presupuesto`, `/usuarios`
5.  **Catálogo:** `GET /api/catalogo/marcas`

## 5. Próximos Pasos Recomendados

1.  **Implementar Infocompras Service:** Crear el servicio en React que consuma el proxy actual para habilitar búsquedas reales en el formulario.
2.  **Configurar Supabase Client:** Reemplazar `httpClient.js` con el cliente de Supabase y mapear las tablas existentes de SQLite a Supabase.
3.  **Migrar Lógica de Aprobación:** Implementar las reglas de negocio (SLA y límites) mediante Database Functions o Edge Functions en Supabase para asegurar la integridad de los datos.
4.  **Habilitar Notificaciones:** Configurar Supabase Edge Functions para disparar correos electrónicos (vía SendGrid/Resend) ante cambios de estado en las solicitudes.
