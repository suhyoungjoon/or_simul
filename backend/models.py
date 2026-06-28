from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    func,
)

from db import Base


class Worker(Base):
    __tablename__ = "workers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    x = Column(Float)
    y = Column(Float)
    color = Column(String)
    can_iptv = Column(Boolean)
    as_rate = Column(Float)
    region = Column(String)
    source = Column(String, default="legacy_csv")
    batch_date = Column(Date)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    x = Column(Float)
    y = Column(Float)
    svc = Column(String)
    region = Column(String)
    time_window = Column(String)
    vip = Column(Boolean)
    overdue = Column(Boolean)
    source = Column(String)
    batch_date = Column(Date)
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class LegacySyncLog(Base):
    __tablename__ = "legacy_sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_type = Column(String)
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))
    status = Column(String)
    records_processed = Column(Integer)
    error_message = Column(Text)
