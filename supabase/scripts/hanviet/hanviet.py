"""Rebuilds lex.characters.han_viet (Sino-Vietnamese readings) from Unicode's Unihan
database, at most one reading per character today and empty for most simplified forms.
Unicode License v3 (https://www.unicode.org/license.txt) permits using, copying, modifying
and redistributing Unihan as long as its copyright notice travels with it, which the SQL
this script writes does, in its header comment.

Per character: read kVietnamese; a simplified character with none of its own gets the
union, in order, of its kTraditionalVariant characters' own kVietnamese instead. Unicode
TR#38 documents kVietnamese only as space-delimited with no stated reading order
(https://www.unicode.org/reports/tr38/#kVietnamese), so this script keeps Unihan's own
field order rather than inventing one. An existing reading Unihan does not know about is
kept and Unihan's readings are appended after it; only a character whose merged array
differs from what is on record gets an UPDATE, and no other column is touched.

usage:
  hanviet.py dump-sql --offset N [--limit N]
      Prints the SQL for one page of the current table (char, han_viet), ordered so pages
      tile without gaps or overlap. Run each page with psql on the instance (see
      .claude/rules/database.md) and save its output; an SSM command returns about 24,000
      characters, so read pages of --limit 400 or fewer.
  hanviet.py build --page FILE [--page FILE ...] --out FILE.sql [--zip Unihan.zip]
      Reads the dumped pages plus Unihan (downloaded when --zip is omitted) and writes the
      update statements to FILE.sql.

env: none
"""
import argparse, json, os, sys, urllib.request, zipfile
from io import BytesIO

UNIHAN_URL = 'https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip'
DEFAULT_PAGE = 400


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- current state

def dump_sql(offset, limit):
    """\\t and \\a switch psql to unaligned, tuples-only output: the default aligned format
    pads every row and overflowed the ~24,000-character SSM output cap at 400 rows per page;
    unaligned JSON does not."""
    return (f'\\t\n\\a\nselect json_agg(t) from '
            f'(select char, han_viet from lex.characters order by char limit {limit} offset {offset}) t;\n')


def load_page(path):
    """One page dumped by dump_sql: psql prints a status line and the setting
    echoes before the query result, so the JSON array is read from the first "[" to the
    last "]" rather than from the start of the file."""
    raw = open(path, encoding='utf-8').read()
    i, j = raw.find('['), raw.rfind(']')
    if i < 0 or j < 0:
        raise ValueError(f'{path}: no JSON array in the dump: {raw[:200]!r}')
    return json.loads(raw[i:j + 1])


# ---------------------------------------------------------------- Unihan

def fetch_unihan(path):
    if path and os.path.exists(path):
        return open(path, 'rb').read()
    log('downloading', UNIHAN_URL)
    with urllib.request.urlopen(UNIHAN_URL, timeout=120) as r:
        return r.read()


def parse_unihan(zip_bytes):
    """kVietnamese and kTraditionalVariant for every character, keyed by the character
    itself rather than its "U+XXXX" codepoint."""
    zf = zipfile.ZipFile(BytesIO(zip_bytes))
    kviet, trad = {}, {}
    with zf.open('Unihan_Readings.txt') as fh:
        for raw_line in fh:
            line = raw_line.decode('utf-8').rstrip('\n')
            if not line or line.startswith('#'):
                continue
            cp, field, value = line.split('\t', 2)
            if field == 'kVietnamese':
                kviet[chr(int(cp[2:], 16))] = value.split()
    with zf.open('Unihan_Variants.txt') as fh:
        for raw_line in fh:
            line = raw_line.decode('utf-8').rstrip('\n')
            if not line or line.startswith('#'):
                continue
            cp, field, value = line.split('\t', 2)
            if field == 'kTraditionalVariant':
                trad[chr(int(cp[2:], 16))] = [chr(int(v[2:], 16)) for v in value.split()]
    return kviet, trad


def unihan_readings(char, kviet, trad):
    """char's own kVietnamese, or, when it has none, the union in order of its
    kTraditionalVariant characters' own readings. kTraditionalVariant sometimes lists the
    character alongside its traditional form (乐 -> 乐 樂); that self-reference is dropped
    so a character missing from kviet never falls back to itself."""
    if char in kviet:
        return kviet[char]
    out = []
    for v in trad.get(char, []):
        if v == char:
            continue
        for r in kviet.get(v, []):
            if r not in out:
                out.append(r)
    return out


def merge(existing, new):
    """Existing readings first, then any Unihan reading not already among them. A reading
    already on record that Unihan does not know about is never dropped."""
    existing = existing or []
    return existing + [r for r in new if r not in existing]


def sql_array(readings):
    if not readings:
        return "'{}'"
    return 'array[' + ','.join("'" + r.replace("'", "''") + "'" for r in readings) + ']'


def sql_literal(char):
    return "'" + char.replace("'", "''") + "'"


# ---------------------------------------------------------------- build

def build(pages, zip_path, out_path):
    current = {}
    for p in pages:
        for row in load_page(p):
            current[row['char']] = row.get('han_viet') or []
    kviet, trad = parse_unihan(fetch_unihan(zip_path))
    changed = []
    for char in sorted(current):
        merged = merge(current[char], unihan_readings(char, kviet, trad))
        if merged != current[char]:
            changed.append(f'update lex.characters set han_viet = {sql_array(merged)} where char = {sql_literal(char)};')
    header = [
        '-- Generated by supabase/scripts/hanviet/hanviet.py from Unicode Unihan.',
        '-- Unicode License v3, https://www.unicode.org/license.txt: use, copy, modify and',
        '-- redistribute permitted with this notice; Copyright (c) 1991-2026 Unicode, Inc.',
        '-- Updates lex.characters.han_viet only where it differs from the merge of what is',
        '-- on record with what Unihan adds; no other column, and no existing reading, changes.',
    ]
    with open(out_path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(header + changed) + '\n')
    log(f'{len(current)} characters read, {len(changed)} to update, written to {out_path}')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    d = sub.add_parser('dump-sql')
    d.add_argument('--offset', type=int, default=0)
    d.add_argument('--limit', type=int, default=DEFAULT_PAGE)
    b = sub.add_parser('build')
    b.add_argument('--page', dest='pages', action='append', required=True)
    b.add_argument('--zip', default=None)
    b.add_argument('--out', required=True)
    a = ap.parse_args()
    if a.cmd == 'dump-sql':
        print(dump_sql(a.offset, a.limit))
    else:
        build(a.pages, a.zip, a.out)


if __name__ == '__main__':
    sys.exit(main())
