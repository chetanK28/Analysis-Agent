from fastapi import APIRouter, Depends, Request
from starlette.formparsers import MultiPartParser, MultiPartException
from starlette.concurrency import run_in_threadpool
from app.services.documents import MAX_FILE_SIZE, extract_document, document_error
from app.core.config import Settings
from app.providers.base import ProviderError
from app.providers.openai_provider import OpenAIProvider
from app.schemas import AnalysisRequest, AnalysisResponse, DocumentTextResponse
from app.services.analyzer import analyze

router = APIRouter()
def get_settings():
    return Settings()
def get_providers(settings: Settings = Depends(get_settings)):
    return {"openai": OpenAIProvider(settings)}

@router.get("/health")
def health():
    return {"status": "ok"}

@router.get("/api/v1/providers")
def providers(registry=Depends(get_providers)):
    return [{"id": name, "model": provider.model, "enabled": provider.enabled} for name, provider in registry.items()]

@router.post("/api/v1/analyze", response_model=AnalysisResponse)
async def analyze_route(request: AnalysisRequest, registry=Depends(get_providers), settings: Settings = Depends(get_settings)):
    provider = registry.get(request.provider)
    if provider is None:
        raise ProviderError("unknown_provider", "Select a listed provider.", 400)
    return await analyze(request, provider, settings.llm_timeout_seconds)

@router.post("/api/v1/documents/extract", response_model=DocumentTextResponse, openapi_extra={
    "requestBody": {"required": True, "content": {"multipart/form-data": {
        "schema": {"type": "object", "required": ["file"], "properties": {
            "file": {"type": "string", "format": "binary"}
        }}
    }}}
})
async def extract_document_route(request: Request):
    # Bound the complete multipart stream, including metadata, before it can spill
    # to disk. Files remain below the in-memory spool threshold for the whole request.
    body_limit = MAX_FILE_SIZE + 64 * 1024
    class MemoryParser(MultiPartParser):
        spool_max_size = body_limit + 1

    async def bounded_stream():
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > body_limit:
                raise MultiPartException("upload_too_large")
            yield chunk

    if not request.headers.get("content-type", "").lower().startswith("multipart/form-data"):
        raise document_error("invalid_upload", "Upload the document as multipart form data with a file field.", 415)
    try:
        form = await MemoryParser(request.headers, bounded_stream(), max_files=1, max_fields=0).parse()
    except MultiPartException as exc:
        if exc.message == "upload_too_large":
            raise document_error("document_too_large", "The document exceeds the 10 MB limit.", 413) from None
        raise document_error("invalid_upload", "Upload one PDF or DOCX document in the file field.", 400) from None
    except Exception:
        raise document_error("invalid_upload", "The multipart upload could not be read. Please select the file again.", 400) from None
    try:
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            raise document_error("invalid_upload", "Select one file to upload in the file field.", 400)
        data = await upload.read(MAX_FILE_SIZE + 1)
        text = await run_in_threadpool(extract_document, data, upload.filename or "", upload.content_type or "")
        # Filename is display metadata; never used as a filesystem path.
        filename = (upload.filename or "document").replace("\\", "/").rsplit("/", 1)[-1]
        return DocumentTextResponse(filename=filename, text=text)
    finally:
        await form.close()
