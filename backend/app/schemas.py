from typing import Literal
import json
import re
from pathlib import Path
from decimal import Decimal, InvalidOperation
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator, computed_field

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class AnalysisRequest(StrictModel):
    user_story: str = Field(min_length=1, max_length=12000)
    acceptance_criteria: str = Field(default="", max_length=12000)
    context: str = Field(default="", max_length=12000)
    provider: str = Field(default="openai", max_length=40)

    @field_validator("user_story")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("User story must not be blank")
        return value.strip()

class Finding(StrictModel):
    id: str = ""
    title: str = Field(min_length=1, max_length=300)
    description: str = Field(min_length=1, max_length=4000)
    evidence: list[str] = Field(max_length=20)
    classification: Literal["explicit", "inferred"]

class Analysis(StrictModel):
    functional_requirements: list[Finding] = Field(max_length=50)
    non_functional_requirements: list[Finding] = Field(max_length=50)
    risks: list[Finding] = Field(max_length=50)
    assumptions: list[Finding] = Field(max_length=50)
    clarification_questions: list[Finding] = Field(max_length=50)

ASSESSMENT_LABELS = json.loads(Path(__file__).with_name("assessment_labels.json").read_text(encoding="utf-8"))

class StoryAssessment(StrictModel):
    complexity_score: int = Field(strict=True, ge=1, le=5)
    complexity_reasons: list[str] = Field(min_length=1, max_length=10)
    readiness_score: int = Field(strict=True, ge=1, le=5)
    readiness_gaps: list[str] = Field(max_length=20)

    @field_validator("complexity_reasons", "readiness_gaps")
    @classmethod
    def nonblank_items(cls, values):
        if any(not value.strip() or len(value) > 1000 for value in values):
            raise ValueError("Assessment entries must be nonblank and at most 1000 characters")
        return values

    @model_validator(mode="before")
    @classmethod
    def ignore_model_labels(cls, value):
        # Labels are derived, including when validating our own serialized response.
        if isinstance(value, dict):
            return {k: v for k, v in value.items() if k not in {"complexity_label", "readiness_label"}}
        return value

    @field_validator("complexity_score", "readiness_score", mode="before")
    @classmethod
    def safe_integer_score(cls, value):
        if isinstance(value, bool):
            raise ValueError("Score must be an integer from 1 to 5")
        if isinstance(value, str):
            value = value.strip()
            if len(value) > 32 or not re.fullmatch(r"[+-]?[0-9]+(?:\.[0-9]+)?", value):
                raise ValueError("Score must be an integer from 1 to 5")
        if isinstance(value, (str, float, Decimal)):
            try:
                number = Decimal(str(value))
            except InvalidOperation:
                raise ValueError("Score must be an integer from 1 to 5") from None
            if not number.is_finite() or not 1 <= number <= 5 or number != number.to_integral_value():
                raise ValueError("Score must be an integer from 1 to 5")
            return int(number)
        return value

    @computed_field
    @property
    def complexity_label(self) -> str:
        return ASSESSMENT_LABELS["complexity"][str(self.complexity_score)]

    @computed_field
    @property
    def readiness_label(self) -> str:
        return ASSESSMENT_LABELS["readiness"][str(self.readiness_score)]

class AssessedAnalysis(Analysis):
    story_assessment: StoryAssessment

class AnalysisResponse(StrictModel):
    provider: str
    model: str
    status: Literal["draft"] = "draft"
    warnings: list[str]
    analysis: Analysis
    story_assessment: StoryAssessment

SECTIONS = tuple(Analysis.model_fields)
class DocumentTextResponse(StrictModel):
    filename: str
    text: str = Field(min_length=1, max_length=12000)
