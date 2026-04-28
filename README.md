# COFERSA - Sistema de Negociación Especial v2.5

## Web app interna para gestión y aprobación de descuentos por Negociación Especial.

### Cambios v2.5
- Versión visible en navbar, título de página, pie de página y badge fijo en esquina inferior derecha de cada pantalla.
- Dashboard multi-mes: selector tipo dropdown con checkboxes para elegir uno o varios meses a la vez; botón rápido para seleccionar el año completo; KPIs, gráficos y tablas se agregan dinámicamente según la selección.
- Correos verificados: todos los eventos (creación, aprobación, rechazo, escalación) incluyen el detalle completo de la solicitud — vendedor, aprobador, cliente, SKUs con precios/porcentajes/montos solicitados y aprobados, totales y comentarios.

### Cambios v3.2
1. Cambio de contraseña para usuarios no-admin (/cambiar-password): requiere contraseña actual, nueva y confirmación. Valida coincidencia, mínimo 6 chars, auditoría sin exponer password.
2. Formulario de nuevo usuario: si rol=vendedor, muestra campo supervisor obligatorio al abrir el form.
3. Botón "Solicitar reseteo" en página de login (sin autenticación requerida).
4. Solicitud de reseteo registrada en tabla password_reset_requests con estado/fecha/IP.
5. Panel admin /admin/password-resets: ver todas las solicitudes, aprobar individual, aprobar masivo, rechazar.
6. Al aprobar: genera contraseña temporal (CoferSaXXXXXX), la muestra al admin, actualiza el usuario, auditoría completa.
7. Admins no pueden solicitar reset desde el formulario público.

### Cambios v3.1
Flujo de notificaciones reescrito completamente:

CREACIÓN: correo solo al aprobador asignado según rango (sin CC).
ESCALACIÓN: correo solo al siguiente aprobador (sin CC).
APROBACIÓN:
  - TO: solicitante (vendedor)
  - CC según quien aprueba:
    - Supervisor aprueba → CC: NE team + compras + admins
    - Gte Ventas aprueba → CC: supervisor vinculado + NE team + compras + admins
    - Compras aprueba    → CC: gte ventas + supervisor vinculado + NE team + admins
RECHAZO:
  - Supervisor/Gte Ventas rechaza → TO: solicitante únicamente
  - Compras rechaza → TO: solicitante + CC supervisor vinculado
CANCELACIÓN:
  - Trazabilidad completa con cambio de estado
  - Correo a los mismos destinatarios que el correo de creación (el aprobador original)
  - mailto: se abre en Gmail con todos los datos al cancelar

VISIBILIDAD EN APP (Bandeja y Mis Solicitudes):
  - Supervisor: ve sus propias solicitudes + las de sus vendedores asignados
  - Gerente de Ventas / Compras / Admin: ven todas las solicitudes

### Cambios v3.0
- Negociaciones Especiales (negociacionespecial@cofersa.cr) recibe correo ÚNICAMENTE cuando una solicitud es aprobada por el aprobador correspondiente.
- Eliminado de: creación de solicitud, escalación y rechazo.

### Cambios v2.9
- Restaurado el flujo mailto: para creación, aprobación y rechazo de solicitudes.
- El mailto: ahora contiene el cuerpo completo de la solicitud en texto plano con todos los campos:
  folio, estado, fechas, vendedor, aprobador, nivel, código/nombre cliente, pedido, justificación,
  marcas, tabla detallada por SKU (cant, precio base, % desc. sol., precio sol., monto desc.,
  % aprobado, precio aprobado, monto aprobado), totales y comentario del aprobador.
- Gmail se abre con los destinatarios (TO/CC) prellenados según flujo de aprobación.
- El correo HTML completo sigue enviándose por SMTP cuando está configurado.
- build_plain_text_email y build_mailto como funciones reutilizables en email_service.py.

### Cambios v2.8
- Correo 100% autosuficiente: el cuerpo HTML incluye directamente todos los datos requeridos
  (folio, estado, fechas, vendedor, aprobador, cliente, pedido, justificación, marcas,
  tabla SKU completa con precio base / % desc. sol. / precio sol. / monto desc. sol. /
  % aprobado / precio aprobado / monto aprobado, totales, comentario del aprobador).
- Sin links a vista previa en el cuerpo del correo (eliminado por solicitud).
- 26/26 campos validados automáticamente en test end-to-end.
- Link "Ver Correo Enviado" disponible en la página de detalle de cada solicitud.

