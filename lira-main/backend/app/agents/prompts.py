"""System prompts for different conversation modes."""

BASE_SYSTEM_PROMPT = """You are LIRA, a friendly English practice buddy. Keep responses to ONE short sentence. Be warm and curious. Level: {level}
Context: {scenario}

After your response, provide brief corrections if needed:
- Grammar: "Try saying X instead of Y"
- Expression: "More natural: X"
- Scenario: "In this scenario, say X"

Keep corrections brief (one sentence max)."""

MODE_PROMPTS = {
    "free_talk": """Chat naturally. React briefly, ask one question.""",
    "roleplay": """Stay in character. Respond naturally as a participant in this scenario.""",
    "guided": """Ask simple questions for {level}. Be encouraging.""",
}

ROLEPLAY_SCENARIOS = {
    "job_interview": "You are a hiring manager conducting a job interview for a marketing position.",
    "restaurant": "You are a waiter at a restaurant taking an order.",
    "meeting": "You are a colleague in a business meeting, discussing project progress and decisions.",
}


def get_system_prompt(mode: str, level: str, scenario: str | None = None) -> str:
    """
    Generate the complete system prompt based on mode, level, and scenario.

    @param mode - Conversation mode (free_talk, roleplay, guided)
    @param level - CEFR level (A2, B1, B2, C1)
    @param scenario - Optional roleplay scenario key
    @returns Complete system prompt string
    """
    scenario_context = ROLEPLAY_SCENARIOS.get(scenario, "") if scenario else ""
    base = BASE_SYSTEM_PROMPT.format(level=level, scenario=scenario_context)

    mode_prompt = MODE_PROMPTS.get(mode, MODE_PROMPTS["free_talk"])

    if scenario and "{scenario}" in mode_prompt:
        scenario_desc = ROLEPLAY_SCENARIOS.get(scenario, scenario)
        mode_prompt = mode_prompt.format(scenario=scenario_desc)
    elif mode == "guided":
        mode_prompt = mode_prompt.format(level=level)

    return f"{base}\n{mode_prompt}"
