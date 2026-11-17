import os
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql+psycopg://polymap:polymap@127.0.0.1:5432/polymap"
)

class Base(DeclarativeBase):
    pass

class Publication(Base):
    __tablename__ = "map_publications"

    version: Mapped[str] = mapped_column(String(16), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSONB)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    map_version: Mapped[str] = mapped_column(ForeignKey("map_publications.version"))
    building_id: Mapped[str | None] = mapped_column(String(36), index=True)
    place_id: Mapped[str] = mapped_column(String(36))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), index=True, server_default="new")
    resolution: Mapped[str] = mapped_column(Text, server_default="")
    outcome: Mapped[str | None] = mapped_column(String(20))
    correction_map_version: Mapped[str | None] = mapped_column(ForeignKey("map_publications.version"))
    __table_args__ = (
        CheckConstraint("outcome IS NULL OR (status = 'closed' AND outcome IN ('fixed', 'not_confirmed'))", name="ck_reports_outcome"),
        CheckConstraint("(outcome IS NOT DISTINCT FROM 'fixed' AND correction_map_version IS NOT NULL) OR (outcome IS DISTINCT FROM 'fixed' AND correction_map_version IS NULL)", name="ck_reports_correction_version"),
    )
    revision: Mapped[int] = mapped_column(server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(String(256))

class EmployeeSession(Base):
    __tablename__ = "employee_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
