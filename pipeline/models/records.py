from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field

Tier = Literal["open", "personal"]

class PronunciationRec(BaseModel):
    entry_id: str
    accent: str
    ipa: str | None = None
    audio_url: str | None = None
    audio_source: str | None = None
    source_id: str | None = None
    tier: Tier = "open"

class SenseRec(BaseModel):
    id: str
    entry_id: str
    pos: str | None = None
    sense_order: int
    gloss_vi: str | None = None
    gloss_vi_is_mt: bool = False
    gloss_en: str | None = None
    register: str | None = None
    domain: str | None = None
    source_id: str | None = None

class InflectionRec(BaseModel):
    entry_id: str
    form_text: str
    ipa: str | None = None
    mood: str | None = None
    tense: str | None = None
    person: int | None = None
    number: str | None = None
    gender: str | None = None
    degree: str | None = None
    form_label: str | None = None
    source_id: str | None = None

class RelationRec(BaseModel):
    entry_id: str
    related_entry_id: str | None = None
    related_text: str | None = None
    relation_type: str
    source_id: str | None = None

class ExampleRec(BaseModel):
    sense_id: str | None = None
    entry_id: str | None = None
    text: str
    reading: str | None = None
    translation_vi: str | None = None
    translation_en: str | None = None
    audio_url: str | None = None
    audio_source: str | None = None
    source_id: str | None = None
    tier: Tier = "open"

class ImageRec(BaseModel):
    sense_id: str
    url: str
    thumbnail_url: str | None = None
    source_id: str | None = None
    license: str | None = None
    attribution: str | None = None
    tier: Tier = "open"

class CrossLinkRec(BaseModel):
    from_entry_id: str
    to_entry_id: str | None = None
    from_sense_id: str | None = None
    to_sense_id: str | None = None
    link_type: str = "translation"
    concept_id: str | None = None
    source_id: str | None = None

class EntryRec(BaseModel):
    id: str
    lang: str
    entry_type: Literal["word", "phrase", "idiom", "collocation"] = "word"
    headword: str
    headword_normalized: str
    traditional: str | None = None
    frequency_rank: int | None = None
    frequency_band: str | None = None
    level: str | None = None
    level_is_estimated: bool = False
    etymology: str | None = None
    attributes: dict = Field(default_factory=dict)
    source_id: str | None = None
    provenance: dict = Field(default_factory=dict)
    senses: list[SenseRec] = Field(default_factory=list)
    pronunciations: list[PronunciationRec] = Field(default_factory=list)
    inflections: list[InflectionRec] = Field(default_factory=list)
    relations: list[RelationRec] = Field(default_factory=list)
    examples: list[ExampleRec] = Field(default_factory=list)
    images: list[ImageRec] = Field(default_factory=list)
    cross_links: list[CrossLinkRec] = Field(default_factory=list)
