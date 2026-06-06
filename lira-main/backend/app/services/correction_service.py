"""Grammar, expression, and scenario appropriateness correction service using LLM."""

from typing import Any

from pydantic import BaseModel, Field
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser

from app.agents.prompts import ROLEPLAY_SCENARIOS
from app.services.llm import get_llm_client


# Scoring rubrics for LLM reference
GRAMMAR_RUBRIC = """
Grammar Score (1-5):
- 5: No grammar errors
- 4: 1-2 minor errors (articles, prepositions, word form)
- 3: A few errors that don't impede understanding
- 2: Several errors that affect clarity
- 1: Many errors making speech hard to understand
"""

SCENARIO_RUBRIC = """
Scenario Appropriateness Score (1-5):
- 5: Perfectly appropriate tone, formality, and register for the scenario
- 4: Mostly appropriate, minor mismatches in tone or style
- 3: Generally appropriate but some tone/style issues
- 2: Noticeably inappropriate tone or register for the scenario
- 1: Completely wrong tone/register for the scenario context
"""


class Correction(BaseModel):
    """Single correction item."""
    type: str = Field(description='Correction type: "grammar", "expression", or "scenario"')
    original: str = Field(description='The exact problematic phrase in the sentence')
    issue: str = Field(description='Brief explanation of the problem')
    suggestion: str = Field(description='Corrected version')


class CorrectionResult(BaseModel):
    """Result of correction analysis with scores."""
    grammar_score: int = Field(ge=1, le=5, description="Grammar score 1-5")
    scenario_score: int = Field(ge=1, le=5, description="Scenario appropriateness score 1-5")
    overall_score: int = Field(ge=1, le=5, description="Overall score 1-5")
    corrections: list[Correction] = Field(default_factory=list, description="List of corrections found")


class QuickFeedbackResult(BaseModel):
    """Quick feedback for realtime mode."""
    quick_feedback: str | None = Field(default=None, description="Brief correction suggestion or null if good")


class CorrectionService:
    """Analyzes text for grammar, expression, and scenario appropriateness issues."""

    def __init__(self):
        self.llm = get_llm_client()
        # Create structured output parsers
        self._batch_parser = JsonOutputParser(pydantic_schema=CorrectionResult)
        self._realtime_parser = JsonOutputParser(pydantic_schema=QuickFeedbackResult)

    async def analyze(
        self,
        user_text: str,
        scenario: str | None = None,
        is_realtime: bool = False,
    ) -> dict[str, Any]:
        """
        Analyze user text for issues and provide scores.

        @param user_text - The user's input text to analyze
        @param scenario - Scenario key for context-appropriate evaluation
        @param is_realtime - If True, return quick feedback without scores
        @returns Dict with scores and corrections
        """
        scenario_context = ROLEPLAY_SCENARIOS.get(scenario, "") if scenario else ""

        if is_realtime:
            return await self._analyze_realtime(user_text, scenario_context)
        return await self._analyze_batch(user_text, scenario_context)

    async def _analyze_realtime(
        self,
        user_text: str,
        scenario_context: str,
    ) -> dict[str, Any]:
        """Realtime mode: quick corrections only, no scoring."""
        prompt = SystemMessage(
            content=f"""You are a helpful English tutor. The user is practicing in this scenario:
{scenario_context}

Provide QUICK corrections for problems. Keep it brief.
Focus on the most important issue only.

If the speech is good, respond with null for quick_feedback.
Otherwise provide a brief correction suggestion.

Examples:
User: "I am very interest in this position"
Response: {{"quick_feedback": "Try saying 'I am very interested in' instead of 'I am very interest in'"}}

User: "Could you please passing me the salt?"
Response: {{"quick_feedback": "More natural: 'Could you pass me the salt?'"}}

User: "The meeting went really well, we discussed about the project"
Response: {{"quick_feedback": "Skip 'about' - 'discussed the project' is correct"}}

Now analyze this sentence:"""
        )

        messages = [prompt, HumanMessage(content=user_text)]

        try:
            # Use with_structured_output
            chain = self.llm | self._realtime_parser
            result = await chain.ainvoke(messages)

            return {
                "is_realtime": True,
                "quick_feedback": result.quick_feedback,
                "scores": None,
                "corrections": [],
            }
        except Exception as e:
            print(f"[CorrectionService] Realtime error: {e}")
            return {"is_realtime": True, "quick_feedback": None, "scores": None, "corrections": []}

    async def _analyze_batch(
        self,
        user_text: str,
        scenario_context: str,
    ) -> dict[str, Any]:
        """Batch mode: full scoring with grammar and scenario appropriateness."""
        prompt = SystemMessage(
            content=f"""You are a helpful English tutor analyzing student sentences.
The user is practicing in this scenario:
{scenario_context}

{GRAMMAR_RUBRIC}

{SCENARIO_RUBRIC}

Analyze the user's sentence and provide scores + corrections.

Examples:
User: "I am very interest in this position"
Scenario: job interview
Response: {{
  "grammar_score": 3,
  "scenario_score": 4,
  "overall_score": 4,
  "corrections": [
    {{"type": "grammar", "original": "I am very interest", "issue": "Subject-verb agreement error", "suggestion": "I am very interested"}},
    {{"type": "expression", "original": "very interest", "issue": "Unnatural phrasing", "suggestion": "very interested in"}}
  ]
}}

User: "Could you please passing me the salt?"
Scenario: restaurant
Response: {{
  "grammar_score": 2,
  "scenario_score": 3,
  "overall_score": 3,
  "corrections": [
    {{"type": "grammar", "original": "passing me", "issue": "Missing verb form", "suggestion": "pass me"}},
    {{"type": "scenario", "original": "Could you please passing me", "issue": "Too formal for casual restaurant request", "suggestion": "Could you pass me"}}
  ]
}}

Now analyze this sentence:"""
        )

        messages = [prompt, HumanMessage(content=user_text)]

        try:
            # Use with_structured_output
            chain = self.llm | self._batch_parser
            result = await chain.ainvoke(messages)

            # Extract quick_feedback from first correction if available
            quick_feedback = None
            if result.corrections:
                first_correction = result.corrections[0]
                quick_feedback = f"Try saying {first_correction.suggestion} instead of {first_correction.original}"

            return {
                "is_realtime": False,
                "grammar_score": result.grammar_score,
                "scenario_score": result.scenario_score,
                "overall_score": result.overall_score,
                "corrections": [c.model_dump() for c in result.corrections],
                "quick_feedback": quick_feedback,
            }
        except Exception as e:
            print(f"[CorrectionService] Batch error: {e}")
            return self._empty_result()

    def _empty_result(self) -> dict[str, Any]:
        return {
            "is_realtime": False,
            "grammar_score": 5,
            "scenario_score": 5,
            "overall_score": 5,
            "corrections": [],
            "quick_feedback": None,
        }


correction_service = CorrectionService()
