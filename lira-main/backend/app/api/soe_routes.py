"""API routes for SOE audio upload and result retrieval."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request

from app.services.soe_queue import enqueue_soe_task, save_audio_chunk, SOETask


router = APIRouter()

# In-memory SOE results store (key: "session_id:turn_index")
soe_results_store: dict[str, dict] = {}


@router.post("/sessions/{session_id}/audio/{turn_index}")
async def upload_audio(
    request: Request,
    session_id: str,
    turn_index: int,
    ref_text: str,
):
    """
    Upload audio for SOE evaluation.

    Accepts raw PCM audio (16kHz, 16bit, mono) or WAV file.
    Saves as WAV and enqueues for SOE processing.

    Returns immediately; SOE result is stored in memory and returned on poll.
    """
    audio_data = await request.body()

    if len(audio_data) < 100:
        raise HTTPException(status_code=400, detail="Audio data too small")

    if audio_data[:4] == b"RIFF":
        wav_path = save_audio_chunk(session_id, turn_index, audio_data[44:])
    else:
        wav_path = save_audio_chunk(session_id, turn_index, audio_data)

    # Initialize result as pending
    key = f"{session_id}:{turn_index}"
    soe_results_store[key] = {"status": "pending", "turn_index": turn_index}

    task = SOETask(
        turn_index=turn_index,
        session_id=session_id,
        ref_text=ref_text,
        audio_path=str(wav_path),
    )
    enqueue_soe_task(task)

    return {
        "status": "queued",
        "session_id": str(session_id),
        "turn_index": turn_index,
        "audio_path": str(wav_path),
    }


@router.get("/sessions/{session_id}/audio/{turn_index}")
async def get_audio(
    session_id: str,
    turn_index: int,
):
    """Get audio file path for a session turn."""
    from pathlib import Path

    audio_path = Path("conversations") / str(session_id) / "audio" / f"turn_{turn_index}.wav"

    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")

    return {
        "audio_path": str(audio_path),
        "url": f"/api/sessions/{session_id}/audio/{turn_index}/file",
    }


@router.get("/sessions/{session_id}/soe/{turn_index}")
async def get_soe_result(
    session_id: str,
    turn_index: int,
):
    """Get SOE evaluation result for a specific turn."""
    key = f"{session_id}:{turn_index}"

    if key not in soe_results_store:
        raise HTTPException(status_code=404, detail="Result not found")

    result = soe_results_store[key]
    return result