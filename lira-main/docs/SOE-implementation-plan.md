# Implementation Plan: Structured Speaking Practice with SOE Integration

## Overview

This plan outlines the implementation of a structured speaking practice system with:
- Scenario-based conversation prompts (job interview, restaurant, hotel, airport, shopping, doctor, meeting)
- Pronunciation evaluation via Tencent Cloud SOE (already integrated)
- Grammar and expression correction (new)
- Real-time vs batch feedback modes (new)
- Integrated final report combining SOE scores and corrections (new)

## Data Flow

```
User Speaks → STT → LLM Response → Grammar Check → SOE Evaluation
                │                │                │
                ▼                ▼                ▼
           [Transcription]   [Agent Text]   [Pronunciation Scores]
                │                │                │
                └────────────────┴────────────────┘
                              │
                              ▼
                    JSONL Turn Record:
                    {
                      "turn_index": 0,
                      "user_text": "...",
                      "agent_text": "...",
                      "soe_scores": {...},
                      "corrections": [...]
                    }
```

---

## Phase 1: Data Model Extensions ✅

### Completed:
- [x] `backend/app/models/session.py` - Added `Scenario` and `FeedbackMode` enums
- [x] `backend/app/models/session.py` - Added `scenario` and `feedback_mode` to `Session`, `SessionCreate`, `SessionResponse`
- [x] `frontend/src/types/session.ts` - Added `Scenario` and `FeedbackMode` types

---

## Phase 2: Scenario Selection UI ✅

### Completed:
- [x] `backend/app/api/routes.py` - Accept scenario in session creation
- [x] `backend/app/services/agent_manager.py` - Pass scenario to worker
- [x] `backend/app/agents/worker.py` - Pass scenario to VoiceAgent
- [x] `backend/app/agents/voice_agent.py` - Accept scenario, pass to ConversationAgent
- [x] `frontend/src/app/page.tsx` - Add scenario selector dropdown
- [x] `frontend/src/app/page.tsx` - Display scenario badge in session

---

## Phase 3: Correction Service (Grammar & Expression)

### 3.1 New Service - Grammar/Expression Correction
**File:** `backend/app/services/correction_service.py` (NEW)

Create a service that analyzes user text and provides corrections:

```python
class CorrectionService:
    """Analyzes text for grammar and expression issues."""
    
    async def analyze(self, text: str) -> list[Correction]:
        """
        Analyze text and return list of corrections.
        
        Returns list of:
        {
          "type": "grammar" | "expression",
          "original": "...",
          "issue": "...",
          "suggestion": "..."
        }
        """
```

### 3.2 Integrate Correction into VoiceAgent
**File:** `backend/app/agents/voice_agent.py`

Update to perform correction analysis after each user turn:
- Call `CorrectionService.analyze()` after each user turn
- Include corrections in the JSONL turn record

---

## Phase 4: Real-time vs Batch Feedback Mode

### 4.1 Frontend - Feedback Mode Toggle
**File:** `frontend/src/app/practice/page.tsx`

Add toggle UI on practice page:
- Add toggle switch for "Real-time corrections" / "Batch mode"
- In real-time mode: show correction badges on agent responses
- In batch mode: silent logging, corrections only shown in final report

### 4.2 Backend - WebSocket Correction Events
**File:** `backend/app/api/routes.py`

Add WebSocket event for corrections:
```json
{
  "type": "correction",
  "turn_index": 0,
  "corrections": [
    {"type": "grammar", "original": "...", "issue": "...", "suggestion": "..."}
  ]
}
```

---

## Phase 5: SOE Integration Enhancement

### 5.1 Audio Capture for SOE
**File:** `backend/app/agents/voice_agent.py`

Enhance audio handling to capture WAV files:
- Add audio buffer for each turn
- On `is_final=True` from STT, save audio segment as WAV
- Queue SOE evaluation with reference text

### 5.2 Update Conversation Logger
**File:** `backend/app/services/conversation_logger.py`

Extend `log_turn` to include full correction and SOE data:
```python
def log_turn(
    session_id: str,
    turn_index: int,
    user_text: str,
    agent_text: str,
    soe_scores: dict | None,
    corrections: list[dict] | None,
):
```

---

## Phase 6: Integrated Final Report

### 6.1 Report Generation Service
**File:** `backend/app/services/report_service.py` (NEW)

