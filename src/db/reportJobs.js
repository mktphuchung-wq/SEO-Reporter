import { query } from "./client.js";

const VALID_STATUSES = new Set(["queued", "running", "completed", "failed"]);

function clampProgress(progress) {
  const parsed = Number(progress);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}

function normalizeTrackedKeywordsText(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean).join("\n");
  return String(value || "").trim();
}

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit || "20", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 20;
}

function normalizeJob(row) { return row || null; }
function reportPeriodForReportType(reportType, reportPeriod) { return reportType === "monthly" || reportType === "quarterly" ? reportType : reportPeriod || "custom"; }

export async function createReportJob(input = {}) {
  const inputJson = input.inputJson || {
    siteUrl: input.propertyUrl || input.siteUrl,
    searchType: input.searchType || "web",
    reportType: input.reportType || input.filters?.reportType || "custom",
    reportPeriod: input.reportPeriod || input.filters?.reportPeriod || "30d",
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    pageContains: String(input.pageContains || "").trim(),
    trackedKeywords: normalizeTrackedKeywordsText(input.trackedKeywords),
    enableAiInsights: Boolean(input.enableAiInsights),
  };
  const result = await query(
    `insert into public.report_jobs (
      user_email, user_name, property_url, search_type, report_type, report_period,
      start_date, end_date, page_contains, tracked_keywords, enable_ai_insights,
      status, progress, current_step, input_json, intermediate_json, filters
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'queued',0,'init',$12,$13,$14)
    returning *`,
    [
      input.userEmail || null, input.userName || null, inputJson.siteUrl || null, inputJson.searchType || "web",
      inputJson.reportType || "custom", reportPeriodForReportType(inputJson.reportType, inputJson.reportPeriod),
      inputJson.startDate || null, inputJson.endDate || null, inputJson.pageContains || null,
      inputJson.trackedKeywords || null, Boolean(inputJson.enableAiInsights), inputJson, {}, input.filters || null,
    ],
  );
  return normalizeJob(result.rows[0]);
}

export async function getReportJob(id) { const result = await query("select * from public.report_jobs where id = $1", [id]); return normalizeJob(result.rows[0]); }

export async function updateReportJobFields(id, fields = {}) {
  const allowed = new Set(["status","progress","current_step","intermediate_json","report_json","report_html","error_message","source_info","filters","ai_insights","started_at","completed_at"]);
  const sets = []; const params = [id];
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key)) continue;
    params.push(["intermediate_json","report_json","source_info","filters","ai_insights"].includes(key) ? JSON.stringify(value ?? null) : value);
    sets.push(`${key} = $${params.length}${["intermediate_json","report_json","source_info","filters","ai_insights"].includes(key) ? "::jsonb" : ""}`);
  }
  if (!sets.length) return getReportJob(id);
  const result = await query(`update public.report_jobs set ${sets.join(", ")} where id=$1 returning *`, params);
  return normalizeJob(result.rows[0]);
}

export async function markReportJobRunning(id) { return updateReportJobFields(id, { status: "running", progress: 10, started_at: new Date(), error_message: null }); }
export async function updateReportJobProgress(id, progress) { return updateReportJobFields(id, { progress: clampProgress(progress) }); }
export async function completeReportJob(id, { reportHtml, reportJson, sourceInfo, filters, aiInsights } = {}) { return updateReportJobFields(id, { status: "completed", progress: 100, current_step: "complete", report_html: reportHtml || null, report_json: reportJson || null, source_info: sourceInfo || null, filters: filters || null, ai_insights: aiInsights || null, error_message: null, completed_at: new Date() }); }
export async function failReportJob(id, errorMessage) { return updateReportJobFields(id, { status: "failed", progress: 100, error_message: String(errorMessage || "Report generation failed.").slice(0, 2000), completed_at: new Date() }); }

export async function listRecentReportJobs({ userEmail, limit } = {}) {
  if (!userEmail) return [];
  const result = await query(`select id,user_email,user_name,property_url,search_type,report_type,report_period,start_date,end_date,page_contains,status,progress,current_step,error_message,report_json,source_info,filters,ai_insights,created_at,updated_at,started_at,completed_at from public.report_jobs where user_email=$1 order by created_at desc limit $2`, [userEmail, normalizeLimit(limit)]);
  return result.rows;
}

export async function saveReportJob({ userEmail, userName, reportPayload, reportHtml = null } = {}) {
  const sourceInfo = reportPayload?.sourceInfo || {}; const filters = reportPayload?.filters || sourceInfo.filters || {}; const range = sourceInfo.range || reportPayload?.selectedPeriodOverview?.currentRange || {};
  const job = await createReportJob({ userEmail, userName, propertyUrl: sourceInfo.property || sourceInfo.propertyUrl, searchType: filters.searchType || "web", reportType: filters.reportType, reportPeriod: filters.reportPeriod, startDate: range.start, endDate: range.end, pageContains: filters.pageContains, trackedKeywords: "", enableAiInsights: Boolean(reportPayload?.aiInsights?.available), filters });
  return completeReportJob(job.id, { reportHtml, reportJson: reportPayload, sourceInfo, filters, aiInsights: reportPayload?.aiInsights || reportPayload?.keywordOpportunities?.aiInsights || null });
}
export function isValidReportJobStatus(status) { return VALID_STATUSES.has(status); }
