"""
COFERSA NE - Email Service
Sends emails via Google Workspace SMTP.
Falls back to logging if SMTP not configured.
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import json
from datetime import datetime

def send_email(db_module, recipients, subject, html_body, solicitud_id=None):
    """Send email via SMTP. Returns (success, error_message)."""
    smtp_host = db_module.get_config('smtp_host', 'smtp.gmail.com')
    smtp_port = int(db_module.get_config('smtp_port', '587'))
    smtp_user = db_module.get_config('smtp_user', '')
    smtp_pass = db_module.get_config('smtp_password', '')
    smtp_from = db_module.get_config('smtp_from', '')

    if not smtp_user or not smtp_pass:
        _log_email(db_module, solicitud_id, recipients, subject, 'skipped',
                   'SMTP no configurado', html_body)
        return True, 'SMTP no configurado - email registrado en log'

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_from or smtp_user
        if isinstance(recipients, list):
            msg['To'] = ', '.join(recipients)
            to_list = recipients
        else:
            msg['To'] = recipients
            to_list = [recipients]

        msg.attach(MIMEText(html_body, 'html', 'utf-8'))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from or smtp_user, to_list, msg.as_string())

        _log_email(db_module, solicitud_id, recipients, subject, 'sent', '', html_body)
        return True, ''
    except Exception as e:
        error = str(e)
        _log_email(db_module, solicitud_id, recipients, subject, 'error', error, html_body)
        return False, error

def _log_email(db_module, solicitud_id, recipients, subject, status, error, html_body=''):
    conn = db_module.get_db()
    recip_str = json.dumps(recipients) if isinstance(recipients, list) else recipients
    conn.execute("""INSERT INTO email_log (solicitud_id, recipients, subject, body_preview, status, error_msg)
                    VALUES (?,?,?,?,?,?)""",
                 (solicitud_id, recip_str, subject, html_body, status, error))
    conn.commit()
    conn.close()

def _fmt_crc(v):
    try:
        return f"\u20a1{float(v):,.2f}"
    except:
        return "\u20a10.00"

def _fmt_pct(v):
    try:
        return f"{float(v):.2f}%"
    except:
        return "0.00%"

def _color_for_estado(estado):
    return {
        'aprobada':  '#27ae60',
        'rechazada': '#e74c3c',
        'escalada':  '#f39c12',
        'pendiente': '#2980b9',
    }.get(estado, '#555')

def build_solicitud_email(sol, skus, event_type, base_url='',
                          vendedor_info=None, aprobador_info=None):
    """
    Build a rich, self-contained HTML email with full solicitud detail.
    vendedor_info / aprobador_info: dicts with nombre, apellido, email (optional).
    """
    estado_labels = {
        'pendiente':  'Pendiente de Aprobación',
        'en_revision':'En Revisión',
        'escalada':   'Escalada a siguiente nivel',
        'aprobada':   'APROBADA',
        'rechazada':  'RECHAZADA',
        'cancelada':  'Cancelada',
    }
    estado = sol.get('estado', '')
    estado_label = estado_labels.get(estado, estado.upper())
    estado_color = _color_for_estado(estado)

    # ── Subject ───────────────────────────────────────────────────────────────
    folio_str = sol.get('folio') or f"#{sol.get('id','')}"
    subject = (f"[COFERSA NE] {folio_str} — {estado_label} — "
               f"{sol.get('cliente_nombre','')} / Ped. {sol.get('numero_pedido','')}")

    # ── Helpers ───────────────────────────────────────────────────────────────
    def td(label, value, bold_val=False):
        val_style = "font-weight:bold;" if bold_val else ""
        return (f"<tr>"
                f"<td style='padding:5px 10px 5px 0;color:#555;font-size:12px;white-space:nowrap;vertical-align:top;'>{label}</td>"
                f"<td style='padding:5px 10px 5px 6px;font-size:13px;{val_style}'>{value}</td>"
                f"</tr>")

    def section_title(title):
        return (f"<tr><td colspan='2' style='padding:14px 0 4px;'>"
                f"<span style='font-size:13px;font-weight:bold;color:#1a5276;"
                f"border-bottom:2px solid #1a5276;padding-bottom:3px;'>{title}</span>"
                f"</td></tr>")

    # ── Header info rows ──────────────────────────────────────────────────────
    folio_row = td("Folio", f"<strong>{folio_str}</strong>") if sol.get('folio') else ""
    vendedor_str = ""
    if vendedor_info:
        vendedor_str = f"{vendedor_info.get('nombre','')} {vendedor_info.get('apellido','')}".strip()
        if vendedor_info.get('email'):
            vendedor_str += f" &lt;{vendedor_info['email']}&gt;"
    aprobador_label = "Aprobador Final" if estado == 'aprobada' else "Aprobador Actual"
    aprobador_str = ""
    if aprobador_info:
        aprobador_str = f"{aprobador_info.get('nombre','')} {aprobador_info.get('apellido','')}".strip()
        if aprobador_info.get('email'):
            aprobador_str += f" &lt;{aprobador_info['email']}&gt;"

    nivel_label = (sol.get('aprobador_nivel') or '').replace('_', ' ').title()

    # ── SKU rows ──────────────────────────────────────────────────────────────
    sku_rows_html = ""
    total_desc_sol = 0.0
    total_desc_apr = 0.0
    marcas_set = set()

    for s in skus:
        marcas_set.add(s.get('marca', ''))
        monto_desc = float(s.get('monto_descuento') or 0)
        total_desc_sol += monto_desc

        pct_apr = s.get('porcentaje_aprobado')
        monto_apr = s.get('monto_aprobado')
        precio_apr = s.get('precio_aprobado')
        has_approved = pct_apr is not None

        if has_approved and monto_apr:
            total_desc_apr += float(monto_apr)

        sku_est = s.get('sku_estado', 'pendiente')
        if sku_est == 'rechazado':
            pct_apr_cell    = "<span style='color:#e74c3c;font-weight:bold;'>✗ Rechazado</span>"
            monto_apr_cell  = "<span style='color:#e74c3c;'>—</span>"
            precio_apr_cell = "<span style='color:#e74c3c;'>—</span>"
        elif has_approved:
            pct_apr_cell    = f"<span style='color:#27ae60;font-weight:bold;'>{_fmt_pct(pct_apr)}</span>"
            monto_apr_cell  = _fmt_crc(monto_apr)
            precio_apr_cell = _fmt_crc(precio_apr)
        else:
            pct_apr_cell    = "<span style='color:#aaa;'>—</span>"
            monto_apr_cell  = "<span style='color:#aaa;'>—</span>"
            precio_apr_cell = "<span style='color:#aaa;'>—</span>"

        sku_rows_html += f"""
        <tr style='border-bottom:1px solid #f0f0f0;'>
            <td style='padding:5px 6px;font-size:12px;'><strong>{s.get('marca','')}</strong><br>
                <span style='font-size:11px;color:#888;'>{s.get('clasificacion','')}</span></td>
            <td style='padding:5px 6px;font-size:12px;'>{s.get('codigo_sku','')}</td>
            <td style='padding:5px 6px;font-size:12px;'>{s.get('descripcion','')}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{s.get('cantidad',0)}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{_fmt_crc(s.get('precio_base',0))}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{_fmt_pct(s.get('porcentaje_descuento_sol',0))}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{_fmt_crc(s.get('precio_solicitado',0))}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{_fmt_crc(monto_desc)}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{pct_apr_cell}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{precio_apr_cell}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{monto_apr_cell}</td>
        </tr>"""

    marcas_str = ", ".join(sorted(marcas_set)) if marcas_set else "—"

    # Totals row
    total_aprobado_row = ""
    if total_desc_apr > 0:
        total_aprobado_row = f"""
        <tr style='background:#d5f5e3;font-weight:bold;'>
            <td colspan='7' style='padding:6px 6px;font-size:12px;text-align:right;'>TOTAL APROBADO:</td>
            <td style='padding:6px 6px;font-size:12px;text-align:right;'></td>
            <td style='padding:6px 6px;font-size:12px;text-align:right;'></td>
            <td style='padding:6px 6px;font-size:12px;text-align:right;'></td>
            <td style='padding:6px 6px;font-size:12px;text-align:right;color:#1e8449;'>{_fmt_crc(total_desc_apr)}</td>
        </tr>"""

    comentario_html = ""
    if sol.get('comentario_aprobador'):
        comentario_html = f"""
        <div style='margin-top:16px;padding:12px;background:#fef9e7;border-left:4px solid #f39c12;border-radius:4px;'>
            <strong style='font-size:12px;color:#7d6608;'>Comentario del aprobador:</strong><br>
            <span style='font-size:13px;'>{sol['comentario_aprobador']}</span>
        </div>"""

    link_html = ""
    if base_url and sol.get('id'):
        sol_id_val = sol['id']
        link_html = f"""
        <div style='margin-top:20px;text-align:center;border-top:1px solid #eee;padding-top:16px;'>
            <a href='{base_url}/solicitud/{sol_id_val}'
               style='display:inline-block;padding:10px 24px;background:#1a5276;color:white;
                      text-decoration:none;border-radius:6px;font-size:13px;'>
               Ver solicitud en el sistema →
            </a>
        </div>"""

    approved_at_str = ""
    if sol.get('approved_at'):
        approved_at_str = td("Fecha Aprobación / Acción", sol['approved_at'][:16])

    # ── Assemble HTML ─────────────────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style='margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;'>
<div style='max-width:780px;margin:20px auto;background:white;border-radius:8px;
            box-shadow:0 2px 12px rgba(0,0,0,0.1);overflow:hidden;'>

  <!-- Header -->
  <div style='background:#1a5276;padding:20px 24px;'>
    <table width="100%"><tr>
      <td><h2 style='margin:0;color:white;font-size:18px;'>COFERSA — Negociación Especial</h2>
          <p style='margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;'>Notificación automática del sistema</p></td>
      <td style='text-align:right;vertical-align:middle;'>
        <span style='display:inline-block;padding:6px 16px;background:{estado_color};
                     color:white;border-radius:20px;font-weight:bold;font-size:14px;'>
          {estado_label}
        </span>
      </td>
    </tr></table>
  </div>

  <!-- Body -->
  <div style='padding:24px;'>

    <!-- Solicitud header info -->
    <table style='width:100%;border-collapse:collapse;'>
      {section_title("Información de la Solicitud")}
      {folio_row}
      {td("Estado", f"<strong style='color:{estado_color};'>{estado_label}</strong>")}
      {td("Fecha de Creación", (sol.get('created_at') or '')[:16])}
      {approved_at_str}
      {td("Nivel de Aprobación", nivel_label) if nivel_label else ""}
      {td("Creado por (Vendedor)", vendedor_str) if vendedor_str else ""}
      {td(aprobador_label, aprobador_str) if aprobador_str else ""}
      {section_title("Datos del Cliente y Pedido")}
      {td("Código Cliente", sol.get('cliente_codigo',''))}
      {td("Nombre Cliente", f"<strong>{sol.get('cliente_nombre','')}</strong>")}
      {td("Número de Pedido", sol.get('numero_pedido',''))}
      {td("Marcas incluidas", marcas_str)}
      {section_title("Justificación")}
      <tr><td colspan='2' style='padding:4px 0 12px;font-size:13px;color:#333;'>
        {sol.get('justificacion','—')}
      </td></tr>
    </table>

    <!-- SKU detail table -->
    <p style='font-size:13px;font-weight:bold;color:#1a5276;margin:16px 0 8px;
              border-bottom:2px solid #1a5276;padding-bottom:4px;'>
      Detalle de SKUs
    </p>
    <div style='overflow-x:auto;'>
    <table style='width:100%;border-collapse:collapse;min-width:700px;'>
      <thead>
        <tr style='background:#1a5276;color:white;'>
          <th style='padding:6px 6px;font-size:11px;text-align:left;'>Marca / Clasif.</th>
          <th style='padding:6px 6px;font-size:11px;text-align:left;'>Código</th>
          <th style='padding:6px 6px;font-size:11px;text-align:left;'>Descripción</th>
          <th style='padding:6px 6px;font-size:11px;text-align:right;'>Cant.</th>
          <th style='padding:6px 6px;font-size:11px;text-align:right;'>P. Base</th>
          <th style='padding:6px 6px;font-size:11px;text-align:right;'>% Desc. Sol.</th>
          <th style='padding:6px 6px;font-size:11px;text-align:right;'>P. Sol.</th>
          <th style='padding:6px 6px;font-size:11px;text-align:right;'>Mto. Desc. Sol.</th>
          <th style='padding:6px 6px;font-size:11px;text-align:right;'>% Aprob.</th>
          <th style='padding:6px 6px;font-size:11px;text-align:right;'>P. Aprob.</th>
          <th style='padding:6px 6px;font-size:11px;text-align:right;'>Mto. Aprob.</th>
        </tr>
      </thead>
      <tbody>{sku_rows_html}</tbody>
      <tfoot>
        <tr style='background:#eaf2f8;font-weight:bold;'>
          <td colspan='7' style='padding:7px 6px;font-size:12px;text-align:right;'>TOTAL DESCUENTO SOLICITADO:</td>
          <td style='padding:7px 6px;font-size:12px;text-align:right;'>{_fmt_crc(total_desc_sol)}</td>
          <td colspan='3'></td>
        </tr>
        {total_aprobado_row}
      </tfoot>
    </table>
    </div>

    {comentario_html}
    {link_html}

  </div><!-- /body -->

  <!-- Footer -->
  <div style='background:#f8f9fa;padding:12px 24px;border-top:1px solid #eee;
              font-size:11px;color:#888;text-align:center;'>
    COFERSA — Sistema de Negociación Especial &nbsp;|&nbsp; Correo automático, no responder directamente.<br>
    Generado: {datetime.now().strftime('%Y-%m-%d %H:%M')}
  </div>

</div>
</body></html>"""

    return subject, html


