# COFERSA NE - Guía de Migración a Vite

Este documento detalla los cambios realizados para completar la migración del frontend original en Python (SSR) a una aplicación React moderna usando Vite.

## Secciones Agregadas / Completadas

1.  **Nueva Solicitud**:
    - Implementación completa de la búsqueda de productos Infocompras (individual y masiva) usando un nuevo servicio `infocomprasService.js`.
    - Lógica de cálculo bidireccional de precios y descuentos (Precio LPV ↔ % Descuento ↔ Precio Solicitado).
    - Selección de marcas real obtenida desde el backend.
2.  **Bandeja de Aprobación y Mis Solicitudes**:
    - Conexión real con APIs JSON.
    - Filtros dinámicos por estado y marca.
    - Soporte para visualización basada en roles (Vendedor ve solo lo suyo, Supervisor ve a su equipo, etc.).
3.  **Detalle de Solicitud**:
    - Vista completa con desglose por marca.
    - Panel de aprobación SKU por SKU (aprobar, rechazar, dejar pendiente).
    - Historial de auditoría y visualización de presupuesto/rangos para aprobadores.
4.  **Vista Previa de Correo**:
    - Nueva página `EmailPreview.jsx` que permite visualizar el correo HTML generado para cada solicitud.
5.  **Administración Completa**:
    - **Usuarios**: Gestión total (crear, editar, desactivar, resetear contraseña).
    - **Reglas**: Edición en línea de límites de aprobación por marca.
    - **Presupuesto**: Visualización paginada y edición.
    - **Auditoría**: Consulta de registros del sistema con paginación.
    - **Configuración**: Ajustes de SMTP y parámetros del sistema.
6.  **Autenticación**:
    - Flujo de Login real conectado al backend.
    - Cambio de contraseña por el usuario.
    - Solicitud de reseteo de contraseña pública.
7.  **Dashboard**:
    - Selector multi-mes funcional.
    - Gráfico de evolución mensual y KPIs dinámicos.

## Cambios en el Backend (`main.py`)

Para soportar el frontend en React, se añadieron múltiples endpoints que devuelven JSON en lugar de HTML:

- `/api/me`: Información del usuario actual.
- `/api/solicitudes/mis`: Listado de solicitudes del usuario.
- `/api/solicitudes/bandeja`: Listado para aprobadores con filtros.
- `/api/solicitud/detalle`: Detalle completo de una solicitud.
- `/api/dashboard/data`: Estadísticas agregadas para el dashboard.
- `/api/admin/*`: Endpoints para listar usuarios, reglas, presupuesto, logs y configuración.

## Lógica Adicional

- Se portó el sistema de puntuación de relevancia para la búsqueda de Infocompras a `NuevaSolicitud.jsx`.
- Se implementó un sistema de "suscripción" en `infocomprasService.js` para manejar la carga asíncrona de los ~10,000+ productos sin bloquear la UI.
- La comunicación entre frontend y backend se realiza mediante `fetch` estándar, aprovechando que el servidor Python maneja las cookies de sesión.

## Cómo ejecutar

1.  **Backend**: `python main.py` (corre en puerto 8080 por defecto).
2.  **Frontend**:
    - `cd cofersa-frontend`
    - `npm install`
    - `npm run dev` (configurado para actuar como proxy hacia el puerto 8080 si es necesario, o simplemente apuntar las URLs de API).

*Nota: Para producción, el frontend debe construirse con `npm run build` y los archivos resultantes en `dist/` pueden ser servidos por el mismo servidor Python o un servidor web dedicado.*