### Cambios v2.7
- Flujo de correos SMTP restaurado completamente: creación, aprobación, rechazo y escalación envían el correo HTML completo por SMTP.
- Creación: vendedor recibe copia de confirmación; NE team siempre copiado.
- Rechazo: vendedor, aprobador, supervisor vinculado, NE team y admins reciben notificación.
- Escalación: vendedor recibe copia informativa; NE team siempre copiado.
- El cuerpo del correo HTML ahora incluye dos botones: "Ver solicitud en el sistema" y "Vista previa de este correo".
- Vista previa (/email/preview/{id}) sigue disponible como página standalone con botón imprimir/PDF.
- Link "Ver Correo Enviado" en página de detalle de cada solicitud.

### Cambios v2.6
- Correos completamente autosuficientes: se eliminó el mailto: simplificado como mecanismo de envío.
- Nueva página /email/preview/{id}: muestra el HTML completo del correo (todos los campos de la solicitud) directamente en el browser. Incluye botón de imprimir/PDF.
- Cuando SMTP no está configurado, el sistema abre esta vista previa en una pestaña nueva (antes abría Gmail con solo 3 líneas de texto).
- Link "Ver Correo Enviado" añadido en la página de detalle de cada solicitud.
- email_log ahora guarda el HTML completo del correo (no solo el preview).
- Versión v2.5: número de versión visible en nav, título del browser, pie de página de cada módulo, y badge en la pantalla de inicio.

### Cambios v2.4
- Correos autosuficientes: generación, aprobación, rechazo y escalación incluyen el detalle completo de la solicitud (cliente, pedido, SKUs con precios, porcentajes, montos solicitados y aprobados, comentarios, totales).
- Dashboard multi-mes: selector de mes y año acumulado, evolución mensual con gráfico de barras.
- Dashboard Supervisor: KPIs propios + gasto por marca mensual y acumulado anual.
- Dashboard Gte. Ventas / Compras / Admin: todas las vistas anteriores + gasto por supervisor mensual y anual + cruce Supervisor × Marca.

### Cambios v2.3
- Datos iniciales precargados desde los 3 archivos Excel oficiales (usuarios, reglas, presupuesto).
- Flujo de aprobación corregido: cada vendedor va a su supervisor vinculado específico.
- Si excede rango supervisor → único gerente_ventas (CC supervisor vinculado).
- Si excede rango gerente_ventas → único compras (CC supervisor + gerente_ventas).
- Admins NO reciben correo al crear solicitud; SÍ reciben copia al aprobar.
- Vendedores obligatoriamente deben tener supervisor asignado al crearlos.
- Validación en importación de presupuesto: supervisores y asesores deben existir primero.
- Formulario de nuevo usuario incluye selector de supervisor para rol vendedor.

### Cambios v2.2
- **Responsive completo**: diseño optimizado para Chrome en laptop (1366px+), tablet (768px) y móvil (375–430px).
- Menú hamburguesa en móvil con overlay.
- Tablas con scroll horizontal controlado en pantallas pequeñas.
- Formularios y botones táctiles optimizados.
- Grids que colapsan correctamente en todos los breakpoints.
- Sin cortes de texto ni elementos fuera de pantalla.

### Cambios v2.1
- **Todos los roles** (vendedor, supervisor, gerente_ventas, compras, admin) pueden crear nuevas solicitudes y ver sus propias solicitudes en "Mis Solicitudes".

---

## Instalación y Ejecución

### Requisitos
- **Python 3.12+** (probado con 3.14)
- Navegador Chrome o similar
- NO requiere pip, NO requiere instalar dependencias, NO requiere venv

### Inicio Rápido (1 click)

```bash
python main.py
```

La app arranca en: **http://localhost:8080**

### Opciones de ejecución

```bash
# Puerto personalizado
python main.py 9090

# Accesible desde toda la red (servidor interno)
python main.py 0.0.0.0 8080

# Puerto específico + todas las interfaces
python main.py 0.0.0.0 9090
```

### Acceso inicial

| Campo       | Valor        |
|-------------|--------------|
| **Usuario** | `abarrios`   |
| **Contraseña** | `Cofersa123!` |
| **Rol**     | Admin        |

---

## Estructura de Carpetas

```
cofersa_ne/
├── main.py            ← Servidor principal (ejecutar este)
├── database.py        ← Modelo de datos SQLite
├── xlsx_reader.py     ← Lector de Excel (.xlsx) sin dependencias
├── email_service.py   ← Servicio de correos (Google Workspace)
├── templates.py       ← Plantillas HTML y CSS
├── Reglas.xlsx        ← Archivo semilla de reglas
├── Presupuesto.xlsx   ← Archivo semilla de presupuesto
├── data/              ← Base de datos SQLite (se crea automáticamente)
├── uploads/           ← Archivos subidos
└── README.md          ← Este archivo
```

---

## Módulos del Sistema

### 1. Autenticación
- Login con usuario (parte antes de @cofersa.cr del email)
- Roles: `vendedor`, `supervisor`, `gerente_ventas`, `compras`, `admin`
- Sesiones seguras con cookies HTTPOnly
- Contraseñas hasheadas con SHA-256 + salt

