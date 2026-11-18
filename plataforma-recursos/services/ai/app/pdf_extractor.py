"""Extract and chunk text from PDFs stored in AIP/SIP packages.

Scope of this module (TASK-20):

- extract raw text per page from PDF bytes (package entries), tolerating
  single-page extraction failures;
- sanitize the extracted text against content injection and binary
  artifacts (NFC normalization, control/format character removal);
- split the sanitized document into fixed-size chunks of 500 characters
  with 100 characters of overlap, exposing precise character offsets and
  the page each chunk starts on;
- walk an AIP/SIP ZIP archive and extract only PDF entries living under
  the expected directories (``ficheiros/`` or ``data/ficheiros/``).

This module performs offline ingestion only: it never calls Ollama or any
model, never mutates the FAISS index and has no side effects outside its
return values.  Character offsets always refer to the sanitized text
produced by this module, not to the raw PDF bytes.
"""

from __future__ import annotations

import io
import re
import unicodedata
import zipfile
from dataclasses import dataclass, field

from pypdf import PdfReader
from pypdf.errors import PdfReadError

CHUNK_SIZE = 500
CHUNK_OVERLAP = 100
MAX_PDF_BYTES = 50 * 1024 * 1024  # 50 MiB per PDF entry
MAX_PAGES = 1000

_PDF_SUFFIX = ".pdf"
_ALLOWED_PREFIXES = ("ficheiros/", "data/ficheiros/")
# Reject absolute paths, drive letters, backslash separators and ".." segments.
_SAFE_ENTRY_NAME = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9 ._()/!-]*$")
_CHUNK_STEP = CHUNK_SIZE - CHUNK_OVERLAP

# Removal policy: zero-width Unicode formatting characters vanish; other control,
# surrogate, private-use and unassigned characters (and tab) become spaces;
# line/paragraph separators become newlines.  "\\n" is preserved.
_DROP_CATEGORIES = {"Cf"}
_SPACE_CATEGORIES = {"Cc", "Cs", "Co", "Cn"}


class PdfExtractionError(ValueError):
    """Raised when a PDF cannot be processed at all (corrupt, encrypted, ...)."""


@dataclass(frozen=True)
class PageText:
    """Text of one PDF page (1-based numbering)."""

    number: int
    text: str


@dataclass(frozen=True)
class Chunk:
    """A 500/100 chunk: exact offsets into the sanitized document text."""

    text: str
    start: int
    end: int
    page: int


@dataclass(frozen=True)
class PdfDocument:
    """All sanitized text and chunks of one PDF inside a package."""

    name: str
    pages: list[PageText]
    chunks: list[Chunk] = field(default_factory=list)


@dataclass(frozen=True)
class PackageExtraction:
    """Result of walking one AIP/SIP package."""

    documents: list[PdfDocument]
    skipped: list[tuple[str, str]]


