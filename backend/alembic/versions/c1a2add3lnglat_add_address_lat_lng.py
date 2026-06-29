"""add address/lat/lng columns

Revision ID: c1a2add3lnglat
Revises: b6fb906cf082
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c1a2add3lnglat'
down_revision: Union[str, None] = 'b6fb906cf082'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("workers", "customers", "legacy_orders"):
        op.add_column(table, sa.Column('address', sa.String(), nullable=True))
        op.add_column(table, sa.Column('lat', sa.Float(), nullable=True))
        op.add_column(table, sa.Column('lng', sa.Float(), nullable=True))


def downgrade() -> None:
    for table in ("workers", "customers", "legacy_orders"):
        op.drop_column(table, 'lng')
        op.drop_column(table, 'lat')
        op.drop_column(table, 'address')