### 2. Vendedor
- **Nueva Solicitud**: formulario completo con:
  - Cliente (código, nombre, número de pedido)
  - Múltiples marcas y SKUs por solicitud
  - Auto-cálculo bidireccional de precios y descuentos
  - Visualización de rangos de aprobación por marca
- **Mis Solicitudes**: listado con estado y trazabilidad

### 3. Aprobadores (Supervisor / Gte Ventas / Compras)
- **Bandeja de Aprobación**: pendientes con filtros
- Aprobar/Rechazar/Escalar automáticamente
- Ajustar % aprobado a menor por SKU
- Histórico de aprobaciones

### 4. Admin
- Gestión completa de usuarios (crear, editar, eliminar, resetear contraseña)
- Importación masiva de usuarios desde Excel
- Gestión de Reglas de Aprobación (importar, editar celda por celda, exportar)
- Gestión de Presupuesto (importar, editar celda por celda, exportar)
- Ver todas las solicitudes con filtros
- Auditoría completa del sistema
- Configuración de correo y sistema

### 5. Dashboard
- Gasto aprobado vs Presupuesto por marca y total
- % de consumo del presupuesto
- Top 10 solicitudes por monto
- Cumplimiento de SLA
- Contadores de solicitudes (total, aprobadas, rechazadas, pendientes)
- Filtro por mes
- Exportable a CSV y Power BI

---

## Importar y Exportar Archivos

### Reglas de Aprobación
1. Vaya a **Reglas** en el menú
2. Haga clic en "Importar Excel/CSV"
3. Seleccione archivo .xlsx o .csv con columnas:
   - `Marca`, `Clasificación`, `Limite Supervisor`, `Limite Gte Ventas`, `Limite Compras`
4. Al importar se reemplazan todas las reglas anteriores
5. Puede editar cada celda directamente en la tabla
6. Exporte con botón "Exportar CSV"

### Presupuesto
1. Vaya a **Presupuesto** en el menú
2. Misma mecánica: importar Excel/CSV, editar celda por celda, exportar
3. Columnas esperadas: `Supervisor`, `Asesor`, `Marca`, `Ppto Mensual_en_CRC`

### Usuarios (Importación masiva)
1. Vaya a **Usuarios** → "Importar Usuarios"
2. Suba archivo .xlsx o .csv con columnas:
   - `Nombre`, `Apellido`, `Email` (o `Correo`), `Role` (o `Rol`), `Status` (o `Estado`)
3. El username se extrae del email quitando @cofersa.cr
4. Contraseña por defecto: `Cofersa123!`
5. Si el usuario ya existe (mismo username), se actualizan sus datos

### Exportaciones
- **CSV de solicitudes**: para análisis en Excel o Google Sheets
- **Dataset Power BI**: CSV expandido con detalle de SKUs por línea
- **CSV de auditoría**: registro completo de acciones

---

## Configuración de Correo (Google Workspace)

### Opción 1: App Password (Recomendada)
1. Ingrese a https://myaccount.google.com/security
2. Active verificación en 2 pasos si no está activa
3. Vaya a "Contraseñas de aplicación" y genere una nueva
4. En el sistema, vaya a **Configuración** y configure:
   - `smtp_host`: `smtp.gmail.com`
   - `smtp_port`: `587`
   - `smtp_user`: `su-email@cofersa.cr`
   - `smtp_password`: la App Password de 16 caracteres
   - `smtp_from`: `negociacionespecial@cofersa.cr`

### Opción 2: Gmail sin App Password
Si la app no puede enviar correo, automáticamente:
- Registra el email en el log de la base de datos
- Genera un enlace `mailto:` que abre Gmail en el navegador
- El usuario puede enviar el correo manualmente desde ahí

### Correos que envía el sistema
1. **Al crear solicitud**: notifica al aprobador correspondiente
2. **Al aprobar**: notifica al vendedor, aprobador y negociacionespecial@cofersa.cr
3. **Al rechazar**: notifica al vendedor y aprobador

---

## Integración con Google Sheets

### Opción 1: CSV Manual
1. Exporte datos desde la sección **Exportar**
2. Abra Google Sheets → Archivo → Importar → Subir archivo CSV

### Opción 2: Google Apps Script (Automático)
1. Cree un Google Sheet destino
2. Extensiones → Apps Script
3. Cree un doGet que importe datos:

```javascript
function doGet(e) {
  // Fetch CSV from your server
  var url = 'http://su-servidor:8080/api/export/aprobadas';
  var response = UrlFetchApp.fetch(url);
  var csv = Utilities.parseCsv(response.getContentText());
  
  var sheet = SpreadsheetApp.getActiveSheet();
  sheet.clear();
  sheet.getRange(1, 1, csv.length, csv[0].length).setValues(csv);
  
  return ContentService.createTextOutput('OK');
}
```
4. Publique como Web App
5. Configure un trigger temporal (cada hora) para actualizar automáticamente

