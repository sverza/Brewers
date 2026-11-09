"""Import the initial public roster from the reviewed, two-column workbook."""

import argparse
import json
import re
import tempfile
import unicodedata
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile


SITE = Path(__file__).resolve().parents[1]
DESTINATION = SITE / "roster/multiseason"
SEASONS = {"2024-2025": "2024-25", "2025-2026": "2025-26", "2026-2027": "2026-27"}
HISTORICAL = "MembriStorici_Al9112026"
STAFF_ROLES = {"Coach": "coach", "Assistente": "assistant-coach"}
XML = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
SLUG = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*")


def clean_name(value):
    if not isinstance(value, str):
        raise ValueError("Nominativo non valido")
    value = unicodedata.normalize("NFC", value).strip()
    if (not 2 <= len(value) <= 100 or not any(c.isalpha() for c in value)
            or not all(c.isalpha() or c in " '-’." for c in value)):
        raise ValueError("Nominativo non valido")
    return " ".join(value.split())


def name_key(name):
    return clean_name(name).replace("’", "'").casefold()


def jersey(value):
    if not re.fullmatch(r"[0-9]{1,2}", value):
        raise ValueError("Maglia attesa come intero da 0 a 99")
    return int(value)


def worksheet_rows(xml, shared, sheet):
    rows = []
    for row in xml.findall("m:sheetData/m:row", XML):
        cells = {}
        for cell in row.findall("m:c", XML):
            address = cell.get("r", "")
            if cell.find("m:f", XML) is not None:
                raise ValueError(f"{sheet} {address}: formule non ammesse")
            cell_type = cell.get("t", "n")
            value = cell.findtext("m:v", default="", namespaces=XML)
            if cell_type == "s":
                if not value.isdecimal() or int(value) >= len(shared):
                    raise ValueError(f"{sheet} {address}: riferimento testo non valido")
                value = shared[int(value)]
            elif cell_type == "inlineStr":
                value = "".join(t.text or "" for t in cell.findall(".//m:is//m:t", XML))
            elif value and cell_type not in {"n", "str"}:
                raise ValueError(f"{sheet} {address}: tipo di cella non ammesso")
            if not value.strip():
                continue
            match = re.fullmatch(r"([AB])([1-9][0-9]*)", address)
            if not match or match[2] != row.get("r") or match[1] in cells:
                raise ValueError(f"{sheet} {address}: attese due colonne A e B senza duplicati")
            cells[match[1]] = value.strip()
        if not cells:
            continue
        if cells.keys() != {"A", "B"}:
            raise ValueError(f"{sheet} riga {row.get('r')}: servono maglia o ruolo e nominativo")
        rows.append((row.get("r"), cells["A"], clean_name(cells["B"])))
    if not rows:
        raise ValueError(f"{sheet}: foglio vuoto")
    return rows


def read_workbook(path):
    with ZipFile(path) as workbook:
        def xml(name):
            if workbook.getinfo(name).file_size > 2_000_000:
                raise ValueError("File Excel oltre il limite previsto per questo import")
            return ET.fromstring(workbook.read(name))

        relationships = {node.get("Id"): node for node in xml("xl/_rels/workbook.xml.rels")}
        sheets = xml("xl/workbook.xml").findall("m:sheets/m:sheet", XML)
        if len(sheets) != 4 or {s.get("name") for s in sheets} != (SEASONS.keys() | {HISTORICAL}):
            raise ValueError("Attesi i tre fogli stagionali concordati e il foglio Membri storici")
        shared = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            shared = [
                "".join(t.text or "" for t in item.findall(".//m:t", XML))
                for item in xml("xl/sharedStrings.xml").findall("m:si", XML)
            ]
        result = {}
        for sheet in sheets:
            relation = relationships[sheet.attrib[REL_ID]]
            target = relation.get("Target", "").removeprefix("/xl/").removeprefix("xl/")
            if relation.get("TargetMode") == "External" or not re.fullmatch(r"worksheets/sheet[0-9]+\.xml", target):
                raise ValueError("Percorso del foglio non valido")
            name = sheet.attrib["name"]
            result[name] = worksheet_rows(xml("xl/" + target), shared, name)
        return result


def index_people(people):
    by_name, ids, slugs, sports_ids = {}, set(), set(), set()
    for person in people:
        if not {"personId", "name", "profileSlug"} <= person.keys() or person.keys() - {
            "personId", "name", "profileSlug", "profilePage", "editorialPath", "imagePath", "sportsPlayerId"
        }:
            raise ValueError("Campi identità non ammessi")
        key = name_key(person["name"])
        person_id, slug = person["personId"], person["profileSlug"]
        if not SLUG.fullmatch(person_id) or not SLUG.fullmatch(slug):
            raise ValueError("ID pubblico non valido")
        if key in by_name or person_id in ids or slug in slugs:
            raise ValueError(f"Identità ambigua nell'archivio per {person['name']}")
        if person.get("profilePage", "roster_details.html") not in {"roster_details.html", "staff_details.html"}:
            raise ValueError("Pagina profilo non valida")
        if "editorialPath" in person and person["editorialPath"] != f"roster/stats/{slug}.json":
            raise ValueError("Riferimento editoriale non valido")
        if "imagePath" in person and not re.fullmatch(
            r"roster/images/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)", person["imagePath"]
        ):
            raise ValueError("Riferimento foto non valido")
        if "sportsPlayerId" in person:
            sports_id = person["sportsPlayerId"]
            if not re.fullmatch(r"[ph]_[0-9a-f]{24}", sports_id) or sports_id in sports_ids:
                raise ValueError("ID statistico pubblico non valido o già associato")
            sports_ids.add(sports_id)
        by_name[key] = person
        ids.add(person_id)
        slugs.add(slug)
    return by_name, ids | slugs


