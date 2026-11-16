from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "map_publications",
        sa.Column("version", sa.String(16), primary_key=True),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_map_publications_published_at", "map_publications", ["published_at"])
    op.create_table(
        "reports",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("map_version", sa.String(16), sa.ForeignKey("map_publications.version"), nullable=False),
        sa.Column("building_id", sa.String(36)),
        sa.Column("place_id", sa.String(36), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="new"),
        sa.Column("resolution", sa.Text, nullable=False, server_default=""),
        sa.Column("revision", sa.Integer, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_reports_building_id", "reports", ["building_id"])
    op.create_index("ix_reports_status", "reports", ["status"])

def downgrade():
    op.drop_table("reports")
    op.drop_table("map_publications")
