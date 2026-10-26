"""Disable real environment-file loading before app import; all LLM tests are offline."""
import os
from app.core.config import Settings

Settings.model_config["env_file"] = None
os.environ["GENERATIVE_ENGINE_API_KEY"] = ""
os.environ["GENERATIVE_ENGINE_MODEL"] = ""
os.environ["GENERATIVE_ENGINE_BASE_URL"] = "https://openai.generative.engine.capgemini.com/v1"
