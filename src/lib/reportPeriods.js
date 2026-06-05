import dayjs, { parseDate } from "./time.js";

function buildMonthRange(monthDate) {
  const start = monthDate.startOf("month");
  const end = monthDate.endOf("month");

  return {
    start: start.format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
    label: formatMonthLabel({ start: start.format("YYYY-MM-DD"), end: end.format("YYYY-MM-DD") }),
  };
}

export function getMostRecentCompletedMonth(today = new Date(), gscDelayDays = 2) {
  const parsedToday = parseDate(today) || dayjs();
  const safeDelayDays = Number.isFinite(Number(gscDelayDays)) && Number(gscDelayDays) >= 0 ? Number(gscDelayDays) : 2;
  const latestReliableDate = parsedToday.subtract(safeDelayDays, "day").startOf("day");
  const previousCalendarMonth = parsedToday.subtract(1, "month").startOf("month");
  const previousCalendarMonthEnd = previousCalendarMonth.endOf("month").startOf("day");
  const completedMonth = latestReliableDate.isBefore(previousCalendarMonthEnd, "day")
    ? previousCalendarMonth.subtract(1, "month")
    : previousCalendarMonth;

  return buildMonthRange(completedMonth);
}

export function getPreviousMonthRange(monthRange) {
  const parsedStart = parseDate(monthRange?.start);
  const month = parsedStart || parseDate(monthRange?.end) || dayjs();
  return buildMonthRange(month.subtract(1, "month"));
}

export function formatMonthLabel(range) {
  const parsed = parseDate(range?.start) || parseDate(range?.end);
  return parsed ? parsed.format("MMMM YYYY") : "Selected month";
}
