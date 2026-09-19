import json

import httpx
import pytest

from learning_mirror_zju_connector.client import (
    CAS_LOGIN_URL,
    CAS_PUBLIC_KEY_URL,
    LEARNING_HOME_URL,
    LEARNING_TODOS_URL,
    TIMETABLE_URL,
    ZjuClient,
    ZjuConnectorError,
    encrypt_password,
)
from learning_mirror_zju_connector.normalizers import (
    normalize_timetable,
    normalize_todos,
)


def test_encrypt_password_matches_textbook_rsa() -> None:
    # 0x0ca1 = 3233, e = 17; value 65 encrypts to 2790 (0x0ae6).
    assert encrypt_password("A", "0ca1", "11") == "0ae6"


def test_normalize_timetable_filters_and_shapes_records() -> None:
    body = json.dumps(
        {
            "kbList": [
                {
                    "kcb": "高等数学<br>MA101<br>张老师<br>东1-101zwf",
                    "xkkh": "course-1",
                    "xqj": "2",
                    "djj": "3",
                    "skcd": "2",
                    "xxq": "秋",
                    "dsz": "0",
                    "sfqd": "1",
                },
                {"kcb": None},
            ]
        },
        ensure_ascii=False,
    )
    result = normalize_timetable(body, 2026, "1|秋")
    assert result == [
        {
            "id": result[0]["id"],
            "source": "zju-undergraduate",
            "course_id": "course-1",
            "course_name": "高等数学",
            "teacher": "张老师",
            "location": "东1-101",
            "day_of_week": 2,
            "periods": [3, 4],
            "first_half": True,
            "second_half": False,
            "week_pattern": "odd",
            "confirmed": True,
        }
    ]


def test_normalize_todos_exports_only_student_items_and_deduplicates() -> None:
    body = json.dumps(
        {
            "todo_list": [
                {"id": 7, "is_student": True, "title": "作业一", "course_name": "数学分析", "end_time": "2026-09-20T12:00:00+08:00"},
                {"id": 7, "is_student": True, "title": "重复", "course_name": "数学分析"},
                {"id": 8, "is_student": False, "title": "教师待办"},
            ]
        },
        ensure_ascii=False,
    )
    result = normalize_todos(body)
    assert len(result) == 1
    assert result[0] | {"id": "ignored"} == {
        "id": "ignored",
        "source": "zju-learning",
        "source_id": "7",
        "title": "作业一",
        "course_name": "数学分析",
        "due_at": "2026-09-20T12:00:00+08:00",
    }


def test_login_and_sync_keep_credentials_out_of_export() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "zjuam.zju.edu.cn" and request.url.path == "/cas/login" and request.method == "GET":
            if request.url.params.get("service"):
                return httpx.Response(302, headers={"location": "https://zdbk.zju.edu.cn/callback?ticket=ST-1"})
            return httpx.Response(200, text='<input name="execution" value="e1s1">')
        if str(request.url) == CAS_PUBLIC_KEY_URL:
            return httpx.Response(200, json={"modulus": "f" * 256, "exponent": "10001"})
        if str(request.url) == CAS_LOGIN_URL and request.method == "POST":
            return httpx.Response(200, headers={"set-cookie": "iPlanetDirectoryPro=sso; Domain=.zju.edu.cn; Path=/; Secure"})
        if request.url.host == "zdbk.zju.edu.cn" and request.url.path == "/callback":
            return httpx.Response(200, headers=[
                ("set-cookie", "JSESSIONID=academic; Path=/; Secure"),
                ("set-cookie", "route=node-1; Path=/; Secure"),
            ])
        if str(request.url) == LEARNING_HOME_URL:
            return httpx.Response(302, headers={"location": "https://courses.zju.edu.cn/ready"})
        if request.url.host == "courses.zju.edu.cn" and request.url.path == "/ready":
            return httpx.Response(200, headers={"set-cookie": "session=learning; Path=/; Secure"})
        if str(request.url) == TIMETABLE_URL:
            return httpx.Response(200, json={"kbList": []})
        if str(request.url) == LEARNING_TODOS_URL:
            return httpx.Response(200, json={"todo_list": []})
        return httpx.Response(404)

    client = ZjuClient(transport=httpx.MockTransport(handler))
    client.login("test-account", "test-only-password")
    client.connect_academic()
    client.connect_learning()
    exported = client.sync(2026, "1|秋").to_dict()
    serialized = json.dumps(exported)
    assert "test-only-password" not in serialized
    assert "iPlanetDirectoryPro" not in serialized
    assert "session" not in serialized
    assert client.username == "test-account"
    client.logout()
    assert not client.connected


def test_learning_redirect_rejects_unapproved_host() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == CAS_LOGIN_URL and request.method == "GET":
            return httpx.Response(200, text='<input name="execution" value="e1s1">')
        if str(request.url) == CAS_PUBLIC_KEY_URL:
            return httpx.Response(200, json={"modulus": "f" * 256, "exponent": "10001"})
        if str(request.url) == CAS_LOGIN_URL and request.method == "POST":
            return httpx.Response(200, headers={"set-cookie": "iPlanetDirectoryPro=sso; Domain=.zju.edu.cn; Path=/; Secure"})
        if str(request.url) == LEARNING_HOME_URL:
            return httpx.Response(302, headers={"location": "https://evil.example/steal"})
        return httpx.Response(404)

    client = ZjuClient(transport=httpx.MockTransport(handler))
    client.login("test-account", "test-only-password")
    with pytest.raises(ZjuConnectorError, match="非预期跳转"):
        client.connect_learning()
