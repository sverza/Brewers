"""Update the public roster from a reviewed Excel workbook."""

import argparse
import json
import re
import tempfile
import unicodedata
from hashlib import sha256
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

from roster_workbook import public_workbook


SITE = Path(__file__).resolve().parents[1]
DESTINATION = SITE / "roster/multiseason"
STAFF_ROLES = {"Coach": "coach", "Assistente": "assistant-coach"}
XML = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
SLUG = re.compile(r"[a-z0-9]+(?:_[a-z0-9]+)*")


def season_id(sheet):
    match = re.fullmatch(r"(20[0-9]{2})-(20[0-9]{2})", sheet)
    if match and int(match[2]) == int(match[1]) + 1:
        return match[1] + "-" + match[2][-2:]


def configured_sheets(catalog):
    if catalog.keys() != {"schemaVersion", "currentSeasonId", "categories"} or catalog["schemaVersion"] != 1:
        raise ValueError("Configurazione Roster incompatibile")
    by_sheet, ids, orders = {}, set(), set()
    for category in catalog["categories"]:
        category_id = category["id"]
        if not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", category_id) or category_id in ids:
            raise ValueError("ID categoria non valido o duplicato")
        ids.add(category_id)
        clean_name(category["label"])
        if category_id in {"player", "staff"}:
            if category["kind"] != "membership" or category.keys() != {"id", "label", "kind"}:
                raise ValueError("Configurazione categoria stagionale non valida")
            continue
        if category["kind"] != "recognition" or category.keys() != {"id", "label", "kind", "sheet", "order"}:
            raise ValueError("Configurazione categoria speciale non valida")
        sheet, order = category["sheet"], category["order"]
        if (not re.fullmatch(r"[\w -]{1,31}", sheet) or re.match(r"^[0-9]{4}", sheet)
                or sheet in by_sheet or type(order) is not int or not 0 <= order <= 9999 or order in orders):
            raise ValueError("Nome foglio o ordine della categoria non valido o duplicato")
        by_sheet[sheet] = category_id
        orders.add(order)
    if not {"player", "staff", "historical-member"} <= ids:
        raise ValueError("Categorie base mancanti")
    return by_sheet


def check_sheets(sheets, catalog, previous):
    special = configured_sheets(catalog)
    seasons = {season_id(s) for s in sheets if season_id(s)}
    unknown = set(sheets) - special.keys() - {s for s in sheets if season_id(s)}
    if unknown:
        raise ValueError("Foglio non riconosciuto: " + ", ".join(sorted(unknown)))
    if (special.keys() - sheets.keys() or catalog["currentSeasonId"] not in seasons
            or {s["seasonId"] for s in previous.get("seasons", [])} - seasons):
        raise ValueError("Excel incompleto: manca una stagione già registrata, quella corrente o una categoria")
    if {r["categoryId"] for r in previous.get("recognitions", [])} - set(special.values()):
        raise ValueError("Svuotare la categoria nel foglio prima di rimuoverla dalla configurazione")
    return special


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
            match = re.fullmatch(r"([ABC])([1-9][0-9]*)", address)
            if not match or match[2] != row.get("r") or match[1] in cells:
                raise ValueError(f"{sheet} {address}: attese colonne A, B e C senza duplicati")
            cells[match[1]] = value.strip()
        if not cells:
            continue
        if cells == {"A": "VUOTO"}:
            rows.append((row.get("r"), "VUOTO", "", ""))
            continue
        if not {"A", "B"} <= cells.keys():
            raise ValueError(f"{sheet} riga {row.get('r')}: servono maglia o ruolo e nominativo")
        identity = cells.get("C", "")
        if identity and identity != "NUOVO" and not SLUG.fullmatch(identity):
            raise ValueError(f"{sheet} riga {row.get('r')}: ID persona non valido")
        if row.get("hidden") == "1":
            raise ValueError(f"{sheet} riga {row.get('r')}: riga nascosta non ammessa")
        rows.append((row.get("r"), cells["A"], clean_name(cells["B"]), identity))
    if not rows:
        raise ValueError(f"{sheet}: foglio vuoto")
    if any(row[1] == "VUOTO" and not row[2] for row in rows):
        if rows == [("1", "VUOTO", "", "")]:
            return []
        raise ValueError(f"{sheet}: VUOTO è ammesso soltanto come unica cella A1")
    return rows


def read_workbook(path):
    with ZipFile(path) as workbook:
        def xml(name):
            if workbook.getinfo(name).file_size > 2_000_000:
                raise ValueError("File Excel oltre il limite previsto per questo import")
            return ET.fromstring(workbook.read(name))

        relationships = {node.get("Id"): node for node in xml("xl/_rels/workbook.xml.rels")}
        sheets = xml("xl/workbook.xml").findall("m:sheets/m:sheet", XML)
        if not sheets or len(sheets) > 100:
            raise ValueError("Numero di fogli non valido")
        shared = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            shared = [
                "".join(t.text or "" for t in item.findall(".//m:t", XML))
                for item in xml("xl/sharedStrings.xml").findall("m:si", XML)
            ]
        result = {}
        for sheet in sheets:
            if sheet.get("state", "visible") != "visible":
                raise ValueError("Fogli nascosti non ammessi")
            relation = relationships[sheet.attrib[REL_ID]]
            target = relation.get("Target", "").removeprefix("/xl/").removeprefix("xl/")
            if relation.get("TargetMode") == "External" or not re.fullmatch(r"worksheets/sheet[0-9]+\.xml", target):
                raise ValueError("Percorso del foglio non valido")
            name = sheet.attrib["name"]
            if name in result:
                raise ValueError("Nome foglio duplicato")
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


