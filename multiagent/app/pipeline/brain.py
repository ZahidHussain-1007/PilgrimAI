"""Stage 1 - BRAIN (LLM call #1): normalize, rewrite, classify, split subqueries.

The ONLY entry point for understanding. Handles typos/dialects, answers
greetings / help / smalltalk directly (direct_reply), and emits subqueries
for agent-backed categories.
"""
from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.services.llm import LLMUnavailable, complete_json

DIRECT_CATEGORIES = {"greeting", "help_meta", "smalltalk"}

BRAIN_SYSTEM = """
You are the Query Brain of PilgrimAI, a pilgrimage and travel assistant for Telangana.

For every user message you do ALL of these, in one pass:

1) NORMALIZE - silently fix spelling mistakes, repeated letters, and transliteration
   ("hiiii", "helloww", "namaste ga", "yadhadri" -> correct forms). Keep the user's
   language and intent. Never mention the corrections.

2) REWRITE - produce `rewritten_query`: the request as a clean standalone sentence.
   Resolve references (it / there / that temple / the hotel) using recent_history.

3) CLASSIFY - pick exactly one `category`:
   - greeting: hellos in ANY language/script (hi, hello, hiiii, namaste, namaskaram,
     vanakkam, hey, good morning, emoji-only greetings, etc).
     -> fill direct_reply with a warm, short greeting back, in the user's language.
   - help_meta: questions about the assistant itself ("what can you do", "how do I
     use this site", "who are you", "what is this website").
     -> fill direct_reply answering from these capabilities ONLY:
        * temple information from verified temple documents (timings, history,
          festivals, significance, travel info)
        * travel help: distance, duration, fastest routes, directions, transit/bus
          options when available, nearby attractions and temples
        * stay & food: hotels/lodges with booking links, restaurants near a
          temple or city (curated dataset + live map results, clearly labeled)
        * estimated trip budget with ranges (travel, stay, food, temple sevas)
        * safety guidance in emergencies
     Ask nothing else. Be brief and clear.
   - temple_info: questions about a temple/person/festival answered from temple
     records (timings, history, darshan, pooja, festivals, significance, how to
     reach mentioned as info).
   - travel_route: getting from an origin to a destination (distance, duration,
     fastest route, directions, by bus / transit / public transport, walking,
     driving, compare modes).
   - accommodation: WHERE TO STAY - hotels, lodges, rooms, guest houses, stays
     near a temple or in a city ("hotels near Yadadri", "where to stay in
     Warangal", "budget rooms near Bhadrachalam").
   - restaurant: WHERE TO EAT - restaurants, tiffin centers, cafes, veg food
     near a temple or city ("pure veg restaurants near Yadadri", "good food
     near Bhadrachalam").
   - budget: ESTIMATED TRIP COST - total/expected budget with ranges for a
     trip ("budget for Hyderabad to Yadadri", "how much will a 2-day trip
     cost", "trip expenses for family of 4"). Fill `origin` and `destination`
     exactly like travel_route when the trip endpoints are named; keep
     days/persons/stay details in `question` (the budget engine reads them).
   - travel_nearby: things near a place that are NOT stay/food/budget questions
     (nearby temples, attractions, parking, things to do around X, AND
     facilities/emergency needs: hospitals, clinics, pharmacies, police
     stations, ATMs, petrol pumps, bus stations - these get live map
     search). ALWAYS
     fill `destination` with the anchor place name - the place things are
     near - even when the phrasing gives it only as an entity mention
     ("best tourist places near by birla mandir" -> destination="Birla
     Mandir"); never leave it null when a place is named.
   - smalltalk: chitchat, jokes, thanks, or anything outside the capabilities
     above -> fill direct_reply politely and briefly, in the user's language,
     saying what you CAN help with. Never invent facts.
     IMPORTANT: a bare follow-up word in a conversation about a specific
     place (e.g. "contact", "history", "reviews", "timings", "address"
     after earlier turns about Birla Mandir) is a QUESTION ABOUT THAT
     PLACE - classify it as temple_info (entity = that place, question =
     the explicit question, e.g. "What are the contact details of Birla
     Mandir?"), NEVER as smalltalk. "history" means the place's history,
     never chat-log history.
   - emergency: urgent life-threat ONLY and only when no place-relative
     need is expressed ("chest pain", "accident", "ambulance now"). If the
     message asks for a facility relative to a place ("emergency hospital
     near Birla Mandir", "hospital nearby"), it is travel_nearby instead.
   - multi: when the message contains MORE THAN ONE distinct task.
     In that case classify subqueries normally (each gets its real category
     among temple_info / travel_route / travel_nearby / accommodation /
     restaurant / budget) but category = multi.

4) SPLIT - decompose the CURRENT message into `subqueries` (empty for direct
   categories):
   - one task per subquery, ids "q1", "q2", ... in natural reading order
   - `question` must be standalone (no pronouns)
   - `category` per subquery: temple_info | travel_route | travel_nearby |
     accommodation | restaurant | budget
   - travel_route AND budget subqueries MUST fill `origin` and `destination`
     with the user's place names (keep original spellings) when trip endpoints
     are named, and `mode`: "driving" (default), "walking" (walk/foot/pedal),
     or "transit" (bus/train/metro/public transport). If a place is truly
     missing, leave the field null.
   - ENDPOINT CARRYOVER: trip endpoints may be stated in recent_history.
     When the user continues an earlier trip ("im traveling from warangal"
     after "i want to go to birla mandir"), carry the other endpoint forward
     from recent_history - NEVER leave it null and never re-ask for an
     endpoint the conversation already gave.
   - When the user wants to GO somewhere but an endpoint is still missing
     after carryover, emit BOTH: a temple_info subquery describing the named
     place (so the answer leads with real information) AND the travel_route
     subquery with the missing endpoint null (the reply will then ask only
     for that missing detail). Example: "i want to go to yadadri" ->
     temple_info(yadadri) + travel_route(destination=Yadadri, origin=null).
   - `depends_on`: id of an earlier subquery whose RESULT this one needs
     (e.g. "nearby attractions of that temple" after "tell me about Yadadri").
     Most queries have no dependencies.

5) ENTITIES - only concrete mentions (Yadadri, Ramadasu, Bhongir, Hyderabad).
   Generic words (hotel, temple, bus, restaurant) are NOT entities.
   NEVER invent IDs. entity_type: temple | person | festival | landmark | city |
   district | place | location | transport_point | accommodation | restaurant |
   unknown.

6) LANGUAGE - detect `language` as a BCP-47-ish tag (en, te, hi, ta, ur, mixed
   for Hinglish). direct_reply and the final composed answer must be in the
   user's language.

Rules:
- Do NOT answer agent-backed questions yourself; use direct_reply ONLY for
  greeting / help_meta / smalltalk / emergency.
- HARD RULE: if category is temple_info, travel_route, travel_nearby,
  accommodation, restaurant, budget, or multi, you MUST output at least ONE
  subquery. NEVER an empty subqueries list for those categories. Only
  greeting/help_meta/smalltalk/emergency use [].
- recent_history is context: resolve references AND trip endpoints (origin,
  destination, mode, dates) from it. Repeat a previous task only when the
  user refers to it.
- HARD RULE: every subquery MUST be derived from the CURRENT message
  (possibly combined with resolved references). NEVER emit a subquery that
  re-asks a PREVIOUS turn's question just because it appears in
  recent_history. Anaphoric messages ("compare both", "what about the other
  one", "and its timings") are RESOLVED into the current question using
  history — history questions are never copied verbatim into subqueries.
- temple_discover: use when the user asks WHICH/NEAREST/BEST temples near a
  place WITHOUT naming a specific temple ("temples near Hyderabad",
  "nearest temple to Uppal", "best temples for a one-day trip"). Fill
  `origin` with that place. Never use temple_discover when specific temples
  are already named.
- Output ONLY the JSON object matching the schema.

============================================================
EXAMPLES (exact output shape - every field present)
============================================================

Message: "hiiii helloww"
{"language":"en","category":"greeting","rewritten_query":"Hello","direct_reply":"Hello! Welcome to PilgrimAI.","subqueries":[]}

Message: "yadadri temple timings"
{"language":"en","category":"temple_info","rewritten_query":"What are the timings of Yadadri Temple?","direct_reply":null,"subqueries":[{"id":"q1","category":"temple_info","question":"What are the timings of Yadadri Temple?","entities":[{"mention":"Yadadri","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]}]}

Message: "hyderabad to warangal by bus"
{"language":"en","category":"travel_route","rewritten_query":"How do I travel from Hyderabad to Warangal by bus?","direct_reply":null,"subqueries":[{"id":"q1","category":"travel_route","question":"How do I travel from Hyderabad to Warangal by bus?","entities":[],"origin":"Hyderabad","destination":"Warangal","mode":"transit","depends_on":[]}]}

Message: "im traveling from warangal"  (recent_history user turn: "i want to go to birla mandir")
{"language":"en","category":"travel_route","rewritten_query":"I want to travel from Warangal to Birla Mandir, Hyderabad.","direct_reply":null,"subqueries":[{"id":"q1","category":"travel_route","question":"How do I travel from Warangal to Birla Mandir, Hyderabad?","entities":[{"mention":"Birla Mandir","entity_type":"temple"}],"origin":"Warangal","destination":"Birla Mandir","mode":"driving","depends_on":[]}]}

Message: "i want to go to yadadri"
{"language":"en","category":"multi","rewritten_query":"Plan travel to Yadadri Temple and tell me about it.","direct_reply":null,"subqueries":[{"id":"q1","category":"temple_info","question":"Tell me about Yadadri Temple.","entities":[{"mention":"Yadadri","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]},{"id":"q2","category":"travel_route","question":"How do I reach Yadadri Temple?","entities":[],"origin":null,"destination":"Yadadri","mode":"driving","depends_on":[]}]}

Message: "hotels near yadadri temple"
{"language":"en","category":"accommodation","rewritten_query":"Which hotels are near Yadadri Temple?","direct_reply":null,"subqueries":[{"id":"q1","category":"accommodation","question":"Which hotels are near Yadadri Temple?","entities":[{"mention":"Yadadri","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]}]}

Message: "pure veg restaurants near bhadrachalam"
{"language":"en","category":"restaurant","rewritten_query":"Which pure vegetarian restaurants are near Bhadrachalam?","direct_reply":null,"subqueries":[{"id":"q1","category":"restaurant","question":"Which pure vegetarian restaurants are near Bhadrachalam?","entities":[{"mention":"Bhadrachalam","entity_type":"city"}],"origin":null,"destination":null,"mode":null,"depends_on":[]}]}

Message: "budget for hyderabad to yadadri for 2 days with hotel"
{"language":"en","category":"budget","rewritten_query":"What is the estimated budget for a 2-day trip from Hyderabad to Yadadri with hotel?","direct_reply":null,"subqueries":[{"id":"q1","category":"budget","question":"What is the estimated budget for a 2-day trip from Hyderabad to Yadadri with hotel?","entities":[{"mention":"Yadadri","entity_type":"temple"}],"origin":"Hyderabad","destination":"Yadadri","mode":"driving","depends_on":[]}]}

Message: "tell me about yadadri and where to stay there"
{"language":"en","category":"multi","rewritten_query":"Tell me about Yadadri Temple and where to stay near it.","direct_reply":null,"subqueries":[{"id":"q1","category":"temple_info","question":"Tell me about Yadadri Temple.","entities":[{"mention":"Yadadri","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]},{"id":"q2","category":"accommodation","question":"Where to stay near Yadadri Temple?","entities":[{"mention":"Yadadri","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]}]}

Message: "tell me about yadadri and how to reach there from hyderabad"
{"language":"en","category":"multi","rewritten_query":"Tell me about Yadadri Temple and how to reach it from Hyderabad.","direct_reply":null,"subqueries":[{"id":"q1","category":"temple_info","question":"Tell me about Yadadri Temple.","entities":[{"mention":"Yadadri","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]},{"id":"q2","category":"travel_route","question":"How do I reach Yadadri Temple from Hyderabad?","entities":[],"origin":"Hyderabad","destination":"Yadadri","mode":"driving","depends_on":[]}]}

Message: "compare both and give me the best option"  (history: user "accommodation near by dharmapuri", assistant listed "AmruthaVanam Agrifarm Resort" and "GreenAcres Farmstay Retreat")
{"language":"en","category":"multi","rewritten_query":"Compare AmruthaVanam Agrifarm Resort and GreenAcres Farmstay Retreat near Dharmapuri and recommend the better option.","direct_reply":null,"subqueries":[{"id":"q1","category":"accommodation","question":"Compare AmruthaVanam Agrifarm Resort and GreenAcres Farmstay Retreat near Dharmapuri - amenities, rating, price and which is the better option for a family.","entities":[{"mention":"Dharmapuri","entity_type":"city"}],"origin":null,"destination":"Dharmapuri","mode":null,"depends_on":[]}]}

Message: "which temples are best near hyderabad for a one-day family trip"
{"language":"en","category":"temple_discover","rewritten_query":"Which are the nearest best temples to visit from Hyderabad for a one-day family trip?","direct_reply":null,"subqueries":[{"id":"q1","category":"temple_discover","question":"Which temples in our registry are nearest to Hyderabad and suitable for a one-day family trip?","entities":[],"origin":"Hyderabad","destination":null,"mode":"driving","depends_on":[]}]}

Message: "best tourist places near by birla mandir"  (history: "i want to go to birla mandir")
{"language":"en","category":"travel_nearby","rewritten_query":"What are the best tourist places near Birla Mandir, Hyderabad?","direct_reply":null,"subqueries":[{"id":"q1","category":"travel_nearby","question":"What are the best tourist places near Birla Mandir, Hyderabad?","entities":[{"mention":"Birla Mandir","entity_type":"temple"}],"origin":null,"destination":"Birla Mandir","mode":"driving","depends_on":[]}]}

Message: "contact"  (recent_history: tourist places near Birla Mandir, Hyderabad)
{"language":"en","category":"temple_info","rewritten_query":"What are the contact details of Birla Mandir, Hyderabad?","direct_reply":null,"subqueries":[{"id":"q1","category":"temple_info","question":"What are the contact details (phone, email, address, website) of Birla Mandir, Hyderabad?","entities":[{"mention":"Birla Mandir","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]}]}

Message: "history"  (recent_history: contacts of birla mandir)
{"language":"en","category":"temple_info","rewritten_query":"What is the history of Birla Mandir, Hyderabad?","direct_reply":null,"subqueries":[{"id":"q1","category":"temple_info","question":"What is the history of Birla Mandir, Hyderabad?","entities":[{"mention":"Birla Mandir","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]}]}

Message: "reviews of birla mandir"
{"language":"en","category":"temple_info","rewritten_query":"What do reviews say about Birla Mandir, Hyderabad?","direct_reply":null,"subqueries":[{"id":"q1","category":"temple_info","question":"What are the reviews and ratings of Birla Mandir, Hyderabad?","entities":[{"mention":"Birla Mandir","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]}]}

Message: "hospital near birla mandir"  (urgent but GEOGRAPHIC, not life-threat)
{"language":"en","category":"travel_nearby","rewritten_query":"Which hospitals are near Birla Mandir, Hyderabad?","direct_reply":null,"subqueries":[{"id":"q1","category":"travel_nearby","question":"Which hospitals are near Birla Mandir, Hyderabad?","entities":[{"mention":"Birla Mandir","entity_type":"temple"}],"origin":null,"destination":"Birla Mandir","mode":"driving","depends_on":[]}]}

Message: "emergency hospital near birla mandir"  (GEOGRAPHIC despite the word)
{"language":"en","category":"travel_nearby","rewritten_query":"Which hospitals with emergency care are near Birla Mandir, Hyderabad?","direct_reply":null,"subqueries":[{"id":"q1","category":"travel_nearby","question":"Which hospitals with emergency care are near Birla Mandir, Hyderabad?","entities":[{"mention":"Birla Mandir","entity_type":"temple"}],"origin":null,"destination":"Birla Mandir","mode":"driving","depends_on":[]}]}

Message: "miracles and experiences in birla mandir"
{"language":"en","category":"temple_info","rewritten_query":"What miracles and devotee experiences are reported at Birla Mandir, Hyderabad?","direct_reply":null,"subqueries":[{"id":"q1","category":"temple_info","question":"What miracles and devotee experiences are reported at Birla Mandir, Hyderabad?","entities":[{"mention":"Birla Mandir","entity_type":"temple"}],"origin":null,"destination":null,"mode":null,"depends_on":[]}]}

Message: "what can you do"
{"language":"en","category":"help_meta","rewritten_query":"What can you do?","direct_reply":"I can provide verified temple details, help with travel routes, distances and nearby places, and safety guidance.","subqueries":[]}
"""


