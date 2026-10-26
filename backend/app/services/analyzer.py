import asyncio
import re
from pydantic import ValidationError
from app.schemas import Analysis, AssessedAnalysis, AnalysisRequest, AnalysisResponse, SECTIONS
from app.providers.base import Provider, ProviderError
from app.services.model_output import validation_error

async def analyze(request: AnalysisRequest, provider: Provider, timeout: float = 60) -> AnalysisResponse:
    try:
        result = AssessedAnalysis.model_validate(await asyncio.wait_for(provider.analyze(request), timeout=timeout))
    except asyncio.TimeoutError:
        raise ProviderError("timeout", "Analysis timed out. Please retry.", 504) from None
    except ValidationError as exc:
        raise validation_error(exc) from None
    warnings, used = [], set()
    # Preserve valid globally unique IDs; reserve them before repairing duplicates.
    reserved = {item.id for section in SECTIONS for item in getattr(result, section) if re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", item.id)}
    for section, prefix in zip(SECTIONS, ("FR", "NFR", "RISK", "ASM", "Q")):
        for index, item in enumerate(getattr(result, section), 1):
            if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", item.id) or item.id in used:
                candidate = f"{prefix}-{index:03}"
                while candidate in used or candidate in reserved:
                    candidate += "-R"
                item.id = candidate
            used.add(item.id)
            supported = [quote for quote in item.evidence if quote.strip() and (quote in request.user_story or quote in request.acceptance_criteria)]
            if item.classification == "explicit" and (not supported or len(supported) != len(item.evidence)):
                item.classification = "inferred"
                warnings.append(f"{item.id}: unsupported explicit evidence; changed to inferred for review.")
            if len(supported) != len(item.evidence):
                warnings.append(f"{item.id}: unsupported evidence removed.")
            item.evidence = supported
    return AnalysisResponse(provider=provider.name, model=provider.model, warnings=warnings, analysis=Analysis.model_validate(result.model_dump(exclude={"story_assessment"})), story_assessment=result.story_assessment)