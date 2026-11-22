"""ious: money lent to or borrowed from people

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-22 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('ious',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('person', sa.String(length=100), nullable=False),
    sa.Column('direction', sa.String(length=10), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('repaid', sa.Numeric(precision=12, scale=2), server_default='0', nullable=False),
    sa.Column('given_on', sa.Date(), nullable=False),
    sa.Column('due_on', sa.Date(), nullable=True),
    sa.Column('note', sa.Text(), server_default='', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("direction IN ('lent', 'borrowed')", name='iou_direction_valid'),
    sa.CheckConstraint('amount > 0', name='iou_amount_positive'),
    sa.CheckConstraint('repaid >= 0 AND repaid <= amount', name='iou_repaid_within_amount'),
    sa.CheckConstraint('due_on IS NULL OR due_on >= given_on', name='iou_due_after_given'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_ious_user_id', 'ious', ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_ious_user_id', table_name='ious')
    op.drop_table('ious')
