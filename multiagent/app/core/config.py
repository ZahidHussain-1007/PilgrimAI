from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All keys / URLs / flags / rates come from environment (.env). No literals in logic."""

    # --- LLM ---
    groq_api_key_1: str | None = None
    groq_api_key_2: str | None = None
    groq_api_key_3: str | None = None
    groq_api_key_4: str | None = None
    groq_api_key_5: str | None = None
    groq_api_key_6: str | None = None
    # non-Groq providers join the same round-robin pool (v16.1)
    openaikey: str | None = None          # OpenRouter key (sk-or-…)
    google_ai_stdio: str | None = None    # Gemini API key
    openrouter_model: str = "openai/gpt-oss-120b"
    google_model: str = "gemini-2.5-flash"
    groq_model: str = "openai/gpt-oss-120b"

    # --- Session store ---
    redis_host: str = "localhost"
    redis_port: int = 6379
    session_ttl_s: int = 86_400

    # --- OSRM (free, no key) ---
    # Driving uses the public OSRM demo. Walking uses the routed-foot
    # instance: the demo answers "walking" with CAR data (identical 69 km
    # for driving and foot on the same pair), so foot gets its own endpoint.
    osrm_enabled: bool = True
    osrm_url: str = "https://router.project-osrm.org"
    osrm_foot_url: str = "https://routing.openstreetmap.de/routed-foot"
    osrm_timeout_s: float = 5.0

    # --- Nominatim geocoding fallback (registry -> geography -> nominatim) ---
    nominatim_enabled: bool = True
    nominatim_url: str = "https://nominatim.openstreetmap.org"
    nominatim_user_agent: str = "PilgrimAI/1.0"
    nominatim_timeout_s: float = 5.0
    nominatim_min_interval_s: float = 1.1
    # --- Geographic scope (v23.2: configurable, not hardcoded) ---
    # DESTINATION scope: the temple catalogue is Telangana only, so a live
    # geocoder hit outside this box must never become a destination.
    # min_lat,min_lon,max_lat,max_lon. Override with GEO_SCOPE_BBOX.
    geo_scope_bbox: str = "15.6,76.6,20.3,81.5"
    # Set GEO_SCOPE_ENABLED=false to disable destination filtering entirely
    # (only useful if the catalogue itself becomes nationwide).
    geo_scope_enabled: bool = True
    # ORIGIN scope: starting points are nationwide. Origins are resolved
    # against this country only and are never filtered by geo_scope_bbox,
    # otherwise "Mumbai" is silently answered with a Telangana hamlet.
    origin_country: str = "India"
    origin_country_code: str = "in"
    # Bounding box for origin validation: India + sea margin.
    # min_lat,min_lon,max_lat,max_lon. Override with ORIGIN_BBOX.
    origin_bbox: str = "6.5,68.0,37.5,97.5"
    # Append ", <country>" to geocoder queries for origins. Keeps names like
    # "Shirdi" from resolving to a same-named locality inside Telangana.
    origin_append_country: bool = True
    # Minimum nomiatim importance for an origin hit to be accepted when it is
    # the only candidate (guards against resolving a typo to a random hamlet).
    origin_min_importance: float = 0.0

    # --- OpenStreetMap Overpass (keyless nearby search, failover list) ---
    overpass_urls: str = (
        "https://overpass-api.de/api/interpreter,"
        "https://overpass.kumi.systems/api/interpreter,"
        "https://overpass.private.coffee/api/interpreter"
    )
    overpass_timeout_s: float = 6.0
    overpass_radius_m: int = 5000
    overpass_food_radius_m: int = 3000
    overpass_max_pois: int = 6

    # --- Estimates / links (config, not code) ---
    # Travel cost = fuel only, derived from reality: rate = price / mileage.
    # Hyderabad petrol pump price on 2026-10-26: Rs 116.15/L (IOCL via
    # NDTV/Goodreturns/Livemint). Mileage 14 km/L = blended real-world city
    # + highway figure for a typical petrol hatchback/sedan (sources:
    # carsmileage segment tables 13-17, royalsundaram/spinny real-world
    # = ARAI minus 3-5). Excludes tolls, parking, driver charges.
    fuel_price_per_liter: float = 116.15
    vehicle_mileage_kmpl: float = 14.0
    fallback_transit_link: str = "https://www.redbus.in/"

    # --- Budget agent (config, not code) ---
    budget_meals_per_day: int = 3

    @property
    def fuel_cost_per_km(self) -> float:
        """Rupees per km = fuel price per litre / mileage (no magic literal)."""
        return round(self.fuel_price_per_liter / max(self.vehicle_mileage_kmpl, 1.0), 2)

    # --- Search deep-link templates ({query} is replaced at runtime) ---
    hotel_search_link: str = "https://www.booking.com/searchresults.html?ss={query}"
    food_search_link: str = "https://www.google.com/maps/search/?api=1&query={query}"

    # --- Cache TTLs (config, not code) ---
    # v18.2: after a 429, how long a PROVIDER stays out of the pool.
    # User contract: "wait 10-30s, that's it" -> default 20s, tunable
    # in .env via LLM_COOLDOWN_S (seconds).
    llm_cooldown_s: int = 20
    ttl_geocode_s: int = 2_592_000
    ttl_route_s: int = 86_400
    ttl_places_s: int = 86_400
    ttl_negative_s: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
