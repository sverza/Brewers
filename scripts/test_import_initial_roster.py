import unittest
from copy import deepcopy
from xml.etree import ElementTree as ET

from import_initial_roster import HISTORICAL, XML, build_import, worksheet_rows


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
            "2024-2025": [("1", "50", "Alba Bianchi"), ("2", "Coach", "Luca Rossi")],
            "2025-2026": [("1", "11", "Alba Bianchi"), ("2", "Assistente", "Alba Bianchi")],
            "2026-2027": [("1", "0", "Alba Bianchi")],
            HISTORICAL: [("1", "50", "Alba Bianchi")],
        }

    def test_season_numbers_and_simultaneous_roles(self):
        archive, roster = build_import(self.sheets, self.archive)
        self.assertEqual(archive, self.archive)
        memberships = [r for r in roster["memberships"] if r["personId"] == "alba_bianchi"]
        self.assertEqual([r["jerseyNumber"] for r in memberships if r["roleId"] == "player"], [50, 11, 0])
        self.assertEqual([r["roleId"] for r in memberships if r["seasonId"] == "2025-26"],
                         ["player", "assistant-coach"])
        self.assertEqual(roster["recognitions"], [{"personId": "alba_bianchi", "categoryId": "historical-member"}])

    def test_import_is_repeatable_and_absence_preserves_identity(self):
        self.sheets["2024-2025"].pop()
        first = build_import(self.sheets, self.archive)
        self.assertEqual(first, build_import(self.sheets, first[0]))
        self.assertEqual(first[0], self.archive)
        self.assertNotIn("luca_rossi", {r["personId"] for r in first[1]["memberships"]})

    def test_reviewed_new_profile_can_lack_bio_and_statistics(self):
        self.sheets["2026-2027"].append(("2", "8", "Nina Verdi"))
        with self.assertRaisesRegex(ValueError, "Identità da risolvere"):
            build_import(self.sheets, self.archive)
        archive, roster = build_import(self.sheets, self.archive, ["Nina Verdi"])
        self.assertEqual(archive["people"][-1], {
            "personId": "nina_verdi", "name": "Nina Verdi", "profileSlug": "nina_verdi",
        })
        self.assertEqual(build_import(self.sheets, archive), (archive, roster))

    def test_duplicate_memberships_numbers_and_recognitions_are_rejected(self):
        for sheet, row, error in [
            ("2024-2025", ("3", "4", "Alba Bianchi"), "ruolo duplicati"),
            ("2024-2025", ("3", "50", "Luca Rossi"), "maglia duplicata"),
            (HISTORICAL, ("2", "1", "Alba Bianchi"), "riconoscimento duplicato"),
            ("2026-2027", ("2", "100", "Luca Rossi"), "Maglia attesa"),
        ]:
            with self.subTest(row=row):
                sheets = deepcopy(self.sheets)
                sheets[sheet].append(row)
                with self.assertRaisesRegex(ValueError, error):
                    build_import(sheets, self.archive)

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
                    build_import(self.sheets, archive)

    def test_workbook_rejects_extra_columns_and_formulas(self):
        for payload, error in [
            ('<c r="C1" t="inlineStr"><is><t>extra</t></is></c>', "due colonne"),
            ('<c r="A1"><f>1+1</f><v>2</v></c>', "formule"),
        ]:
            with self.subTest(error=error):
                root = ET.fromstring(f'<worksheet xmlns="{XML["m"]}"><sheetData><row r="1">'
                                     f'{payload}</row></sheetData></worksheet>')
                with self.assertRaisesRegex(ValueError, error):
                    worksheet_rows(root, [], "Foglio test")


if __name__ == "__main__":
    unittest.main()
