import sys
from unittest.mock import MagicMock

class MockResponse:
    def __init__(self, body, status=200):
        self.body = body
        self.status = status
    
    @classmethod
    def json(cls, data, status=200):
        return cls(data, status)

class MockWorkers:
    Response = MockResponse
    
    @staticmethod
    async def fetch(*args, **kwargs):
        pass

# 在任何 module import handlers 之前，先將 dummy workers 放入 sys.modules
sys.modules['workers'] = MockWorkers()
