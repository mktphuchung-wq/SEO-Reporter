import { query } from "./client.js";

const ROLES = new Set(["admin", "member"]);
const STATUSES = new Set(["active", "inactive"]);
const SEARCH_TYPES = new Set(["web", "image", "video", "news"]);

function normalizeNullableText(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeName(name) {
  return String(name || "").trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRole(role) {
  if (!ROLES.has(role)) {
    throw new Error("Invalid team member role. Expected admin or member.");
  }
}

function validateStatus(status) {
  if (!STATUSES.has(status)) {
    throw new Error("Invalid team member status. Expected active or inactive.");
  }
}

function validateSearchType(searchType) {
  if (!SEARCH_TYPES.has(searchType)) {
    throw new Error("Invalid search type.");
  }
}

function normalizeTeamMemberInput({ name, email, role = "member", status = "active", defaultPropertyUrl, notes } = {}) {
  const normalizedName = normalizeName(name);
  const normalizedEmail = normalizeEmail(email);
  validateRole(role);
  validateStatus(status);

  return {
    name: normalizedName,
    email: normalizedEmail,
    role,
    status,
    defaultPropertyUrl: normalizeNullableText(defaultPropertyUrl),
    notes: normalizeNullableText(notes),
  };
}

function formatInvalidRows(invalidRows) {
  return invalidRows.map((row) => `row ${row.rowNumber}: ${row.value} (${row.error})`).join("; ");
}

function parseUrlsText(urlsText) {
  const urls = [];
  const seen = new Set();
  const invalidRows = [];

  String(urlsText || "")
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const value = rawLine.trim();
      if (!value) return;

      try {
        const parsed = new URL(value);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          invalidRows.push({ rowNumber: index + 1, value, error: "URL protocol must be http or https" });
          return;
        }
      } catch {
        invalidRows.push({ rowNumber: index + 1, value, error: "URL is not valid" });
        return;
      }

      if (!seen.has(value)) {
        seen.add(value);
        urls.push(value);
      }
    });

  if (invalidRows.length) {
    throw new Error(`URL list contains invalid rows: ${formatInvalidRows(invalidRows)}`);
  }

  return urls;
}

export async function listTeamMembers() {
  const result = await query("select * from team_members order by created_at desc");
  return result.rows;
}

export async function getTeamMember(memberId) {
  const result = await query("select * from team_members where id = $1", [memberId]);
  return result.rows[0] || null;
}

export async function createTeamMember(input = {}) {
  const member = normalizeTeamMemberInput(input);
  if (!member.email || !isValidEmail(member.email)) {
    throw new Error("A valid email is required.");
  }

  const result = await query(
    `insert into team_members (name, email, role, status, default_property_url, notes)
     values ($1, $2, $3, $4, $5, $6)
     returning *`,
    [member.name, member.email, member.role, member.status, member.defaultPropertyUrl, member.notes],
  );
  return result.rows[0];
}

export async function updateTeamMember(memberId, fields = {}) {
  const existing = await getTeamMember(memberId);
  if (!existing) throw new Error("Team member not found.");

  const next = {
    name: Object.prototype.hasOwnProperty.call(fields, "name") ? normalizeName(fields.name) : existing.name,
    email: Object.prototype.hasOwnProperty.call(fields, "email") ? normalizeEmail(fields.email) : existing.email,
    role: fields.role ?? existing.role,
    status: fields.status ?? existing.status,
    defaultPropertyUrl: Object.prototype.hasOwnProperty.call(fields, "defaultPropertyUrl")
      ? normalizeNullableText(fields.defaultPropertyUrl)
      : Object.prototype.hasOwnProperty.call(fields, "default_property_url")
        ? normalizeNullableText(fields.default_property_url)
        : existing.default_property_url,
    notes: Object.prototype.hasOwnProperty.call(fields, "notes") ? normalizeNullableText(fields.notes) : existing.notes,
  };

  validateRole(next.role);
  validateStatus(next.status);
  if (next.email && !isValidEmail(next.email)) {
    throw new Error("Email must be valid when provided.");
  }

  const result = await query(
    `update team_members
     set name = $2, email = $3, role = $4, status = $5, default_property_url = $6, notes = $7
     where id = $1
     returning *`,
    [memberId, next.name, next.email || null, next.role, next.status, next.defaultPropertyUrl, next.notes],
  );
  return result.rows[0];
}

export async function deactivateTeamMember(memberId) {
  const result = await query("update team_members set status = 'inactive' where id = $1 returning *", [memberId]);
  return result.rows[0] || null;
}

export async function listUrlListsForMember(memberId) {
  const result = await query("select * from team_member_url_lists where member_id = $1 order by status, updated_at desc", [memberId]);
  return result.rows;
}

export async function getDefaultUrlListForMember(memberId) {
  const result = await query("select * from team_member_url_lists where member_id = $1 and status = 'active' order by updated_at desc limit 1", [memberId]);
  return result.rows[0] || null;
}

export async function saveTeamMemberUrlList({ memberId, name, propertyUrl, searchType = "web", urlsText } = {}) {
  if (!memberId) throw new Error("memberId is required.");
  const normalizedPropertyUrl = normalizeNullableText(propertyUrl);
  if (!normalizedPropertyUrl) throw new Error("propertyUrl is required.");
  validateSearchType(searchType);

  const urls = parseUrlsText(urlsText);
  const existing = await getDefaultUrlListForMember(memberId);
  const params = [
    memberId,
    normalizeNullableText(name) || "Default URL List",
    normalizedPropertyUrl,
    searchType,
    JSON.stringify(urls),
    urls.length,
  ];

  if (existing) {
    const result = await query(
      `update team_member_url_lists
       set name = $2, property_url = $3, search_type = $4, urls_json = $5::jsonb, url_count = $6, status = 'active'
       where id = $7
       returning *`,
      [...params, existing.id],
    );
    return result.rows[0];
  }

  const result = await query(
    `insert into team_member_url_lists (member_id, name, property_url, search_type, urls_json, url_count, status)
     values ($1, $2, $3, $4, $5::jsonb, $6, 'active')
     returning *`,
    params,
  );
  return result.rows[0];
}

export async function listTeamPerformance() {
  const result = await query("select * from team_performance order by current_clicks desc, name asc");
  return result.rows;
}

export async function getTeamPerformanceForMember(memberId) {
  const result = await query("select * from team_performance where id = $1", [memberId]);
  return result.rows[0] || null;
}
