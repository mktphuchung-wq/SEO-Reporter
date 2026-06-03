import crypto from "node:crypto";

// Temporary in-memory job registry for the serverless MVP.
// This is not durable on Vercel serverless: cold starts, scale-out, and deployments can lose jobs/results.
// Move this registry to Redis or Postgres before serious production use.
const jobs = new Map();
const VALID_STATUSES = new Set(["queued", "running", "completed", "failed"]);

function timestamp() {
  return new Date().toISOString();
}

export function createReportJob(initial = {}) {
  const now = timestamp();
  const job = {
    id: crypto.randomUUID(),
    status: "queued",
    progress: 0,
    error: null,
    resultHtml: null,
    createdAt: now,
    updatedAt: now,
    ...initial,
  };
  jobs.set(job.id, job);
  return job;
}

export function getReportJob(id) {
  return jobs.get(String(id || "")) || null;
}

export function updateReportJob(id, updates = {}) {
  const job = getReportJob(id);
  if (!job) {
    return null;
  }

  const nextStatus = updates.status && VALID_STATUSES.has(updates.status) ? updates.status : job.status;
  const nextProgress = Number.isFinite(Number(updates.progress)) ? Math.max(0, Math.min(100, Number(updates.progress))) : job.progress;
  const updated = {
    ...job,
    ...updates,
    status: nextStatus,
    progress: nextProgress,
    updatedAt: timestamp(),
  };
  jobs.set(job.id, updated);
  return updated;
}
