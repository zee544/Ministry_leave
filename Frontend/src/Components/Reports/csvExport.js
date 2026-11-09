function csvCell(value) {
  const text = value == null ? "" : String(value);
  const safeText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function serializeCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
