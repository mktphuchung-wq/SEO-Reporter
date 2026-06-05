import dayjs, { parseDate } from "./time.js";

export function getMostRecentCompletedMonth(today = new Date(), gscDelayDays = 2) {
  const parsedToday = parseDate(today) || dayjs();
  const safeDelayDays = Number.isFinite(Number(gscDelayDays)) && Number(gscDelayDays) >= 0 ? Number(gscDelayDays) : 2;
  const latestReliableDate = parsedToday.subtract(safeDelayDays, "day").startOf("day");
  const completedMonth = latestReliableDate.isSame(latestReliableDate.endOf("month"), "day")
    ? latestReliableDate
    : latestReliableDate.subtract(1, "month");
  const start = completedMonth.startOf("month");
  const end = completedMonth.endOf("month");

  return {
    start: start.format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
    label: formatMonthLabel({ start: start.format("YYYY-MM-DD"), end: end.format("YYYY-MM-DD") }),
  };
}

export function getPreviousMonthRange(monthRange) {
  const parsedStart = parseDate(monthRange?.start);
  const month = parsedStart || parseDate(monthRange?.end) || dayjs();
  const previousMonth = month.subtract(1, "month");
  const start = previousMonth.startOf("month");
  const end = previousMonth.endOf("month");

  return {
    start: start.format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
    label: formatMonthLabel({ start: start.format("YYYY-MM-DD"), end: end.format("YYYY-MM-DD") }),
  };
}

export function formatMonthLabel(range) {
  const parsed = parseDate(range?.start) || parseDate(range?.end);
  return parsed ? parsed.format("MMMM YYYY") : "Selected month";
}

function quarterRangeFor(date) {
  const parsed = parseDate(date) || dayjs();
  const quarter = Math.floor(parsed.month() / 3) + 1;
  const startMonth = (quarter - 1) * 3;
  const start = parsed.month(startMonth).startOf("month");
  const end = parsed.month(startMonth + 2).endOf("month");

  return {
    start: start.format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
    label: `Q${quarter} ${start.year()}`,
  };
}

export function getMostRecentCompletedQuarter(today = new Date(), gscDelayDays = 2) {
  const parsedToday = parseDate(today) || dayjs();
  const safeDelayDays = Number.isFinite(Number(gscDelayDays)) && Number(gscDelayDays) >= 0 ? Number(gscDelayDays) : 2;
  const latestReliableDate = parsedToday.subtract(safeDelayDays, "day").startOf("day");
  const candidateRange = quarterRangeFor(latestReliableDate);
  const candidateEnd = parseDate(candidateRange.end);
  const completedQuarterDate = candidateEnd && latestReliableDate.isSame(candidateEnd, "day")
    ? latestReliableDate
    : latestReliableDate.subtract(3, "month");

  return quarterRangeFor(completedQuarterDate);
}

export function getPreviousQuarterRange(quarterRange) {
  const parsedStart = parseDate(quarterRange?.start);
  const quarter = parsedStart || parseDate(quarterRange?.end) || dayjs();
  return quarterRangeFor(quarter.subtract(3, "month"));
}

export function formatQuarterLabel(range) {
  if (range?.label) {
    return range.label;
  }
  const parsed = parseDate(range?.start) || parseDate(range?.end);
  return parsed ? quarterRangeFor(parsed).label : "Selected quarter";
}
