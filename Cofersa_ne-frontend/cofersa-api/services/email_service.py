import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import List, Dict, Any, Optional

def send_email(smtp_config: Dict[str, Any], recipients: List[str], subject: str, html_body: str) -> (bool, str):
    """Send email via SMTP."""
    smtp_host = smtp_config.get('host', 'smtp.gmail.com')
    smtp_port = int(smtp_config.get('port', 587))
    smtp_user = smtp_config.get('user', '')
    smtp_pass = smtp_config.get('password', '')
    smtp_from = smtp_config.get('from', smtp_user)

    if not smtp_user or not smtp_pass:
        return False, "SMTP no configurado"

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_from
        msg['To'] = ', '.join(recipients)

        msg.attach(MIMEText(html_body, 'html', 'utf-8'))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, recipients, msg.as_string())

        return True, ""
    except Exception as e:
        return False, str(e)

def _fmt_crc(v):
    try:
        return f"\u20a1{float(v or 0):,.2f}"
    except:
        return "\u20a10.00"

def _fmt_pct(v):
    try:
        return f"{float(v or 0):.2f}%"
    except:
        return "0.00%"

def _color_for_estado(estado):
    return {
        'aprobada':  '#27ae60',
        'rechazada': '#e74c3c',
        'escalada':  '#f39c12',
        'pendiente': '#2980b9',
    }.get(estado, '#555')

def build_solicitud_email(sol: Dict[str, Any], skus: List[Dict[str, Any]], base_url: str = "", 
                          vendedor_info: Dict[str, Any] = None, aprobador_info: Dict[str, Any] = None) -> (str, str):
    """
    Build a rich, self-contained HTML email with full solicitud detail.
    Ported from legacy COFERSA NE design.
    """
    estado_labels = {
        'pendiente':  'Pendiente de Aprobación',
        'en_revision':'En Revisión',
        'escalada':   'Escalada',
        'aprobada':   'APROBADA',
        'rechazada':  'RECHAZADA',
        'cancelada':  'Cancelada',
    }
    estado = sol.get('estado', 'pendiente')
    estado_label = estado_labels.get(estado, estado.upper())
    estado_color = _color_for_estado(estado)
    
    folio_str = sol.get('folio') or f"#{sol.get('id','')}"
    subject = f"[COFERSA NE] {folio_str} — {estado_label} — {sol.get('cliente_nombre', '')}"
    
    # Helpers for HTML building
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

    vendedor_str = ""
    if vendedor_info:
        vendedor_str = f"{vendedor_info.get('nombre','')} {vendedor_info.get('apellido','')}".strip()
    
    aprobador_str = ""
    if aprobador_info:
        aprobador_str = f"{aprobador_info.get('nombre','')} {aprobador_info.get('apellido','')}".strip()

    # SKU rows
    sku_rows_html = ""
    total_desc_sol = 0.0
    for s in skus:
        mdesc = float(s.get('monto_descuento') or 0)
        total_desc_sol += mdesc
        sku_rows_html += f"""
        <tr style='border-bottom:1px solid #f0f0f0;'>
            <td style='padding:5px 6px;font-size:12px;'><strong>{s.get('marca','')}</strong></td>
            <td style='padding:5px 6px;font-size:12px;'>{s.get('codigo_sku','')}</td>
            <td style='padding:5px 6px;font-size:12px;'>{s.get('descripcion','')}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{s.get('cantidad',0)}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{_fmt_crc(s.get('precio_base',0))}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{_fmt_pct(s.get('porcentaje_descuento_sol',0))}</td>
            <td style='padding:5px 6px;font-size:12px;text-align:right;'>{_fmt_crc(mdesc)}</td>
        </tr>"""

    html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <body style='margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;'>
        <div style='max-width:700px;margin:20px auto;background:white;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.1);overflow:hidden;'>
            <div style='background:#1a5276;padding:20px 24px;color:white;'>
                <table width="100%"><tr>
                    <td><h2 style='margin:0;font-size:18px;'>COFERSA — Negociación Especial</h2></td>
                    <td style='text-align:right;'>
                        <span style='padding:6px 16px;background:{estado_color};border-radius:20px;font-weight:bold;'>{estado_label}</span>
                    </td>
                </tr></table>
            </div>
            <div style='padding:24px;'>
                <table style='width:100%;border-collapse:collapse;'>
                    {section_title("Detalles de la Solicitud")}
                    {td("Folio", f"<strong>{folio_str}</strong>")}
                    {td("Vendedor", vendedor_str) if vendedor_str else ""}
                    {td("Cliente", f"<strong>{sol.get('cliente_nombre','')}</strong>")}
                    {td("Pedido", sol.get('numero_pedido',''))}
                    {section_title("Justificación")}
                    <tr><td colspan='2' style='padding:10px 0;font-size:13px;'>{sol.get('justificacion','')}</td></tr>
                </table>

                <p style='font-size:13px;font-weight:bold;color:#1a5276;margin-top:20px;border-bottom:2px solid #1a5276;'>Detalle de SKUs</p>
                <table style='width:100%;border-collapse:collapse;'>
                    <thead>
                        <tr style='background:#f8f9fa;border-bottom:2px solid #1a5276;'>
                            <th style='text-align:left;padding:8px;'>Marca</th>
                            <th style='text-align:left;padding:8px;'>Código</th>
                            <th style='text-align:left;padding:8px;'>Descripción</th>
                            <th style='text-align:right;padding:8px;'>Cant.</th>
                            <th style='text-align:right;padding:8px;'>P. Base</th>
                            <th style='text-align:right;padding:8px;'>% Desc.</th>
                            <th style='text-align:right;padding:8px;'>Mto. Desc.</th>
                        </tr>
                    </thead>
                    <tbody>{sku_rows_html}</tbody>
                    <tfoot>
                        <tr style='background:#eaf2f8;font-weight:bold;'>
                            <td colspan='6' style='text-align:right;padding:8px;'>TOTAL DESCUENTO:</td>
                            <td style='text-align:right;padding:8px;'>{_fmt_crc(total_desc_sol)}</td>
                        </tr>
                    </tfoot>
                </table>

                {f"<div style='margin-top:20px;padding:15px;background:#fef9e7;border-left:4px solid #f39c12;'><strong>Comentario:</strong><br>{sol['comentario_aprobador']}</div>" if sol.get('comentario_aprobador') else ""}

                <div style='margin-top:30px;text-align:center;'>
                    <a href='{base_url}/solicitud/{sol.get('id')}' style='padding:12px 25px;background:#1a5276;color:white;text-decoration:none;border-radius:5px;'>Ver en el Sistema</a>
                </div>
            </div>
            <div style='background:#f8f9fa;padding:15px;text-align:center;font-size:11px;color:#888;border-top:1px solid #eee;'>
                Generado automáticamente por COFERSA NE - {datetime.now().strftime('%Y-%m-%d %H:%M')}
            </div>
        </div>
    </body>
    </html>
    """
    return subject, html
