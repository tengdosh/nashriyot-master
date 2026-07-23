"""Nashriyot-Master AI microservice (skeleton).

Task 1 provides only a health endpoint. Later milestones (v1 §7, M10/M18/M19)
add /predict, /coldstart and /elasticity. The service is reached server-to-server
from the Next.js app over the Docker network with a shared token.
"""

from fastapi import FastAPI

app = FastAPI(title="Nashriyot-Master AI Service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness probe. Returns 200 with a small JSON body."""
    return {"status": "ok", "service": "ai-service"}
