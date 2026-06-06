"""API routes for session management and health checks."""

import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from app.models.session import (
    AgentMode,
    CEFRLevel,
    Session,
    SessionCreate,
    SessionResponse,
)
from app.services.livekit import create_room_token
from app.services.agent_manager import agent_manager
from app.services.analytics import analytics_service
from app.core.config import get_settings

router = APIRouter()

# In-memory session storage (replace with Redis in production)
sessions: dict[UUID, Session] = {}

# WebSocket connections for real-time events
ws_connections: dict[UUID, WebSocket] = {}


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    settings = get_settings()

    # Check Redis connectivity
    redis_status = "unknown"
    try:
        r = await analytics_service._get_redis()
        if r:
            await r.ping()
            redis_status = "connected"
        else:
            redis_status = "fallback_memory"
    except Exception:
        redis_status = "disconnected"

    return {
        "status": "healthy",
        "service": "lira-backend",
        "version": "0.1.0",
        "dependencies": {
            "redis": redis_status,
            "llm_provider": settings.llm_provider.value,
        },
    }


@router.get("/health/ready")
async def readiness_check():
    """Readiness check for Kubernetes."""
    settings = get_settings()

    # Verify critical services
    checks = {
        "config": True,
        "livekit": bool(settings.livekit_url and settings.livekit_api_key),
        "deepgram": bool(settings.deepgram_api_key),
        "llm": bool(settings.openai_api_key or settings.azure_openai_api_key),
    }

    all_ready = all(checks.values())

    return {
        "ready": all_ready,
        "checks": checks,
    }


@router.post("/sessions", response_model=SessionResponse)
async def create_session(request: SessionCreate):
    """Create a new conversation session and return LiveKit credentials."""
    settings = get_settings()

    session = Session(
        mode=request.mode,
        level=request.level,
        scenario=request.scenario,
        feedback_mode=request.feedback_mode,
        user_id=request.user_id,
    )
    sessions[session.session_id] = session

    # Start analytics tracking for this session
    await analytics_service.start_session(
        session_id=session.session_id,
        mode=session.mode,
        level=session.level,
        user_id=session.user_id,
    )

    # Generate LiveKit token for this session
    token = create_room_token(
        room_name=f"lira-{session.session_id}",
        participant_name=f"user-{session.session_id}",
    )

    # Spawn agent for this session (non-blocking)
    print(f"[API] Creating session {session.session_id}, spawning agent...")
    async def spawn_with_logging():
        try:
            print(f"[Agent] Spawning agent for session {session.session_id}")
            await agent_manager.spawn_agent(
                session.session_id,
                mode=session.mode.value,
                level=session.level.value,
                scenario=session.scenario.value if session.scenario else None,
                feedback_mode=session.feedback_mode.value if session.feedback_mode else "real_time",
            )
        except Exception as e:
            print(f"[Agent] Failed to spawn agent: {e}")
            import traceback
            traceback.print_exc()

    asyncio.create_task(spawn_with_logging())

    return SessionResponse(
        session_id=session.session_id,
        mode=session.mode,
        level=session.level,
        scenario=session.scenario,
        feedback_mode=session.feedback_mode,
        livekit_token=token,
        livekit_url=settings.livekit_url,
    )


@router.get("/sessions/history")
async def get_sessions_history():
    """Get list of past sessions from JSONL files."""
    from app.services.conversation_logger import conversation_logger

    history_dir = conversation_logger.base_dir
    sessions_list = []

    if history_dir.exists():
        for file_path in history_dir.glob("*.jsonl"):
            session_id = file_path.stem
            entries = []
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            entries.append(json.loads(line))
            except Exception:
                continue

            if entries:
                session_start = next((e for e in entries if e.get("type") == "session_start"), None)
                turn_count = len([e for e in entries if e.get("type") == "turn"])

                sessions_list.append({
                    "session_id": session_id,
                    "mode": session_start.get("mode", "unknown") if session_start else "unknown",
                    "level": session_start.get("level", "unknown") if session_start else "unknown",
                    "started_at": session_start.get("started_at", "") if session_start else "",
                    "turns": turn_count,
                })

    sessions_list.sort(key=lambda x: x.get("started_at", ""), reverse=True)
    return {"sessions": sessions_list[:50]}


