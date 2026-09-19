from fastapi.testclient import TestClient

from learning_mirror_zju_connector.app import app


def test_local_ui_is_available_only_on_expected_loopback_host() -> None:
    local = TestClient(app, base_url="http://127.0.0.1:8765")
    response = local.get("/")
    assert response.status_code == 200
    assert "学镜 · 浙大本地连接器" in response.text
    assert "同步到学镜工作台" in response.text
    assert '"https://learningmirror.cn"' in response.text

    foreign = TestClient(app, base_url="http://attacker.example")
    assert foreign.get("/").status_code == 403


def test_mutation_requires_non_simple_local_request_header() -> None:
    client = TestClient(app, base_url="http://127.0.0.1:8765")
    assert client.post("/api/logout").status_code == 403
    assert client.post(
        "/api/logout", headers={"X-Learning-Mirror-Local": "1"}
    ).json() == {"connected": False}


def test_cross_origin_request_is_rejected() -> None:
    client = TestClient(app, base_url="http://127.0.0.1:8765")
    response = client.get("/api/status", headers={"Origin": "https://learningmirror.cn"})
    assert response.status_code == 403
