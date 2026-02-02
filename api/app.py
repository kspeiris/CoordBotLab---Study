from flask import Flask, request, jsonify
import time, json, os

app = Flask(__name__)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)
LOG_PATH = os.path.join(DATA_DIR, "events.jsonl")

@app.post("/event")
def event():
    data = request.json or {}
    rec = {
        "ts": time.time(),
        "ip": request.headers.get("X-Client-IP", request.remote_addr),
        "ua": request.headers.get("User-Agent", ""),
        "session": data.get("session", "no-session"),
        "action": data.get("action", "unknown"),
        "label": data.get("label", "unknown")   # for evaluation: human/bot/coord
    }

    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")

    return jsonify({"ok": True})
