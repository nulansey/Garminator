"""Push notifications to the user's phone via ntfy.sh."""
import os

import requests

NTFY_URL = "https://ntfy.sh"


def _topic():
    topic = os.environ.get("NTFY_TOPIC")
    if not topic:
        raise RuntimeError("NTFY_TOPIC environment variable is not set")
    return topic


def send(message, title="Health tip", tags="green_heart", priority="default"):
    response = requests.post(
        f"{NTFY_URL}/{_topic()}",
        data=message.encode("utf-8"),
        headers={"Title": title, "Tags": tags, "Priority": priority},
        timeout=30,
    )
    response.raise_for_status()


def send_error(detail):
    send(
        f"Health tips: {detail}"[:400],
        title="Health tips problem",
        tags="warning",
        priority="high",
    )
