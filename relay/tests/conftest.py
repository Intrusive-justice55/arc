"""Shared test configuration."""

import pytest


# Ensure event loop is properly configured for pytest-asyncio
@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
