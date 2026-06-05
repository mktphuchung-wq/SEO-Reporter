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
