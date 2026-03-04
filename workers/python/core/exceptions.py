class ServiceError(Exception):
    """Base class for service layer exceptions."""
    pass

class RateLimitError(ServiceError):
    pass

class AuthError(ServiceError):
    pass

class UpstreamError(ServiceError):
    pass