@router.get("/sessions/{session_id}/conversation")
async def get_session_conversation(session_id: UUID):
    """Get full conversation transcript for a session."""
    from app.services.conversation_logger import conversation_logger

    entries = conversation_logger.read_session(session_id)

    if not entries:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {"session_id": str(session_id), "entries": entries}


@router.get("/sessions/{session_id}/report")
async def get_session_report(session_id: UUID):
    """Get session report with scores and corrections summary."""
    from app.services.conversation_logger import conversation_logger

    entries = conversation_logger.read_session(session_id)

    if not entries:
        raise HTTPException(status_code=404, detail="Session not found")

    # Find the session_end entry with report
    session_end = next((e for e in entries if e.get("type") == "session_end"), None)
    if not session_end or not session_end.get("report"):
        return {"session_id": str(session_id), "report": None, "message": "Session not ended or no report available"}

    return {"session_id": str(session_id), "report": session_end["report"]}


@router.get("/sessions/{session_id}")
async def get_session(session_id: UUID):
    """Get session details."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.patch("/sessions/{session_id}/mode")
async def update_session_mode(session_id: UUID, mode: AgentMode):
    """Update session mode (free_talk, corrective, roleplay, guided)."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.mode = mode
    return {"session_id": session_id, "mode": mode}


@router.delete("/sessions/{session_id}")
async def end_session(session_id: UUID):
    """End a session and cleanup resources."""
    session = sessions.pop(session_id, None)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Stop the agent
    await agent_manager.stop_agent(session_id)

    # Finalize analytics and get session summary
    session_analytics = await analytics_service.end_session(session_id)

    # Close WebSocket if connected
    ws = ws_connections.pop(session_id, None)
    if ws:
        await ws.close()

    return {
        "session_id": session_id,
        "status": "ended",
        "metrics": session.metrics,
        "analytics": session_analytics.model_dump() if session_analytics else None,
    }


@router.websocket("/sessions/{session_id}/ws")
async def session_websocket(websocket: WebSocket, session_id: UUID):
    """
    WebSocket endpoint for real-time session events.

    Sends transcription and agent response events to the client.
    """
    session = sessions.get(session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return

    await websocket.accept()
    ws_connections[session_id] = websocket

    try:
        # Wait for agent to be ready (with timeout)
        agent = None
        for _ in range(50):  # 5 seconds max
            agent = agent_manager.get_agent(session_id)
            if agent:
                break
            await asyncio.sleep(0.1)

        if agent:
            print(f"[WS] Agent found for session {session_id}, setting up callbacks")
            original_on_transcription = agent.on_transcription
            original_on_response = agent.on_response

            async def send_transcription(text: str, is_final: bool):
                if original_on_transcription:
                    original_on_transcription(text, is_final)
                print(f"[WS] Sending transcription: {text[:50]}... final={is_final}")
                await websocket.send_json({
                    "type": "transcription",
                    "text": text,
                    "is_final": is_final,
                })

            async def send_response(text: str):
                if original_on_response:
                    original_on_response(text)
                print(f"[WS] Sending response: {text[:50]}...")
                await websocket.send_json({
                    "type": "response",
                    "text": text,
                })

            agent.on_transcription = lambda t, f: asyncio.create_task(send_transcription(t, f))
            agent.on_response = lambda r: asyncio.create_task(send_response(r))

        # Keep connection alive and handle client messages
        while True:
            data = await websocket.receive_json()

            # Handle mode changes from client
            if data.get("type") == "set_mode":
                new_mode = data.get("mode")
                if new_mode in [m.value for m in AgentMode]:
                    session.mode = AgentMode(new_mode)
                    await websocket.send_json({
                        "type": "mode_changed",
                        "mode": new_mode,
                    })

    except WebSocketDisconnect:
        ws_connections.pop(session_id, None)
