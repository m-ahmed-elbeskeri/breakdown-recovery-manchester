from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Defaults to a local SQLite file so the app runs with zero config; set
    # DATABASE_URL to a hosted Postgres (Neon, Supabase, …) for real use.
    database_url: str = "sqlite:///./local.db"
    admin_api_key: str = "change-me"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:5180,http://localhost:5180"

    # Email alerts on new bookings (via Resend — https://resend.com, free tier).
    # Leave RESEND_API_KEY empty to disable notifications entirely.
    resend_api_key: str = ""
    notify_email_from: str = "onboarding@resend.dev"
    notify_email_to: str = ""

    @property
    def sqlalchemy_url(self) -> str:
        """Normalise common provider URLs to the psycopg (v3) driver."""
        url = self.database_url
        if url.startswith("postgres://"):
            return "postgresql+psycopg://" + url[len("postgres://") :]
        if url.startswith("postgresql://"):
            return "postgresql+psycopg://" + url[len("postgresql://") :]
        return url

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
