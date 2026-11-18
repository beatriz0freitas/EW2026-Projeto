"""Tests for PDF extraction, sanitization and chunking from AIP packages (TASK-20)."""

from __future__ import annotations

import io
import zipfile

import pytest
from pypdf import PdfReader, PdfWriter

from app.pdf_extractor import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    MAX_PDF_BYTES,
    PdfDocument,
    PdfExtractionError,
    chunk_text,
    extract_package_pdfs,
    extract_pdf_chunks,
    sanitize_pdf_text,
)


def _escape(text: str) -> str:
    return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _page_objects(page_text: str, page_id: int, content_id: int, font_id: int) -> bytes:
    lines = page_text.split("\n")
    stream_lines = ["BT", "/F1 12 Tf", "72 720 Td"]
    for index, line in enumerate(lines):
        if index:
            stream_lines.append("0 -14 Td")
        stream_lines.append(f"({_escape(line)}) Tj")
    stream_lines.append("ET")
    stream = "\n".join(stream_lines).encode("latin-1")
    page = (
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
    ).encode("latin-1")
    content = b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream)
    return page + b"\n||\n" + content


def _assemble(body_parts: list[bytes]) -> bytes:
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets: list[int] = []
    for number, body in enumerate(body_parts, start=1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % number)
        out.write(body)
        out.write(b"\nendobj\n")
    xref_pos = out.tell()
    count = len(body_parts) + 1
    out.write(b"xref\n0 %d\n" % count)
    out.write(b"0000000000 65535 f \n")
    for offset in offsets:
        out.write(b"%010d 00000 n \n" % offset)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (count, xref_pos))
    return out.getvalue()


def _build_pdf(*page_texts: str) -> bytes:
    """Handcraft a minimal, valid PDF with one page per given text (no deps)."""
    count = len(page_texts)
    font_id = 3 + 2 * count
    bodies: list[bytes] = [b"<< /Type /Catalog /Pages 2 0 R >>"]
    kids = b" ".join(b"%d 0 R" % (3 + 2 * index) for index in range(count))
    bodies.append(b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, count))
    for index, page_text in enumerate(page_texts):
        page_id = 3 + 2 * index
        content_id = 4 + 2 * index
        for part in _page_objects(page_text, page_id, content_id, font_id).split(b"\n||\n"):
            bodies.append(part)
    bodies.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    return _assemble(bodies)


def _encrypted_pdf(source: bytes) -> bytes:
    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(source)))
    writer.encrypt("segredo")
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def _package(*entries: tuple[str, bytes]) -> bytes:
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, payload in entries:
            archive.writestr(name, payload)
    return out.getvalue()


LONG_TEXT = "palavra" * 400  # 2800 chars, forces several overlapping windows


class TestSanitization:
    def test_removes_control_and_format_characters(self) -> None:
        dirty = "linha\x00um\u200b\x08dois\xadtr\u2028\u202es fim"
        cleaned = sanitize_pdf_text(dirty)
        assert "\x00" not in cleaned
        assert "\u200b" not in cleaned
        assert "\u202e" not in cleaned
        assert "linha um dois" in cleaned

    def test_keeps_newlines_and_tabs_become_spaces(self) -> None:
        cleaned = sanitize_pdf_text("a\tb\nc\r\nd")
        assert "\n" in cleaned
        assert "\t" not in cleaned
        assert cleaned == "a b\nc\nd"

    def test_unicode_nfc_normalization(self) -> None:
        Decomposed = "e\u0301"  # decomposed accented E-acute
        assert sanitize_pdf_text(f"caf{Decomposed}") == "caf\u00e9"

    def test_collapses_whitespace_runs(self) -> None:
        assert sanitize_pdf_text("a   b\n\n\n\nc") == "a b\n\nc"


class TestChunking:
    def test_chunks_have_exact_offsets_and_overlap(self) -> None:
        chunks = chunk_text(LONG_TEXT)
        assert all(len(chunk.text) <= CHUNK_SIZE for chunk in chunks)
        assert all(len(chunk.text) == CHUNK_SIZE for chunk in chunks[:-1])
        for previous, current in zip(chunks, chunks[1:], strict=False):
            assert current.start == previous.start + CHUNK_SIZE - CHUNK_OVERLAP
            assert previous.text[-CHUNK_OVERLAP:] == current.text[:CHUNK_OVERLAP]
        for chunk in chunks:
            assert chunk.text == LONG_TEXT[chunk.start : chunk.end]

    def test_short_text_single_chunk(self) -> None:
        chunks = chunk_text("pequeno")
        assert len(chunks) == 1
        assert (chunks[0].start, chunks[0].end) == (0, 7)

    def test_empty_text_no_chunks(self) -> None:
        assert chunk_text("") == []

    def test_invalid_parameters_rejected(self) -> None:
        with pytest.raises(ValueError):
            chunk_text(LONG_TEXT, size=0)
        with pytest.raises(ValueError):
            chunk_text(LONG_TEXT, size=100, overlap=100)
        with pytest.raises(ValueError):
            chunk_text(LONG_TEXT, overlap=-1)


