import { fetchGscUrlPerformance } from "../datasources/gscApi.js";
import { getQuarterlyJob, getNextQueuedBatch, updateBatchStatus, saveQuarterlyUrlResults, updateQuarterlyJobProgress } from "../db/teamQuarterlyJobs.js";
import { query } from "../db/client.js";

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}
function pct(delta, previous) { return Number(previous) > 0 ? (Number(delta) / Number(previous)) * 100 : null; }
function statusFor(previous, current) {
  if (current.clicks > 0 && previous.clicks === 0) return "New traffic";
  if (previous.clicks > 0 && current.clicks === 0) return "Lost traffic";
  if (current.impressions >= 100 && current.ctr < 0.01) return "High impressions low CTR";
  if (current.clicks > previous.clicks) return "Growing";
  if (current.clicks < previous.clicks) return "Declining";
  return "Stable";
}
function buildRow(url, previous, current) {
  const clickDelta = (current.clicks || 0) - (previous.clicks || 0);
  const impressionDelta = (current.impressions || 0) - (previous.impressions || 0);
  const positionDelta = previous.position != null && current.position != null ? current.position - previous.position : null;
  const status = statusFor(previous, current);
  return { url, previous_clicks: previous.clicks || 0, current_clicks: current.clicks || 0, click_delta: clickDelta, click_delta_percent: pct(clickDelta, previous.clicks), previous_impressions: previous.impressions || 0, current_impressions: current.impressions || 0, impression_delta: impressionDelta, impression_delta_percent: pct(impressionDelta, previous.impressions), previous_ctr: previous.ctr, current_ctr: current.ctr, previous_position: previous.position, current_position: current.position, position_delta: positionDelta, match_type_previous: previous.matchType, match_type_current: current.matchType, status, insight: `${status}: clicks ${clickDelta >= 0 ? "+" : ""}${clickDelta}, impressions ${impressionDelta >= 0 ? "+" : ""}${impressionDelta}.` };
}
async function recomputeJob(jobId) {
  const stats = await query(`select count(*) filter(where status='completed')::int completed_batches, coalesce(sum(url_count) filter(where status='completed'),0)::int processed_urls, count(*)::int total_batches from team_quarterly_job_batches where job_id=$1`, [jobId]);
  const s = stats.rows[0];
  const progress = s.total_batches > 0 ? Math.round((s.completed_batches / s.total_batches) * 100) : 100;
  const status = s.completed_batches >= s.total_batches ? "completed" : "running";
  return updateQuarterlyJobProgress(jobId, { completed_batches: s.completed_batches, processed_urls: s.processed_urls, progress, status, completed_at: status === "completed" ? new Date() : null });
}
export async function runNextTeamQuarterlyBatch({ jobId, authClient }) {
  const job = await getQuarterlyJob(jobId); if (!job) throw new Error("Quarterly job not found.");
  const batch = await getNextQueuedBatch(jobId); if (!batch) return { job: await recomputeJob(jobId), batch: null, done: true };
  await updateQuarterlyJobProgress(jobId, { status: "running" });
  await updateBatchStatus(batch.id, "running");
  const urls = (Array.isArray(job.urls_json) ? job.urls_json : []).slice(batch.start_index, batch.end_index + 1);
  try {
    const rows = await mapLimit(urls, 3, async (url) => {
      try {
        const [previous, current] = await Promise.all([
          fetchGscUrlPerformance({ siteUrl: job.property_url, url, startDate: job.previous_start.toISOString?.().slice(0,10) || job.previous_start, endDate: job.previous_end.toISOString?.().slice(0,10) || job.previous_end, searchType: job.search_type, authClient }),
          fetchGscUrlPerformance({ siteUrl: job.property_url, url, startDate: job.current_start.toISOString?.().slice(0,10) || job.current_start, endDate: job.current_end.toISOString?.().slice(0,10) || job.current_end, searchType: job.search_type, authClient }),
        ]);
        return buildRow(url, previous, current);
      } catch (error) {
        return { url, status: "Error", insight: String(error?.message || "URL processing failed.").slice(0, 300) };
      }
    });
    await saveQuarterlyUrlResults({ jobId, batchId: batch.id, memberId: job.member_id, rows });
    await updateBatchStatus(batch.id, "completed", { completedAt: new Date() });
    return { job: await recomputeJob(jobId), batch, done: false };
  } catch (error) {
    await updateBatchStatus(batch.id, "failed", { errorMessage: String(error?.message || "Batch failed").slice(0, 300) });
    await updateQuarterlyJobProgress(jobId, { status: job.completed_batches > 0 ? "partially_completed" : "failed", error_message: String(error?.message || "Batch failed").slice(0, 300) });
    throw error;
  }
}
