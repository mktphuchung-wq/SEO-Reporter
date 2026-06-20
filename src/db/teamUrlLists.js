import { query } from "./client.js";

const SEARCH_TYPES = new Set(["web", "image", "video", "news"]);

function firstCell(line) {
  const tab = line.indexOf("\t");
  const comma = line.indexOf(",");
  const indexes = [tab, comma].filter((i) => i >= 0);
  return indexes.length ? line.slice(0, Math.min(...indexes)) : line;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function propertyWarning(url, propertyUrl) {
  const prop = String(propertyUrl || "").trim();
  if (!prop || prop.startsWith("sc-domain:")) return "";
  if ((prop.startsWith("http://") || prop.startsWith("https://")) && !url.startsWith(prop)) {
    return `URL does not start with selected URL-prefix property ${prop}: ${url}`;
  }
  return "";
}

export function parseAndNormalizeUrlList(input) {
  const seen = new Set();
  const urls = [];
  const warnings = [];
  const invalidRows = [];
  String(input || "").split(/\r?\n/).forEach((raw, index) => {
    const url = firstCell(raw.trim()).trim();
    if (!url) return;
    if (!isHttpUrl(url)) {
      invalidRows.push({ rowNumber: index + 1, url, error: "URL must be a valid http/https URL." });
      return;
    }
    if (seen.has(url)) {
      warnings.push(`Duplicate URL removed: ${url}`);
      return;
    }
    seen.add(url);
    urls.push(url);
  });
  return { urls, warnings, invalidRows, validCount: urls.length, invalidCount: invalidRows.length };
}

export function validateUrlListUrls(urls, propertyUrl) {
  const warnings = [];
  const invalidRows = [];
  const validUrls = [];
  const seen = new Set();
  for (const [index, raw] of (Array.isArray(urls) ? urls : []).entries()) {
    const url = String(raw || "").trim();
    if (!isHttpUrl(url)) {
      invalidRows.push({ rowNumber: index + 1, url, error: "URL must be a valid http/https URL." });
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const warning = propertyWarning(url, propertyUrl);
    if (warning) warnings.push(warning);
    validUrls.push(url);
  }
  return { validUrls, warnings, invalidRows };
}

export async function listUrlListsForMember(memberId) {
  const result = await query("select * from team_member_url_lists where member_id = $1 order by status, updated_at desc", [memberId]);
  return result.rows;
}

export async function getUrlList(id) {
  const result = await query("select * from team_member_url_lists where id = $1", [id]);
  return result.rows[0] || null;
}

export async function createUrlList({ memberId, name, propertyUrl, searchType = "web", urls = [] }) {
  if (!memberId) throw new Error("memberId is required.");
  if (!propertyUrl) throw new Error("propertyUrl is required.");
  if (!SEARCH_TYPES.has(searchType)) throw new Error("Invalid search type.");
  const validation = validateUrlListUrls(urls, propertyUrl);
  if (validation.invalidRows.length) throw new Error("URL list contains invalid URLs.");
  const result = await query(
    `insert into team_member_url_lists (member_id, name, property_url, search_type, urls_json, url_count)
     values ($1,$2,$3,$4,$5::jsonb,$6) returning *`,
    [memberId, name || "Default URL List", propertyUrl, searchType, JSON.stringify(validation.validUrls), validation.validUrls.length],
  );
  return { urlList: result.rows[0], warnings: validation.warnings };
}

export async function updateUrlList(id, fields = {}) {
  const existing = await getUrlList(id);
  if (!existing) throw new Error("URL list not found.");
  const propertyUrl = fields.propertyUrl ?? fields.property_url ?? existing.property_url;
  const searchType = fields.searchType ?? fields.search_type ?? existing.search_type;
  if (!SEARCH_TYPES.has(searchType)) throw new Error("Invalid search type.");
  const urls = fields.urls ?? existing.urls_json;
  const validation = validateUrlListUrls(urls, propertyUrl);
  if (validation.invalidRows.length) throw new Error("URL list contains invalid URLs.");
  const result = await query(
    `update team_member_url_lists set name=$2, property_url=$3, search_type=$4, urls_json=$5::jsonb, url_count=$6, status=$7 where id=$1 returning *`,
    [id, fields.name ?? existing.name, propertyUrl, searchType, JSON.stringify(validation.validUrls), validation.validUrls.length, fields.status ?? existing.status],
  );
  return { urlList: result.rows[0], warnings: validation.warnings };
}

export async function archiveUrlList(id) {
  const result = await query("update team_member_url_lists set status='archived' where id=$1 returning *", [id]);
  return result.rows[0] || null;
}
