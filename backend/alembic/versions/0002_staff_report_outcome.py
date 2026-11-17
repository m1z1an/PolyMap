from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("employees", sa.Column("id", sa.Integer, primary_key=True),
                    sa.Column("username", sa.String(80), nullable=False, unique=True),
                    sa.Column("password_hash", sa.String(256), nullable=False))
    op.create_table("employee_sessions", sa.Column("token_hash", sa.String(64), primary_key=True),
                    sa.Column("employee_id", sa.Integer, sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
                    sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False))
    op.add_column("reports", sa.Column("outcome", sa.String(20)))
    op.add_column("reports", sa.Column("correction_map_version", sa.String(16), sa.ForeignKey("map_publications.version")))
    op.create_check_constraint("ck_reports_outcome", "reports", "outcome IS NULL OR (status = 'closed' AND outcome IN ('fixed', 'not_confirmed'))")
    op.create_check_constraint("ck_reports_correction_version", "reports", "(outcome IS NOT DISTINCT FROM 'fixed' AND correction_map_version IS NOT NULL) OR (outcome IS DISTINCT FROM 'fixed' AND correction_map_version IS NULL)")

def downgrade():
    op.drop_constraint("ck_reports_correction_version", "reports", type_="check")
    op.drop_constraint("ck_reports_outcome", "reports", type_="check")
    op.drop_column("reports", "correction_map_version")
    op.drop_column("reports", "outcome")
    op.drop_table("employee_sessions")
    op.drop_table("employees")
