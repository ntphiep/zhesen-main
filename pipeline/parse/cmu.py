from pipeline.models.records import PronunciationRec
import cmudict

# ARPAbet → IPA mapping table
ARPABET_TO_IPA = {
    "AA": "ɑ",
    "AE": "æ",
    "AH": "ʌ",
    "AO": "ɔ",
    "AW": "aʊ",
    "AY": "aɪ",
    "B": "b",
    "CH": "tʃ",
    "D": "d",
    "DH": "ð",
    "EH": "ɛ",
    "ER": "ɝ",
    "EY": "eɪ",
    "F": "f",
    "G": "g",
    "HH": "h",
    "IH": "ɪ",
    "IY": "i",
    "JH": "dʒ",
    "K": "k",
    "L": "l",
    "M": "m",
    "N": "n",
    "NG": "ŋ",
    "OW": "oʊ",
    "OY": "ɔɪ",
    "P": "p",
    "R": "ɹ",
    "S": "s",
    "SH": "ʃ",
    "T": "t",
    "TH": "θ",
    "UH": "ʊ",
    "UW": "u",
    "V": "v",
    "W": "w",
    "Y": "j",
    "Z": "z",
    "ZH": "ʒ",
}

# Lazy cache for cmudict
_cmu_dict: dict[str, list[list[str]]] | None = None


def _get_cmu_dict() -> dict[str, list[list[str]]]:
    """Lazily load and cache the CMU Pronouncing Dictionary."""
    global _cmu_dict
    if _cmu_dict is None:
        _cmu_dict = cmudict.dict()
    return _cmu_dict


def arpabet_to_ipa(phones: list[str]) -> str:
    """Convert a list of ARPAbet phones to IPA string.

    Strips trailing stress digits (0/1/2) from each phone before mapping.
    Unknown phones are skipped.

    Args:
        phones: List of ARPAbet phones, possibly with stress digits.

    Returns:
        Concatenated IPA string.
    """
    ipa_parts: list[str] = []
    for phone in phones:
        # Strip trailing stress digits
        stripped = phone.rstrip("012")
        # Map to IPA if known, otherwise skip
        if stripped in ARPABET_TO_IPA:
            ipa_parts.append(ARPABET_TO_IPA[stripped])
    return "".join(ipa_parts)


def us_pronunciation(headword: str) -> PronunciationRec | None:
    """Look up a headword in the CMU dictionary and return US pronunciation record.

    Args:
        headword: The word to look up.

    Returns:
        PronunciationRec with IPA derived from the first pronunciation variant,
        or None if the headword is not in the dictionary.
    """
    cmu_data = _get_cmu_dict()
    phones_list = cmu_data.get(headword.lower())

    if phones_list is None:
        return None

    # Use the first pronunciation variant
    first_phones = phones_list[0]
    ipa = arpabet_to_ipa(first_phones)

    return PronunciationRec(
        entry_id=f"en:{headword}",
        accent="en-US",
        ipa=ipa,
        source_id="cmudict",
        tier="open",
    )