Create service to generate final report:
```python
async def generate_report(session_id: UUID) -> dict:
    """
    Generate comprehensive session report.
    
    Returns:
    {
      "session_id": "...",
      "scenario": "...",
      "created_at": "...",
      "total_turns": 5,
      "pronunciation_report": {
        "total_score": 82.5,
        "pronunciation": 85,
        "fluency": 80,
        "integrity": 82,
        "word_details": [...]
      },
      "correction_report": {
        "grammar_issues": [...],
        "expression_issues": [...],
        "total_grammar_count": 3,
        "total_expression_count": 2
      },
      "turn_details": [...],
      "summary": "..."
    }
    """
```

### 6.2 Report API Endpoint
**File:** `backend/app/api/routes.py`

Add endpoint:
```
GET /api/sessions/{session_id}/report
```

Returns the integrated report JSON.

### 6.3 Frontend Report Modal
**File:** `frontend/src/app/practice/page.tsx`

Add report display component:
- Triggered when user clicks "End Session"
- Fetches report from API
- Displays:
  - SOE pronunciation scores with visual indicators
  - Grammar/expression corrections grouped by type
  - Turn-by-turn breakdown
  - Summary with overall recommendations

---

## File Modifications Summary

### Backend Files

| File | Status | Description |
|------|--------|-------------|
| `backend/app/models/session.py` | ✅ Done | Add scenario, feedback_mode fields |
| `backend/app/api/routes.py` | ✅ Done | Accept scenario, add report endpoint |
| `backend/app/agents/prompts.py` | ✅ Done | Scenario prompts work |
| `backend/app/agents/voice_agent.py` | ✅ Done | Scenario passed to ConversationAgent |
| `backend/app/services/agent_manager.py` | ✅ Done | Pass scenario to worker |
| `backend/app/agents/worker.py` | ✅ Done | Pass scenario to VoiceAgent |
| `backend/app/services/conversation_logger.py` | Pending | Extend log_turn with corrections/soe |
| `backend/app/services/correction_service.py` | Create | Grammar/expression analysis service |
| `backend/app/services/report_service.py` | Create | Report generation service |

### Frontend Files

| File | Status | Description |
|------|--------|-------------|
| `frontend/src/types/session.ts` | ✅ Done | Add Scenario type |
| `frontend/src/app/page.tsx` | ✅ Done | Add scenario selection UI |
| `frontend/src/app/practice/page.tsx` | Pending | Add feedback toggle, report modal |
| `frontend/src/lib/api.ts` | Pending | Add report endpoint method |

---

## TODO List

### Phase 1: Data Model ✅
- [x] `backend/app/models/session.py` - Add scenario, feedback_mode fields
- [x] `frontend/src/types/session.ts` - Add Scenario type

### Phase 2: Scenario Selection ✅
- [x] `backend/app/api/routes.py` - Accept scenario in session creation
- [x] `frontend/src/app/page.tsx` - Add scenario selector UI
- [x] `backend/app/agents/voice_agent.py` - Pass scenario to ConversationAgent

### Phase 3: Correction Service
- [ ] Create `backend/app/services/correction_service.py` - Grammar/expression analysis
- [ ] Integrate correction into `voice_agent.py`

### Phase 4: Feedback Modes
- [ ] `frontend/src/app/practice/page.tsx` - Add real-time/batch toggle
- [ ] Add WebSocket correction events to routes.py
- [ ] Update conversation_logger to support corrections

### Phase 5: SOE Enhancement
- [ ] Enhance voice_agent audio capture for SOE
- [ ] Update conversation_logger with turn_index, soe_scores, corrections

### Phase 6: Report Generation
- [ ] Create `backend/app/services/report_service.py`
- [ ] Add GET /api/sessions/{session_id}/report endpoint
- [ ] Frontend add report modal component
- [ ] Connect end session button to report display

---

## Success Criteria

- [ ] User can select scenario on home page before starting session
- [ ] Agent responds with scenario-appropriate prompts
- [ ] Real-time mode shows corrections immediately after user speaks
- [ ] Batch mode logs corrections silently, shows only in report
- [ ] SOE pronunciation scores stored per turn in JSONL
- [ ] Final report includes:
  - [ ] SOE pronunciation score (pronunciation, fluency, integrity)
  - [ ] Grammar issues count and suggestions
  - [ ] Expression issues count and suggestions
  - [ ] Turn-by-turn details with all data
  - [ ] Summary with recommendations
- [ ] Report displays in frontend modal after ending session