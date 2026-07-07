import pytest

import src.notify as notify


class FakeResponse:
    def raise_for_status(self):
        pass


def test_send_posts_message_to_topic(monkeypatch):
    calls = {}

    def fake_post(url, data=None, headers=None, timeout=None):
        calls.update(url=url, data=data, headers=headers)
        return FakeResponse()

    monkeypatch.setenv("NTFY_TOPIC", "my-secret-topic")
    monkeypatch.setattr(notify.requests, "post", fake_post)

    notify.send("hello", title="Test title")

    assert calls["url"] == "https://ntfy.sh/my-secret-topic"
    assert calls["data"] == b"hello"
    assert calls["headers"]["Title"] == "Test title"


def test_send_requires_topic(monkeypatch):
    monkeypatch.delenv("NTFY_TOPIC", raising=False)
    with pytest.raises(RuntimeError):
        notify.send("hello")


def test_send_error_uses_warning_style(monkeypatch):
    calls = {}

    def fake_post(url, data=None, headers=None, timeout=None):
        calls.update(url=url, data=data, headers=headers)
        return FakeResponse()

    monkeypatch.setenv("NTFY_TOPIC", "my-secret-topic")
    monkeypatch.setattr(notify.requests, "post", fake_post)

    notify.send_error("couldn't reach Garmin")

    assert b"couldn't reach Garmin" in calls["data"]
    assert calls["headers"]["Priority"] == "high"