def build_import(sheets, archive, catalog, previous):
    special = check_sheets(sheets, catalog, previous)
    if archive.keys() != {"schemaVersion", "people"} or archive["schemaVersion"] != 1:
        raise ValueError("Schema dell'archivio identità incompatibile")
    people = list(archive["people"])
    by_name, reserved = index_people(people)
    new_names = {name_key(name): name for rows in sheets.values() for _, _, name, key in rows if key == "NUOVO"}
    for key, name in new_names.items():
        person_id = "persona_" + sha256(key.encode()).hexdigest()[:24]
        existing = by_name.get(key)
        if existing and existing["personId"] == person_id:
            continue
        if existing or person_id in reserved:
            raise ValueError(f"NUOVO ambiguo per {name}. Indicare l'ID esistente o verificare l'omonimia.")
        person = {"personId": person_id, "name": name, "profileSlug": person_id}
        people.append(person)
        reserved.add(person_id)
        by_name[key] = person

    def resolve(sheet, row, name, supplied):
        person = by_name.get(name_key(name))
        if not person or supplied not in {"", "NUOVO", person["personId"]}:
            raise ValueError(f"{sheet} riga {row}: identità da risolvere per {name}")
        return person["personId"]

    memberships, recognitions = [], []
    seasons = [(sheet, season_id(sheet)) for sheet in sorted(sheets) if season_id(sheet)]
    for sheet, season in seasons:
        used_roles, used_numbers = set(), set()
        for row, value, name, supplied in sheets[sheet]:
            person_id = resolve(sheet, row, name, supplied)
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
    for sheet, category in special.items():
        recognized = set()
        for row, value, name, supplied in sheets[sheet]:
            if value != "Sì":
                jersey(value)  # Legacy numbers are checked but are not season assignments.
            person_id = resolve(sheet, row, name, supplied)
            if person_id in recognized:
                raise ValueError(f"{sheet} riga {row}: riconoscimento duplicato")
            recognized.add(person_id)
            recognitions.append({"personId": person_id, "categoryId": category})

    return {"schemaVersion": 1, "people": sorted(people, key=lambda p: p["personId"])}, {
        "schemaVersion": 1, "seasons": [{"seasonId": season, "label": label} for label, season in seasons],
        "memberships": memberships, "recognitions": recognitions,
    }


def write_json(path, data, check):
    if path.is_file() and json.loads(path.read_text(encoding="utf-8")) == data:
        return
    if check:
        raise ValueError(f"Snapshot non aggiornato: {path.name}")
    content = (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode()
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
    parser.add_argument("--config", type=Path, default=DESTINATION / "categories.json")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Verifica senza modificare i JSON")
    mode.add_argument("--sanitize-to", type=Path, metavar="XLSX", help="Crea la sola copia pubblicabile")
    parser.add_argument("--public-source", action="store_true", help="Accetta solo la copia pubblicabile")
    args = parser.parse_args()
    try:
        archive_path = DESTINATION / "identities.json"
        original = json.loads(archive_path.read_text(encoding="utf-8"))
        previous = json.loads((DESTINATION / "roster.json").read_text(encoding="utf-8"))
        categories = json.loads(args.config.read_text(encoding="utf-8-sig"))
        sheets = read_workbook(args.workbook)
        if args.public_source and args.workbook.read_bytes() != public_workbook(sheets):
            raise ValueError("Usare esclusivamente la copia prodotta da --sanitize-to")
        archive, snapshot = build_import(sheets, original, categories, previous)
        people = {p["personId"]: p for p in archive["people"]}
        if any(people[p["personId"]] != p for p in original["people"]):
            raise ValueError("Identità o contenuto editoriale preesistente modificato")
        for person in people.values():
            for field in ("editorialPath", "imagePath"):
                if field in person and not (SITE / person[field]).is_file():
                    raise ValueError(f"Riferimento editoriale mancante per {person['personId']}")
        if args.sanitize_to:
            with args.sanitize_to.open("xb") as output:
                output.write(public_workbook(sheets))
        else:
            # Identities only grow, so even a failed later write cannot orphan an existing reference.
            write_json(archive_path, archive, args.check)
            write_json(DESTINATION / "roster.json", snapshot, args.check)
            write_json(DESTINATION / "categories.json", categories, args.check)
        print(json.dumps({
            "people": len(archive["people"]), "new": len(archive["people"]) - len(original["people"]),
            "sportsLinks": sum("sportsPlayerId" in p for p in archive["people"]),
            "memberships": len(snapshot["memberships"]), "recognitions": len(snapshot["recognitions"]),
        }))
    except (ValueError, OSError, KeyError, TypeError, BadZipFile, ET.ParseError) as error:
        parser.exit(1, f"Import bloccato. {error}\n")


if __name__ == "__main__":
    main()
