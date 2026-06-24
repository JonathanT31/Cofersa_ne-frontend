import zipfile
import xml.etree.ElementTree as ET
import csv
import io
import re
from typing import List, Dict, Any


# ---------------------------------------------------------------------------
# XLSX WRITER (sin dependencias externas)
# ---------------------------------------------------------------------------

def _escape_xml(text: str) -> str:
    """Escape special XML characters in cell values."""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def generate_xlsx(headers: List[str], rows: List[List[Any]]) -> bytes:
    """
    Generate a minimal valid .xlsx file from headers and data rows.
    Returns the raw bytes of the file (ready to send as HTTP response).
    Uses only Python stdlib – no openpyxl / xlsxwriter needed.
    """
    # ---- 1. Build shared strings ----------------------------------------
    # Collect all unique string values (headers + cell values that are strings)
    all_strings: List[str] = []
    seen: dict = {}

    def get_ss_idx(val: str) -> int:
        if val not in seen:
            seen[val] = len(all_strings)
            all_strings.append(val)
        return seen[val]

    # Pre-register headers
    for h in headers:
        get_ss_idx(str(h))

    # Pre-register string cells in data rows
    for row in rows:
        for cell in row:
            if not isinstance(cell, (int, float)):
                get_ss_idx(str(cell))

    # ---- 2. Build worksheet XML -----------------------------------------
    COL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

    def col_letter(idx: int) -> str:
        result = ""
        idx += 1
        while idx:
            idx, remainder = divmod(idx - 1, 26)
            result = COL_LETTERS[remainder] + result
        return result

    sheet_rows_xml = []
    all_data_rows = [headers] + rows
    for r_idx, row_data in enumerate(all_data_rows, start=1):
        cells_xml = []
        for c_idx, cell in enumerate(row_data):
            col = col_letter(c_idx)
            ref = f"{col}{r_idx}"
            if isinstance(cell, (int, float)):
                cells_xml.append(f'<c r="{ref}"><v>{cell}</v></c>')
            else:
                ss_idx = get_ss_idx(str(cell))
                cells_xml.append(f'<c r="{ref}" t="s"><v>{ss_idx}</v></c>')
        sheet_rows_xml.append(f'<row r="{r_idx}">{"".join(cells_xml)}</row>')

    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        "<sheetData>"
        + "".join(sheet_rows_xml)
        + "</sheetData></worksheet>"
    )

    # ---- 3. Build shared strings XML ------------------------------------
    si_entries = "".join(
        f"<si><t>{_escape_xml(s)}</t></si>" for s in all_strings
    )
    shared_strings_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        f' count="{len(all_strings)}" uniqueCount="{len(all_strings)}">'
        + si_entries
        + "</sst>"
    )

    # ---- 4. Boilerplate XLSX files --------------------------------------
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        "</Types>"
    )

    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )

    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        "<sheets>"
        '<sheet name="Plantilla" sheetId="1" r:id="rId1"/>'
        "</sheets></workbook>"
    )

    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        "</Relationships>"
    )

    # ---- 5. Pack into ZIP (XLSX format) ---------------------------------
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types_xml)
        zf.writestr("_rels/.rels", rels_xml)
        zf.writestr("xl/workbook.xml", workbook_xml)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)
        zf.writestr("xl/sharedStrings.xml", shared_strings_xml)
    return buf.getvalue()


def generate_template_reglas() -> bytes:
    """Returns bytes of a .xlsx template for the 'reglas' import."""
    headers = ["Marca", "Clasificacion", "Limite_Vendedor", "Limite_Supervisor", "Limite_Compras"]
    example_rows = [
        ["EJEMPLO_MARCA", "1 Alto", 3.0, 5.0, 5.01],
    ]
    return generate_xlsx(headers, example_rows)


def generate_template_presupuesto() -> bytes:
    """Returns bytes of a .xlsx template for the 'presupuesto' import."""
    headers = ["Supervisor", "Asesor", "Marca", "Ppto_Mensual"]
    example_rows = [
        ["supervisor.ejemplo", "asesor.ejemplo", "EJEMPLO_MARCA", 500000],
    ]
    return generate_xlsx(headers, example_rows)

def read_xlsx(filepath) -> List[List[Any]]:
    """Parse xlsx into list of lists without external dependencies."""
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

def _col_to_idx(cell_ref: str) -> int:
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

def parse_number(val) -> float:
    if not val:
        return 0.0
    val = str(val).strip()
    try:
        return float(val)
    except ValueError:
        s = val.replace(' ', '')
        if ',' in s and s.rfind(',') > s.rfind('.'):
            s = s.replace('.', '').replace(',', '.')
        else:
            s = s.replace(',', '').replace('.', '')
        try:
            return float(s)
        except ValueError:
            return 0.0

def import_reglas_from_xlsx(filepath) -> List[Dict[str, Any]]:
    rows = read_xlsx(filepath)
    if not rows: return []
    headers = [str(h).strip().lower() for h in rows[0]]
    
    results = []
    for row in rows[1:]:
        d = {}
        for i, h in enumerate(headers):
            if i < len(row): d[h] = row[i]
        
        marca = ''; clasif = ''; lim_v = 0; lim_s = 0; lim_g = 0; lim_c = 0
        for k, v in d.items():
            if 'marca' in k: marca = str(v).strip()
            elif 'clasif' in k: clasif = str(v).strip()
            elif 'vendedor' in k or 'vend' in k: lim_v = parse_number(v)
            elif 'supervisor' in k or ('sup' in k and 'vendedor' not in k): lim_s = parse_number(v)
            elif 'gte' in k or 'gerente' in k: lim_g = parse_number(v)
            elif 'compra' in k: lim_c = parse_number(v)
        
        if marca:
            if lim_v == 0 and lim_s > 0:
                lim_v = lim_s
                lim_s = lim_g if lim_g > 0 else lim_c
            results.append({
                'marca': marca,
                'clasificacion': clasif,
                'limite_vendedor': lim_v,
                'limite_supervisor': lim_s,
                'limite_gte_ventas': lim_g,
                'limite_compras': lim_c,
            })
    return results

def import_presupuesto_from_xlsx(filepath) -> List[Dict[str, Any]]:
    rows = read_xlsx(filepath)
    if not rows: return []
    headers = [str(h).strip().lower() for h in rows[0]]
    
    results = []
    for row in rows[1:]:
        d = {}
        for i, h in enumerate(headers):
            if i < len(row): d[h] = row[i]
        
        supervisor = ''; asesor = ''; marca = ''; ppto = 0
        for k, v in d.items():
            if 'supervisor' in k: supervisor = str(v).strip()
            elif 'asesor' in k: asesor = str(v).strip()
            elif 'marca' in k: marca = str(v).strip()
            elif 'ppto' in k or 'presupuesto' in k or 'crc' in k: ppto = parse_number(v)
        
        if marca and supervisor:
            results.append({
                'supervisor': supervisor,
                'asesor': asesor,
                'marca': marca,
                'ppto_mensual': ppto,
            })
    return results
