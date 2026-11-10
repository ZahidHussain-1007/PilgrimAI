"""Shared agent-adapter contracts; snapshots are versioned, additive JSON.
These TypedDicts document data boundaries, not live-provider certifications.
Runtime acceptance is the separate validation gate, not these type annotations.
"""

from typing import Literal, TypedDict


class TempleEvidence(TypedDict, total=False):
    id: str
    name: str
    lat: float
    lng: float
    kind: Literal["temple", "attraction"]
    required: bool
    source: str
    verification: str
    last_verified: str | None
    facts: dict
    windows: dict[str, list[list[int]]]
    hours_basis: str
    visit_minutes: int | None
    effort: str
    nearby: list[dict]
    url: str
    rank_score: float
    classification: str
    reason: str


class AttractionEvidence(TypedDict, total=False):
    id: str | None
    name: str
    url: str
    classification: Literal["scheduled", "optional", "excluded"]
    reason: str
    distance_from_primary_km: float
    straight_line: bool
    rank_score: float
    visit_minutes: int | None


class RouteEvidence(TypedDict, total=False):
    source: str
    estimated: bool
    traffic_live: bool
    km: float | None
    minutes: int | None
    routing_minutes: int | None
    traffic_buffer_percent: float
    traffic_buffer_minutes: int
    url: str
    # from/to are Python keywords only at call sites, not JSON keys.


class HotelEvidence(TypedDict, total=False):
    id: str
    temple_id: str
    name: str
    address: str
    lat: float | None
    lng: float | None
    source_record: str
    source_url: str
    last_verified: str | None
    price_low: float | None
    price_high: float | None
    capacity_per_room: int | None
    extra_bed: bool | None
    requested_rooms: int
    requested_people: int
    requirements_match: bool
    match_status: str
    availability: Literal["unverified", "verified"]
    booking_status: Literal["not_booked", "booked"]
    check_in_minute: int | None
    check_out_minute: int | None
    chargeable_nights: int
    maps_url: str
    verification: str


class RestaurantEvidence(TypedDict, total=False):
    id: str
    temple_id: str
    name: str
    lat: float | None
    lng: float | None
    source_record: str
    source_url: str
    last_verified: str | None
    diet_match: bool
    diet_evidence: str
    windows: dict[str, list[list[int]]]
    price_low: float | None
    price_high: float | None
    verification: str
    availability: Literal["unverified", "verified"]
    maps_url: str


class StayFoodEvidence(TypedDict, total=False):
    hotels: list[HotelEvidence]
    restaurants: list[RestaurantEvidence]
    selected_hotel: HotelEvidence | None
    notes: list[str]
    coordinate_discovery: dict


class BudgetLine(TypedDict):
    category: str
    date: str
    quantity: float
    unit: str
    status: Literal["unknown", "not_required", "catalog_price", "estimated"]
    unit_low: float | None
    unit_high: float | None
    low: float | None
    high: float | None
    source: str | None
    basis: str
    place_id: str | None


class BudgetEvidence(TypedDict, total=False):
    currency: Literal["INR"]
    low: float
    high: float
    complete: bool
    missing: list[str]
    within_cap: bool | None
    total_type: Literal["partial_subtotal", "planning_estimate"]
    per_person: dict
    categories: list[dict]
    daywise: list[dict]
    items: list[BudgetLine]
    confidence: str
    assumptions: list[str]
