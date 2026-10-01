import assert from 'node:assert/strict';
import { evaluateSheetFormula } from './formulaUtils.js';

const columns = [{ id: 'truck' }, { id: 'amount' }];
const rows = [{ truck: 'A', amount: 10 }, { truck: 'B', amount: 20 }, { truck: 'C', amount: 5 }];

assert.equal(evaluateSheetFormula('=SUM(B1:B3)', columns, rows), 35);
assert.equal(evaluateSheetFormula('=AVERAGE(B1:B2)', columns, rows), 15);
assert.equal(evaluateSheetFormula('=MIN(B1:B3)', columns, rows), 5);
assert.equal(evaluateSheetFormula('=MAX(B1:B3)', columns, rows), 20);
assert.equal(evaluateSheetFormula('=SUM(A1:B2)', columns, rows), '#REF!');
assert.equal(evaluateSheetFormula('plain text', columns, rows), null);
console.log('sheet formula assertions passed');
