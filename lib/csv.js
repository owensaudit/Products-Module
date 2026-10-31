// Parse a small RFC-style CSV (quotes, escaped quotes, CRLF). No member data lives here.

export function parseCsv(text) {
  const input = String(text ?? "").replace(/^\uFEFF/, "");
  if (input.trim() === "") return { headers: [], rows: [] };

  const table = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      table.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    table.push(row);
  }

  while (table.length && table[table.length - 1].every((cell) => cell.trim() === "")) {
    table.pop();
  }

  if (!table.length) return { headers: [], rows: [] };

  const headers = table[0].map((header, index) => {
    const trimmed = header.trim();
    return trimmed || `Column ${index + 1}`;
  });

  const rows = table
    .slice(1)
    .filter((cells) => cells.some((cell) => String(cell).trim() !== ""))
    .map((cells) => {
      const record = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] == null ? "" : String(cells[index]).trim();
      });
      return record;
    });

  return { headers, rows };
}