def build_import(sheets, archive, approved_new=()):
    if archive.keys() != {"schemaVersion", "people"} or archive["schemaVersion"] != 1:
        raise ValueError("Schema dell'archivio identità incompatibile")
    people = list(archive["people"])
    by_name, reserved = index_people(people)
    reviewed = {name_key(name) for name in approved_new}
    source_names = {name_key(name): name for rows in sheets.values() for _, _, name in rows}
    if not reviewed <= source_names.keys():
        raise ValueError("Una nuova identità approvata non è presente nel foglio")
    for key in sorted(source_names.keys() - by_name.keys()):
        name = source_names[key]
        if key not in reviewed:
            raise ValueError(f"Identità da risolvere prima dell'import: {name}")
        ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
        slug = re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")
        if not slug or slug in reserved:
            raise ValueError(f"Slug non univoco per la nuova identità: {name}")
        person = {"personId": slug, "name": name, "profileSlug": slug}
        people.append(person)
        reserved.add(slug)
        by_name[key] = person

    memberships, recognitions = [], []
    for sheet, season in SEASONS.items():
        used_roles, used_numbers = set(), set()
        for row, value, name in sheets[sheet]:
            person_id = by_name[name_key(name)]["personId"]
            role = STAFF_ROLES.get(value, "player")
            key = (person_id, role)
            if key in used_roles:
                raise ValueError(f"{sheet} riga {row}: persona e ruolo duplicati")
            used_roles.add(key)
            membership = {
                "personId": person_id, "seasonId": season, "roleId": role,
                "categoryId": "player" if role == "player" else "staff",
            }
            if role == "player":
                number = jersey(value)
                if number in used_numbers:
                    raise ValueError(f"{sheet} riga {row}: maglia duplicata nella stessa stagione")
                used_numbers.add(number)
                membership["jerseyNumber"] = number
            memberships.append(membership)
    recognized = set()
    for row, value, name in sheets[HISTORICAL]:
        jersey(value)  # The source number is checked but is not a season assignment.
        person_id = by_name[name_key(name)]["personId"]
        if person_id in recognized:
            raise ValueError(f"{HISTORICAL} riga {row}: riconoscimento duplicato")
        recognized.add(person_id)
        recognitions.append({"personId": person_id, "categoryId": "historical-member"})

    return {"schemaVersion": 1, "people": sorted(people, key=lambda p: p["personId"])}, {
        "schemaVersion": 1, "seasons": [{"seasonId": season, "label": label} for label, season in SEASONS.items()],
        "memberships": memberships, "recognitions": recognitions,
    }


def write_json(path, data, check):
    content = (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode()
    if path.is_file() and path.read_bytes().replace(b"\r\n", b"\n") == content:
        return
    if check:
        raise ValueError(f"Snapshot non aggiornato: {path.name}")
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temp_path = Path(temporary.name)
        temporary.write(content)
    try:
        temp_path.replace(path)
    finally:
        temp_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--new-person", action="append", default=[], metavar="NOME")
    parser.add_argument("--check", action="store_true", help="Verifica senza modificare i JSON")
    args = parser.parse_args()
    try:
        archive_path = DESTINATION / "identities.json"
        original = json.loads(archive_path.read_text(encoding="utf-8"))
        archive, snapshot = build_import(read_workbook(args.workbook), original, args.new_person)
        categories = json.loads((DESTINATION / "categories.json").read_text(encoding="utf-8"))
        available = {c["id"]: c["kind"] for c in categories["categories"]}
        if categories["schemaVersion"] != 1 or len(available) != len(categories["categories"]) or any(
            available.get(row["categoryId"]) != kind
            for rows, kind in [(snapshot["memberships"], "membership"), (snapshot["recognitions"], "recognition")]
            for row in rows
        ):
            raise ValueError("Categorie mancanti, duplicate o incompatibili")
        # The archive grows first. Even if the snapshot write fails, existing references remain valid.
        write_json(archive_path, archive, args.check)
        write_json(DESTINATION / "roster.json", snapshot, args.check)
        print(json.dumps({
            "people": len(archive["people"]), "new": len(archive["people"]) - len(original["people"]),
            "sportsLinks": sum("sportsPlayerId" in p for p in archive["people"]),
            "memberships": len(snapshot["memberships"]), "recognitions": len(snapshot["recognitions"]),
        }))
    except (ValueError, OSError, KeyError, TypeError, BadZipFile, ET.ParseError) as error:
        parser.exit(1, f"Import bloccato. {error}\n")


if __name__ == "__main__":
    main()