def build_plain_text_email(sol, skus, vendedor_info=None, aprobador_info=None):
    """
    Build a complete plain-text version of the solicitud for use in mailto: links.
    Contains all required fields. mailto: does not support HTML.
    """
    estado_labels = {
        'pendiente':  'Pendiente de Aprobación',
        'en_revision':'En Revisión',
        'escalada':   'Escalada a siguiente nivel',
        'aprobada':   'APROBADA',
        'rechazada':  'RECHAZADA',
        'cancelada':  'Cancelada',
    }
    estado = sol.get('estado', '')
    estado_label = estado_labels.get(estado, estado.upper())
    folio_str = sol.get('folio') or f"#{sol.get('id','')}"

    def fmt_crc(v):
        try: return f"\u20a1{float(v):,.2f}"
        except: return "\u20a10.00"

    def fmt_pct(v):
        try: return f"{float(v):.2f}%"
        except: return "0.00%"

    vend_str = ""
    if vendedor_info:
        vend_str = f"{vendedor_info.get('nombre','')} {vendedor_info.get('apellido','')}".strip()
        if vendedor_info.get('email'):
            vend_str += f" <{vendedor_info['email']}>"

    apr_label = "Aprobador Final" if estado == 'aprobada' else "Aprobador Actual"
    apr_str = ""
    if aprobador_info:
        apr_str = f"{aprobador_info.get('nombre','')} {aprobador_info.get('apellido','')}".strip()
        if aprobador_info.get('email'):
            apr_str += f" <{aprobador_info['email']}>"

    nivel = (sol.get('aprobador_nivel') or '').replace('_', ' ').title()
    marcas = sorted(set(s.get('marca','') for s in skus if s.get('marca')))

    lines = [
        "=" * 60,
        "COFERSA — NEGOCIACIÓN ESPECIAL",
        "=" * 60,
        "",
        f"ESTADO:            {estado_label}",
        f"FOLIO:             {folio_str}",
        f"FECHA CREACIÓN:    {(sol.get('created_at') or '')[:16]}",
    ]
    if sol.get('approved_at'):
        lines.append(f"FECHA APROBACIÓN:  {sol['approved_at'][:16]}")
    if nivel:
        lines.append(f"NIVEL APROBACIÓN:  {nivel}")
    if vend_str:
        lines.append(f"VENDEDOR:          {vend_str}")
    if apr_str:
        lines.append(f"{apr_label.upper()}: {apr_str}")

    lines += [
        "",
        "-" * 60,
        "DATOS DEL CLIENTE Y PEDIDO",
        "-" * 60,
        f"Código Cliente:    {sol.get('cliente_codigo','')}",
        f"Nombre Cliente:    {sol.get('cliente_nombre','')}",
        f"Número de Pedido:  {sol.get('numero_pedido','')}",
        f"Marcas incluidas:  {', '.join(marcas) if marcas else '—'}",
        "",
        "-" * 60,
        "JUSTIFICACIÓN",
        "-" * 60,
        sol.get('justificacion', '—'),
        "",
        "-" * 60,
        "DETALLE DE SKUs",
        "-" * 60,
    ]

    total_sol = 0.0
    total_apr = 0.0
    for i, s in enumerate(skus, 1):
        monto_desc = float(s.get('monto_descuento') or 0)
        total_sol += monto_desc
        pct_apr  = s.get('porcentaje_aprobado')
        monto_apr_v = s.get('monto_aprobado')
        precio_apr_v = s.get('precio_aprobado')
        if pct_apr is not None and monto_apr_v:
            total_apr += float(monto_apr_v)

        lines.append(f"  SKU #{i}: {s.get('marca','')} | {s.get('codigo_sku','')} — {s.get('descripcion','')}")
        lines.append(f"    Clasificación:       {s.get('clasificacion','')}")
        lines.append(f"    Cantidad:            {s.get('cantidad',0)}")
        lines.append(f"    Precio Base:         {fmt_crc(s.get('precio_base',0))}")
        lines.append(f"    % Descuento Sol.:    {fmt_pct(s.get('porcentaje_descuento_sol',0))}")
        lines.append(f"    Precio Solicitado:   {fmt_crc(s.get('precio_solicitado',0))}")
        lines.append(f"    Monto Desc. Sol.:    {fmt_crc(monto_desc)}")
        sku_est = s.get('sku_estado', 'pendiente')
        if sku_est == 'rechazado':
            lines.append(f"    Estado:              ✗ RECHAZADO")
        elif pct_apr is not None:
            lines.append(f"    Estado:              ✓ Aprobado")
            lines.append(f"    % Aprobado:          {fmt_pct(pct_apr)}")
            lines.append(f"    Precio Aprobado:     {fmt_crc(precio_apr_v)}")
            lines.append(f"    Monto Aprobado:      {fmt_crc(monto_apr_v)}")
        else:
            lines.append(f"    Estado:              Pendiente")
        lines.append("")

    lines += [
        "-" * 60,
        f"TOTAL DESCUENTO SOLICITADO:  {fmt_crc(total_sol)}",
    ]
    if total_apr > 0:
        lines.append(f"TOTAL DESCUENTO APROBADO:    {fmt_crc(total_apr)}")

    if sol.get('comentario_aprobador'):
        lines += [
            "",
            "-" * 60,
            "COMENTARIO DEL APROBADOR",
            "-" * 60,
            sol['comentario_aprobador'],
        ]

    lines += [
        "",
        "=" * 60,
        "Correo generado automáticamente por COFERSA NE",
        "=" * 60,
    ]

    return "\n".join(lines)


def build_mailto(to_list, cc_list, subject, body_plain):
    """
    Build a mailto: URL that opens Gmail compose with full solicitud detail.
    to_list and cc_list are lists of email addresses.
    """
    import urllib.parse
    to_str  = ','.join(e for e in to_list if e)
    cc_str  = ','.join(e for e in cc_list if e)
    params  = {'subject': subject, 'body': body_plain}
    if cc_str:
        params['cc'] = cc_str
    query = urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    return f"mailto:{to_str}?{query}"
