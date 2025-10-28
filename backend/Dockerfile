FROM python:3.12-slim AS builder

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml README.md ./
COPY src/ ./src/
# Install dependencies only, not the package itself
RUN uv pip install --system --no-cache -e .

FROM python:3.12-slim AS runtime

WORKDIR /app

RUN groupadd --gid 1000 nexora && \
    useradd --uid 1000 --gid 1000 --shell /bin/bash nexora && \
    apt-get update && apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy source code last so it takes precedence
COPY --chown=nexora:nexora src/ ./src/
COPY --chown=nexora:nexora alembic/ ./alembic/
COPY --chown=nexora:nexora alembic.ini pyproject.toml ./

USER nexora

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
