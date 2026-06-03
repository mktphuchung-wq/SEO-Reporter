import { query } from "./client.js";

const VALID_STATUSES = new Set(["queued", "running", "completed", "failed"]);

function clampProgress(progress) {
  const parsed = Number(progress);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeTrackedKeywords(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit || "20", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 20;
}

function normalizeJob(row) {
  return row || null;
}

export async function createReportJob(input = {}) {
  const result = await query(
    `insert into public.report_jobs (
      user_email,
      user_name,
      property_url,
      search_type,
      report_period,
      start_date,
      end_date,
      page_contains,
      tracked_keywords,
      status,
      progress,
      filters
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', 0, $10)
    returning *`,
    [
      input.userEmail || null,
      input.userName || null,
      input.propertyUrl || input.siteUrl || null,
      input.searchType || "web",
      input.reportPeriod || "30d",
      input.startDate || null,
      input.endDate || null,
      String(input.pageContains || "").trim() || null,
      normalizeTrackedKeywords(input.trackedKeywords),
      input.filters || null,
    ],
  );
  return normalizeJob(result.rows[0]);
}

export async function getReportJob(id) {
  const result = await query("select * from public.report_jobs where id = $1", [id]);
  return normalizeJob(result.rows[0]);
}

export async function markReportJobRunning(id) {
  const result = await query(
    `update public.report_jobs
     set status = 'running', progress = greatest(progress, 10), started_at = coalesce(started_at, now()), error_message = null
     where id = $1
     returning *`,
    [id],
  );
  return normalizeJob(result.rows[0]);
}

export async function updateReportJobProgress(id, progress) {
  const result = await query(
    `update public.report_jobs
     set progress = $2
     where id = $1 and status in ('queued', 'running')
     returning *`,
    [id, clampProgress(progress)],
  );
  return normalizeJob(result.rows[0]);
}

export async function completeReportJob(id, { reportHtml, reportJson, sourceInfo, filters, aiInsights } = {}) {
  const result = await query(
    `update public.report_jobs
     set status = 'completed',
         progress = 100,
         error_message = null,
         report_html = $2,
         report_json = $3,
         source_info = $4,
         filters = $5,
         ai_insights = $6,
         completed_at = now()
     where id = $1
     returning *`,
    [id, reportHtml || null, reportJson || null, sourceInfo || null, filters || null, aiInsights || null],
  );
  return normalizeJob(result.rows[0]);
}

export async function failReportJob(id, errorMessage) {
  const safeMessage = String(errorMessage || "Report generation failed.").slice(0, 2000);
  const result = await query(
    `update public.report_jobs
     set status = 'failed', progress = 100, error_message = $2, completed_at = now()
     where id = $1
     returning *`,
    [id, safeMessage],
  );
  return normalizeJob(result.rows[0]);
}

export async function listRecentReportJobs({ userEmail, limit } = {}) {
  if (!userEmail) {
    return [];
  }

  const result = await query(
    `select id, user_email, user_name, property_url, search_type, report_period, start_date, end_date,
            status, progress, error_message, created_at, updated_at, started_at, completed_at
     from public.report_jobs
     where user_email = $1
     order by created_at desc
     limit $2`,
    [userEmail, normalizeLimit(limit)],
  );
  return result.rows;
}

export function isValidReportJobStatus(status) {
  return VALID_STATUSES.has(status);
}
