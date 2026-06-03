import { escapeHtml } from "./html.js";
import { renderEmptyState } from "./components.js";

export function renderTable({ columns = [], rows = [] } = {}) {
  if (!rows.length) {
    return renderEmptyState({
      title: "No rows to show",
      body: "Data will appear here after reports are generated or a data source is connected.",
    });
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column.label || column.key || column)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>${columns
                  .map((column) => {
                    const key = column.key || column;
                    const value = typeof column.render === "function" ? column.render(row) : escapeHtml(row[key] ?? "");
                    return `<td>${value}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}
