import { getReportJob, updateReportJobFields, completeReportJob, failReportJob } from "../db/reportJobs.js";
import { generateReportFromInput, isEnvEnabled } from "./reportGenerator.js";

const STEPS = ["init", "fetch_page_rows", "fetch_keyword_rows", "build_analytics", "render_report", "ai_insights", "complete"];
const FRIENDLY_AI_UNAVAILABLE = { available: false, message: "AI insights unavailable" };

function nextStep(current) {
  const idx = STEPS.indexOf(current || "init");
  return STEPS[Math.min(idx + 1, STEPS.length - 1)];
}
function compactInput(job) {
  return {
    sourceType: "gsc",
    siteUrl: job.input_json?.siteUrl || job.property_url,
    searchType: job.input_json?.searchType || job.search_type || "web",
    reportType: job.input_json?.reportType || job.report_type || "custom",
    reportPeriod: job.input_json?.reportPeriod || job.report_period || "30d",
    startDate: job.input_json?.startDate || job.start_date,
    endDate: job.input_json?.endDate || job.end_date,
    pageContains: job.input_json?.pageContains || job.page_contains || "",
    trackedKeywords: job.input_json?.trackedKeywords || job.tracked_keywords || "",
    enableAiInsights: Boolean(job.enable_ai_insights),
  };
}

export async function processNextReportJobStep({ jobId, authClient }) {
  const job = await getReportJob(jobId);
  if (!job) throw new Error("Report job not found.");
  if (["completed", "failed"].includes(job.status)) return job;

  const step = job.current_step || "init";
  try {
    if (step === "init") {
      return updateReportJobFields(jobId, { status: "running", progress: 5, current_step: "fetch_page_rows", started_at: job.started_at || new Date(), error_message: null });
    }
    if (step === "fetch_page_rows") {
      return updateReportJobFields(jobId, { status: "running", progress: 25, current_step: "fetch_keyword_rows", intermediate_json: { ...(job.intermediate_json || {}), pageRows: "deferred to render step with GSC row limits" } });
    }
    if (step === "fetch_keyword_rows") {
      return updateReportJobFields(jobId, { status: "running", progress: 45, current_step: "build_analytics", intermediate_json: { ...(job.intermediate_json || {}), keywordRows: "skipped unless needed by report input" } });
    }
    if (step === "build_analytics") {
      return updateReportJobFields(jobId, { status: "running", progress: 65, current_step: "render_report" });
    }
    if (step === "render_report") {
      const input = compactInput(job);
      const shouldRunAi = Boolean(input.enableAiInsights) && isEnvEnabled(process.env.SYNC_REPORT_AI_ENABLED);
      const result = await generateReportFromInput({ input: { ...input, enableAiInsights: shouldRunAi }, authClient });
      return updateReportJobFields(jobId, { status: "running", progress: shouldRunAi ? 80 : 90, current_step: shouldRunAi ? "ai_insights" : "complete", report_html: result.reportHtml, report_json: result.reportJson, source_info: result.sourceInfo, filters: result.filters, ai_insights: result.aiInsights || FRIENDLY_AI_UNAVAILABLE });
    }
    if (step === "ai_insights") {
      return updateReportJobFields(jobId, { status: "running", progress: 90, current_step: "complete" });
    }
    if (step === "complete") {
      return completeReportJob(jobId, { reportHtml: job.report_html, reportJson: job.report_json, sourceInfo: job.source_info, filters: job.filters, aiInsights: job.ai_insights || FRIENDLY_AI_UNAVAILABLE });
    }
    return updateReportJobFields(jobId, { current_step: nextStep(step) });
  } catch (error) {
    return failReportJob(jobId, error?.message || "Report generation failed.");
  }
}
