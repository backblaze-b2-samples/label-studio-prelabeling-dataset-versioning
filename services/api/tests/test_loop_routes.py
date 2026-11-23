"""HTTP mapping of the loop routes: status codes and the 409 ReleaseBlocked body."""

import pytest


@pytest.mark.asyncio
async def test_project_routes(client, loop):
    created = await client.post("/projects", json={"title": "Route test", "labels": ["person"]})
    assert created.status_code == 201
    slug = created.json()["slug"]
    assert (await client.get("/projects")).json()[0]["slug"] == slug
    assert (await client.post(f"/projects/{slug}/sync")).json()["in_sync"] is True
    assert (await client.post(f"/projects/{slug}/prelabel-runs", json={"threshold": 0.3})).status_code == 200
    assert loop.ml.calls[-1][1] == 0.3

    blocked = await client.post(f"/projects/{slug}/releases", json={})
    assert blocked.status_code == 409
    body = blocked.json()
    assert body["detail"] and len(body["flagged"]) == 3

    verification = await client.get(f"/projects/{slug}/verification")
    assert verification.json()["status"] == "incomplete"

    page = await client.get(f"/projects/{slug}/assets", params={"kind": "raw"})
    assert page.status_code == 200 and len(page.json()["items"]) == 3
    assert page.json()["items"][0]["prelabel_status"] is True
    runs = await client.get(f"/projects/{slug}/assets", params={"kind": "prelabels"})
    assert len(runs.json()["groups"]) == 1

    patched = await client.patch(f"/projects/{slug}", json={"description": "x"})
    assert patched.status_code == 200 and patched.json()["description"] == "x"
    assert (await client.delete(f"/projects/{slug}")).json()["slug"] == slug


@pytest.mark.asyncio
async def test_error_statuses(client, loop):
    assert (await client.get("/projects/nope-nope")).status_code == 404
    assert (await client.get("/projects/Bad_Slug")).status_code == 400
    assert (await client.get("/projects/ab/assets", params={"kind": "exports", "release": "../x"})).status_code in (400, 404)
    assert (await client.get("/models")).json()["license"] == "Apache-2.0"


@pytest.mark.asyncio
async def test_unreachable_dependency_is_503(client, loop, monkeypatch):
    from app.repo.upstream import UpstreamServiceError

    def down():
        raise UpstreamServiceError("ML backend", "connection refused")

    monkeypatch.setattr(loop.ml, "info", down)
    response = await client.get("/models")
    assert response.status_code == 503
    assert "docker compose up" in response.json()["detail"]
