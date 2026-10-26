from pathlib import Path
from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore", hide_input_in_errors=True)
    generative_engine_api_key: SecretStr = SecretStr("")
    generative_engine_base_url: str = ""
    generative_engine_model: str = ""
    llm_timeout_seconds: float = Field(default=60, ge=1, le=180)
    cors_origin: str = "http://localhost:5173"
