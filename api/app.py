from flask import Flask, request, jsonify
import time, json, os

app = Flask(__name__)

# data folder and log path
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(DATA_DIR, exist_ok=True)
LOG_PATH = os.path.join(DATA_DIR, "events.jsonl")

@app.post("/event")
def event():
    data = request.get_json(silent=True) or {}

    rec = {
        "ts": time.time(),
        "ip": request.headers.get("X-Client-IP", request.remote_addr),
        "ua": request.headers.get("User-Agent", ""),
        "session": data.get("session", "no-session"),
        "action": data.get("action", "unknown"),
        "label": data.get("label", "unknown")  # human / bot / coord (for evaluation)
    }

    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec) + "\n")

    return jsonify({"okk": True})

@app.get("/health")
def health():
    return jsonify({"status": "up"})

if __name__ == "__main__":
    # IMPORTANT: this is what starts the server
    app.run(host="127.0.0.1", port=5000, debug=True)
