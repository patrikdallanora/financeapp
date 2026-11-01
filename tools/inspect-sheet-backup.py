"""Verify the archived XLSX without modifying it or logging financial rows.

Usage: python tools/inspect-sheet-backup.py INPUT.xlsx OUTPUT_DIRECTORY
All ZIP entries and worksheet XML are preserved in the original XLSX. The
private cell archive retains original XML cell types, raw values and formulas.
"""
import hashlib
import json
import pathlib
import sys
import xml.etree.ElementTree as ET
import zipfile

source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
destination.mkdir(parents=True, exist_ok=True)
ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
relationships_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
office_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

with zipfile.ZipFile(source) as archive:
    corrupted = archive.testzip()
    if corrupted:
        raise ValueError("ZIP com entrada corrompida")
    strings = []
    if "xl/sharedStrings.xml" in archive.namelist():
        strings = ["".join(node.itertext()) for node in ET.fromstring(archive.read("xl/sharedStrings.xml"))]
    relationships = {
        r.attrib["Id"]: r.attrib["Target"]
        for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    }
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    sheets = []
    raw = {}
    for sheet in workbook.find("s:sheets", ns):
        name = sheet.attrib["name"]
        target = relationships[sheet.attrib[f"{{{office_ns}}}id"]]
        path = target.lstrip("/") if target.startswith("/") else "xl/" + target
        content = archive.read(path)
        document = ET.fromstring(content)
        cells = []
        headers = []
        row_numbers = set()
        for cell in document.findall(".//s:sheetData/s:row/s:c", ns):
            value = cell.find("s:v", ns)
            formula = cell.find("s:f", ns)
            inline = cell.find("s:is", ns)
            if value is None and formula is None and inline is None:
                continue
            item = {"ref": cell.attrib["r"], "type": cell.attrib.get("t", "n"),
                    "value": value.text if value is not None else None,
                    "formula": formula.text if formula is not None else None,
                    "inline": "".join(inline.itertext()) if inline is not None else None}
            cells.append(item)
            row_number = int("".join(c for c in cell.attrib["r"] if c.isdigit()))
            row_numbers.add(row_number)
            if row_number == 1:
                header = strings[int(item["value"])] if item["type"] == "s" else item["inline"] or item["value"]
                headers.append(header)
        raw[name] = cells
        sheets.append({"name": name, "populated_rows_including_header": len(row_numbers),
                       "data_rows": len(row_numbers - {1}), "cells": len(cells), "headers": headers,
                       "xml_sha256": hashlib.sha256(content).hexdigest()})
    raw_file = destination / "sheet-cells-private.json"
    raw_file.write_text(json.dumps({"sharedStrings": strings, "sheets": raw}, ensure_ascii=False), encoding="utf-8")
    manifest = {"source_file": source.name, "bytes": source.stat().st_size,
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "zip_integrity": "verified",
                "sheet_count": len(sheets), "sheets": sheets,
                "cell_archive_sha256": hashlib.sha256(raw_file.read_bytes()).hexdigest()}
    (destination / "sheet-backup-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False))
