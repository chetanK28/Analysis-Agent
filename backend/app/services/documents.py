"""In-memory document extraction. Never include parser exceptions or content in errors."""
import logging
from io import BytesIO
from pathlib import PurePath
from zipfile import ZipFile, BadZipFile
from docx import Document
from docx.table import Table
from pypdf import PdfReader
from app.providers.base import ProviderError

# Parser warnings can include document fragments. Keep application/GEP logs intact.
_pdf_logger = logging.getLogger("pypdf")
_pdf_logger.handlers = [logging.NullHandler()]
_pdf_logger.propagate = False

MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_TEXT_LENGTH = 12000
SCANNED_PDF_MESSAGE = "This PDF does not contain selectable text. Please upload a text-based PDF or paste the user story manually."
CONTENT_TYPES = {
    ".pdf": {"application/pdf", "application/octet-stream"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"},
}

def document_error(code, message, status=422):
    return ProviderError(code, message, status)

def validate_document_type(filename: str, content_type: str) -> str:
    extension = PurePath(filename.lower()).suffix
    if extension == ".doc":
        raise document_error("unsupported_document", "Legacy .doc files are not supported. Save the document as .docx and upload it again.", 415)
    if extension not in CONTENT_TYPES:
        raise document_error("unsupported_document", "Upload a text-based PDF (.pdf) or Word DOCX (.docx) file.", 415)
    if content_type.split(";", 1)[0].lower() not in CONTENT_TYPES[extension]:
        raise document_error("invalid_document_type", "The file content type does not match its extension. Upload a PDF or DOCX file.", 415)
    return extension

def table_text(table):
    for row in table.rows:
        yield " | ".join("\n".join(block.text if not isinstance(block, Table) else "\n".join(table_text(block)) for block in cell.iter_inner_content()) for cell in row.cells)

def extract_document(data: bytes, filename: str, content_type: str) -> str:
    extension = validate_document_type(filename, content_type)
    if len(data) > MAX_FILE_SIZE:
        raise document_error("document_too_large", "The document exceeds the 10 MB limit.", 413)
    if not data:
        raise document_error("empty_document", "The uploaded file is empty.")
    if data.startswith(bytes.fromhex("D0CF11E0A1B11AE1")):
        raise document_error("protected_document", "Password-protected or legacy Word documents are not supported. Upload an unprotected DOCX file.")
    if (extension == ".pdf" and not data.startswith(b"%PDF-")) or (extension == ".docx" and not data.startswith(b"PK\x03\x04")):
        raise document_error("corrupt_document", "The file signature is invalid. Upload a valid PDF or DOCX document.")
    # Suppress library warnings, which may contain fragments of untrusted document data.
    # pypdf reads with strict=True so damaged files fail rather than being repaired.
    try:
        if extension == ".pdf":
            reader = PdfReader(BytesIO(data), strict=True)
            if reader.is_encrypted:
                raise document_error("protected_document", "Password-protected PDFs are not supported. Upload an unprotected PDF.")
            parts = (page.extract_text() or "" for page in reader.pages)
        else:
            with ZipFile(BytesIO(data)) as archive:
                if any(info.flag_bits & 1 for info in archive.infolist()):
                    raise document_error("protected_document", "Password-protected DOCX files are not supported. Upload an unprotected DOCX.")
                if sum(info.file_size for info in archive.infolist()) > 50 * 1024 * 1024:
                    raise document_error("document_too_large", "The expanded DOCX is too large to process. Upload a smaller document.", 413)
                if "word/document.xml" not in archive.namelist():
                    raise BadZipFile()
            document = Document(BytesIO(data))
            parts = (block.text if not isinstance(block, Table) else "\n".join(table_text(block)) for block in document.iter_inner_content())
        chunks, length = [], 0
        for part in parts:
            part = part.strip()
            if part:
                length += len(part) + (1 if chunks else 0)
                if length > MAX_TEXT_LENGTH:
                    raise document_error("document_text_too_long", "Extracted text exceeds 12,000 characters. Upload a shorter document or paste a focused user story manually.")
                chunks.append(part)
        text = "\n".join(chunks)
    except ProviderError:
        raise
    except Exception:
        raise document_error("corrupt_document", "The document could not be read. It may be corrupt or password-protected. Upload a valid, unprotected PDF or DOCX.") from None
    if not text:
        raise document_error("no_extractable_text", SCANNED_PDF_MESSAGE if extension == ".pdf" else "This Word document has no extractable text. Add text or paste the user story manually.")
    return text
