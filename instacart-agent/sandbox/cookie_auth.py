from hmac import compare_digest
from http.cookies import CookieError, SimpleCookie
from pathlib import Path

from websockify.auth_plugins import AuthenticationError


class SessionCookieAuth:
    """Authorize a noVNC WebSocket with a short-lived, same-origin cookie."""

    COOKIE_NAME = "__Host-nutriplan-view"

    def __init__(self, src=None):
        self.token_path = Path(src or "")

    def authenticate(self, headers, target_host, target_port):
        try:
            expected = self.token_path.read_text(encoding="utf-8").strip()
            cookies = SimpleCookie()
            cookies.load(headers.get("Cookie", ""))
            supplied_cookie = cookies.get(self.COOKIE_NAME)
            supplied = supplied_cookie.value if supplied_cookie else ""
        except (CookieError, OSError, UnicodeError):
            supplied = ""
            expected = ""

        if not expected or not supplied or not compare_digest(supplied, expected):
            raise AuthenticationError(
                response_code=403,
                response_msg="Private browser authorization required.",
            )
