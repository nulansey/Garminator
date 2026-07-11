from fastapi.testclient import TestClient

from web.app import app


def test_health_endpoint():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_dashboard_page_renders():
    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code == 200
    assert "Garmin Health Coach" in resp.text
    assert "Calorie goal" in resp.text


def test_goals_page_renders():
    client = TestClient(app)
    resp = client.get("/goals")
    assert resp.status_code == 200
    assert "Calorie goal" in resp.text


def test_calorie_save_rejects_bad_amount(monkeypatch):
    import web.app as webapp
    pushed = []
    monkeypatch.setattr(webapp.gitsync, "commit_and_push",
                        lambda *a, **k: pushed.append(a) or (True, "pushed"))
    client = TestClient(app)
    resp = client.post("/goals/calorie",
                       data={"goal_type": "deficit", "amount": "99999"},
                       follow_redirects=False)
    assert resp.status_code == 303
    assert "ok=0" in resp.headers["location"]
    assert pushed == []  # invalid input never reaches git


def test_calorie_save_valid(monkeypatch, tmp_path):
    import shutil
    import web.app as webapp
    import web.goals as goals_mod
    cfg = tmp_path / "config.yaml"
    shutil.copy(goals_mod.CONFIG_PATH, cfg)
    monkeypatch.setattr(goals_mod, "CONFIG_PATH", cfg)
    calls = []
    monkeypatch.setattr(webapp.gitsync, "commit_and_push",
                        lambda paths, msg, **k: calls.append(msg) or (True, "pushed"))
    client = TestClient(app)
    resp = client.post("/goals/calorie",
                       data={"goal_type": "maintain", "amount": "0"},
                       follow_redirects=False)
    assert resp.status_code == 303
    assert "ok=1" in resp.headers["location"]
    assert calls and calls[0].startswith("config:")


def test_timing_save_rejects_all_disabled(monkeypatch):
    import web.app as webapp
    monkeypatch.setattr(webapp.gitsync, "commit_and_push",
                        lambda *a, **k: (True, "pushed"))
    client = TestClient(app)
    resp = client.post("/goals/timing",
                       data={"morning_hour": "7", "midday_hour": "13",
                             "evening_hour": "20"},  # no *_enabled boxes checked
                       follow_redirects=False)
    assert resp.status_code == 303
    assert "ok=0" in resp.headers["location"]


def test_chat_page_renders():
    client = TestClient(app)
    resp = client.get("/chat")
    assert resp.status_code == 200
    assert "Send" in resp.text


def test_chat_send_streams_and_persists(monkeypatch, tmp_path):
    import web.app as webapp
    import web.chat as chat_mod
    chat_file = tmp_path / "chat.json"
    monkeypatch.setattr(chat_mod, "CHAT_PATH", chat_file)
    monkeypatch.setattr(chat_mod, "stream_reply",
                        lambda prompt: iter(["Hello ", "there"]))
    client = TestClient(app)
    resp = client.post("/chat/send", json={"message": "hi coach"})
    assert resp.status_code == 200
    assert resp.text == "Hello there"
    saved = chat_mod.load_chat(chat_file)
    assert saved[-2]["role"] == "user" and saved[-2]["text"] == "hi coach"
    assert saved[-1]["role"] == "coach" and saved[-1]["text"] == "Hello there"


def test_chat_send_gemini_error(monkeypatch, tmp_path):
    import web.chat as chat_mod
    monkeypatch.setattr(chat_mod, "CHAT_PATH", tmp_path / "chat.json")

    def boom(prompt):
        raise RuntimeError("Gemini exploded")
        yield  # pragma: no cover — makes this a generator

    monkeypatch.setattr(chat_mod, "stream_reply", boom)
    client = TestClient(app)
    resp = client.post("/chat/send", json={"message": "hi"})
    assert resp.status_code == 200
    assert "trouble" in resp.text.lower()  # friendly error, not a stack trace
