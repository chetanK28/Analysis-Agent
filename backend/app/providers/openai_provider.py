import asyncio
import json
import logging
from pathlib import Path
from urllib.parse import urlsplit
from openai import AsyncOpenAI, APIConnectionError, APITimeoutError, APIStatusError
from pydantic import ValidationError
from app.core.config import Settings
from app.providers.base import ProviderError
from app.schemas import AssessedAnalysis, AnalysisRequest
from app.services.model_output import parse_model_response, validation_error

PROMPT = (Path(__file__).resolve().parents[1] / "prompts" / "analysis_v1.txt").read_text(encoding="utf-8")
logger = logging.getLogger(__name__)

# Never echo upstream text: it may include credentials, headers or source input.
SAFE_UPSTREAM_CODES = {
    "invalid_api_key", "authentication_error", "permission_denied",
    "model_not_found", "unsupported_model", "unsupported_endpoint",
    "unsupported_parameter", "invalid_request_error", "insufficient_quota",
    "quota_exceeded", "rate_limit_exceeded", "server_error",
}

TRANSIENT_STATUSES = {500, 502, 503, 504}
TEMPORARILY_UNAVAILABLE = "GEP is temporarily unavailable; please retry"
NON_RETRYABLE_CODES = SAFE_UPSTREAM_CODES - {"server_error"}


def sanitized_code(exc: APIStatusError) -> str:
    raw_code = getattr(exc, "code", None)
    return raw_code if isinstance(raw_code, str) and raw_code in SAFE_UPSTREAM_CODES else "unrecognized_upstream_error"


def translate_status(exc: APIStatusError) -> ProviderError:
    code = sanitized_code(exc)
    status = exc.status_code
    if status == 401 or code in {"invalid_api_key", "authentication_error"}:
        error = ProviderError("authentication_error", "GEP returned HTTP 401. Check the server URL and authentication scheme in GEP's OpenAI API reference, then check key validity. This adapter currently uses Bearer authentication.", 503)
    elif status == 403 or code == "permission_denied":
        error = ProviderError("access_denied", "GEP returned HTTP 403. Check Studio membership, key permissions, model access and company network policy; confirm the OpenAI API reference server and authentication scheme.", 503)
    elif status == 429 or code in {"insufficient_quota", "quota_exceeded"}:
        error = ProviderError("quota_or_rate_limit", "Capgemini GEP quota or rate limit reached. Check Studio usage, budget and quota, or retry later.", 429)
    elif status == 408:
        error = ProviderError("timeout", "Capgemini GEP timed out. Please retry.", 504)
    elif status in (404, 405, 501) or code in {"model_not_found", "unsupported_model", "unsupported_endpoint"}:
        error = ProviderError("unsupported_model_or_endpoint", "Capgemini GEP could not serve this model or Chat Completions endpoint. Confirm the model ID in Models Catalog and Chat Completions support under the OpenAI API reference server URL.")
    elif status in (400, 422):
        error = ProviderError("unsupported_request", "Capgemini GEP rejected the request. Confirm the model supports Chat Completions, system/user messages and temperature=0 in the company starter kit.")
    elif status in TRANSIENT_STATUSES:
        error = ProviderError("gateway_failure", TEMPORARILY_UNAVAILABLE, 503)
    else:
        error = ProviderError("gateway_failure", "Capgemini GEP returned a gateway failure. Retry later or contact your GEP administrator.")
    logger.warning("GEP upstream status=%s code=%s message=%s", status, code, error.message)
    return error

class OpenAIProvider:
    name = "openai"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.model = settings.generative_engine_model.strip()

        try:
            url = urlsplit(settings.generative_engine_base_url.strip())
            host = (url.hostname or "").lower()
            path = url.path.rstrip("/").lower()

            self.valid_url = (
                url.scheme == "https"
                and host.endswith(".capgemini.com")
                and not url.username
                and not url.password
                and url.port in (None, 443)
                and not url.query
                and not url.fragment
                and "/v2/llm" not in path
                and not path.endswith(
                    ("/invoke", "/responses", "/chat/completions")
                )
            )

        except ValueError:
            self.valid_url = False

        key = settings.generative_engine_api_key.get_secret_value().strip()

        self.enabled = bool(
            key
            and key != "replace_me_locally"
            and self.model
            and self.model != "replace_with_enabled_GEP_model"
            and self.valid_url
        )

    async def analyze(self, request: AnalysisRequest) -> AssessedAnalysis:

        if not self.enabled:
            raise ProviderError(
                "configuration_error",
                "Configure GENERATIVE_ENGINE_API_KEY, GENERATIVE_ENGINE_BASE_URL and an enabled GENERATIVE_ENGINE_MODEL in backend/.env, then restart the backend.",
                503,
            )

        try:

            async with AsyncOpenAI(
                api_key=self.settings.generative_engine_api_key.get_secret_value(),
                base_url=self.settings.generative_engine_base_url.strip(),
                timeout=self.settings.llm_timeout_seconds,
                max_retries=0,
            ) as client:

                for attempt in range(2):
                    try:
                        response = await client.chat.completions.create(
                            model=self.model,
                            messages=[
                                {
                                    "role": "system",
                                    "content": PROMPT,
                                },
                                {
                                    "role": "user",
                                    "content": json.dumps(
                                        request.model_dump(exclude={"provider"})
                                    ),
                                },
                            ],
                            temperature=0,
                        )
                        break
                    except APIStatusError as exc:
                        error = translate_status(exc)  # Log each upstream status and allowlisted code.
                        if attempt == 0 and exc.status_code in TRANSIENT_STATUSES and sanitized_code(exc) not in NON_RETRYABLE_CODES:
                            await asyncio.sleep(0.5)
                            continue
                        raise error from None

                content = response.choices[0].message.content or ""

                return parse_model_response(content)

        except APITimeoutError:
            logger.warning(
                "GEP upstream status=unavailable code=timeout message=Gateway request timed out"
            )

            raise ProviderError(
                "timeout",
                "Capgemini GEP timed out. Please retry.",
                504,
            ) from None

        except APIConnectionError:
            logger.warning(
                "GEP upstream status=unavailable code=connection_error message=Gateway connection failed"
            )

            raise ProviderError(
                "gateway_connection_error",
                "Cannot reach Capgemini GEP. Check the company network, VPN and gateway availability.",
            ) from None

        except APIStatusError as exc:
            raise translate_status(exc) from None

        except ValidationError as exc:
            logger.warning(
                "GEP upstream status=unavailable code=invalid_output message=Schema validation failed"
            )

            raise validation_error(exc) from None
