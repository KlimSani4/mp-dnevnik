"""Schedule parser for rasp.dmami.ru."""

import asyncio
import logging
import re
from datetime import time
from typing import Any

import httpx

from src.shared.exceptions import ExternalServiceError

logger = logging.getLogger(__name__)

RASP_URL = "https://rasp.dmami.ru/site/group"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
TIMEOUT = 30.0

# Subjects to filter out (only pure PE electives, not ПД)
FILTER_PATTERNS = [
    r"Элективные дисциплины по физической культуре",
    r"Общая физическая подготовка",
    r"Проектная деятельность",
]


class CircuitBreaker:
    """Simple circuit breaker for external services."""

    def __init__(
        self,
        failure_threshold: int = 5,
        reset_timeout: float = 30.0,
    ) -> None:
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.failures = 0
        self.last_failure_time: float | None = None
        self.state = "closed"  # closed, open, half-open

    def record_success(self) -> None:
        """Record successful call."""
        self.failures = 0
        self.state = "closed"

    def record_failure(self) -> None:
        """Record failed call."""
        self.failures += 1
        self.last_failure_time = asyncio.get_running_loop().time()
        if self.failures >= self.failure_threshold:
            self.state = "open"
            logger.warning("Circuit breaker opened")

    def can_proceed(self) -> bool:
        """Check if call can proceed."""
        if self.state == "closed":
            return True

        if self.state == "open":
            if self.last_failure_time is None:
                return True
            elapsed = asyncio.get_running_loop().time() - self.last_failure_time
            if elapsed >= self.reset_timeout:
                self.state = "half-open"
                logger.info("Circuit breaker half-open")
                return True
            return False

        # half-open
        return True


_circuit_breaker = CircuitBreaker()


class RaspParser:
    """Parser for Moscow Polytechnic schedule API."""

    def __init__(self) -> None:
        self.client = httpx.AsyncClient(
            timeout=TIMEOUT,
            headers={
                "User-Agent": USER_AGENT,
                "Referer": "https://rasp.dmami.ru/",
                "X-Requested-With": "XMLHttpRequest",
            },
        )

    async def close(self) -> None:
        """Close HTTP client."""
        await self.client.aclose()

    async def fetch_schedule(
        self,
        group_code: str,
        *,
        max_retries: int = 3,
    ) -> list[dict[str, Any]]:
        """
        Fetch schedule from rasp.dmami.ru.

        Returns list of schedule entries ready for import.
        """
        if not _circuit_breaker.can_proceed():
            raise ExternalServiceError("Schedule service temporarily unavailable")

        last_error: Exception | None = None

        for attempt in range(max_retries):
            try:
                response = await self._fetch_with_retry(group_code)
                _circuit_breaker.record_success()
                return self._parse_response(response)

            except httpx.TimeoutException as e:
                last_error = e
                logger.warning(
                    "Schedule fetch timeout",
                    extra={"group": group_code, "attempt": attempt + 1},
                )
                _circuit_breaker.record_failure()

            except httpx.HTTPStatusError as e:
                last_error = e
                logger.error(
                    "Schedule fetch HTTP error",
                    extra={
                        "group": group_code,
                        "status": e.response.status_code,
                    },
                )
                _circuit_breaker.record_failure()
                break  # Don't retry on HTTP errors

            except Exception as e:
                last_error = e
                logger.exception("Schedule fetch error", extra={"group": group_code})
                _circuit_breaker.record_failure()

            # Exponential backoff
            if attempt < max_retries - 1:
                await asyncio.sleep(2**attempt)

        raise ExternalServiceError(f"Failed to fetch schedule: {last_error}")

    async def _fetch_with_retry(self, group_code: str) -> dict[str, Any]:
        """Fetch schedule data from API."""
        response = await self.client.get(
            RASP_URL,
            params={
                "group": group_code,
                "session": "0",
            },
        )
        response.raise_for_status()

        data: dict[str, Any] = response.json()

        if not data.get("grid"):
            logger.warning("Empty schedule grid", extra={"group": group_code})
            return {}

        return data

    def _parse_response(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """Parse API response into schedule entries."""
        entries: list[dict[str, Any]] = []

        grid = data.get("grid", {})

        for weekday_str, day_data in grid.items():
            try:
                weekday = int(weekday_str)
            except ValueError:
                continue

            if not isinstance(day_data, dict):
                continue

            for pair_str, pair_data in day_data.items():
                try:
                    pair_number = int(pair_str)
                except ValueError:
                    continue

                if not isinstance(pair_data, list):
                    continue

                for lesson in pair_data:
                    entry = self._parse_lesson(weekday, pair_number, lesson)
                    if entry:
                        entries.append(entry)

        return entries

    def _parse_lesson(
        self,
        weekday: int,
        pair_number: int,
        lesson: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Parse single lesson entry."""
        subject = lesson.get("sbj", "")

        # Filter out PE and personal development
        for pattern in FILTER_PATTERNS:
            if re.search(pattern, subject, re.IGNORECASE):
                return None

        # Parse time
        time_str = lesson.get("time", "")
        start_time, end_time = self._parse_time_range(time_str)

        if not start_time or not end_time:
            # Use default times based on pair number
            start_time, end_time = self._get_default_times(pair_number)

        # Parse location
        location = lesson.get("location", "")
        room = lesson.get("shortRooms", [""])[0] if lesson.get("shortRooms") else ""
        if room and location:
            location = f"{location}, {room}"
        elif room:
            location = room

        return {
            "subject": subject.strip(),
            "weekday": weekday,
            "pair_number": pair_number,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "location": location.strip() if location else None,
            "room": room.strip() if room else None,
            "teacher": lesson.get("teacher", "").strip() or None,
            "lesson_type": lesson.get("type", "").strip() or None,
            "week_parity": self._parse_week_parity(lesson.get("week", "")),
            "date_from": lesson.get("df"),
            "date_to": lesson.get("dt"),
            "external_link": lesson.get("e_link"),
            "raw_data": lesson,
        }

    @staticmethod
    def _parse_time_range(time_str: str) -> tuple[time | None, time | None]:
        """Parse time range string like '09:00 - 10:30'."""
        if not time_str:
            return None, None

        match = re.match(r"(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})", time_str)
        if not match:
            return None, None

        try:
            start = time(int(match.group(1)), int(match.group(2)))
            end = time(int(match.group(3)), int(match.group(4)))
            return start, end
        except ValueError:
            return None, None

    @staticmethod
    def _get_default_times(pair_number: int) -> tuple[time, time]:
        """Get default times for pair number (Moscow Poly schedule)."""
        pairs = {
            1: (time(9, 0), time(10, 30)),
            2: (time(10, 40), time(12, 10)),
            3: (time(12, 20), time(13, 50)),
            4: (time(14, 30), time(16, 0)),
            5: (time(16, 10), time(17, 40)),
            6: (time(17, 50), time(19, 20)),
            7: (time(19, 30), time(21, 0)),
        }
        return pairs.get(pair_number, (time(9, 0), time(10, 30)))

    @staticmethod
    def _parse_week_parity(week_str: str) -> str | None:
        """Parse week parity string."""
        if not week_str:
            return None

        week_lower = week_str.lower()
        if "нечет" in week_lower or "нч" in week_lower:
            return "odd"
        if "чет" in week_lower or "чн" in week_lower:
            return "even"
        return None


async def fetch_group_schedule(group_code: str) -> list[dict[str, Any]]:
    """Convenience function to fetch schedule for a group."""
    parser = RaspParser()
    try:
        return await parser.fetch_schedule(group_code)
    finally:
        await parser.close()
