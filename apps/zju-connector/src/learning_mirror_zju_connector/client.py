from __future__ import annotations

import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx

CAS_LOGIN_URL = "https://zjuam.zju.edu.cn/cas/login"
CAS_PUBLIC_KEY_URL = "https://zjuam.zju.edu.cn/cas/v2/getPubKey"
UNDERGRADUATE_SERVICE_URL = "https://zdbk.zju.edu.cn/jwglxt/xtgl/login_ssologin.html"
TIMETABLE_URL = "https://zdbk.zju.edu.cn/jwglxt/kbcx/xskbcx_cxXsKb.html"
LEARNING_HOME_URL = "https://courses.zju.edu.cn/user/index"
LEARNING_TODOS_URL = "https://courses.zju.edu.cn/api/todos"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
MAX_RESPONSE_BYTES = 4 * 1024 * 1024
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
LEARNING_REDIRECT_HOSTS = {
    "courses.zju.edu.cn",
    "zjuam.zju.edu.cn",
    "identity.zju.edu.cn",
}


class ZjuConnectorError(RuntimeError):
    """A safe, user-facing connector failure without secret material."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class _ExecutionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.execution: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "input" or self.execution is not None:
            return
        values = dict(attrs)
        if values.get("name") == "execution" and values.get("value"):
            self.execution = values["value"]


@dataclass(frozen=True)
class SyncResult:
    academic_year_start: int
    season: str
    courses: list[dict[str, Any]]
    assignments: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "source": "zju-local-connector",
            "academic_year_start": self.academic_year_start,
            "season": self.season,
            "courses": self.courses,
            "assignments": self.assignments,
        }


def encrypt_password(password: str, modulus_hex: str, exponent_hex: str) -> str:
    """Implement the legacy textbook-RSA wire format used by the ZJU CAS page."""
    if not re.fullmatch(r"[0-9a-fA-F]+", modulus_hex or "") or not re.fullmatch(
        r"[0-9a-fA-F]+", exponent_hex or ""
    ):
        raise ZjuConnectorError("protocol-error", "统一认证返回的 RSA 公钥格式无效。")
    password_bytes = password.encode("utf-8")
    password_value = int.from_bytes(password_bytes, "big")
    modulus_value = int(modulus_hex, 16)
    exponent_value = int(exponent_hex, 16)
    if password_value >= modulus_value:
        raise ZjuConnectorError("invalid-input", "密码长度超出统一认证当前支持范围。")
    return format(pow(password_value, exponent_value, modulus_value), "x").zfill(
        len(modulus_hex)
    )


def _execution_from_html(body: str) -> str:
    parser = _ExecutionParser()
    parser.feed(body)
    if not parser.execution:
        raise ZjuConnectorError("protocol-error", "统一认证登录页结构已经变化。")
    return parser.execution


def _meta_refresh_target(body: str, base_url: str) -> str | None:
    match = re.search(
        r"<meta\b[^>]*http-equiv\s*=\s*['\"]?refresh['\"]?[^>]*content\s*=\s*['\"][^'\"]*url\s*=\s*([^'\";>]+)",
        body,
        re.IGNORECASE,
    )
    if not match:
        match = re.search(
            r"<meta\b[^>]*content\s*=\s*['\"][^'\"]*url\s*=\s*([^'\";>]+)[^>]*http-equiv\s*=\s*['\"]?refresh",
            body,
            re.IGNORECASE,
        )
    return urljoin(base_url, match.group(1).strip()) if match else None


def _cookie_exists(client: httpx.Client, name: str, domain_suffix: str | None = None) -> bool:
    for cookie in client.cookies.jar:
        if cookie.name != name:
            continue
        if domain_suffix is None or cookie.domain.lstrip(".").endswith(domain_suffix):
            return True
    return False


class ZjuClient:
    """In-memory ZJU session. Passwords are never retained on the instance."""

    def __init__(self, *, transport: httpx.BaseTransport | None = None) -> None:
        self._client = httpx.Client(
            headers={"User-Agent": USER_AGENT},
            follow_redirects=False,
            timeout=httpx.Timeout(20.0),
            transport=transport,
        )
        self.username: str | None = None
        self._academic_connected = False
        self._learning_connected = False

    @property
    def connected(self) -> bool:
        return self.username is not None

    def close(self) -> None:
        self.logout()
        self._client.close()

    def logout(self) -> None:
        self._client.cookies.clear()
        self.username = None
        self._academic_connected = False
        self._learning_connected = False

    def _checked(self, response: httpx.Response, label: str) -> httpx.Response:
        if len(response.content) > MAX_RESPONSE_BYTES:
            raise ZjuConnectorError("response-too-large", f"{label}响应超过本地安全上限。")
        if response.status_code >= 400:
            raise ZjuConnectorError(
                "upstream-error", f"{label}暂时不可用（HTTP {response.status_code}）。"
            )
        return response

    def login(self, username: str, password: str) -> None:
        clean_username = username.strip()
        if not clean_username or not password:
            raise ZjuConnectorError("invalid-input", "学号和密码不能为空。")
        if len(clean_username) > 64 or len(password) > 256:
            raise ZjuConnectorError("invalid-input", "学号或密码长度异常。")

        # Reset all prior service sessions before changing accounts.
        self.logout()
        login_page = self._checked(self._client.get(CAS_LOGIN_URL), "统一认证登录页")
        execution = _execution_from_html(login_page.text)
        key_response = self._checked(
            self._client.get(CAS_PUBLIC_KEY_URL), "统一认证公钥服务"
        )
        try:
            public_key = key_response.json()
            modulus = public_key["modulus"]
            exponent = public_key["exponent"]
        except (ValueError, KeyError, TypeError) as exc:
            raise ZjuConnectorError("protocol-error", "统一认证公钥响应无法解析。") from exc

        encrypted = encrypt_password(password, str(modulus), str(exponent))
        response = self._client.post(
            CAS_LOGIN_URL,
            data={
                "username": clean_username,
                "password": encrypted,
                "execution": execution,
                "_eventId": "submit",
                "rememberMe": "true",
            },
        )
        # Remove the only local reference as soon as the form body has been built and sent.
        del encrypted
        if not _cookie_exists(self._client, "iPlanetDirectoryPro"):
            if re.search(r"用户名或密码错误|账号或密码错误|学号或密码错误|密码错误", response.text):
                raise ZjuConnectorError("invalid-credentials", "统一认证拒绝了该学号或密码。")
            if re.search(r"验证码|captcha|滑块", response.text, re.IGNORECASE):
                raise ZjuConnectorError(
                    "interactive-verification-required",
                    "统一认证要求验证码或交互验证，请稍后使用官方页面完成验证。",
                )
            raise ZjuConnectorError("login-failed", "统一认证没有建立有效登录态。")

        self.username = clean_username

    def connect_academic(self) -> None:
        self._require_login()
        response = self._client.get(
            CAS_LOGIN_URL, params={"service": UNDERGRADUATE_SERVICE_URL}
        )
        location = response.headers.get("location")
        if response.status_code not in REDIRECT_STATUSES or not location:
            raise ZjuConnectorError("academic-login-failed", "统一认证未签发教务网访问凭证。")
        callback = urljoin(CAS_LOGIN_URL, location)
        parsed = urlparse(callback)
        if parsed.hostname != "zdbk.zju.edu.cn":
            raise ZjuConnectorError("unsafe-redirect", "教务网登录返回了非预期跳转。")
        if parsed.scheme == "http":
            callback = parsed._replace(scheme="https").geturl()
        elif parsed.scheme != "https":
            raise ZjuConnectorError("unsafe-redirect", "教务网登录返回了不安全跳转。")
        callback_response = self._client.get(callback)
        self._checked(callback_response, "教务网登录")
        if not _cookie_exists(
            self._client, "JSESSIONID", "zdbk.zju.edu.cn"
        ) or not _cookie_exists(self._client, "route", "zdbk.zju.edu.cn"):
            raise ZjuConnectorError("academic-login-failed", "教务网没有建立完整会话。")
        self._academic_connected = True

    def connect_learning(self) -> None:
        self._require_login()
        current = LEARNING_HOME_URL
        for _ in range(15):
            parsed = urlparse(current)
            if parsed.scheme != "https" or parsed.hostname not in LEARNING_REDIRECT_HOSTS:
                raise ZjuConnectorError("unsafe-redirect", "学在浙大登录返回了非预期跳转。")
            response = self._client.get(current)
            if response.status_code in REDIRECT_STATUSES:
                location = response.headers.get("location")
                if not location:
                    raise ZjuConnectorError("protocol-error", "学在浙大登录跳转缺少地址。")
                current = urljoin(current, location)
                continue
            self._checked(response, "学在浙大登录")
            target = _meta_refresh_target(response.text, current)
            if target:
                current = target
                continue
            if (
                parsed.hostname == "courses.zju.edu.cn"
                and _cookie_exists(self._client, "session", "courses.zju.edu.cn")
            ):
                self._learning_connected = True
                return
            break
        raise ZjuConnectorError("learning-login-failed", "学在浙大没有建立作业访问会话。")

    def fetch_timetable(self, academic_year_start: int, season: str) -> str:
        self._require_login()
        if not self._academic_connected:
            self.connect_academic()
        if academic_year_start < 2000 or academic_year_start > 2200:
            raise ZjuConnectorError("invalid-input", "学年参数无效。")
        if season not in {"1|秋", "1|冬", "2|春", "2|夏"}:
            raise ZjuConnectorError("invalid-input", "学季参数无效。")
        response = self._client.post(
            TIMETABLE_URL,
            data={
                "xnm": f"{academic_year_start}-{academic_year_start + 1}",
                "xqm": season,
                "captcha_value": "null",
            },
            headers={
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Referer": "https://zdbk.zju.edu.cn/jwglxt/xtgl/index_initMenu.html",
                "X-Requested-With": "XMLHttpRequest",
            },
        )
        self._checked(response, "教务网课表接口")
        if "captcha_error" in response.text.lower():
            raise ZjuConnectorError("interactive-verification-required", "教务网要求完成验证码。")
        if "统一身份认证" in response.text or "name=\"execution\"" in response.text:
            raise ZjuConnectorError("session-expired", "教务网会话已经失效，请重新连接。")
        return response.text

    def fetch_todos(self) -> str:
        self._require_login()
        if not self._learning_connected:
            self.connect_learning()
        response = self._client.get(LEARNING_TODOS_URL)
        self._checked(response, "学在浙大作业接口")
        if response.status_code in {301, 302, 303, 307, 308}:
            raise ZjuConnectorError("session-expired", "学在浙大会话已经失效，请重新连接。")
        return response.text

    def sync(self, academic_year_start: int, season: str) -> SyncResult:
        from .normalizers import normalize_timetable, normalize_todos

        courses = normalize_timetable(
            self.fetch_timetable(academic_year_start, season), academic_year_start, season
        )
        assignments = normalize_todos(self.fetch_todos())
        return SyncResult(academic_year_start, season, courses, assignments)

    def _require_login(self) -> None:
        if not self.connected:
            raise ZjuConnectorError("not-connected", "请先在本机连接浙大统一认证。")
