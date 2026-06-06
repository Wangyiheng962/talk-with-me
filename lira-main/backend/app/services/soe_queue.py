"""SOE task queue using asyncio.Queue for background processing."""

import asyncio
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from app.services.soe_service import soe_service
from app.services.conversation_logger import conversation_logger


@dataclass
class SOETask:
    """A SOE evaluation task."""
    turn_index: int
    session_id: str
    ref_text: str
    audio_path: str
    mode: str = "corrective"
    level: str = "B1"


# In-memory queue
soe_queue: asyncio.Queue[SOETask] | None = None


def get_soe_queue() -> asyncio.Queue[SOETask]:
    """Get or create the global SOE queue."""
    global soe_queue
    if soe_queue is None:
        soe_queue = asyncio.Queue[SOETask]()
    return soe_queue


async def soe_worker():
    """Background worker that processes SOE tasks from the queue."""
    print("[SOE Worker] Started")
    queue = get_soe_queue()

    while True:
        try:
            task = await queue.get()
            print(f"[SOE Worker] Processing task: turn={task.turn_index}, session={task.session_id}")

            try:
                result = await soe_service.evaluate(
                    audio_path=task.audio_path,
                    ref_text=task.ref_text,
                )
                print(f"[SOE Worker] Got result: {result}")

                _update_soe_result(task, result)

            except Exception as e:
                print(f"[SOE Worker] Task failed: {e}")
                import traceback
                traceback.print_exc()
            finally:
                queue.task_done()

        except Exception as e:
            print(f"[SOE Worker] Queue error: {e}")
            await asyncio.sleep(1)


def _update_soe_result(task: SOETask, result: dict):
    """Update SOE result in memory store for frontend retrieval."""
    key = f"{task.session_id}:{task.turn_index}"
    # Import the store from soe_routes
    from app.api.soe_routes import soe_results_store
    soe_results_store[key] = {
        "status": "completed",
        "turn_index": task.turn_index,
        "result": result,
    }
    print(f"[SOE Worker] Updated result store: {key}")


def enqueue_soe_task(task: SOETask):
    """Add a SOE task to the queue."""
    queue = get_soe_queue()
    queue.put_nowait(task)
    print(f"[SOE Queue] Task enqueued: turn={task.turn_index}, queue_size={queue.qsize()}")


def save_audio_chunk(
    session_id: str,
    turn_index: int,
    audio_data: bytes,
) -> Path:
    """Save audio chunk as WAV file (16kHz, 16bit, mono)."""
    audio_dir = Path("conversations") / str(session_id) / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    wav_path = audio_dir / f"turn_{turn_index}.wav"

    pcm_len = len(audio_data)
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + pcm_len,
        b"WAVE",
        b"fmt ",
        16, 1,
        1, 16000,
        32000, 2,
        16, b"data", pcm_len
    )

    with open(wav_path, "wb") as f:
        f.write(header + audio_data)

    return wav_path