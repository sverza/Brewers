"""Serialize only validated roster cells into a deterministic, metadata-free XLSX."""

from io import BytesIO
from xml.sax.saxutils import escape, quoteattr
from zipfile import ZipFile, ZipInfo


SHEET = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT = "application/vnd.openxmlformats-officedocument.spreadsheetml."


def public_workbook(sheets):
    parts = {
        "_rels/.rels": f'<Relationships xmlns="{PACKAGE_REL}"><Relationship Id="rId1" '
        f'Type="{OFFICE_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    }
    names, links, types = [], [], []
    for i, (name, rows) in enumerate(sorted(sheets.items()), start=1):
        names.append(f'<sheet name={quoteattr(name)} sheetId="{i}" r:id="rId{i}"/>')
        links.append(f'<Relationship Id="rId{i}" Type="{OFFICE_REL}/worksheet" Target="worksheets/sheet{i}.xml"/>')
        types.append(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="{CONTENT}worksheet+xml"/>')
        encoded = []
        for j, (_, *values) in enumerate(rows or [(None, "VUOTO", "", "")], start=1):
            cells = [
                f'<c r="{col}{j}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
                for col, value in zip("ABC", values) if value
            ]
            encoded.append(f'<row r="{j}">{"".join(cells)}</row>')
        parts[f"xl/worksheets/sheet{i}.xml"] = (
            f'<worksheet xmlns="{SHEET}"><sheetData>{"".join(encoded)}</sheetData></worksheet>'
        )
    parts["xl/workbook.xml"] = f'<workbook xmlns="{SHEET}" xmlns:r="{OFFICE_REL}"><sheets>{"".join(names)}</sheets></workbook>'
    parts["xl/_rels/workbook.xml.rels"] = f'<Relationships xmlns="{PACKAGE_REL}">{"".join(links)}</Relationships>'
    parts["[Content_Types].xml"] = (
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        f'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        f'<Override PartName="/xl/workbook.xml" ContentType="{CONTENT}sheet.main+xml"/>{"".join(types)}</Types>'
    )
    result = BytesIO()
    with ZipFile(result, "w") as workbook:
        for name, body in sorted(parts.items()):
            workbook.writestr(_entry(name), '<?xml version="1.0" encoding="UTF-8"?>' + body)
    return result.getvalue()


def _entry(name):
    # Fixed timestamp and attributes make the upload format stable across OSes.
    info = ZipInfo(name)
    info.create_system = 0
    info.external_attr = 0x20
    return info
