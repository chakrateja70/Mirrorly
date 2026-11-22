"""wellness: water in ml, richer profile (target weight, habits, dislikes)

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-23 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, Sequence[str], None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CHECKS = {
    'wellness_stress_valid': "stress IN ('low', 'medium', 'high')",
    'wellness_alcohol_valid': "alcohol IN ('never', 'occasionally', 'weekly', 'daily')",
    'wellness_smoking_valid': "smoking IN ('never', 'occasionally', 'daily')",
    'wellness_eating_out_valid': "eating_out IN ('rarely', 'weekly', 'often', 'daily')",
    'wellness_cooking_valid': "cooking IN ('self', 'family', 'canteen', 'order')",
    'wellness_water_goal_valid': 'water_goal_ml BETWEEN 500 AND 8000',
}


def upgrade() -> None:
    """Upgrade schema."""
    # water: glasses -> ml (1 glass = 250 ml), data kept
    op.add_column('wellness_days', sa.Column('water_ml', sa.SmallInteger(), nullable=True))
    op.execute('UPDATE wellness_days SET water_ml = water_glasses * 250 WHERE water_glasses IS NOT NULL')
    op.drop_column('wellness_days', 'water_glasses')
    op.create_check_constraint('wellness_day_water_valid', 'wellness_days', 'water_ml BETWEEN 0 AND 10000')
    op.add_column('wellness_profiles', sa.Column('water_goal_ml', sa.SmallInteger(), server_default='2500', nullable=False))
    op.execute('UPDATE wellness_profiles SET water_goal_ml = LEAST(GREATEST(water_goal_glasses * 250, 500), 8000)')
    op.drop_column('wellness_profiles', 'water_goal_glasses')

    op.add_column('wellness_profiles', sa.Column('target_weight_kg', sa.Numeric(precision=5, scale=1), nullable=True))
    op.add_column('wellness_profiles', sa.Column('dislikes', sa.ARRAY(sa.String(length=50)), server_default='{}', nullable=False))
    op.add_column('wellness_profiles', sa.Column('sleep_issues', sa.ARRAY(sa.String(length=20)), server_default='{}', nullable=False))
    op.add_column('wellness_profiles', sa.Column('stress', sa.String(length=10), nullable=True))
    op.add_column('wellness_profiles', sa.Column('caffeine_cups', sa.SmallInteger(), nullable=True))
    op.add_column('wellness_profiles', sa.Column('alcohol', sa.String(length=12), nullable=True))
    op.add_column('wellness_profiles', sa.Column('smoking', sa.String(length=12), nullable=True))
    op.add_column('wellness_profiles', sa.Column('eating_out', sa.String(length=12), nullable=True))
    op.add_column('wellness_profiles', sa.Column('cooking', sa.String(length=12), nullable=True))
    for name, check in CHECKS.items():
        op.create_check_constraint(name, 'wellness_profiles', check)


def downgrade() -> None:
    """Downgrade schema."""
    for name in CHECKS:
        op.drop_constraint(name, 'wellness_profiles', type_='check')
    for col in ('cooking', 'eating_out', 'smoking', 'alcohol', 'caffeine_cups', 'stress', 'sleep_issues', 'dislikes', 'target_weight_kg'):
        op.drop_column('wellness_profiles', col)
    op.add_column('wellness_profiles', sa.Column('water_goal_glasses', sa.SmallInteger(), server_default='8', nullable=False))
    op.execute('UPDATE wellness_profiles SET water_goal_glasses = LEAST(GREATEST(ROUND(water_goal_ml / 250.0), 1), 20)')
    op.drop_column('wellness_profiles', 'water_goal_ml')
    op.drop_constraint('wellness_day_water_valid', 'wellness_days', type_='check')
    op.add_column('wellness_days', sa.Column('water_glasses', sa.SmallInteger(), nullable=True))
    op.execute('UPDATE wellness_days SET water_glasses = ROUND(water_ml / 250.0) WHERE water_ml IS NOT NULL')
    op.drop_column('wellness_days', 'water_ml')
