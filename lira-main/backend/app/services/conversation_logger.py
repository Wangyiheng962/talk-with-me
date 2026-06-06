"""Conversation logger for saving session transcripts to JSONL files."""

import json
from pathlib import Path
from datetime import datetime
from uuid import UUID

CONVERSATIONS_DIR = Path("conversations")


class ConversationLogger:
    """Logs conversation turns to JSONL files."""

    def __init__(self, base_dir: Path | None = None):
        self.base_dir = base_dir or CONVERSATIONS_DIR
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _get_session_path(self, session_id: UUID) -> Path:
        """Get the JSONL file path for a session."""
        return self.base_dir / f"{session_id}.jsonl"

    def log_session_start(
        self,
        session_id: UUID,
        mode: str,
        level: str,
        user_id: str | None = None,
    ):
        """Log session start metadata."""
        session_path = self._get_session_path(session_id)
        metadata = {
            "type": "session_start",
            "session_id": str(session_id),
            "mode": mode,
            "level": level,
            "user_id": user_id,
            "started_at": datetime.utcnow().isoformat(),
        }
        with open(session_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(metadata, ensure_ascii=False) + "\n")

    def log_turn(
        self,
        session_id: UUID,
        user_text: str,
        agent_text: str,
        mode: str,
        level: str,
        correction: bool = False,
        correction_detail: str | None = None,
    ):
        """Log a single conversation turn."""
        session_path = self._get_session_path(session_id)
        turn = {
            "type": "turn",
            "session_id": str(session_id),
            "mode": mode,
            "level": level,
            "user_text": user_text,
            "agent_text": agent_text,
            "correction": correction,
            "correction_detail": correction_detail,
            "timestamp": datetime.utcnow().isoformat(),
        }
        with open(session_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(turn, ensure_ascii=False) + "\n")

    def log_session_end(self, session_id: UUID):
        """Log session end marker."""
        session_path = self._get_session_path(session_id)
        end_marker = {
            "type": "session_end",
            "session_id": str(session_id),
            "ended_at": datetime.utcnow().isoformat(),
        }
        with open(session_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(end_marker, ensure_ascii=False) + "\n")

    def read_session(self, session_id: UUID) -> list[dict]:
        """Read all logged entries for a session."""
        session_path = self._get_session_path(session_id)
        if not session_path.exists():
            return []

        entries = []
        with open(session_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
        return entries


conversation_logger = ConversationLogger()