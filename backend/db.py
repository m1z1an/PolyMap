import os
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
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
    revision: Mapped[int] = mapped_column(server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
