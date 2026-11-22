"""wellness: profiles, check-ins, meals, plans

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-22 20:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('meals',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('slot', sa.String(length=10), nullable=False),
    sa.Column('eaten_at', sa.Time(), nullable=True),
    sa.Column('text', sa.String(length=300), nullable=False),
    sa.Column('items', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('kcal', sa.Integer(), server_default='0', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("slot IN ('breakfast', 'lunch', 'snack', 'dinner')", name='meal_slot_valid'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_meals_user_id_day', 'meals', ['user_id', 'day'], unique=False)
    op.create_table('wellness_days',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('bed_time', sa.Time(), nullable=True),
    sa.Column('wake_time', sa.Time(), nullable=True),
    sa.Column('sleep_minutes', sa.SmallInteger(), nullable=True),
    sa.Column('sleep_quality', sa.SmallInteger(), nullable=True),
    sa.Column('screen_minutes', sa.SmallInteger(), nullable=True),
    sa.Column('water_glasses', sa.SmallInteger(), nullable=True),
    sa.Column('exercise_minutes', sa.SmallInteger(), nullable=True),
    sa.Column('energy', sa.SmallInteger(), nullable=True),
    sa.Column('note', sa.Text(), server_default='', nullable=False),
    sa.CheckConstraint('screen_minutes BETWEEN 0 AND 1440 AND exercise_minutes BETWEEN 0 AND 1440', name='wellness_day_minutes_valid'),
    sa.CheckConstraint('sleep_quality BETWEEN 1 AND 5 AND energy BETWEEN 1 AND 5', name='wellness_day_scales_valid'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'day', name='uq_wellness_days_user_day')
    )
    op.create_table('wellness_plans',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('kind', sa.String(length=10), nullable=False),
    sa.Column('day', sa.Date(), nullable=False),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('model', sa.String(length=100), server_default='', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("kind IN ('day', 'journey')", name='wellness_plan_kind_valid'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'kind', 'day', name='uq_wellness_plans_user_kind_day')
    )
    op.create_table('wellness_profiles',
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('birth_year', sa.SmallInteger(), nullable=False),
    sa.Column('sex', sa.String(length=10), nullable=False),
    sa.Column('height_cm', sa.Numeric(precision=5, scale=1), nullable=False),
    sa.Column('weight_kg', sa.Numeric(precision=5, scale=1), nullable=False),
    sa.Column('occupation', sa.String(length=100), server_default='', nullable=False),
    sa.Column('activity', sa.String(length=10), nullable=False),
    sa.Column('work_mode', sa.String(length=10), nullable=False),
    sa.Column('work_start', sa.Time(), nullable=True),
    sa.Column('work_end', sa.Time(), nullable=True),
    sa.Column('commute_minutes', sa.SmallInteger(), server_default='0', nullable=False),
    sa.Column('wake_time', sa.Time(), nullable=False),
    sa.Column('bed_time', sa.Time(), nullable=False),
    sa.Column('workout_time', sa.Time(), nullable=True),
    sa.Column('diet', sa.String(length=12), nullable=False),
    sa.Column('cuisine', sa.String(length=100), server_default='', nullable=False),
    sa.Column('usual_meals', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=False),
    sa.Column('allergies', sa.ARRAY(sa.String(length=50)), server_default='{}', nullable=False),
    sa.Column('conditions', sa.ARRAY(sa.String(length=20)), server_default='{}', nullable=False),
    sa.Column('health_notes', sa.Text(), server_default='', nullable=False),
    sa.Column('goal', sa.String(length=10), nullable=False),
    sa.Column('screen_goal_minutes', sa.SmallInteger(), server_default='180', nullable=False),
    sa.Column('water_goal_glasses', sa.SmallInteger(), server_default='8', nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("activity IN ('sedentary', 'light', 'moderate', 'active')", name='wellness_activity_valid'),
    sa.CheckConstraint("diet IN ('veg', 'eggetarian', 'non_veg', 'vegan', 'jain')", name='wellness_diet_valid'),
    sa.CheckConstraint("goal IN ('lose', 'maintain', 'gain', 'energy', 'sleep')", name='wellness_goal_valid'),
    sa.CheckConstraint("sex IN ('male', 'female', 'other')", name='wellness_sex_valid'),
    sa.CheckConstraint("work_mode IN ('office', 'home', 'hybrid', 'none')", name='wellness_work_mode_valid'),
    sa.CheckConstraint('height_cm BETWEEN 80 AND 250 AND weight_kg BETWEEN 20 AND 300', name='wellness_body_valid'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('wellness_profiles')
    op.drop_table('wellness_plans')
    op.drop_table('wellness_days')
    op.drop_index('ix_meals_user_id_day', table_name='meals')
    op.drop_table('meals')
