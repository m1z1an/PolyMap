import hashlib
import json
import os
import secrets
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import create_engine, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .db import DATABASE_URL, Publication, Report

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

class ReportUpdate(BaseModel):
    status: Status
    resolution: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""
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
    revision: int
    created_at: datetime
    updated_at: datetime

def session():
    with Session(engine) as db:
        yield db

DB = Annotated[Session, Depends(session)]

def moderator(authorization: Annotated[str, Header()] = ""):
    key = os.getenv("POLYMAP_ADMIN_KEY", "")
    if not key or not secrets.compare_digest(authorization.encode(), ("Bearer " + key).encode()):
        raise HTTPException(401, "Требуется ключ доступа")

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
    return list(db.scalars(query))

@app.patch("/api/reports/{report_id}", response_model=ReportView, dependencies=[Depends(moderator)])
def update_report(report_id: int, payload: ReportUpdate, db: DB):
    if payload.status == "closed" and not payload.resolution:
        raise HTTPException(422, "Укажите результат проверки")
    row = db.scalar(update(Report).where(Report.id == report_id, Report.revision == payload.revision)
                    .values(status=payload.status, resolution=payload.resolution,
                            updated_at=func.now(), revision=Report.revision + 1).returning(Report))
    if row is None:
        raise HTTPException(409 if db.get(Report, report_id) else 404, "Заявка изменилась или удалена")
    view = ReportView.model_validate(row)
    db.commit()
    return view

if __name__ == "__main__":
    import sys
    print(publish(Path(sys.argv[1])))