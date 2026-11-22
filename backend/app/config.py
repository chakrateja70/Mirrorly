from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret: str
    cors_origins: list[str] = []
    cookie_secure: bool = True  # set false only for plain-http local dev without the Vite proxy
    jwt_days: int = 7
    budget_pin: str = "1234"  # PIN required to change categories and budgets
    groq_api_key: str = ""  # empty = chat assistant disabled
    groq_model: str = "openai/gpt-oss-20b"  # must support structured outputs (json_schema)
    groq_whisper_model: str = "whisper-large-v3-turbo"  # voice messages -> text (multilingual: Hindi, Hinglish, ...)


settings = Settings()
