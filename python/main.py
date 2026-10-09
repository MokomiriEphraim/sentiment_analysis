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

import re
from typing import Dict, List

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

    # Emoji extraction (emoji.emoji_list keeps ZWJ sequences intact),
    # each emoji scored through VADER's own emoji-aware lexicon.
    emoji_counts: Dict[str, int] = {}
    for match in emoji.emoji_list(text):
        e = match["emoji"]
        emoji_counts[e] = emoji_counts.get(e, 0) + 1

    emojis: List[EmojiScore] = []
    raw_total = 0.0
    for e, count in emoji_counts.items():
        e_compound = float(_analyzer.polarity_scores(e)["compound"])
        raw_total += e_compound * count
        emojis.append(
            EmojiScore(emoji=e, count=count, compound=e_compound, label=_label(e_compound))
        )
    emojis.sort(key=lambda x: abs(x.compound * x.count), reverse=True)

    emoji_compound = 0.0
    if emojis:
        emoji_compound = round(raw_total / ((raw_total**2 + 8) ** 0.5), 4)

    return {
        "label": _label(compound),
        "compound": round(compound, 4),
        "scores": {
            "neg": scores["neg"],
            "neu": scores["neu"],
            "pos": scores["pos"],
            "compound": scores["compound"],
        },
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