class BrainEntity(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mention: str
    entity_type: Literal[
        "temple",
        "person",
        "festival",
        "landmark",
        "city",
        "district",
        "place",
        "location",
        "transport_point",
        "accommodation",
        "restaurant",
        "unknown",
    ]


class BrainSubquery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    category: Literal[
        "temple_info",
        "travel_route",
        "travel_nearby",
        "temple_discover",
        "accommodation",
        "restaurant",
        "budget",
    ]
    question: str
    entities: list[BrainEntity] = Field(default_factory=list)
    origin: str | None = None
    destination: str | None = None
    mode: Literal["driving", "walking", "transit"] | None = None
    depends_on: list[str] = Field(default_factory=list)


class BrainResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str
    category: Literal[
        "greeting",
        "help_meta",
        "temple_info",
        "travel_route",
        "travel_nearby",
        "temple_discover",
        "accommodation",
        "restaurant",
        "budget",
        "smalltalk",
        "emergency",
        "multi",
    ]
    rewritten_query: str
    direct_reply: str | None = None
    subqueries: list[BrainSubquery] = Field(default_factory=list)


def _schema() -> dict:
    return BrainResult.model_json_schema()


def understand(
    *,
    message: str,
    history: list[dict] | None = None,
) -> BrainResult:
    payload = {
        "message": message,
        "recent_history": [
            {
                "user": str(turn.get("user", ""))[:500],
                "reply": str(turn.get("reply", ""))[:500],
            }
            for turn in (history or [])
        ],
    }

    raw = complete_json(
        system=BRAIN_SYSTEM,
        payload=payload,
        schema_name="pilgrim_brain",
        schema=_schema(),
    )

    try:
        result = BrainResult.model_validate(raw)
    except ValidationError:
        # one retry with the same strict schema
        raw = complete_json(
            system=BRAIN_SYSTEM,
            payload=payload,
            schema_name="pilgrim_brain",
            schema=_schema(),
        )
        try:
            result = BrainResult.model_validate(raw)
        except ValidationError as exc:
            raise LLMUnavailable(f"brain returned invalid output: {exc}") from exc

    result = _postprocess(result)
    return _drop_stale_subqueries(result, message)


_STOPWORDS = {
    "the", "and", "for", "are", "with", "this", "that", "from", "near",
    "tell", "about", "what", "which", "who", "when", "how", "why", "you",
    "your", "please", "give", "show", "have", "any", "can", "could", "would",
    "should", "will", "them", "they", "their", "there", "here", "into",
    "over", "under", "between", "its", "was", "were", "been", "but",
    "not", "yes", "okay", "ok", "well", "just", "also", "then", "than",
    "our", "out", "get", "got", "let", "us", "one", "two", "more", "most",
    "some", "all", "each", "other", "very", "much", "many", "like",
    "only", "still", "again", "now", "where", "need", "want", "did",
    "does", "doing", "done", "option", "options", "both",
}


def _content_tokens(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(word) >= 3 and word not in _STOPWORDS
    }


def _drop_stale_subqueries(result: BrainResult, message: str) -> BrainResult:
    """v17 (live bug): 'compare both' emitted subqueries for PREVIOUS
    turns' questions (re-asking an old ambulance query). A subquery must
    share >=1 content token with the current message or its rewrite —
    otherwise it belongs to history, not to this turn."""
    if not result.subqueries or result.category in {
        "greeting", "help_meta", "smalltalk",
    }:
        return result
    keep_tokens = _content_tokens(message) | _content_tokens(
        result.rewritten_query
    )
    if not keep_tokens:
        return result
    kept = [
        sq for sq in result.subqueries
        if _content_tokens(sq.question) & keep_tokens
    ]
    if kept:
        if len(kept) != len(result.subqueries):
            dropped = [sq.id for sq in result.subqueries if sq not in kept]
            logger.warning("brain: dropped stale subqueries %s", dropped)
            result = result.model_copy(update={"subqueries": kept})
        return result
    # NOTHING survived: rebuild one honest subquery from the rewrite
    logger.warning("brain: every subquery was stale - rebuilding from rewrite")
    fallback = result.subqueries[0].model_copy(
        update={
            "id": "q1",
            "question": result.rewritten_query or message,
            "depends_on": [],
        }
    )
    return result.model_copy(update={"subqueries": [fallback]})


def _postprocess(result: BrainResult) -> BrainResult:
    """Deterministic guards - no LLM trust."""
    if result.category in DIRECT_CATEGORIES and not (result.direct_reply or "").strip():
        raise LLMUnavailable("brain produced no direct_reply for a direct category")

    if result.category == "emergency" and not (result.direct_reply or "").strip():
        result.direct_reply = None  # caller falls back to the safety policy reply

    seen: set[str] = set()
    cleaned: list[BrainSubquery] = []
    for subquery in result.subqueries:
        sid = subquery.id.strip() or f"q{len(cleaned) + 1}"
        if sid in seen:
            continue
        seen.add(sid)
        subquery.id = sid
        subquery.depends_on = [d for d in subquery.depends_on if d in seen]
        cleaned.append(subquery)
    result.subqueries = cleaned

    # Deterministic repair: a routed single-task category must never carry
    # zero subqueries (models occasionally drop the list). Synthesize one
    # from the rewritten query; never let this become a 503.
    if (
        result.category
        in {
            "temple_info",
            "travel_route",
            "travel_nearby",
            "accommodation",
            "restaurant",
            "budget",
        }
        and not result.subqueries
    ):
        result.subqueries = [
            BrainSubquery(
                id="q1",
                category=result.category,
                question=result.rewritten_query or result.category,
            )
        ]
        cleaned = list(result.subqueries)

    if result.category not in DIRECT_CATEGORIES and result.category != "emergency":
        if not cleaned:
            raise LLMUnavailable("brain produced no subqueries for a routed category")

    return result
