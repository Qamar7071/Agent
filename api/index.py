"""Vercel entry point: the Flask API in backend/app.py, served as one Python function.

vercel.json rewrites every /api/* request to this function. The website itself is the
static Vite build in dist/, served by Vercel's CDN.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import app  # noqa: E402,F401  (Vercel serves this WSGI application)
