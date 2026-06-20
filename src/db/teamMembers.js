import { query } from "./client.js";

const ROLES = new Set(["admin", "member"]);
const STATUSES = new Set(["active", "inactive"]);
function validate(role = "member", status = "active") { if (!ROLES.has(role)) throw new Error("Invalid team member role."); if (!STATUSES.has(status)) throw new Error("Invalid team member status."); }

export async function listTeamMembers() {
  const result = await query(`select m.*, coalesce(sum(l.url_count) filter (where l.status='active'),0)::int as url_count,
    count(l.id) filter (where l.status='active' and l.url_count > 0)::int as active_url_list_count,
    j.id as latest_job_id, j.status as latest_job_status, j.quarter_label as latest_quarter,
    coalesce(s.current_clicks,0)::int as latest_current_clicks, coalesce(s.current_impressions,0)::int as latest_current_impressions
    from team_members m
    left join team_member_url_lists l on l.member_id=m.id
    left join lateral (select * from team_quarterly_jobs j where j.member_id=m.id order by j.created_at desc limit 1) j on true
    left join lateral (select sum(current_clicks) current_clicks, sum(current_impressions) current_impressions from team_quarterly_url_results r where r.job_id=j.id) s on true
    group by m.id,j.id,j.status,j.quarter_label,s.current_clicks,s.current_impressions order by m.created_at desc`);
  return result.rows;
}
export async function getTeamMember(id) { const r = await query("select * from team_members where id=$1", [id]); return r.rows[0] || null; }
export async function createTeamMember({ name, email, role = "member", status = "active", defaultPropertyUrl, notes }) {
  validate(role, status); if (!name) throw new Error("Name is required.");
  const r = await query(`insert into team_members (name,email,role,status,default_property_url,notes) values ($1,$2,$3,$4,$5,$6) returning *`, [name, email || null, role, status, defaultPropertyUrl || null, notes || null]);
  return r.rows[0];
}
export async function updateTeamMember(id, fields = {}) {
  const existing = await getTeamMember(id); if (!existing) throw new Error("Team member not found.");
  const role = fields.role ?? existing.role; const status = fields.status ?? existing.status; validate(role, status);
  const r = await query(`update team_members set name=$2,email=$3,role=$4,status=$5,default_property_url=$6,notes=$7 where id=$1 returning *`, [id, fields.name ?? existing.name, fields.email ?? existing.email, role, status, fields.defaultPropertyUrl ?? fields.default_property_url ?? existing.default_property_url, fields.notes ?? existing.notes]);
  return r.rows[0];
}
export async function deleteOrDeactivateTeamMember(id) {
  const deps = await query(`select (select count(*) from team_quarterly_jobs where member_id=$1)::int + (select count(*) from team_quarterly_url_results where member_id=$1)::int as count`, [id]);
  if (Number(deps.rows[0]?.count || 0) > 0) return updateTeamMember(id, { status: "inactive" });
  const r = await query("delete from team_members where id=$1 returning *", [id]); return r.rows[0] || null;
}
export async function getTeamMemberPerformanceSummary() {
  const r = await query(`select m.id,m.name,m.email,m.default_property_url,coalesce(u.url_count,0)::int url_count,
    j.id latest_job_id,j.quarter_label latest_quarter,j.status last_job_status,
    coalesce(s.previous_clicks,0)::int previous_clicks,coalesce(s.current_clicks,0)::int current_clicks,coalesce(s.click_delta,0)::int click_delta,
    coalesce(s.previous_impressions,0)::int previous_impressions,coalesce(s.current_impressions,0)::int current_impressions,coalesce(s.impression_delta,0)::int impression_delta,
    coalesce(s.growing_urls,0)::int growing_urls,coalesce(s.declining_urls,0)::int declining_urls
    from team_members m
    left join lateral (select sum(url_count) url_count from team_member_url_lists where member_id=m.id and status='active') u on true
    left join lateral (select * from team_quarterly_jobs where member_id=m.id order by created_at desc limit 1) j on true
    left join lateral (select sum(previous_clicks) previous_clicks,sum(current_clicks) current_clicks,sum(click_delta) click_delta,sum(previous_impressions) previous_impressions,sum(current_impressions) current_impressions,sum(impression_delta) impression_delta,count(*) filter (where status='Growing') growing_urls,count(*) filter (where status='Declining') declining_urls from team_quarterly_url_results where job_id=j.id) s on true
    order by m.name`);
  return r.rows;
}
