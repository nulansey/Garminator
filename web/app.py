"""FastAPI control panel for the Garmin health coach.

Run with:  ./coach   (or: .venv/bin/python -m uvicorn web.app:app --host 0.0.0.0 --port 8787)
"""
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")  # GEMINI_API_KEY for the chat coach

app = FastAPI(title="Garmin Health Coach")
templates = Jinja2Templates(directory=str(ROOT / "web" / "templates"))

STATIC_DIR = ROOT / "web" / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/health")
def health():
    return {"status": "ok"}
