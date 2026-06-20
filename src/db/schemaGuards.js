const TEAM_MEMBERS_RELATION_MISSING = 'relation "team_members" does not exist';
const TEAM_PERFORMANCE_RELATION_MISSING = 'relation "team_performance" does not exist';

export function isMissingRelationError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "42P01" ||
    message.includes(TEAM_MEMBERS_RELATION_MISSING) ||
    message.includes(TEAM_PERFORMANCE_RELATION_MISSING)
  );
}

export function renderMissingTeamSchemaMessage() {
  return `<div class="card">
    <h2>Team database tables are not installed yet.</h2>
    <p>Run this SQL in Supabase SQL Editor, then refresh.</p>
    <code>sql/004_create_team_members_and_performance.sql</code>
  </div>`;
}
