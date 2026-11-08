"""Typed planning boundary. No LLM guesses enter scheduling arithmetic."""

from datetime import date, datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PriceAllowance(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    low: float = Field(ge=0, le=10000000)
    high: float = Field(ge=0, le=10000000)

    @model_validator(mode="after")
    def ordered(self):
        if self.low > self.high:
            raise ValueError("Upper price must not be below lower price.")
        return self


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    temple_ids: list[str] = Field(min_length=1, max_length=23)
    primary_temple_id: str | None = None
    timezone: Literal["Asia/Kolkata"] = "Asia/Kolkata"
    stay_mode: Literal["daily_return", "overnight"] = "daily_return"
    allow_unconfirmed_stay: bool = False
    time_grid_minutes: Literal[1, 5] = 1
    hotel_id: str | None = Field(default=None, max_length=100)
    avoid_climbing: bool = False
    traffic_buffer_percent: float = Field(default=15, ge=0, le=100)
    parking_buffer_minutes: int = Field(default=10, ge=0, le=60)
    meal_minutes: int = Field(default=60, ge=45, le=90)
    daily_travel_limit_minutes: int | None = Field(default=None, ge=30, le=840)
    meal_price_per_person: PriceAllowance | None = None
    tolls_per_day: PriceAllowance | None = None
    parking_per_visit: PriceAllowance | None = None
    miscellaneous_per_day: PriceAllowance | None = None
    origin: str = Field(min_length=2, max_length=160)
    start_date: date
    days: int = Field(default=1, ge=1, le=7)
    departure: str = Field(default="07:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    finish: str = Field(default="21:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    adults: int = Field(default=2, ge=0, le=30)
    children: int = Field(default=0, ge=0, le=30)
    elderly: int = Field(default=0, ge=0, le=30)
    transport: Literal["car", "taxi", "bus", "train"] = "car"
    stay: Literal["none", "hotel", "guest", "dham"] = "none"
    food: Literal["veg", "nonveg", "jain", "any"] = "veg"
    special: Literal["none", "wheel", "elder", "medical"] = "none"
    budget_tier: Literal["low", "mid", "high"] = "mid"
    budget_cap: float | None = Field(default=None, gt=0, le=10000000)
    rooms: int = Field(default=1, ge=1, le=30)
    visit_minutes: int = Field(default=75, ge=30, le=240)
    rest_minutes: int = Field(default=15, ge=0, le=90)
    priorities: list[Literal["darshan", "family", "history", "shakti", "quick"]] = (
        Field(default_factory=list, max_length=5)
    )
    include_attractions: bool = False
    language: Literal["en", "te", "hi"] = "en"
    allow_estimates: bool = False

    @model_validator(mode="after")
    def coherent(self):
        self.origin = self.origin.strip()
        if self.primary_temple_id is None:
            self.primary_temple_id = self.temple_ids[0]
        if self.primary_temple_id not in self.temple_ids:
            raise ValueError("Primary temple must remain selected.")
        if self.stay_mode == "overnight" and (self.days < 2 or self.stay == "none"):
            raise ValueError(
                "Overnight travel requires at least two days and an accommodation preference."
            )
        if len(self.origin) < 2 or len(set(self.temple_ids)) != len(self.temple_ids):
            raise ValueError("Choose distinct temples and a real starting point.")
        if any(not __import__("re").fullmatch(r"T\d{4}", x) for x in self.temple_ids):
            raise ValueError("Invalid catalog temple ID.")
        from pathlib import Path

        if any(
            not (
                Path(__file__).resolve().parents[2]
                / "data"
                / "temples"
                / (tid + ".json")
            ).is_file()
            for tid in self.temple_ids
        ):
            raise ValueError("Choose temples from the supported 23-temple catalog.")
        if self.departure >= self.finish:
            raise ValueError("Daily finish must be later than departure (IST).")
        if self.adults + self.elderly < 1:
            raise ValueError("At least one adult or elderly traveller is required.")
        if self.adults + self.children + self.elderly > 30:
            raise ValueError("At most 30 travellers per plan.")
        if (
            self.start_date
            < datetime.now(timezone(timedelta(hours=5, minutes=30))).date()
        ):
            raise ValueError("Choose today or a future date.")
        return self


class RevisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=800)
    base_version: int = Field(ge=1)
    changes: dict = Field(default_factory=dict)
    confirm: bool = False
