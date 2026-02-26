"""
E2E test configuration. Requires: pip install playwright && playwright install chromium
"""

import pytest

BASE_URL = "http://localhost:6666"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL
