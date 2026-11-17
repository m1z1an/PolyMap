import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import create_engine, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .db import DATABASE_URL, Employee, EmployeeSession, Publication, Report

app = FastAPI(title="PolyMap API", version="1.0")
origins = [origin.strip() for origin in os.getenv("POLYMAP_ORIGINS", "").split(",") if origin.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "PATCH"],
                       allow_headers=["Authorization", "Content-Type"])

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
Status = Literal["new", "review", "closed"]
Message = Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=2000)]
Version = Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{16}$")]

class ReportInput(BaseModel):
    map_version: Version
    building_id: UUID | None = None
    place_id: UUID
    message: Message

class LoginInput(BaseModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=1024)]

class ReportUpdate(BaseModel):
    status: Status
    resolution: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""
    outcome: Literal["fixed", "not_confirmed"] | None = None
    correction_map_version: Version | None = None
    revision: int = Field(ge=1)

class ReportView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    map_version: str
    building_id: str | None
    place_id: str
    message: str
    status: Status
    resolution: str
    outcome: Literal["fixed", "not_confirmed"] | None
    correction_map_version: str | None
    place_name: str
    building_name: str
    revision: int
    created_at: datetime
    updated_at: datetime

def session():
    with Session(engine) as db:
        yield db

DB = Annotated[Session, Depends(session)]

def password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"

def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt, _ = encoded.split("$")
        return algorithm == "scrypt" and secrets.compare_digest(password_hash(password, bytes.fromhex(salt)), encoded)
    except (ValueError, TypeError):
        return False

def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def moderator(db: DB, authorization: Annotated[str, Header()] = "") -> EmployeeSession:
    token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
    session_row = db.get(EmployeeSession, token_digest(token)) if token else None
    if not session_row or session_row.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(401, "Требуется вход сотрудника")
    return session_row

@app.post("/api/auth/login")
def login(payload: LoginInput, db: DB):
    employee = db.scalar(select(Employee).where(Employee.username == payload.username))
    if not employee or not verify_password(payload.password, employee.password_hash):
        raise HTTPException(401, "Неверное имя сотрудника или пароль")
    token = secrets.token_urlsafe(32)
    db.add(EmployeeSession(token_hash=token_digest(token), employee_id=employee.id,
                           expires_at=datetime.now(timezone.utc) + timedelta(hours=12)))
    db.commit()
    return {"token": token, "username": employee.username}

@app.post("/api/auth/logout")
def logout(db: DB, employee_session: Annotated[EmployeeSession, Depends(moderator)]):
    db.delete(employee_session)
    db.commit()
    return {"ok": True}

def report_view(report: Report, publication: Publication) -> ReportView:
    place = next((p for p in publication.payload.get("places", []) if p.get("id") == report.place_id), {})
    building = next ( (b for b in publication.payload.get("buildings", []) if b.get("id") == report.building_id), {})
    values = {column.name: getattr(report, column.name) for column in Report.__table__.columns}
    return ReportView(**values, place_name=place.get("name") or report.place_id,
                      building_name=building.get("name") or (report.building_id or "Кампус"))

def publish(path: Path):
    raw = path.read_bytes()
    data = json.loads(raw)
    if not all(isinstance(data.get(key), list) and data[key] for key in
               ("campus", "buildings", "places", "nodes", "connections")) or not data.get("revision"):
        raise ValueError("Неполный пакет карты")
    version = hashlib.sha256(raw).hexdigest()[:16]
    with Session(engine) as db:
        db.execute(insert(Publication).values(version=version, payload=data).on_conflict_do_nothing())
        db.commit()
    return version

@app.get("/api/maps/current")
def current_map(db: DB):
    version = db.scalar(select(Publication.version).order_by(
        Publication.published_at.desc(), Publication.version.desc()).limit(1))
    if not version:
        raise HTTPException(404, "Карты пока не опубликованы")
    return {"version": version, "url": f"/api/maps/{version}/bundle"}

@app.get("/api/maps/{version}/bundle")
def map_bundle(version: Version, db: DB):
    publication = db.get(Publication, version)
    if publication is None:
        raise HTTPException(404, "Версия карты отсутствует")
    return publication.payload

@app.post("/api/reports", status_code=201)
def submit_report(payload: ReportInput, db: DB):
    publication = db.get(Publication, payload.map_version)
    place = next((place for place in publication.payload["places"]
                  if place["id"] == str(payload.place_id)), None) if publication else None
    building = str(payload.building_id) if payload.building_id else None
    if place is None or building != place["building"]:
        raise HTTPException(422, "Место отсутствует в этой версии карты")
    report = Report(map_version=payload.map_version, building_id=building,
                    place_id=str(payload.place_id), message=payload.message)
    db.add(report)
    db.flush()
    result = {"id": report.id, "status": report.status}
    db.commit()
    return result

@app.get("/api/reports", response_model=list[ReportView], dependencies=[Depends(moderator)])
def list_reports(db: DB, status: Status | None = None, building_id: UUID | None = None,
                 offset: Annotated[int, Query(ge=0)] = 0, limit: Annotated[int, Query(ge=1, le=100)] = 30):
    query = select(Report).order_by(Report.id.desc()).offset(offset).limit(limit)
    if status:
        query = query.where(Report.status == status)
    if building_id:
        query = query.where(Report.building_id == str(building_id))
    reports = list(db.scalars(query))
    return [report_view(report, db.get(Publication, report.map_version)) for report in reports]

@app.patch("/api/reports/{report_id}", response_model=ReportView, dependencies=[Depends(moderator)])
def update_report(report_id: int, payload: ReportUpdate, db: DB):
    if payload.status == "closed" and not payload.resolution:
        raise HTTPException(422, "Укажите результат проверки")
    if payload.status == "closed":
        if payload.outcome is None:
            raise HTTPException(422, "Выберите итог проверки")
        if payload.outcome == "fixed" and (not payload.correction_map_version or not db.get(Publication, payload.correction_map_version)):
            raise HTTPException(422, "Укажите опубликованную версию с исправлением")
        original = db.get(Report, report_id)
        if payload.outcome == "fixed" and original and original.map_version == payload.correction_map_version:
            raise HTTPException(422, "Исправление должно ссылаться на другую версию карты")
    if (payload.status != "closed" and (payload.outcome or payload.correction_map_version)) or (payload.outcome != "fixed" and payload.correction_map_version):
        raise HTTPException(422, "Итог проверки и версия исправления не соответствуют статусу")
    row = db.scalar(update(Report).where(Report.id == report_id, Report.revision == payload.revision)
                    .values(status=payload.status, resolution=payload.resolution, outcome=payload.outcome,
                            correction_map_version=payload.correction_map_version,
                            updated_at=func.now(), revision=Report.revision + 1).returning(Report))
    if row is None:
        raise HTTPException(409 if db.get(Report, report_id) else 404, "Заявка изменилась или удалена")
    view = report_view(row, db.get(Publication, row.map_version))
    db.commit()
    return view

if __name__ == "__main__":
    import sys
    print(publish(Path(sys.argv[1])))
