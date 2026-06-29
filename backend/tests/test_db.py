from sqlalchemy import create_engine, inspect
from db import Base
import models  # noqa: F401  (모델을 import해야 Base.metadata에 테이블이 등록됨)


def test_base_metadata_creates_tables_on_sqlite():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    # NOTE: engine.table_names() was removed in SQLAlchemy 2.0; use inspect() instead.
    # Base.metadata는 테스트 스위트 전역에서 공유되므로, 다른 테스트가 models를 import한 시점에
    # 이미 테이블이 등록되어 있을 수 있다 (pytest 수집 순서에 의존하지 않도록 명시적으로 import).
    assert set(inspect(engine).get_table_names()) == {
        "workers",
        "customers",
        "legacy_sync_log",
        "legacy_orders",
    }
