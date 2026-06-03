import { parseDate } from "./time.js";

export function splitDateRangeIntoMonthlyChunks(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || end.isBefore(start, "day")) {
    return [];
  }

  const chunks = [];
  let cursor = start.startOf("day");
  const finalDay = end.startOf("day");

  while (!cursor.isAfter(finalDay, "day")) {
    const monthEnd = cursor.endOf("month");
    const chunkEnd = monthEnd.isBefore(finalDay, "day") ? monthEnd : finalDay;
    chunks.push({
      start: cursor.format("YYYY-MM-DD"),
      end: chunkEnd.format("YYYY-MM-DD"),
    });
    cursor = chunkEnd.add(1, "day");
  }

  return chunks;
}
