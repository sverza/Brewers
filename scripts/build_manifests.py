#!/usr/bin/env python3
"""
Genera i manifest statici usati dal sito al posto delle chiamate live
all'API GitHub (api.github.com/repos/.../contents/...), che ha un limite
di 60 richieste/ora per IP non autenticato e viene esaurito facilmente
con più pagine che lo usano in contemporanea.

Produce:
  - partite/manifest.json          -> elenco piatto di tutte le partite
                                       (ricorsivo dentro /partite), con
                                       stagione dedotta dalla cartella o
                                       dal nome del file.
  - articoli_per_news/manifest.json -> elenco dei file al primo livello
                                        di /articoli_per_news (stesso
                                        comportamento delle chiamate che
                                        sostituisce: non ricorsivo).

Questo script viene eseguito automaticamente dalla GitHub Action
.github/workflows/build-manifests.yml ad ogni push che tocca /partite o
/articoli_per_news, quindi i manifest restano sempre allineati al
contenuto del repo senza bisogno di aggiornarli a mano.
"""
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_BASE = 'https://raw.githubusercontent.com/sverza/Brewers/main/'

PARTITE_DIR = REPO_ROOT / 'partite'
ARTICOLI_DIR = REPO_ROOT / 'articoli_per_news'

PARTITE_MANIFEST = PARTITE_DIR / 'manifest.json'
ARTICOLI_MANIFEST = ARTICOLI_DIR / 'manifest.json'

EXCLUDED_PARTITE_FILES = {'calendario.json', 'eventi.json', 'manifest.json'}


def season_from_folder_name(folder_name):
    """Equivalente di seasonFromFolderName() in JS: 'Stagione_2023_24' -> '2023/24'."""
    m = re.search(r'(\d{4})[_-](\d{2,4})', folder_name)
    if not m:
        return folder_name
    start_year = m.group(1)
    end_part = m.group(2)
    if len(end_part) == 4:
        end_part = end_part[-2:]
    return f'{start_year}/{end_part}'


def season_from_filename(file_name):
    """Equivalente di seasonFromFilename() in JS, basato sul prefisso YYYYMMDD."""
    m = re.match(r'^(\d{4})(\d{2})(\d{2})', file_name)
    if not m:
        return None
    year, month = int(m.group(1)), int(m.group(2))
    start_year = year if month >= 7 else year - 1
    return f'{start_year}/{str(start_year + 1)[-2:]}'


def walk_partite(dir_path, season_override=None):
    """Percorre /partite ricorsivamente, replicando walkPartiteDir() lato client."""
    entries = []
    for item in sorted(dir_path.iterdir(), key=lambda p: p.name):
        if item.is_dir():
            season_label = season_override or season_from_folder_name(item.name)
            entries.extend(walk_partite(item, season_label))
        elif item.is_file() and item.name.lower().endswith('.json'):
            if item.name in EXCLUDED_PARTITE_FILES:
                continue
            season = season_override or season_from_filename(item.name) or 'Sconosciuta'
            rel_path = item.relative_to(REPO_ROOT).as_posix()
            entries.append({
                'name': item.name,
                'season': season,
                'download_url': RAW_BASE + rel_path,
            })
    return entries


def build_partite_manifest():
    if not PARTITE_DIR.is_dir():
        print(f'Attenzione: {PARTITE_DIR} non esiste, salto.', file=sys.stderr)
        return []
    files = walk_partite(PARTITE_DIR)
    files.sort(key=lambda f: f['name'])
    return files


def build_articoli_manifest():
    if not ARTICOLI_DIR.is_dir():
        print(f'Attenzione: {ARTICOLI_DIR} non esiste, salto.', file=sys.stderr)
        return []
    entries = []
    for item in sorted(ARTICOLI_DIR.iterdir(), key=lambda p: p.name):
        if not item.is_file():
            continue  # non ricorsivo: replica il comportamento della Contents API a un livello
        if item.name == 'manifest.json':
            continue
        rel_path = item.relative_to(REPO_ROOT).as_posix()
        entries.append({
            'name': item.name,
            'download_url': RAW_BASE + rel_path,
        })
    entries.sort(key=lambda f: f['name'])
    return entries


def write_json(path, data):
    text = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    path.write_text(text, encoding='utf-8')


def main():
    partite = build_partite_manifest()
    write_json(PARTITE_MANIFEST, partite)
    print(f'Scritto {PARTITE_MANIFEST.relative_to(REPO_ROOT)} ({len(partite)} partite)')

    articoli = build_articoli_manifest()
    write_json(ARTICOLI_MANIFEST, articoli)
    print(f'Scritto {ARTICOLI_MANIFEST.relative_to(REPO_ROOT)} ({len(articoli)} file)')


if __name__ == '__main__':
    main()
