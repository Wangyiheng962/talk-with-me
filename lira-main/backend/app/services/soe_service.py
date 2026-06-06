"""Tencent Cloud SOE (智聆口语评测) WebSocket client."""

import asyncio
import base64
import hashlib
import hmac
import json
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import quote

import websockets

from app.core.config import get_settings


class SOEService:
    """Client for Tencent Cloud SOE pronunciation evaluation."""

    def __init__(self):
        self.settings = get_settings()
        self.secret_id = self.settings.tencent_soe_secret_id
        self.secret_key = self.settings.tencent_soe_secret_key
        self.app_id = "1440400749"  # TODO: move to config

    def _make_signature(self, sign_str: str) -> str:
        """Generate HMAC-SHA1 + Base64 signature."""
        signed = hmac.new(
            self.secret_key.encode(),
            sign_str.encode(),
            hashlib.sha1
        ).digest()
        return base64.b64encode(signed).decode()

    def _build_url(self, voice_id: str, ref_text: str, eval_mode: int = 1) -> str:
        """Build SOE WebSocket URL with proper signature."""
        # Build params dict (excluding signature) - use raw values for signature
        params = {
            "secretid": self.secret_id,
            "timestamp": int(time.time()),
            "expired": int(time.time()) + 3600,
            "nonce": 1000,
            "voice_id": voice_id,
            "server_engine_type": "16k_en",
            "voice_format": 1,
            "eval_mode": eval_mode,
            "score_coeff": 1.5,
            "ref_text": ref_text,  # Raw value for signature
        }

        # Sort alphabetically and build sign string with RAW values
        sorted_params_raw = sorted([f"{k}={v}" for k, v in params.items()], key=lambda x: x.split("=")[0])
        sign_str = f"soe.cloud.tencent.com/soe/api/{self.app_id}?" + "&".join(sorted_params_raw)

        signature = self._make_signature(sign_str)

        # Build final URL with URL-encoded values
        sorted_params_encoded = sorted([f"{k}={quote(str(v), safe='')}" for k, v in params.items()], key=lambda x: x.split("=")[0])
        query_str = "&".join(sorted_params_encoded) + f"&signature={quote(signature)}"
        url = f"wss://soe.cloud.tencent.com/soe/api/{self.app_id}?{query_str}"
        return url

    async def evaluate(
        self,
        audio_path: str | Path,
        ref_text: str,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Evaluate pronunciation via SOE WebSocket API.

        Args:
            audio_path: Path to WAV audio file (16kHz, 16bit, mono)
            ref_text: Reference text to evaluate against
            session_id: Optional session ID (used for voice_id)

        Returns:
            Dict with pronunciation scores:
            - pronunciation: 0-100
            - fluency: 0-100
            - integrity: 0-100
            - total: 综合分数
        """
        voice_id = session_id or str(uuid.uuid4())
        url = self._build_url(voice_id, ref_text)
        print(f"[SOE] Full URL: {url}")
        audio_path = Path(audio_path)

        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        eval_result: dict[str, Any] = {}
        error_result: dict[str, Any] | None = None

        async with websockets.connect(url, ping_interval=30) as ws:
            # First receive handshake response
            handshake = await asyncio.wait_for(ws.recv(), timeout=10)
            handshake_data = json.loads(handshake)
            print(f"[SOE] Handshake: {handshake_data}")

            code = handshake_data.get("code", -1)
            if code != 0:
                raise RuntimeError(f"SOE handshake failed: code={code}, msg={handshake_data.get('message', 'unknown')}")

            # Handshake successful, now send audio
            with open(audio_path, "rb") as f:
                f.seek(44)  # Skip WAV header
                pcm_data = f.read()

            # Send audio chunks
            chunk_size = 1280
            for i in range(0, len(pcm_data), chunk_size):
                chunk = pcm_data[i:i + chunk_size]
                if chunk:
                    await ws.send(chunk)
                    await asyncio.sleep(0.04)

            # Send end signal
            await ws.send(json.dumps({"type": "end"}))

            # Receive result
            while True:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=30)
                    data = json.loads(msg)
                    print(f"[SOE] Received: {data}")

                    code = data.get("code", -1)
                    if code == 0:
                        if data.get("final") == 1:
                            # Final result
                            eval_result = self._parse_result(data)
                            break
                        elif data.get("result"):
                            # Intermediate result, save for later
                            eval_result = self._parse_result(data)
                    else:
                        error_result = data
                        break
                except asyncio.TimeoutError:
                    error_result = {"error": "Timeout waiting for SOE result"}
                    break

        if error_result and not eval_result:
            raise RuntimeError(f"SOE error: {error_result}")

        return eval_result

    def _parse_result(self, data: dict[str, Any]) -> dict[str, Any]:
        """Parse SOE response into normalized scores."""
        # Parse nested result if present
        raw_result = data.get("result", {})
        if isinstance(raw_result, str):
            try:
                raw_result = json.loads(raw_result)
            except:
                raw_result = {}

        resp = raw_result if raw_result else data

        def safe_score(key: str, default: float = 0.0) -> float:
            val = resp.get(key, default)
            if isinstance(val, (int, float)):
                return float(val)
            return default

        # Extract from Words array if present
        pronunciation = safe_score("PronAccuracy", 0)
        fluency = safe_score("PronFluency", 0)
        completion = safe_score("PronCompletion", 0)

        # Calculate total as weighted average
        total = pronunciation * 0.4 + fluency * 0.3 + completion * 0.3

        # Extract word-level analysis
        words = []
        raw_words = resp.get("Words", [])
        if isinstance(raw_words, list):
            for w in raw_words:
                if isinstance(w, dict):
                    words.append({
                        "word": w.get("Word", ""),
                        "match_tag": w.get("MatchTag", 0),  # 0=正确, 1=多词, 2=漏读, 3=错读, 4=未录入
                        "accuracy": w.get("PronAccuracy", 0),
                        "begin_time": w.get("MemBeginTime", 0),
                        "end_time": w.get("MemEndTime", 0),
                    })

        return {
            "pronunciation": pronunciation,
            "fluency": fluency * 100,  # Convert to 0-100 scale
            "integrity": completion * 100,
            "rhythm": 0,
            "total": total,
            "words": words,  # 逐词分析
        }


soe_service = SOEService()