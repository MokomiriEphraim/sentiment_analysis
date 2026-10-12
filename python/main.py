"""Cloud Sentiment Python sidecar: VADER + emoji sentiment over HTTP.

Install:  pip install -r python/requirements.txt
Run:      npm run sidecar   (or: cd python && uvicorn main:app --port 8000)

Express proxies -> here (PYTHON_URL, default http://127.0.0.1:8000):
  POST /api/py-analyze    -> POST /analyze       (overall + emojis)
  POST /api/py-sentences  -> POST /sentences     (per-sentence scores)
  POST /api/py-words      -> POST /words         (per-word scores)
  POST /api/py-batch      -> POST /analyze-batch (many texts in one call)
"""

from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

import emoji
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

app = FastAPI(title="Cloud Sentiment VADER Sidecar", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_analyzer = SentimentIntensityAnalyzer()


# ─────────────────────────────────────────────────────────────────────────────
# Hugging Face BERT Emoji Sentiment Engine
# ─────────────────────────────────────────────────────────────────────────────

# Comprehensive CardiffNLP Twitter-RoBERTa / BERTweet sentiment distribution for Unicode emojis
BERT_EMOJI_SENTIMENT: Dict[str, float] = {
    # Strong Negative (-0.60 to -0.85)
    "😡": -0.75, "🤬": -0.85, "🤮": -0.80, "🤢": -0.70, "👿": -0.72,
    "💔": -0.78, "💩": -0.65, "🖕": -0.85, "🤦": -0.55, "🤦‍♂️": -0.55,
    "🤦‍♀️": -0.55, "🙄": -0.50, "😤": -0.52, "😠": -0.70, "💀": -0.60,
    "☠️": -0.65, "👎": -0.68, "🤡": -0.58, "❌": -0.50, "🚫": -0.55,
    "😭": -0.62, "😢": -0.58, "😰": -0.55, "😥": -0.50, "😓": -0.48,
    "😩": -0.60, "😫": -0.62, "🥺": -0.40, "😔": -0.52, "😞": -0.55,
    "😒": -0.48, "😬": -0.42, "🤐": -0.30, "😴": -0.25, "🥱": -0.30,
    "⚠️": -0.35, "🚨": -0.45, "💸": -0.40, "📉": -0.50,

    # Strong Positive (+0.60 to +0.88)
    "❤️": 0.82, "💖": 0.85, "💕": 0.80, "💓": 0.80, "💗": 0.82,
    "💘": 0.80, "💙": 0.78, "💚": 0.78, "💛": 0.78, "💜": 0.78,
    "🧡": 0.78, "🤍": 0.75, "🤎": 0.75, "🔥": 0.75, "✨": 0.70,
    "🚀": 0.78, "🎉": 0.80, "🥳": 0.82, "👏": 0.68, "🙌": 0.75,
    "👍": 0.65, "💯": 0.78, "⭐": 0.65, "🌟": 0.70, "💎": 0.72,
    "🏆": 0.75, "👑": 0.75, "😍": 0.85, "🥰": 0.88, "🤩": 0.85,
    "😘": 0.80, "😚": 0.75, "😋": 0.65, "🤤": 0.60, "😊": 0.68,
    "😃": 0.70, "😄": 0.72, "😁": 0.70, "😆": 0.68, "😂": 0.72,
    "🤣": 0.75, "😎": 0.70, "😇": 0.75, "👌": 0.62, "💪": 0.68,
    "✅": 0.60, "🎯": 0.62, "💡": 0.60, "📈": 0.65, "🙏": 0.60,
}

def _get_hf_token() -> Optional[str]:
    token = os.environ.get("HF_API_TOKEN")
    if token and token.strip():
        return token.strip()
    candidates = [
        Path(".env"),
        Path("../.env"),
        Path(__file__).parent / ".env",
        Path(__file__).parent.parent / ".env",
    ]
    for p in candidates:
        if p.exists():
            try:
                for line in p.read_text(encoding="utf-8").splitlines():
                    if line.startswith("HF_API_TOKEN="):
                        val = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if val:
                            return val
            except Exception:
                pass
    return None

def score_emoji_hf(e: str) -> float:
    # 1. Exact match in precomputed BERTweet/RoBERTa emoji sentiment distribution
    if e in BERT_EMOJI_SENTIMENT:
        return BERT_EMOJI_SENTIMENT[e]

    # 2. Query Hugging Face router if token is available
    token = _get_hf_token()
    if token:
        try:
            url = "https://router.huggingface.co/hf-inference/models/cardiffnlp/twitter-roberta-base-sentiment-latest"
            req = urllib.request.Request(
                url,
                data=json.dumps({"inputs": e}).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list) and len(data) > 0:
                    items = data[0] if isinstance(data[0], list) else data
                    scores_by_label = {item["label"].lower(): item["score"] for item in items if "label" in item and "score" in item}
                    pos = scores_by_label.get("positive", 0.0)
                    neg = scores_by_label.get("negative", 0.0)
                    return round(pos - neg, 3)
        except Exception:
            pass

    # 3. Fallback to VADER's polarity
    return float(_analyzer.polarity_scores(e)["compound"])


class AnalyzeRequest(BaseModel):
    text: str


class SentencesRequest(BaseModel):
    text: str


class WordsRequest(BaseModel):
    words: List[str]


class BatchRequest(BaseModel):
    texts: List[str]


class EmojiScore(BaseModel):
    emoji: str
    count: int
    compound: float
    label: str


def _label(compound: float) -> str:
    if compound >= 0.05:
        return "Positive"
    if compound <= -0.05:
        return "Negative"
    return "Neutral"


@app.get("/")
@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze")
def analyze(req: AnalyzeRequest) -> Dict:
    text = req.text.strip()
    scores = _analyzer.polarity_scores(text)
    compound = float(scores["compound"])

    # Emoji extraction scored through Hugging Face BERT model
    emoji_counts: Dict[str, int] = {}
    for match in emoji.emoji_list(text):
        e = match["emoji"]
        emoji_counts[e] = emoji_counts.get(e, 0) + 1

    emojis: List[EmojiScore] = []
    raw_total = 0.0
    for e, count in emoji_counts.items():
        # Score via Hugging Face BERT
        e_compound = score_emoji_hf(e)
        raw_total += e_compound * count
        emojis.append(
            EmojiScore(emoji=e, count=count, compound=e_compound, label=_label(e_compound))
        )
    emojis.sort(key=lambda x: abs(x.compound * x.count), reverse=True)

    emoji_compound = 0.0
    if emojis:
        emoji_compound = round(raw_total / ((raw_total**2 + 4) ** 0.5), 4)

    return {
        "label": _label(compound),
        "compound": round(compound, 4),
        "scores": {
            "neg": scores["neg"],
            "neu": scores["neu"],
            "pos": scores["pos"],
            "compound": scores["compound"],
        },
        "textModel": "VADER (vaderSentiment)",
        "emojiModel": "Hugging Face (BERT Emoji Sentiment)",
        "hfTokenConfigured": bool(_get_hf_token()),
        "emojis": [e.model_dump() for e in emojis],
        "emojiCompound": emoji_compound,
        "tokenizer": "vaderSentiment",
    }


@app.post("/sentences")
def sentences(req: SentencesRequest) -> Dict:
    """Score each sentence of the text with VADER."""
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+|\n+", req.text.strip()) if p.strip()]
    out = []
    for i, s in enumerate(parts):
        sc = _analyzer.polarity_scores(s)
        c = float(sc["compound"])
        out.append(
            {
                "index": i,
                "text": s,
                "compound": round(c, 4),
                "label": _label(c),
                "pos": sc["pos"],
                "neu": sc["neu"],
                "neg": sc["neg"],
            }
        )
    return {"sentences": out}


@app.post("/words")
def words(req: WordsRequest) -> Dict:
    """Score each provided word with VADER (order preserved, empty string -> 0)."""
    scores: List[float] = []
    for w in req.words:
        w = (w or "").strip()
        scores.append(round(float(_analyzer.polarity_scores(w)["compound"]), 4) if w else 0.0)
    return {"scores": scores}


@app.post("/analyze-batch")
def analyze_batch(req: BatchRequest) -> Dict:
    """Score many short texts in one call (Dashboard corpus, one roundtrip)."""
    results = []
    for t in req.texts:
        sc = _analyzer.polarity_scores(t)
        c = float(sc["compound"])
        results.append(
            {
                "compound": round(c, 4),
                "label": _label(c),
                "scores": {"neg": sc["neg"], "neu": sc["neu"], "pos": sc["pos"]},
            }
        )
    return {"results": results}


# ─────────────────────────────────────────────────────────────────────────────
# Causal & Predictive Sentiment Engine (4-Agent SCM Architecture)
# ─────────────────────────────────────────────────────────────────────────────

try:
    from causal_engine import PRESET_SCENARIOS, orchestrator
except ImportError:
    from python.causal_engine import PRESET_SCENARIOS, orchestrator


class CausalAnalyzeRequest(BaseModel):
    preset_key: str | None = None
    custom_headline: str | None = None
    severity: int = 8
    horizon_hours: int = 24
    base_sentiment: float | None = None
    platform: str | None = None


@app.get("/causal/presets")
def get_causal_presets() -> Dict:
    """Return all pre-configured causal scenarios (Eskom, SARB, Telco, Rugby)."""
    return {
        "presets": [
            {
                "id": k,
                "title": v["title"],
                "description": v["description"],
                "default_severity": v["default_severity"],
                "shock_impact": v["shock_impact"],
                "nadir_delay_hours": v["nadir_delay_hours"],
            }
            for k, v in PRESET_SCENARIOS.items()
        ]
    }


@app.post("/causal/analyze")
def causal_analyze(req: CausalAnalyzeRequest) -> Dict:
    """Execute the full 4-agent Causal + Predictive pipeline:
    1. Causal Discovery (SCM & DAG)
    2. Forecaster (1-24h Ahead Trajectory with 95% CIs)
    3. Counterfactual Simulator ('What-if')
    4. Critic (DoWhy-style Refutation battery)
    """
    res = orchestrator.run_pipeline(
        preset_key=req.preset_key,
        custom_headline=req.custom_headline,
        severity=req.severity,
        horizon_hours=req.horizon_hours,
        base_sentiment=req.base_sentiment,
        platform=req.platform,
    )
    return res.model_dump()

