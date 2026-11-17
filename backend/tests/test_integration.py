"""PostgreSQL integration checks; set TEST_DATABASE_URL to a disposable test database."""
import os
import subprocess
import sys
import uuid
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL is required")


@pytest.fixture
def database(monkeypatch):
    schema = "test_" + uuid.uuid4().hex
    admin = create_engine(URL)
    with admin.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    scoped = make_url(URL).update_query_dict({"options": f"-csearch_path={schema}"})
    url = scoped.render_as_string(hide_password=False)
    monkeypatch.setenv("DATABASE_URL", url)

    def migrate(revision):
        subprocess.run([sys.executable, "-m", "alembic", "-c", "backend/alembic.ini", "upgrade", revision],
                       cwd=ROOT, env={**os.environ, "DATABASE_URL": url}, check=True)

    yield url, migrate
    with admin.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    admin.dispose()


def test_upgrade_existing_and_metadata(database):
    url, migrate = database
    migrate("0001")
    engine = create_engine(url)
    with engine.begin() as c:
        c.execute(text("INSERT INTO map_publications(version,payload) VALUES ('aaaaaaaaaaaaaaaa', '{\"label\":\"original\"}')"))
        c.execute(text("INSERT INTO reports(id,map_version,place_id,message,status,resolution) VALUES "
                       "(42,'aaaaaaaaaaaaaaaa','place','existing report','closed','done')"))
    migrate("head")
    from backend.db import Base
    with engine.connect() as c:
        row = c.execute(text("SELECT id,map_version,place_id,message,status,resolution,outcome,correction_map_version FROM reports")).one()
        assert tuple(row) == (42, "aaaaaaaaaaaaaaaa", "place", "existing report", "closed", "done", None, None)
        assert c.execute(text("SELECT payload FROM map_publications")).scalar_one() == {"label": "original"}
        assert compare_metadata(MigrationContext.configure(c), Base.metadata) == []
    engine.dispose()


def test_revision_template_generates(database, tmp_path):
    url, migrate = database
    migrate("head")
    folder = tmp_path / "alembic"
    shutil.copytree(ROOT / "backend" / "alembic", folder, ignore=shutil.ignore_patterns("__pycache__"))
    config = tmp_path / "alembic.ini"
    config.write_text(f"[alembic]\nscript_location = {folder.as_posix()}\nprepend_sys_path = .\n")
    subprocess.run([sys.executable, "-m", "alembic", "-c", str(config), "revision", "--autogenerate", "-m", "check template"],
                   cwd=ROOT, env={**os.environ, "DATABASE_URL": url}, check=True)
    generated = list((folder / "versions").glob("*_check_template.py"))
    assert len(generated) == 1
    compile(generated[0].read_text(encoding="utf-8"), str(generated[0]), "exec")


def test_empty_upgrade_and_report_lifecycle(database, monkeypatch):
    url, migrate = database
    migrate("head")
    from backend import main
    from backend.db import Employee, Publication
    from sqlalchemy.orm import Session
    engine = create_engine(url)
    monkeypatch.setattr(main, "engine", engine)
    building = "3f8a34a4-f93b-4e54-a859-3319412cc477"
    place = "6a6adde3-f5bc-42bd-9f9c-ca0b45c311ca"
    original = {"places": [{"id": place, "building": building, "name": "Old place"}],
                "buildings": [{"id": building, "name": "Old building"}]}
    with Session(engine) as db:
        db.add_all([Publication(version="aaaaaaaaaaaaaaaa", payload=original),
                    Publication(version="bbbbbbbbbbbbbbbb", payload={"places": [], "buildings": []}),
                    Employee(username="employee", password_hash=main.password_hash("secret password"))])
        db.commit()
    with TestClient(main.app) as client:
        assert client.get("/api/reports").status_code == 401
        assert client.post("/api/auth/login", json={"username": "employee", "password": "bad"}).status_code == 401
        report = client.post("/api/reports", json={"map_version": "aaaaaaaaaaaaaaaa", "building_id": building,
                             "place_id": place, "message": "A valid report message"})
        assert report.status_code == 201
        report_id = report.json()["id"]
        assert client.patch(f"/api/reports/{report_id}", json={"status": "review", "revision": 1}).status_code == 401
        invalid = {"map_version": "cccccccccccccccc", "building_id": building,
                   "place_id": place, "message": "A valid report message"}
        assert client.post("/api/reports", json=invalid).status_code == 422
        token = client.post("/api/auth/login", json={"username": "employee", "password": "secret password"}).json()["token"]
        headers = {"Authorization": "Bearer " + token}
        filtered = client.get("/api/reports", headers=headers, params={"building_id": building, "status": "new"})
        assert [row["id"] for row in filtered.json()] == [report_id]
        assert client.get("/api/reports", headers=headers, params={"building_id": str(uuid.uuid4())}).json() == []
        item = client.get("/api/reports", headers=headers).json()[0]
        assert (item["place_name"], item["building_name"]) == ("Old place", "Old building")
        data = {"status": "closed", "resolution": "Corrected", "outcome": "fixed", "revision": 1}
        assert client.patch(f"/api/reports/{report_id}", headers=headers, json=data).status_code == 422
        data["correction_map_version"] = "aaaaaaaaaaaaaaaa"
        assert client.patch(f"/api/reports/{report_id}", headers=headers, json=data).status_code == 422
        data["correction_map_version"] = "bbbbbbbbbbbbbbbb"
        closed = client.patch(f"/api/reports/{report_id}", headers=headers, json=data)
        assert closed.status_code == 200
        assert closed.json()["map_version"] == "aaaaaaaaaaaaaaaa"
        assert closed.json()["correction_map_version"] == "bbbbbbbbbbbbbbbb"
        assert closed.json()["revision"] == 2
        assert client.patch(f"/api/reports/{report_id}", headers=headers, json=data).status_code == 409
        concurrent_report = client.post("/api/reports", json={"map_version": "aaaaaaaaaaaaaaaa", "building_id": building,
                                        "place_id": place, "message": "Another valid report"}).json()["id"]
        edit = {"status": "review", "resolution": "", "revision": 1}
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(lambda _: client.patch(f"/api/reports/{concurrent_report}", headers=headers, json=edit).status_code,
                                     range(2)))
        assert sorted(statuses) == [200, 409]
        assert client.patch(f"/api/reports/{concurrent_report}", headers=headers,
                            json={"status": "closed", "resolution": "Checked, no error", "outcome": "not_confirmed", "revision": 2}).status_code == 200
        assert client.post("/api/auth/logout", headers=headers).status_code == 200
        assert client.get("/api/reports", headers=headers).status_code == 401
        assert client.patch(f"/api/reports/{report_id}", headers=headers, json=data).status_code == 401
    engine.dispose()
