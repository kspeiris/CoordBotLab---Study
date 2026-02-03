import json, os

BASE = os.path.join(os.path.dirname(__file__), "..", "data")
EVENTS = os.path.join(BASE, "events.jsonl")
ALERTS = os.path.join(BASE, "alerts.jsonl")

def load_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(x) for x in f if x.strip()]

def main():
    events = load_jsonl(EVENTS)
    alerts = load_jsonl(ALERTS)

    #  if any "coord" events exist, detection should trigger at least once
    coord_events = [e for e in events if e.get("label") == "coord"]
    has_coord = len(coord_events) > 0

    detected = len(alerts) > 0

    # Simple episode-level scoring
    TP = 1 if (has_coord and detected) else 0
    FN = 1 if (has_coord and not detected) else 0
    FP = 1 if ((not has_coord) and detected) else 0

    precision = TP / (TP + FP) if (TP + FP) else 0.0
    recall = TP / (TP + FN) if (TP + FN) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    print("=== Evaluation (episode-level) ===")
    print(f"coord_present: {has_coord}")
    print(f"alerts_count: {len(alerts)}")
    print(f"Precision: {precision:.2f}")
    print(f"Recall:    {recall:.2f}")
    print(f"F1:        {f1:.2f}")

if __name__ == "__main__":
    main()