def sanitize_pdf_text(text: str) -> str:
    """Normalize and clean extracted text, removing injection-prone artifacts.

    NFC-normalizes, drops zero-width format characters, maps other control
    characters to spaces (``\\r`` becomes ``\\n``), collapses repeated spaces
    and trims.  Offsets downstream refer to this sanitized form.
    """
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    normalized = unicodedata.normalize("NFC", text)
    kept: list[str] = []
    for char in normalized:
        if char == "\n":
            kept.append(char)
            continue
        category = unicodedata.category(char)
        if category in _DROP_CATEGORIES:
            continue
        if char == "\t" or category in _SPACE_CATEGORIES or category in {"Zl", "Zp"}:
            kept.append(" ")
        else:
            kept.append(char)
    cleaned = "".join(kept)
    cleaned = re.sub(r"[ ]{2,}", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def _page_texts(pdf_bytes: bytes) -> list[PageText]:
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise PdfExtractionError(f"PDF exceeds the {MAX_PDF_BYTES} byte limit")
    if pdf_bytes[:5] != b"%PDF-":
        raise PdfExtractionError("input does not look like a PDF document")
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
        if reader.is_encrypted:
            raise PdfExtractionError("encrypted PDFs are not supported")
        page_count = len(reader.pages)
    except PdfReadError as exc:
        raise PdfExtractionError(f"unreadable PDF structure: {exc}") from exc
    if page_count > MAX_PAGES:
        raise PdfExtractionError(f"PDF has {page_count} pages, limit is {MAX_PAGES}")
    pages: list[PageText] = []
    for number in range(1, page_count + 1):
        try:
            raw = reader.pages[number - 1].extract_text() or ""
        except (PdfReadError, ValueError, KeyError):
            raw = ""
        pages.append(PageText(number=number, text=sanitize_pdf_text(raw)))
    return pages


def chunk_text(
    text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP
) -> list[Chunk]:
    """Split text into chunks of at most ``size`` chars with ``overlap`` chars of overlap.

    Windows advance by ``size - overlap`` characters, so consecutive chunks always
    share exactly ``overlap`` characters (except at document boundaries).  Offsets
    are precise indices into ``text``.
    """
    if overlap < 0 or size <= 0 or overlap >= size:
        raise ValueError("require 0 <= overlap < size")
    total = len(text)
    if total == 0:
        return []
    step = size - overlap
    chunks: list[Chunk] = []
    start = 0
    while start < total:
        end = min(start + size, total)
        chunks.append(Chunk(text=text[start:end], start=start, end=end, page=0))
        if end == total:
            break
        start += step
    return chunks


def _boundaries(pages: list[PageText]) -> tuple[str, list[tuple[int, int]]]:
    """Concatenate page texts and map each text offset to its (1-based) page."""
    parts: list[str] = []
    boundaries: list[tuple[int, int]] = []
    offset = 0
    for page in pages:
        if not page.text:
            continue
        boundaries.append((offset, page.number))
        parts.append(page.text)
        offset += len(page.text) + 2  # "\n\n" separator joins non-empty pages
    return "\n\n".join(parts), boundaries


def _page_for_offset(offset: int, boundaries: list[tuple[int, int]]) -> int:
    page_number = boundaries[0][1]
    for base, candidate in boundaries:
        if base <= offset:
            page_number = candidate
        else:
            break
    return page_number


def extract_pdf_chunks(
    pdf_bytes: bytes, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP
) -> tuple[list[PageText], list[Chunk]]:
    """Extract, sanitize and chunk a single PDF.

    Returns the sanitized per-page texts and the chunks with precise offsets into
    the concatenation ``"\\n\\n".join(page texts)``.  Raises :class:`PdfExtractionError`
    for structurally unusable PDFs (encrypted, not a PDF, oversized, empty).
    """
    pages = _page_texts(pdf_bytes)
    if not pages or not any(page.text for page in pages):
        raise PdfExtractionError("PDF has no extractable text")
    document, boundaries = _boundaries(pages)
    chunks = [
        Chunk(
            text=chunk.text,
            start=chunk.start,
            end=chunk.end,
            page=_page_for_offset(chunk.start, boundaries),
        )
        for chunk in chunk_text(document, size=size, overlap=overlap)
    ]
    return pages, chunks


def _safe_pdf_entry(name: str) -> bool:
    lowered = name.lower()
    if not lowered.endswith(_PDF_SUFFIX) or lowered == _PDF_SUFFIX:
        return False
    if not name.startswith(_ALLOWED_PREFIXES):
        return False
    if not _SAFE_ENTRY_NAME.match(name):
        return False
    return ".." not in name.split("/")


def iter_package_pdfs(package: zipfile.ZipFile) -> list[tuple[str, int]]:
    """List package entries that qualify as ingested PDFs, with their sizes."""
    entries: list[tuple[str, int]] = []
    for info in package.infolist():
        if info.is_dir():
            continue
        if info.filename.lower().endswith(_PDF_SUFFIX) and _safe_pdf_entry(info.filename):
            entries.append((info.filename, info.file_size))
    return entries


def extract_package_pdfs(package_bytes: bytes) -> PackageExtraction:
    """Extract every valid PDF from an AIP/SIP ZIP archive, in memory.

    Entries ending in ``.pdf`` outside the allowed directories, with unsafe names
    (``..``, absolute paths) or that fail extraction are recorded in ``skipped``;
    non-PDF entries are ignored.  The package itself must be a readable ZIP and no
    file is ever written to disk.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(package_bytes)) as archive:
            documents: list[PdfDocument] = []
            skipped: list[tuple[str, str]] = []
            for info in archive.infolist():
                name = info.filename
                if info.is_dir() or not name.lower().endswith(_PDF_SUFFIX):
                    continue
                if not _safe_pdf_entry(name):
                    skipped.append((name, "entry rejected by safety policy"))
                    continue
                if info.file_size > MAX_PDF_BYTES:
                    skipped.append((name, f"entry exceeds {MAX_PDF_BYTES} bytes"))
                    continue
                try:
                    entry_bytes = archive.read(name)
                except (zipfile.BadZipFile, RuntimeError, OSError) as exc:
                    skipped.append((name, f"unreadable entry: {exc}"))
                    continue
                try:
                    pages, chunks = extract_pdf_chunks(entry_bytes)
                except PdfExtractionError as exc:
                    skipped.append((name, str(exc)))
                    continue
                documents.append(PdfDocument(name=name, pages=pages, chunks=chunks))
    except zipfile.BadZipFile as exc:
        raise PdfExtractionError(f"package is not a valid ZIP archive: {exc}") from exc
    return PackageExtraction(documents=documents, skipped=skipped)
