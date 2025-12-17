"""Schedule parser tests."""

from datetime import time

from src.integrations.rasp_parser import RaspParser


class TestRaspParser:
    """Tests for RaspParser."""

    def test_parse_time_range_valid(self) -> None:
        """Test parsing valid time range."""
        parser = RaspParser()
        start, end = parser._parse_time_range("09:00 - 10:30")

        assert start == time(9, 0)
        assert end == time(10, 30)

    def test_parse_time_range_with_dash(self) -> None:
        """Test parsing time range with different dash."""
        parser = RaspParser()
        start, end = parser._parse_time_range("14:30–16:00")

        assert start == time(14, 30)
        assert end == time(16, 0)

    def test_parse_time_range_empty(self) -> None:
        """Test parsing empty time range."""
        parser = RaspParser()
        start, end = parser._parse_time_range("")

        assert start is None
        assert end is None

    def test_parse_time_range_invalid(self) -> None:
        """Test parsing invalid time range."""
        parser = RaspParser()
        start, end = parser._parse_time_range("invalid")

        assert start is None
        assert end is None

    def test_get_default_times(self) -> None:
        """Test default pair times."""
        parser = RaspParser()

        # First pair
        start, end = parser._get_default_times(1)
        assert start == time(9, 0)
        assert end == time(10, 30)

        # Fourth pair
        start, end = parser._get_default_times(4)
        assert start == time(14, 30)
        assert end == time(16, 0)

    def test_parse_week_parity_odd(self) -> None:
        """Test parsing odd week."""
        parser = RaspParser()

        assert parser._parse_week_parity("нечет") == "odd"
        assert parser._parse_week_parity("НЧ") == "odd"
        assert parser._parse_week_parity("нечетная") == "odd"

    def test_parse_week_parity_even(self) -> None:
        """Test parsing even week."""
        parser = RaspParser()

        assert parser._parse_week_parity("чет") == "even"
        assert parser._parse_week_parity("ЧН") == "even"
        assert parser._parse_week_parity("четная") == "even"

    def test_parse_week_parity_none(self) -> None:
        """Test parsing empty week parity."""
        parser = RaspParser()

        assert parser._parse_week_parity("") is None
        assert parser._parse_week_parity("both") is None

    def test_parse_lesson_filters_pe(self) -> None:
        """Test filtering out PE classes."""
        parser = RaspParser()

        lesson = {"sbj": "-*Физ*-", "time": "09:00 - 10:30"}
        result = parser._parse_lesson(1, 1, lesson)

        assert result is None

    def test_parse_lesson_filters_pd(self) -> None:
        """Test filtering out personal development."""
        parser = RaspParser()

        lesson = {"sbj": "-*ПД*-", "time": "09:00 - 10:30"}
        result = parser._parse_lesson(1, 1, lesson)

        assert result is None

    def test_parse_lesson_valid(self) -> None:
        """Test parsing valid lesson."""
        parser = RaspParser()

        lesson = {
            "sbj": "Математика",
            "time": "09:00 - 10:30",
            "teacher": "Иванов И.И.",
            "aud": "101",
            "type": "Лекция",
        }
        result = parser._parse_lesson(1, 1, lesson)

        assert result is not None
        assert result["subject"] == "Математика"
        assert result["weekday"] == 1
        assert result["pair_number"] == 1
        assert result["teacher"] == "Иванов И.И."
        assert result["room"] == "101"
        assert result["lesson_type"] == "Лекция"