---

## Flujo de Aprobación

```
Vendedor crea solicitud
    ↓
Sistema evalúa % descuento vs reglas por marca
    ↓
Si % ≤ límite Supervisor → asigna a Supervisor (SLA: 1h hábil)
Si % > límite Supervisor y ≤ límite Gte Ventas → asigna a Gte Ventas (SLA: 4h)
Si % > límite Gte Ventas → asigna a Compras (SLA: 8h)
    ↓
Aprobador revisa:
  → Aprueba (puede ajustar % a menor) → Genera FOLIO → Notifica
  → Rechaza (requiere comentario) → Notifica vendedor
  → Si no tiene autoridad → Escala automáticamente al siguiente nivel
```

### Formato de Folio
`NE-YYYYMM-######` (Ejemplo: NE-202603-000001)

---

## Autollenado Bidireccional del Formulario

El formulario de nueva solicitud implementa cálculo automático:

**Caso 1**: Si llena Precio Base + % Descuento:
- Calcula: Precio Solicitado = PrecioBase × (1 - %Descuento/100)
- Calcula: Monto Descuento = (PrecioBase - PrecioSolicitado) × Cantidad

**Caso 2**: Si llena Precio Base + Precio Solicitado:
- Calcula: %Descuento = (1 - PrecioSolicitado/PrecioBase) × 100
- Calcula: Monto Descuento = (PrecioBase - PrecioSolicitado) × Cantidad

**Regla**: el último campo editado gana (last-edited-wins).

### Validaciones
- No permite descuento negativo
- No permite precio solicitado > precio base
- Valida en frontend y backend
- Muestra errores inline por campo

---

## Resolución de Problemas Conocidos

### Bug histórico de envío de solicitud
**Causa raíz**: validación incompleta y errores no manejados en el backend.
**Solución**: 
- Validación completa campo por campo tanto en frontend como backend
- Errores se muestran de forma amigable por campo
- Logging interno con traceback para depuración
- No existe "pantalla genérica de crash"

### Problema de ubicación / ruta base
**Causa raíz**: rutas absolutas fijas que fallan al mover el app.
**Solución**:
- Todas las rutas son relativas al directorio del script (`__file__`)
- `BASE_DIR = os.path.dirname(os.path.abspath(__file__))`
- La app funciona sin importar dónde esté instalada
- Funciona en PC local, servidor, detrás de proxy

### Campo roto de rangos de aprobación
**Solución**: Los rangos se cargan por AJAX al seleccionar marca, y se muestran como bloque compacto de 3 líneas:
```
Supervisor hasta X%
Gerente Ventas hasta Y%
Compras >Y%
```

---

## Modelo de Datos

### Tablas principales
- `users`: usuarios y roles
- `reglas`: reglas de aprobación por marca
- `presupuesto`: presupuesto mensual por marca/asesor
- `solicitudes`: solicitudes de descuento
- `solicitud_skus`: líneas de SKU por solicitud
- `audit_log`: registro completo de auditoría
- `sessions`: sesiones de usuario
- `email_log`: registro de correos enviados
- `config`: configuración del sistema

### SLA por rol
| Rol | SLA |
|-----|-----|
| Supervisor | 1 hora hábil |
| Gte. Ventas | 4 horas hábiles |
| Compras | 8 horas hábiles |

---

## Supuestos y Decisiones Técnicas

1. **Base de datos**: SQLite almacenada en `data/cofersa_ne.db` - ideal para uso interno, sin necesidad de servidor de BD separado
2. **Autenticación**: sesiones basadas en cookies, contraseñas con SHA-256+salt
3. **Excel**: lectura nativa usando `zipfile` + `xml.etree` (stdlib), sin necesidad de openpyxl
4. **Email**: SMTP directo a Google Workspace, con fallback a `mailto:` links
5. **Moneda**: CRC (₡) con formato consistente en toda la app
6. **Rangos**: por marca únicamente (no varían por supervisor ni vendedor)
7. **Escalamiento**: automático y directo al nivel correspondiente (sin cascada)
8. **Solicitudes aprobadas**: no editables; solo cancelación con autorización
9. **SLA**: medido desde creación/escalamiento hasta aprobación
10. **Multi-usuario**: el servidor HTTP maneja conexiones concurrentes; SQLite con WAL mode

---

## Soporte

Para problemas técnicos, revise:
1. La consola del servidor (terminal donde ejecuta `python main.py`)
2. La sección de Auditoría en el panel Admin
3. El archivo `data/cofersa_ne.db` puede inspeccionarse con cualquier visor SQLite
