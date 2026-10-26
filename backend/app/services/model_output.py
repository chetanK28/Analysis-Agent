"""Parse model output without exposing source content in diagnostics."""
import json
from decimal import Decimal
import re
from pydantic import ValidationError
from app.schemas import AssessedAnalysis, Analysis, Finding, StoryAssessment
from app.providers.base import ProviderError

SAFE_FIELDS = set(Analysis.model_fields) | set(Finding.model_fields) | set(StoryAssessment.model_fields) | {"story_assessment"}

def validation_error(exc: ValidationError) -> ProviderError:
    issues = []
    for error in exc.errors(include_input=False, include_context=False, include_url=False):
        # Never echo arbitrary extra keys or validator messages from model content.
        path = ".".join(str(part) if isinstance(part, int) else part if part in SAFE_FIELDS else "unknown_field" for part in error["loc"]) or "response"
        if error["type"] == "missing":
            reason = "required field is missing"
        elif error["loc"] and error["loc"][-1] in {"complexity_score", "readiness_score"}:
            reason = "must be a whole-number score from 1 to 5"
        else:
            reason = "invalid value or structure"
        issues.append(f"{path}: {reason}")
    return ProviderError("invalid_output", "Model response could not be validated: " + "; ".join(issues[:10]) + ". Please retry.")

def parse_model_response(content: str) -> AssessedAnalysis:
    content = content.strip()
    wrapper = re.fullmatch(r"```(?:json)?[ \t]*\r?\n(.*?)\r?\n?```", content, flags=re.DOTALL | re.IGNORECASE)
    if wrapper:
        content = wrapper.group(1).strip()
    try:
        data = json.loads(content, parse_float=Decimal)
    except ValueError:
        raise ProviderError("invalid_output", "Model response could not be validated: response must contain one complete JSON object. Please retry.") from None
    try:
        return AssessedAnalysis.model_validate(data)
    except ValidationError as exc:
        raise validation_error(exc) from None
