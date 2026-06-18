"""Spanish entry builder — task 3d.1.

Builds EntryRec objects for Spanish headwords using:
  - en.wiktionary.org REST API + HTML scrape (Spanish section, lang="es")
  - verbecc CompleteConjugator for full verb conjugation tables
  - wordfreq for frequency ranking
"""
from __future__ import annotations

import logging
from functools import lru_cache

import wordfreq

from pipeline.models.records import EntryRec, InflectionRec
from pipeline.parse.wiktionary import fetch_wiktionary, parse_wiktionary

try:
    from verbecc import CompleteConjugator, ConjugatorError, VerbNotFoundError
    _CONJ_LIB = "verbecc"
except ImportError:  # pragma: no cover
    raise ImportError("verbecc is required for Spanish conjugation; install it via pip install verbecc")

logger = logging.getLogger(__name__)

_CONJ_SOURCE = "verbecc"

# ---------------------------------------------------------------------------
# Conjugation helpers
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def _conjugator() -> CompleteConjugator:
    """Return a cached CompleteConjugator for Spanish (slow to initialise)."""
    return CompleteConjugator(lang="es")


def conjugate_es(verb: str) -> list[InflectionRec]:
    """Return a full conjugation table for a Spanish verb as InflectionRec objects.

    Covers: indicativo, subjuntivo, imperativo, condicional, infinitivo,
    gerundio, participo.

    One InflectionRec is produced per conjugated pronoun form.  For finite
    moods the ``mood``, ``tense``, ``person`` (1/2/3), ``number``
    ('sing'/'plur'), and ``form_label`` fields are populated.  For non-finite
    moods (infinitivo/gerundio/participo) person/number are left None.

    Args:
        verb: Spanish infinitive (e.g. "hablar").

    Returns:
        List of InflectionRec; empty list if the verb is invalid/unknown.
    """
    entry_id = f"es:{verb}"
    try:
        result = _conjugator().conjugate(verb)
    except (VerbNotFoundError, ConjugatorError) as exc:
        logger.debug("verbecc could not conjugate %r: %s", verb, exc)
        return []

    data = result.get_data()
    moods_data: dict = data.get("moods", {})

    records: list[InflectionRec] = []

    for mood_name, tenses in moods_data.items():
        mood_str = str(mood_name)
        for tense_name, forms in tenses.items():
            tense_str = str(tense_name)
            for form in forms:
                conjugated_list: list[str] = form.get("c", [])
                if not conjugated_list:
                    continue
                # Strip the pronoun prefix — keep only the verb form itself.
                # verbecc returns forms like "yo hablo"; we want "hablo".
                raw_form = conjugated_list[0]
                # For non-finite moods the form IS the bare word
                form_text = _strip_pronoun(raw_form)

                person_raw = form.get("p")
                number_raw = form.get("n")

                # Map verbecc person/number enums to our schema values
                person: int | None = _map_person(person_raw)
                number: str | None = _map_number(number_raw)

                # Derive pronoun label from raw_form for form_label
                pronoun_part = raw_form[: len(raw_form) - len(form_text)].strip()
                if pronoun_part:
                    form_label = f"{mood_str} {tense_str} {pronoun_part}"
                else:
                    form_label = f"{mood_str} {tense_str}"

                records.append(
                    InflectionRec(
                        entry_id=entry_id,
                        form_text=form_text,
                        mood=mood_str,
                        tense=tense_str,
                        person=person,
                        number=number,
                        form_label=form_label,
                        source_id=_CONJ_SOURCE,
                    )
                )

    return records


def _strip_pronoun(raw: str) -> str:
    """Remove the leading pronoun from a conjugated form string.

    verbecc returns strings like "yo hablo" or "nosotros hablamos".
    For the imperativo negative it returns "no habl..." — we keep "no habl..."
    as-is since the negation is part of the form.

    For non-finite forms (infinitivo, gerundio, participo) no pronoun is present;
    the string is returned unchanged.
    """
    # Known Spanish pronouns that verbecc prefixes
    _PRONOUNS = (
        "yo ", "tú ", "vos ", "él ", "ella ", "usted ",
        "nosotros ", "nosotras ", "vosotros ", "vosotras ",
        "ellos ", "ellas ", "ustedes ",
    )
    for pron in _PRONOUNS:
        if raw.startswith(pron):
            return raw[len(pron):]
    return raw


