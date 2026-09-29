import pytest
from app.normalizer import normalize_subtitle_text, canonical_key_text


def test_normalize_empty_and_whitespace():
    assert normalize_subtitle_text("") == ""
    assert normalize_subtitle_text("   \n\t  ") == ""


def test_normalize_html_tags_and_entities():
    raw = '<font color="#ffff00">Du wei&szlig;t doch &uuml;berhaupt nicht,</font><br>wovon du redest!'
    normalized = normalize_subtitle_text(raw)
    assert normalized == "Du weißt doch überhaupt nicht, wovon du redest!"


def test_normalize_dialogue_dashes_and_newlines():
    raw = "- Hallo, Naruto!\n- Wie geht es dir?"
    # Leading dash removed, multi-newlines collapsed into single space
    normalized = normalize_subtitle_text(raw)
    assert normalized == "Hallo, Naruto! - Wie geht es dir?"


def test_canonical_key_text():
    raw1 = "  Du weißt doch überhaupt nicht, wovon du redest...  "
    raw2 = '„Du weißt doch überhaupt nicht, wovon du redest!“'
    assert canonical_key_text(raw1) == canonical_key_text(raw2)
    assert canonical_key_text(raw1) == "du weißt doch überhaupt nicht, wovon du redest"
