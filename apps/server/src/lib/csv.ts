/** Parser CSV simples (vírgula, cabeçalho na primeira linha, suporte a aspas duplas). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // última célula/linha sem \n final
  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);

  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  return rows.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    header.forEach((key, idx) => {
      obj[key] = cells[idx] ?? '';
    });
    return obj;
  });
}
