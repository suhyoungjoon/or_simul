from sqlalchemy import create_engine, inspect
from db import Base


def test_base_metadata_creates_tables_on_sqlite():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    # 이 시점엔 모델이 없으니 테이블 0개가 정상
    # NOTE: engine.table_names() was removed in SQLAlchemy 2.0; use inspect() instead.
    assert inspect(engine).get_table_names() == []