def _map_person(person_raw: object) -> int | None:
    """Map verbecc Person enum value to int 1/2/3, or None."""
    if person_raw is None:
        return None
    s = str(person_raw)
    if s == "1":
        return 1
    if s == "2":
        return 2
    if s == "3":
        return 3
    return None


def _map_number(number_raw: object) -> str | None:
    """Map verbecc Number enum value ('s'/'p') to 'sing'/'plur', or None."""
    if number_raw is None:
        return None
    s = str(number_raw)
    if s == "s":
        return "sing"
    if s == "p":
        return "plur"
    return None


# ---------------------------------------------------------------------------
# Entry builder
# ---------------------------------------------------------------------------


def build_es_entry(word: str) -> EntryRec:
    """Build a Spanish EntryRec from en.wiktionary.org (es section) + verbecc.

    Args:
        word: Lowercase Spanish headword (e.g. "hablar", "casa").

    Returns:
        EntryRec with id=``es:{word}``, lang=``"es"``, senses (gloss_en),
        pronunciations (IPA es-ES/es-419/es), conjugations for verbs, and
        gender attribute for nouns where Wiktionary exposes it.
    """
    raw = fetch_wiktionary(word, lang="es")
    entry = parse_wiktionary(word, raw, lang="es")

    # Attach frequency rank
    try:
        freq = wordfreq.word_frequency(word, "es")
        if freq > 0:
            entry.attributes["frequency"] = freq
    except Exception:
        pass

    # Conjugations: if any sense is a verb, run full conjugation
    is_verb = any(s.pos == "verb" for s in entry.senses)
    if is_verb:
        entry.inflections.extend(conjugate_es(word))

    # Gender: if any sense is a noun and Wiktionary exposed gender in the
    # raw definitions, capture it in attributes.
    _try_capture_gender(entry, raw)

    return entry


def _try_capture_gender(entry: EntryRec, raw: dict) -> None:
    """Best-effort extraction of grammatical gender from raw Wiktionary data.

    Some Wiktionary definition entries expose gender in the definition HTML
    (e.g. "masculine noun"). We do a simple text scan for now.
    """
    for pos_group in raw.get("definitions", []):
        if pos_group.get("partOfSpeech", "").lower() != "noun":
            continue
        for def_item in pos_group.get("definitions", []):
            defn = def_item.get("definition", "").lower()
            if "masculine" in defn and "feminine" not in defn:
                entry.attributes["gender"] = "m"
                return
            if "feminine" in defn and "masculine" not in defn:
                entry.attributes["gender"] = "f"
                return


# ---------------------------------------------------------------------------
# Headword selector
# ---------------------------------------------------------------------------


def select_es_headwords(limit: int) -> list[str]:
    """Return the top-*limit* Spanish headwords from wordfreq, alphabetically sorted.

    Uses ``wordfreq.top_n_list("es", ...)`` to get frequency-ranked candidates,
    filters to lowercase single-word tokens that contain only Spanish letters
    (ASCII letters plus á é í ó ú ñ ü and their capitalised equivalents),
    de-dupes, then returns them sorted alphabetically.

    Args:
        limit: Maximum number of headwords to return.

    Returns:
        Alphabetically sorted list of up to *limit* Spanish headwords.
    """
    candidates = wordfreq.top_n_list("es", limit * 5 + 50)
    seen: set[str] = set()
    result: list[str] = []
    for word in candidates:
        word_lower = word.lower()
        if word_lower in seen:
            continue
        if not _is_valid_es_word(word_lower):
            continue
        seen.add(word_lower)
        result.append(word_lower)
        if len(result) >= limit:
            break
    return sorted(result)


_ES_VALID_CHARS = frozenset(
    "abcdefghijklmnopqrstuvwxyz"
    "áéíóúñü"
)


def _is_valid_es_word(word: str) -> bool:
    """Return True if *word* consists only of valid Spanish letters."""
    return bool(word) and all(ch in _ES_VALID_CHARS for ch in word)
