"""
COFERSA NE - XLSX Reader using only stdlib (zipfile + xml.etree)
Reads .xlsx files without any external dependencies.
Also handles CSV import/export as fallback.
"""
import zipfile
import xml.etree.ElementTree as ET
import csv
import io
import re
import os

def read_xlsx(filepath):
    """Read an xlsx file and return list of dicts (header row as keys)."""
    rows = _parse_xlsx_rows(filepath)
    if not rows:
        return []
    headers = [str(h).strip() for h in rows[0]]
    result = []
    for row in rows[1:]:
        d = {}
        for i, h in enumerate(headers):
            if h:
                val = row[i] if i < len(row) else ''
                d[h] = val
        result.append(d)
    return result

def _parse_xlsx_rows(filepath):
    """Parse xlsx into list of lists."""
    try:
        with zipfile.ZipFile(filepath) as z:
            # Read shared strings
            ss = []
            if 'xl/sharedStrings.xml' in z.namelist():
                tree = ET.parse(z.open('xl/sharedStrings.xml'))
                ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                for si in tree.findall('.//s:si', ns):
                    texts = si.findall('.//s:t', ns)
                    ss.append(''.join(t.text or '' for t in texts))
            
            # Find first sheet
            sheet_name = 'xl/worksheets/sheet1.xml'
            if sheet_name not in z.namelist():
                # Try to find from workbook
                for name in z.namelist():
                    if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                        sheet_name = name
                        break
            
            tree = ET.parse(z.open(sheet_name))
            ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            
            rows = []
            for row_el in tree.findall('.//s:sheetData/s:row', ns):
                row_data = {}
                for c in row_el.findall('s:c', ns):
                    ref = c.get('r', '')
                    col_idx = _col_to_idx(ref)
                    t = c.get('t', '')
                    v = c.find('s:v', ns)
                    val = v.text if v is not None else ''
                    if t == 's' and val:
                        try:
                            val = ss[int(val)]
                        except (ValueError, IndexError):
                            pass
                    # Handle inline strings
                    if t == 'inlineStr':
                        is_el = c.find('s:is', ns)
                        if is_el is not None:
                            t_el = is_el.find('s:t', ns)
                            val = t_el.text if t_el is not None else ''
                    row_data[col_idx] = val
                
                if row_data:
                    max_col = max(row_data.keys()) + 1
                    row_list = [row_data.get(i, '') for i in range(max_col)]
                    rows.append(row_list)
            
            return rows
    except Exception as e:
        print(f"Error reading xlsx: {e}")
        return []

def _col_to_idx(cell_ref):
    """Convert cell reference like 'A1', 'AB3' to column index."""
    col_str = ''
    for ch in cell_ref:
        if ch.isalpha():
            col_str += ch
        else:
            break
    if not col_str:
        return 0
    idx = 0
    for ch in col_str.upper():
        idx = idx * 26 + (ord(ch) - ord('A') + 1)
    return idx - 1

def read_csv_text(text):
    """Read CSV from text string, return list of dicts."""
    reader = csv.DictReader(io.StringIO(text))
    return [dict(r) for r in reader]

def export_csv(headers, rows):
    """Export data as CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row.get(h, '') for h in headers])
    return output.getvalue()

def parse_number(val):
    """Parse a numeric string, handling Spanish locale (1.234.567,89) and scientific notation."""
    if not val:
        return 0.0
    val = str(val).strip()
    try:
        return float(val)
    except ValueError:
        # Handle Spanish/CR locale: "200.000,00" → 200000.0
        # If ends with ,dd pattern (comma as decimal) replace . with '' and , with .
        s = val.replace(' ', '')
        # Spanish/CR format: "200.000,00" or "1.050.000,00"
        if ',' in s and s.rfind(',') > s.rfind('.'):
            # Comma is decimal separator
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '').replace('.', '')
        try:
            return float(s)
        except ValueError:
            return 0.0

def import_reglas_from_xlsx(filepath):
    """Import approval rules from xlsx file. Returns list of dicts.
    Supports new 3-level structure: vendedor / supervisor / compras
    Also backwards-compatible with old 3-level: supervisor / gte_ventas / compras
    """
    data = read_xlsx(filepath)
    results = []
    for row in data:
        marca = ''; clasificacion = ''
        lim_vend = 0; lim_sup = 0; lim_gte = 0; lim_com = 0
        for k, v in row.items():
            kl = k.lower().strip()
            if 'marca' in kl:
                marca = str(v).strip()
            elif 'clasif' in kl:
                clasificacion = str(v).strip()
            elif 'vendedor' in kl or 'vend' in kl:
                lim_vend = parse_number(v)
            elif 'supervisor' in kl or ('sup' in kl and 'vendedor' not in kl):
                lim_sup = parse_number(v)
            elif 'gte' in kl or 'gerente' in kl:
                lim_gte = parse_number(v)
            elif 'compra' in kl:
                lim_com = parse_number(v)
        if marca:
            # If no vendedor limit in file, use old supervisor as vendedor (backwards compat)
            if lim_vend == 0 and lim_sup > 0:
                lim_vend = lim_sup
                lim_sup  = lim_gte if lim_gte > 0 else lim_com
            results.append({
                'marca': marca,
                'clasificacion': clasificacion,
                'limite_vendedor': lim_vend,
                'limite_supervisor': lim_sup,
                'limite_gte_ventas': lim_gte,   # kept for DB compat
                'limite_compras': lim_com,
            })
    return results

def import_presupuesto_from_xlsx(filepath):
    """Import budget from xlsx file. Returns list of dicts."""
    data = read_xlsx(filepath)
    results = []
    for row in data:
        supervisor = ''
        asesor = ''
        marca = ''
        ppto = 0
        for k, v in row.items():
            kl = k.lower().strip()
            if 'supervisor' in kl:
                supervisor = str(v).strip()
            elif 'asesor' in kl:
                asesor = str(v).strip()
            elif 'marca' in kl:
                marca = str(v).strip()
            elif 'ppto' in kl or 'presupuesto' in kl or 'crc' in kl:
                ppto = parse_number(v)
        if marca and supervisor:
            results.append({
                'supervisor': supervisor,
                'asesor': asesor,
                'marca': marca,
                'ppto_mensual_crc': ppto,
            })
    return results
