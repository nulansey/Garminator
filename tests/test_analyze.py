from src.analyze import build_prompt

CONFIG = {"tone": "friendly"}


def test_morning_prompt_leads_with_calorie_target():
    context = {"today": "2026-07-07", "today_weekday": "Tuesday"}
    p = build_prompt(context, [], "morning", CONFIG, calorie_target_value=2150)
    assert "~2,150 calories" in p
    assert "MORNING BRIEFING" in p
    assert "typical burn" in p


def test_prompt_explains_predictive_framing():
    p = build_prompt({"today_weekday": "Tuesday"}, [], "midday", CONFIG)
    assert "weighted" in p
    assert "Tuesday" in p


def test_prompt_includes_recent_tips_and_tone():
    history = [{"date": "2026-07-05", "slot": "evening", "text": "wind down early"}]
    p = build_prompt({}, history, "midday", CONFIG)
    assert "wind down early" in p
    assert "friendly" in p


def test_prompt_includes_pattern_data():
    context = {"weekday_averages_weighted": {"Tuesday": {"totalSteps": 4100.0}}}
    p = build_prompt(context, [], "evening", CONFIG)
    assert "4100" in p


def test_build_prompt_includes_targets():
    config = {"tone": "friendly",
              "targets": {"sleep_hours": 7.5, "steps": 10000}}
    prompt = build_prompt({"today_weekday": "Tuesday"}, [], "evening", config)
    assert "7.5" in prompt and "10,000" in prompt
    assert "target" in prompt.lower()


def test_build_prompt_without_targets_unchanged():
    config = {"tone": "friendly"}
    prompt = build_prompt({"today_weekday": "Tuesday"}, [], "evening", config)
    assert "sleep target" not in prompt.lower()
