export function evaluateSheetFormula(formula, columns, rows) {
  const str = String(formula || '').trim();
  const match = /^=(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/i.exec(str);
  const colIndex = letters => [...letters.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

  if (match) {
    const startCol = colIndex(match[2]);
    const endCol = colIndex(match[4]);
    if (startCol !== endCol || !columns[startCol]) return '#REF!';
    const startRow = Number(match[3]) - 1;
    const endRow = Number(match[5]);
    const values = rows.slice(startRow, endRow).map(row => Number(row[columns[startCol].id])).filter(Number.isFinite);
    const op = match[1].toUpperCase();
    if (op === 'COUNT') return values.length;
    if (!values.length) return 0;
    if (op === 'SUM') return values.reduce((a, b) => a + b, 0);
    if (op === 'AVERAGE') return values.reduce((a, b) => a + b, 0) / values.length;
    return op === 'MIN' ? Math.min(...values) : Math.max(...values);
  }

  // Support cell arithmetic: e.g. =A1*B1, =C2+D2, =E3-F3, =G4/H4
  const arithMatch = /^=([A-Z]+)(\d+)\s*([\+\-\*\/])\s*([A-Z]+)(\d+)$/i.exec(str);
  if (arithMatch) {
    const col1 = colIndex(arithMatch[1]);
    const row1 = Number(arithMatch[2]) - 1;
    const op = arithMatch[3];
    const col2 = colIndex(arithMatch[4]);
    const row2 = Number(arithMatch[5]) - 1;
    if (!columns[col1] || !columns[col2] || !rows[row1] || !rows[row2]) return '#REF!';
    const v1 = Number(rows[row1][columns[col1].id]) || 0;
    const v2 = Number(rows[row2][columns[col2].id]) || 0;
    if (op === '+') return v1 + v2;
    if (op === '-') return v1 - v2;
    if (op === '*') return v1 * v2;
    if (op === '/') return v2 === 0 ? '#DIV/0!' : v1 / v2;
  }

  return null;
}

