import time, random, threading, requests, uuid

URL = "http://127.0.0.1:5000/event"

HUMAN_PATTERNS = [
    ["view", "scroll", "click", "scroll", "exit"],
    ["view", "scroll", "scroll", "click", "exit"],
    ["view", "click", "scroll", "exit"]
]

BOT_PATTERN = ["view", "click", "click", "click", "exit"]

def post_event(client_ip, ua, session, action, label):
    requests.post(
        URL,
        json={"session": session, "action": action, "label": label},
        headers={"X-Client-IP": client_ip, "User-Agent": ua},
        timeout=3
    )

def run_session(client_ip, ua, session, pattern, label, sync_start=None, delay_range=(0.08, 0.25)):
    if sync_start is not None:
        while time.time() < sync_start:
            time.sleep(0.001)

    for action in pattern:
        post_event(client_ip, ua, session, action, label)
        time.sleep(random.uniform(*delay_range))

def main():
    threads = []

    # Humans (uncoordinated, jittery)
    for i in range(10):
        ip = f"10.0.0.{i+10}"
        ua = f"Mozilla/5.0 HumanSim/{i}"
        session = str(uuid.uuid4())
        pattern = random.choice(HUMAN_PATTERNS)
        t = threading.Thread(target=run_session,
                             args=(ip, ua, session, pattern, "human", None, (0.15, 0.6)))
        threads.append(t)

    # Single bots (not coordinated)
    for i in range(4):
        ip = f"10.0.2.{i+30}"
        ua = f"Mozilla/5.0 SingleBot/{i}"
        session = str(uuid.uuid4())
        t = threading.Thread(target=run_session,
                             args=(ip, ua, session, BOT_PATTERN, "bot", None, (0.05, 0.15)))
        threads.append(t)

    # Coordinated group (synchronized start + same pattern)
    sync_start = time.time() + 2.0
    for i in range(12):
        ip = f"10.0.1.{i+50}"
        ua = "Mozilla/5.0 CoordBot/1.0"
        session = f"coord-group-A-{i}"
        t = threading.Thread(target=run_session,
                             args=(ip, ua, session, BOT_PATTERN, "coord", sync_start, (0.04, 0.12)))
        threads.append(t)

    for t in threads: t.start()
    for t in threads: t.join()

    print("✅ Simulation complete")
    print("Check: data/events.jsonl")

if __name__ == "__main__":
    main()