class TestExtraction:
    def test_extracts_single_page_text(self) -> None:
        pages, chunks = extract_pdf_chunks(_build_pdf("Relatorio anual", "Segunda linha"))
        assert [page.text for page in pages] == ["Relatorio anual", "Segunda linha"]
        document = "\n\n".join(page.text for page in pages)
        assert len(chunks) == 1
        assert chunks[0].text == document
        assert (chunks[0].start, chunks[0].end, chunks[0].page) == (0, len(document), 1)

    def test_chunk_pages_follow_page_boundaries(self) -> None:
        filler = "x" * 300
        pages, chunks = extract_pdf_chunks(_build_pdf(filler, filler, filler))
        assert len(pages) == 3
        # Two pages fill the first chunk (300 + 2 + 300 = 602 > 500), so the second
        # chunk must start on page 2 within the duplicated tail material.
        assert chunks[0].page == 1
        assert chunks[-1].page in {2, 3}
        for chunk in chunks:
            assert chunk.text  # no empty chunks

    def test_offsets_and_page_attribution_are_consistent(self) -> None:
        filler = "y" * 300
        pages, chunks = extract_pdf_chunks(_build_pdf(filler, filler, filler, filler))
        boundaries: list[tuple[int, int]] = []
        offset = 0
        for page in pages:
            boundaries.append((offset, page.number))
            offset += len(page.text) + 2
        for chunk in chunks:
            expected = max((base for base, page in boundaries if base <= chunk.start), default=0)
            page_number = next(page for base, page in boundaries if base == expected)
            assert chunk.page == page_number

    def test_pdf_without_text_is_rejected(self) -> None:
        with pytest.raises(PdfExtractionError, match="no extractable text"):
            extract_pdf_chunks(_build_pdf(""))

    def test_corrupt_input_is_rejected(self) -> None:
        with pytest.raises(PdfExtractionError):
            extract_pdf_chunks(b"isto nao e um pdf")
        with pytest.raises(PdfExtractionError):
            extract_pdf_chunks(b"%PDF-1.4 lixo estruturado")

    def test_encrypted_pdf_is_rejected(self) -> None:
        encrypted = _encrypted_pdf(_build_pdf("conteudo classificado"))
        assert PdfReader(io.BytesIO(encrypted)).is_encrypted
        with pytest.raises(PdfExtractionError, match="encrypted"):
            extract_pdf_chunks(encrypted)

    def test_oversized_pdf_is_rejected_without_parsing(self) -> None:
        with pytest.raises(PdfExtractionError, match="byte limit"):
            extract_pdf_chunks(b"%PDF-" + b"0" * MAX_PDF_BYTES)


class TestPackageWalker:
    def test_extracts_valid_pdfs_and_skips_others(self) -> None:
        package = _package(
            ("ficheiros/relatorio.pdf", _build_pdf("Conteudo publico")),
            ("data/ficheiros/arquivado.pdf", _build_pdf("Conteudo do AIP")),
            ("ficheiros/roto.pdf", b"%PDF-1.4 corrompido"),
            ("metadata.json", b"{}"),
            ("ficheiros/nota.txt", b"texto simples"),
        )
        result = extract_package_pdfs(package)
        assert isinstance(result.documents[0], PdfDocument)
        names = sorted(doc.name for doc in result.documents)
        assert names == ["data/ficheiros/arquivado.pdf", "ficheiros/relatorio.pdf"]
        assert all(doc.chunks for doc in result.documents)
        skipped = dict(result.skipped)
        assert "ficheiros/roto.pdf" in skipped
        assert len(skipped) == 1

    def test_rejects_dangerous_and_out_of_place_entries(self) -> None:
        package = _package(
            ("ficheiros/../../etc/passwd.pdf", b"%PDF-1.4"),
            ("segredos/outro.pdf", _build_pdf("x" * 50)),
            ("ficheiros/sem-autorizacao.pdf", _build_pdf("conteudo")),
        )
        result = extract_package_pdfs(package)
        assert [doc.name for doc in result.documents] == ["ficheiros/sem-autorizacao.pdf"]
        assert len(result.skipped) == 2

    def test_uppercase_extension_is_accepted(self) -> None:
        package = _package(("ficheiros/MAIUSCULAS.PDF", _build_pdf("texto")))
        result = extract_package_pdfs(package)
        assert [doc.name for doc in result.documents] == ["ficheiros/MAIUSCULAS.PDF"]

    def test_invalid_zip_archive_is_rejected(self) -> None:
        with pytest.raises(PdfExtractionError, match="not a valid ZIP"):
            extract_package_pdfs(b"isto nao e um zip")

    def test_package_without_pdfs_is_empty(self) -> None:
        package = _package(("metadata.json", b"{}"), ("ficheiros/vazio/", b""))
        result = extract_package_pdfs(package)
        assert result.documents == []
        assert result.skipped == []
