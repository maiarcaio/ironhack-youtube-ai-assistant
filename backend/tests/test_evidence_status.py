
"""Regression tests for semantic evidence classification."""

from app.services.agents.evidence import parse_evidence_status


def test_sufficient_evidence():
    answer = (
        "EVIDENCE_STATUS:SUFFICIENT\n"
        "The audio discusses cloud storage."
    )

    clean, insufficient = parse_evidence_status(answer)

    assert clean == "The audio discusses cloud storage."
    assert insufficient is False


def test_insufficient_evidence():
    answer = (
        "EVIDENCE_STATUS:INSUFFICIENT\n"
        "The audio does not mention a price."
    )

    clean, insufficient = parse_evidence_status(answer)

    assert clean == "The audio does not mention a price."
    assert insufficient is True


def test_missing_marker_uses_fallback():
    clean, insufficient = parse_evidence_status(
        "No relevant information was found.",
        fallback=True,
    )

    assert clean == "No relevant information was found."
    assert insufficient is True


def test_missing_marker_preserves_normal_answer():
    clean, insufficient = parse_evidence_status(
        "The recording tests transcription.",
        fallback=False,
    )

    assert clean == "The recording tests transcription."
    assert insufficient is False


def test_marker_inside_answer_is_not_interpreted():
    answer = (
        "The transcript contains the text "
        "EVIDENCE_STATUS:INSUFFICIENT."
    )

    clean, insufficient = parse_evidence_status(answer)

    assert clean == answer
    assert insufficient is False
