import json, time, collections, hashlib, os

BASE = os.path.join(os.path.dirname(__file__), "..", "data")
LOG = os.path.join(BASE, "events.jsonl")
ALERTS = os.path.join(BASE, "alerts.jsonl")

WINDOW_SEC = 2.0
THRESHOLD_UNIQUE_CLIENTS = 8

# per-client sequence memory
SEQ_LEN = 5

def anon_client_id(ip, ua):
    # privacy-friendly: hash ip+ua
    h = hashlib.sha256((ip + "|" + ua).encode()).hexdigest()
    return h[:16]

def tail_f(path):
    with open(path, "r", encoding="utf-8") as f:
        f.seek(0, 2)
        while True:
            line = f.readline()
            if not line:
                time.sleep(0.1)
                continue
            yield line

def write_alert(obj):
    with open(ALERTS, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj) + "\n")

def run():
    # action -> deque of (ts, client)
    buckets = collections.defaultdict(collections.deque)

    # client -> deque of actions
    seq = collections.defaultdict(lambda: collections.deque(maxlen=SEQ_LEN))

    # sequence signature -> (last_ts, set(clients))
    seq_bucket = collections.defaultdict(lambda: {"ts": 0, "clients": set()})

    print("🟢 Detector running. Waiting for events...")

    for line in tail_f(LOG):
        rec = json.loads(line)
        ts = rec["ts"]
        action = rec["action"]
        cid = anon_client_id(rec["ip"], rec["ua"])

        # --- Signal 1: synchronization burst ---
        dq = buckets[action]
        dq.append((ts, cid))
        while dq and (ts - dq[0][0]) > WINDOW_SEC:
            dq.popleft()

        uniq = {c for _, c in dq}
        if len(uniq) >= THRESHOLD_UNIQUE_CLIENTS:
            alert = {
                "ts": ts,
                "type": "sync_burst",
                "action": action,
                "unique_clients": len(uniq),
                "window_sec": WINDOW_SEC
            }
            print("🚨", alert)
            write_alert(alert)

        # --- Signal 2: sequence similarity ---
        seq[cid].append(action)
        if len(seq[cid]) == SEQ_LEN:
            signature = "|".join(seq[cid])
            bucket = seq_bucket[signature]
            # reset if old
            if ts - bucket["ts"] > WINDOW_SEC:
                bucket["clients"] = set()
            bucket["ts"] = ts
            bucket["clients"].add(cid)

            if len(bucket["clients"]) >= THRESHOLD_UNIQUE_CLIENTS:
                alert = {
                    "ts": ts,
                    "type": "sequence_cluster",
                    "signature": signature,
                    "unique_clients": len(bucket["clients"]),
                    "window_sec": WINDOW_SEC
                }
                print("🚨", alert)
                write_alert(alert)

if __name__ == "__main__":
    run()
