"""Simple agent worker runner for Windows."""
import asyncio
from app.agents.worker import AgentWorker

async def run():
    w = AgentWorker()
    w._running = True
    print('Agent worker started')
    while w._running:
        await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(run())
