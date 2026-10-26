from typing import Protocol
from app.schemas import AssessedAnalysis, AnalysisRequest

class ProviderError(Exception):
    def __init__(self, code: str, message: str, status: int = 502):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)

class Provider(Protocol):
    name: str
    model: str
    enabled: bool
    async def analyze(self, request: AnalysisRequest) -> AssessedAnalysis: ...