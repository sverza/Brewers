import unittest
from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

import json

from import_initial_roster import DESTINATION, XML, build_import, read_workbook, worksheet_rows
from roster_workbook import public_workbook

HISTORICAL = "MembriStorici_Al9112026"
CATALOG = json.loads((DESTINATION / "categories.json").read_text(encoding="utf-8"))


def import_roster(sheets, archive):
    return build_import(sheets, archive, CATALOG, {})


class InitialRosterTest(unittest.TestCase):
    def setUp(self):
        self.archive = {
            "schemaVersion": 1,
            "people": [
                {"personId": "alba_bianchi", "name": "Alba Bianchi", "profileSlug": "alba_bianchi",
                 "editorialPath": "roster/stats/alba_bianchi.json", "sportsPlayerId": "p_" + "a" * 24},
                {"personId": "luca_rossi", "name": "Luca Rossi", "profileSlug": "luca_rossi"},
            ],
        }
        self.sheets = {
            "2024-2025": [("1", "50", "Alba Bianchi", ""), ("2", "Coach", "Luca Rossi", "")],
            "2025-2026": [("1", "11", "Alba Bianchi", ""), ("2", "Assistente", "Alba Bianchi", "")],
            "2026-2027": [("1", "0", "Alba Bianchi", "")],
            HISTORICAL: [("1", "50", "Alba Bianchi", "")],
        }

    def test_season_numbers_and_simultaneous_roles(self):
        archive, roster = import_roster(self.sheets, self.archive)
        self.assertEqual(archive, self.archive)
        memberships = [r for r in roster["memberships"] if r["personId"] == "alba_bianchi"]
        self.assertEqual([r["jerseyNumber"] for r in memberships if r["roleId"] == "player"], [50, 11, 0])
        self.assertEqual([r["roleId"] for r in memberships if r["seasonId"] == "2025-26"],
                         ["player", "assistant-coach"])
        self.assertEqual(roster["recognitions"], [{"personId": "alba_bianchi", "categoryId": "historical-member"}])

    def test_import_is_repeatable_and_absence_preserves_identity(self):
        self.sheets["2024-2025"].pop()
        first = import_roster(self.sheets, self.archive)
        self.assertEqual(first, import_roster(self.sheets, first[0]))
        self.assertEqual(first[0], self.archive)
        self.assertNotIn("luca_rossi", {r["personId"] for r in first[1]["memberships"]})
        self.sheets["2026-2027"] = []
        archive, roster = import_roster(self.sheets, self.archive)
        self.assertEqual(archive, self.archive)
        self.assertEqual({r["seasonId"] for r in roster["memberships"]}, {"2024-25", "2025-26"})

    def test_reviewed_new_profile_can_lack_bio_and_statistics(self):
        self.sheets["2026-2027"].append(("2", "8", "Nina Verdi", ""))
        with self.assertRaisesRegex(ValueError, "identità da risolvere"):
            import_roster(self.sheets, self.archive)
        self.sheets["2026-2027"][-1] = ("2", "8", "Nina Verdi", "NUOVO")
        archive, roster = import_roster(self.sheets, self.archive)
        person = next(p for p in archive["people"] if p["name"] == "Nina Verdi")
        self.assertEqual(set(person), {"personId", "name", "profileSlug"})
        self.assertEqual(person["profileSlug"], person["personId"])
        self.assertEqual(import_roster(self.sheets, archive), (archive, roster))

    def test_duplicate_memberships_numbers_and_recognitions_are_rejected(self):
        for sheet, row, error in [
            ("2024-2025", ("3", "4", "Alba Bianchi", ""), "ruolo duplicati"),
            ("2024-2025", ("3", "50", "Luca Rossi", ""), "maglia duplicata"),
            (HISTORICAL, ("2", "1", "Alba Bianchi", ""), "riconoscimento duplicato"),
            ("2026-2027", ("2", "100", "Luca Rossi", ""), "Maglia attesa"),
        ]:
            with self.subTest(row=row):
                sheets = deepcopy(self.sheets)
                sheets[sheet].append(row)
                with self.assertRaisesRegex(ValueError, error):
                    import_roster(sheets, self.archive)

    def test_homonym_and_reused_sports_id_are_rejected(self):
        person = self.archive["people"][0]
        for changes, error in [
            ({"name": "ALBA BIANCHI", "sportsPlayerId": "p_" + "b" * 24}, "Identità ambigua"),
            ({"name": "Nina Verdi"}, "già associato"),
        ]:
            with self.subTest(changes=changes):
                archive = deepcopy(self.archive)
                archive["people"].append({
                    **person, "personId": "extra", "profileSlug": "extra",
                    "editorialPath": "roster/stats/extra.json", **changes,
                })
                with self.assertRaisesRegex(ValueError, error):
                    import_roster(self.sheets, archive)

    def test_workbook_rejects_extra_columns_and_formulas(self):
        for payload, error in [
            ('<c r="D1" t="inlineStr"><is><t>extra</t></is></c>', "attese colonne"),
            ('<c r="A1"><f>1+1</f><v>2</v></c>', "formule"),
        ]:
            with self.subTest(error=error):
                root = ET.fromstring(f'<worksheet xmlns="{XML["m"]}"><sheetData><row r="1">'
                                     f'{payload}</row></sheetData></worksheet>')
                with self.assertRaisesRegex(ValueError, error):
                    worksheet_rows(root, [], "Foglio test")

    def test_future_season_and_configured_recognition_reuse_person(self):
        catalog = deepcopy(CATALOG)
        catalog["currentSeasonId"] = "2027-28"
        catalog["categories"].append({
            "id": "volunteers", "kind": "recognition", "sheet": "Volontari",
            "label": "Volontari", "order": 90,
        })
        self.sheets["2027-2028"] = [("1", "9", "Alba Bianchi", "alba_bianchi")]
        self.sheets[HISTORICAL].append(("2", "Sì", "Luca Rossi", "luca_rossi"))
        self.sheets["Volontari"] = [("1", "Sì", "Alba Bianchi", "alba_bianchi")]
        archive, roster = build_import(self.sheets, self.archive, catalog, {})
        self.assertEqual(archive, self.archive)
        self.assertEqual(roster["seasons"][-1]["seasonId"], "2027-28")
        self.assertIn({"personId": "alba_bianchi", "categoryId": "volunteers"}, roster["recognitions"])
        self.assertIn({"personId": "luca_rossi", "categoryId": "historical-member"}, roster["recognitions"])

    def test_unknown_and_missing_sheets_are_rejected(self):
        _, previous = import_roster(self.sheets, self.archive)
        for name in ("2027-2029", "Volontari"):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "Foglio non riconosciuto"):
                build_import({**self.sheets, name: []}, self.archive, CATALOG, previous)
        del self.sheets["2024-2025"]
        with self.assertRaisesRegex(ValueError, "Excel incompleto"):
            build_import(self.sheets, self.archive, CATALOG, previous)

    def test_changing_number_and_role_preserves_profile_and_bh_id(self):
        _, previous = import_roster(self.sheets, self.archive)
        self.sheets["2024-2025"] = [("1", "33", "Alba Bianchi", "alba_bianchi")]
        self.sheets["2025-2026"] = [("1", "Coach", "Alba Bianchi", "alba_bianchi")]
        archive, roster = build_import(self.sheets, self.archive, CATALOG, previous)
        self.assertEqual(archive, self.archive)
        self.assertEqual(roster["memberships"][0]["jerseyNumber"], 33)
        self.assertEqual(roster["memberships"][1]["roleId"], "coach")
        self.assertNotIn("luca_rossi", {r["personId"] for r in roster["memberships"] + roster["recognitions"]})

    def test_canonical_workbook_round_trips_and_rejects_corruption(self):
        self.sheets[HISTORICAL] = []
        with TemporaryDirectory() as temp:
            path = Path(temp) / "roster.xlsx"
            path.write_bytes(public_workbook(self.sheets))
            self.assertEqual(read_workbook(path), self.sheets)
            self.assertEqual(public_workbook(read_workbook(path)), path.read_bytes())
            with ZipFile(path) as workbook:
                self.assertFalse(any(part.startswith("docProps/") for part in workbook.namelist()))
            path.write_bytes(b"invalid workbook")
            with self.assertRaises(BadZipFile):
                read_workbook(path)


if __name__ == "__main__":
    unittest.main()
