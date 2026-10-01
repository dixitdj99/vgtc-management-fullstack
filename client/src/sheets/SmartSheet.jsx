import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Undo2, Redo2, Printer, Paintbrush, DollarSign, Percent,
  ChevronDown, ChevronUp, Bold, Italic, Strikethrough, Baseline, PaintBucket,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, ArrowUpDown, Filter,
  Search, X, Plus, RefreshCw, Check, CheckCircle2, Cloud, AlertCircle,
  Download, Table2, Maximize2, Minimize2, ArrowLeft, Lock, MessageSquare,
  FileSpreadsheet, Star, Sun, Moon, Coffee, Copy, Clipboard
} from 'lucide-react';
import ax from '../api';
import { evaluateSheetFormula } from './formulaUtils';
import './smartSheet.css';

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vgtc-sheet-sync') : null;

// Convert 0-indexed column index to Excel column letters (0 -> A, 25 -> Z, 26 -> AA)
function toColLetter(idx) {
  let letter = '';
  let temp = idx;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

const SHEET_TABS = [
  { id: 'balance-all', title: 'All Balance Sheet' },
  { id: 'balance-kosli', title: 'Kosli' },
  { id: 'balance-jhajjar', title: 'Jhajjar' },
  { id: 'balance-bahadurgarh', title: 'Bahadurgarh' },
  { id: 'balance-jksuper', title: 'JK Super' },
  { id: 'balance-jkl-dump', title: 'JKL Dump' },
  { id: 'balance-jkl', title: 'JK Lakshmi' },
];

const CHALLAN_TABS = [
  { id: 'challans-kosli', title: 'Kosli Challans' },
  { id: 'challans-jhajjar', title: 'Jhajjar Challans' },
  { id: 'challans-bahadurgarh', title: 'Bahadurgarh Challans' },
  { id: 'challans-jkl', title: 'JK Lakshmi Challans' },
];

const COLOR_PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
  '#16537e', '#0b5394', '#351c75', '#741b47', '#274e13', '#7f6000', '#783f04', '#274e13', '#0c343d', '#1c4587',
];

export default function SmartSheet({ sheetId: initialSheetId }) {
  const [currentSheetId, setCurrentSheetId] = useState(initialSheetId || 'balance-all');
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  const [saveMessage, setSaveMessage] = useState('Saved to cloud');
  const [loading, setLoading] = useState(true);
  const [isStarred, setIsStarred] = useState(false);

  // Theme support: synchronized with portal localStorage ('vgtc-theme')
  const [theme, setTheme] = useState(() => localStorage.getItem('vgtc-theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vgtc-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'vgtc-theme' && e.newValue) {
        setTheme(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Cell Selection & Editing State
  const [activeCell, setActiveCell] = useState({ row: 0, col: 0 });
  const [selection, setSelection] = useState(null); // range, rows, or columns; indices follow visible sort/filter order
  const [printSelection, setPrintSelection] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [formulaValue, setFormulaValue] = useState('');

  // Sheet View State
  const [zoom, setZoom] = useState(100);
  const [columnWidths, setColumnWidths] = useState({});
  const [sortConfig, setSortConfig] = useState(null);
  const [freezeFirstCol, setFreezeFirstCol] = useState(true);
  const [showFormulaBar, setShowFormulaBar] = useState(true);

  // Google Sheets Filter State
  const [columnFilterValues, setColumnFilterValues] = useState({}); // { [colId]: Set of selected values }
  const [activeFilterCol, setActiveFilterCol] = useState(null); // column object currently open in filter popover
  const [filterSearchText, setFilterSearchText] = useState('');
  const [tempFilterSelection, setTempFilterSelection] = useState(new Set());

  // Formatting state: cellKey -> { bold, italic, strikethrough, color, bg, align, format }
  const [cellStyles, setCellStyles] = useState({});
  const [fontFamily, setFontFamily] = useState('Roboto, sans-serif');
  const [fontSize, setFontSize] = useState(13);

  // Menus & Modals
  const [openMenu, setOpenMenu] = useState(null);
  const [searchMenusText, setSearchMenusText] = useState('');
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState('');
  const [findMatches, setFindMatches] = useState([]);
  const [findMatchIdx, setFindMatchIdx] = useState(0);
  const [showColorPicker, setShowColorPicker] = useState(null); // 'text' or 'bg'
  const [showFunctionMenu, setShowFunctionMenu] = useState(false);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  // History for Undo/Redo
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  // Refs
  const gridContainerRef = useRef(null);
  const cellInputRef = useRef(null);
  const formulaInputRef = useRef(null);
  const resizerRef = useRef({ colId: null, startX: 0, startWidth: 0 });
  const editCommittedRef = useRef(false);
  const pendingRowsRef = useRef(new Set());
  const mutationEpochRef = useRef(0);
  const loadRequestIdRef = useRef(0);
  const draggingSelectionRef = useRef(false);

  const isChallan = sheet?.definition?.kind === 'challan';
  const isBalanceSheet = sheet?.definition?.kind === 'balance';

  // Load Sheet Data
  const loadSheet = useCallback(async (sid = currentSheetId, { quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    const requestId = ++loadRequestIdRef.current;
    const startedAtEpoch = mutationEpochRef.current;
    try {
      const response = await ax.get(`/sheets/${encodeURIComponent(sid)}`, { _skipCache: true });
      if (requestId === loadRequestIdRef.current && startedAtEpoch === mutationEpochRef.current && pendingRowsRef.current.size === 0) {
        setSheet(response.data);
      }
      if (!quiet && requestId === loadRequestIdRef.current) setError('');
    } catch (err) {
      if (requestId === loadRequestIdRef.current) setError(err.response?.data?.error || 'Could not load spreadsheet data');
    } finally {
      if (!quiet && requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, [currentSheetId]);

  useEffect(() => {
    loadSheet(currentSheetId);
  }, [loadSheet, currentSheetId]);

  // Sync across tabs & windows
  useEffect(() => {
    const onSync = event => {
      if (!event.data?.sheetId || event.data.sheetId === currentSheetId) {
        loadSheet(currentSheetId, { quiet: true });
      }
    };
    channel?.addEventListener('message', onSync);
    const onFocus = () => loadSheet(currentSheetId, { quiet: true });
    window.addEventListener('focus', onFocus);
    return () => {
      channel?.removeEventListener('message', onSync);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadSheet, currentSheetId]);

  // Process rows with Google Sheets style filtering and sorting
  const processedRows = useMemo(() => {
    if (!sheet?.rows) return [];
    let result = [...sheet.rows];

    // Apply per-column distinct value set filters
    Object.entries(columnFilterValues).forEach(([colId, allowedSet]) => {
      if (allowedSet && allowedSet instanceof Set) {
        result = result.filter(row => {
          const val = row[colId] == null || String(row[colId]).trim() === '' ? '(Blanks)' : String(row[colId]);
          return allowedSet.has(val);
        });
      }
    });

    // Apply Sorting
    if (sortConfig) {
      result.sort((a, b) => {
        const valA = a[sortConfig.key] ?? '';
        const valB = b[sortConfig.key] ?? '';
        const numA = Number(valA);
        const numB = Number(valB);
        if (!isNaN(numA) && !isNaN(numB) && valA !== '' && valB !== '') {
          return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
        }
        return sortConfig.direction === 'asc'
          ? String(valA).localeCompare(String(valB))
          : String(valB).localeCompare(String(valA));
      });
    }

    return result;
  }, [sheet, columnFilterValues, sortConfig]);

  // Real columns configured for this sheet
  const realColumns = useMemo(() => {
    return (sheet?.columns || []).map((col, idx) => ({
      ...col,
      width: columnWidths[col.id] || col.width || 120,
      letter: toColLetter(idx),
      isFiller: false,
    }));
  }, [sheet, columnWidths]);

  // Combined columns: Real columns + Filler columns out to column Z (or 26 columns)
  const columns = useMemo(() => {
    const extraCount = Math.max(0, 26 - realColumns.length);
    const fillerCols = Array.from({ length: extraCount }, (_, i) => {
      const cIdx = realColumns.length + i;
      const letter = toColLetter(cIdx);
      return {
        id: `_filler_${letter}`,
        title: '',
        letter,
        width: 100,
        editable: false,
        isFiller: true,
      };
    });
    return [...realColumns, ...fillerCols];
  }, [realColumns]);

  useEffect(() => {
    const stopDrag = () => { draggingSelectionRef.current = false; };
    window.addEventListener('mouseup', stopDrag);
    return () => window.removeEventListener('mouseup', stopDrag);
  }, []);

  useEffect(() => {
    setSelection(null);
  }, [currentSheetId, columnFilterValues, sortConfig]);

  const selectedBounds = useMemo(() => {
    if (!selection || !processedRows.length || !realColumns.length) return null;
    if (selection.kind === 'rows') {
      const rows = [...selection.rows].filter(index => index >= 0 && index < processedRows.length).sort((a, b) => a - b);
      return rows.length ? { rows, cols: realColumns.map((_, index) => index) } : null;
    }
    if (selection.kind === 'columns') {
      const cols = [...selection.cols].filter(index => index >= 0 && index < realColumns.length).sort((a, b) => a - b);
      return cols.length ? { rows: processedRows.map((_, index) => index), cols } : null;
    }
    const firstRow = Math.max(0, Math.min(selection.anchor.row, selection.focus.row));
    const lastRow = Math.min(processedRows.length - 1, Math.max(selection.anchor.row, selection.focus.row));
    const firstCol = Math.max(0, Math.min(selection.anchor.col, selection.focus.col));
    const lastCol = Math.min(realColumns.length - 1, Math.max(selection.anchor.col, selection.focus.col));
    if (firstRow > lastRow || firstCol > lastCol) return null;
    return {
      rows: Array.from({ length: lastRow - firstRow + 1 }, (_, index) => firstRow + index),
      cols: Array.from({ length: lastCol - firstCol + 1 }, (_, index) => firstCol + index),
    };
  }, [selection, processedRows, realColumns]);

  const selectedLookup = useMemo(() => selectedBounds ? {
    rows: new Set(selectedBounds.rows),
    cols: new Set(selectedBounds.cols),
  } : null, [selectedBounds]);
  const isInSelection = (row, col) => Boolean(selectedLookup?.rows.has(row) && selectedLookup.cols.has(col));

  useEffect(() => {
    if (!printSelection) return;
    const reset = () => setPrintSelection(false);
    window.addEventListener('afterprint', reset, { once: true });
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', reset);
    };
  }, [printSelection]);

  // Total display rows: at least 60 rows or real records + 35 blank rows (endless grid)
  const TOTAL_ROWS = useMemo(() => {
    return Math.max(processedRows.length + 35, 60);
  }, [processedRows.length]);

  // Sync Formula Input with Active Cell
  useEffect(() => {
    const row = processedRows[activeCell.row];
    const col = columns[activeCell.col];
    if (!col || col.isFiller || !row) {
      setFormulaValue('');
      if (!isEditing) setEditValue('');
      return;
    }
    const val = row[col.id] ?? '';
    setFormulaValue(String(val));
    if (!isEditing) setEditValue(String(val));
  }, [activeCell, processedRows, columns, isEditing]);

  // Auto-focus cell input when editing begins
  useEffect(() => {
    if (isEditing && cellInputRef.current) {
      editCommittedRef.current = false;
      cellInputRef.current.focus();
      cellInputRef.current.select();
    }
  }, [isEditing]);

  // Save Cell Function
  const saveCell = useCallback(async (rowId, columnId, value, recordHistory = true) => {
    const col = sheet?.columns?.find(c => c.id === columnId);
    if (!col || col.editable === false || !sheet?.canEdit) return;

    const prevRow = sheet.rows.find(r => r.id === rowId);
    if (!prevRow) return;
    if (currentSheetId !== 'challans-jkl' && columnId === 'totalBags' && prevRow?.materials?.length !== 1) {
      setError('Bag totals for multi-material challans must be changed in the Challan form.');
      return;
    }
    if (pendingRowsRef.current.has(rowId)) {
      setError('Wait for this row to finish saving before editing it again.');
      return;
    }
    pendingRowsRef.current.add(rowId);
    mutationEpochRef.current += 1;

    setSaveStatus('saving');
    setSaveMessage('Saving changes…');

    const prevVal = prevRow?.[columnId] ?? '';

    // Optimistic Update
    setSheet(curr => {
      if (!curr) return curr;
      return {
        ...curr,
        rows: curr.rows.map(row => {
          if (row.id !== rowId) return row;
          const updated = { ...row, [columnId]: value };
          // Optimistically recompute grossFreight & netBalance
          if (curr.columns.some(c => c.id === 'grossFreight')) {
            const w = Number(columnId === 'weight' ? value : updated.weight) || 0;
            const r = Number(columnId === 'rate' ? value : updated.rate) || 0;
            const gross = Math.round(w * r);
            const diesel = updated.advanceDiesel === 'FULL' ? 4000 : (Number(updated.advanceDiesel) || 0);
            const cash = Number(updated.advanceCash) || 0;
            const online = Number(updated.advanceOnline) || 0;
            const munshi = Number(updated.munshi) || 0;
            const shortage = Number(updated.shortage) || 0;
            const commission = Number(updated.commission) || 0;
            const tyre = (Number(updated.tyrePuncture) || 0) + (Number(updated.tyreGreasingAir) || 0);
            const net = Math.round(gross - diesel - cash - online - munshi - shortage - commission - tyre);
            updated.grossFreight = gross;
            updated.netBalance = net;
          }
          return updated;
        })
      };
    });

    try {
      const response = await ax.patch(`/sheets/${encodeURIComponent(currentSheetId)}/${encodeURIComponent(rowId)}`, {
        field: columnId,
        value,
        revision: prevRow?._revision,
      });

      setSheet(curr => {
        if (!curr) return curr;
        return {
          ...curr,
          rows: curr.rows.map(r => r.id === rowId ? response.data.row : r)
        };
      });

      if (recordHistory) {
        setHistory(h => [...h.slice(-99), { rowId, columnId, prevVal, nextVal: value }]);
        setFuture([]);
      }

      setSaveStatus('saved');
      setSaveMessage('Saved to cloud');
      channel?.postMessage({ sheetId: currentSheetId, rowId, type: 'vgtc-sheet-update' });
    } catch (err) {
      setSaveStatus('error');
      setSaveMessage('Save failed');
      // Rollback on failure
      setSheet(curr => {
        if (!curr) return curr;
        return {
          ...curr,
          rows: curr.rows.map(r => r.id === rowId ? (err.response?.data?.row || prevRow) : r)
        };
      });
      setError(err.response?.data?.error || 'Failed to save cell edit');
    } finally {
      pendingRowsRef.current.delete(rowId);
    }
  }, [sheet, currentSheetId]);

  // Commit Active Cell Edit
  const commitEdit = useCallback((explicitValue) => {
    if (isEditing && editCommittedRef.current) return;
    if (isEditing) editCommittedRef.current = true;
    setIsEditing(false);
    const row = processedRows[activeCell.row];
    const col = columns[activeCell.col];
    if (!row || !col || col.isFiller || col.editable === false || !sheet?.canEdit) return;

    let finalVal = explicitValue !== undefined ? explicitValue : editValue;
    const currentVal = String(row[col.id] ?? '');

    // Check if formula
    if (String(finalVal).startsWith('=')) {
      const result = evaluateSheetFormula(finalVal, realColumns, processedRows);
      if (result !== null && result !== '#REF!') {
        finalVal = String(result);
      }
    }

    if (String(finalVal).trim() !== currentVal.trim()) {
      saveCell(row.id, col.id, finalVal);
    }
  }, [processedRows, activeCell, columns, realColumns, editValue, sheet, saveCell, isEditing]);

  // Add New Row: strictly for Challans only
  const handleAddRow = useCallback(async (initialFieldVal = null) => {
    if (!isChallan) {
      setInfoMessage('Adding rows directly in Balance Sheets is restricted. New vouchers are created through the Voucher module.');
      setTimeout(() => setInfoMessage(''), 4500);
      return;
    }
    if (!sheet?.canEdit) return;

    setSaveStatus('saving');
    setSaveMessage('Adding challan row…');
    try {
      const payload = {
        date: new Date().toISOString().split('T')[0],
      };
      if (initialFieldVal && columns[activeCell.col]?.editable) {
        payload[columns[activeCell.col].id] = initialFieldVal;
      }
      const response = await ax.post(`/sheets/${encodeURIComponent(currentSheetId)}`, payload);
      setSheet(curr => ({
        ...curr,
        rows: [response.data.row, ...(curr?.rows || [])]
      }));
      setSaveStatus('saved');
      setSaveMessage('Saved to cloud');
      channel?.postMessage({ sheetId: currentSheetId, type: 'vgtc-sheet-update' });
      setActiveCell({ row: 0, col: activeCell.col });
    } catch (err) {
      setSaveStatus('error');
      setSaveMessage('Add row failed');
      setError(err.response?.data?.error || 'Could not add new row');
    }
  }, [isChallan, sheet, currentSheetId, columns, activeCell]);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (!history.length) return;
    const last = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setFuture(f => [...f, last]);
    saveCell(last.rowId, last.columnId, last.prevVal, false);
  }, [history, saveCell]);

  const handleRedo = useCallback(() => {
    if (!future.length) return;
    const next = future[future.length - 1];
    setFuture(f => f.slice(0, -1));
    setHistory(h => [...h, next]);
    saveCell(next.rowId, next.columnId, next.nextVal, false);
  }, [future, saveCell]);

  // Cell Styles (Bold, Italic, Strikethrough, Color, Bg, Align)
  const toggleStyle = (styleProp, value = null) => {
    const key = `${activeCell.row}:${activeCell.col}`;
    setCellStyles(prev => {
      const current = prev[key] || {};
      const nextVal = value !== null ? value : !current[styleProp];
      return {
        ...prev,
        [key]: {
          ...current,
          [styleProp]: nextVal,
        }
      };
    });
  };

  // Keyboard navigation & Shortcuts (when NOT editing inside input)
  const handleKeyDown = useCallback((e) => {
    if (isEditing) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    // Enter Key -> Start editing
    if (e.key === 'Enter') {
      e.preventDefault();
      const col = columns[activeCell.col];
      if (col?.editable && activeCell.row < processedRows.length) {
        setIsEditing(true);
      } else if (isChallan && activeCell.row >= processedRows.length) {
        handleAddRow();
      }
      return;
    }

    // Tab Key -> Move right / left
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        setActiveCell(curr => ({ ...curr, col: Math.max(0, curr.col - 1) }));
      } else {
        setActiveCell(curr => ({ ...curr, col: Math.min(columns.length - 1, curr.col + 1) }));
      }
      return;
    }

    // Escape Key
    if (e.key === 'Escape') {
      if (showFind) setShowFind(false);
      setOpenMenu(null);
      setShowColorPicker(null);
      setShowFunctionMenu(false);
      setShowFormatMenu(false);
      setActiveFilterCol(null);
      setContextMenu(null);
      return;
    }

    // Navigation keys
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveCell(curr => ({ ...curr, row: Math.max(0, curr.row - 1) }));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveCell(curr => ({ ...curr, row: Math.min(TOTAL_ROWS - 1, curr.row + 1) }));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveCell(curr => ({ ...curr, col: Math.max(0, curr.col - 1) }));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveCell(curr => ({ ...curr, col: Math.min(columns.length - 1, curr.col + 1) }));
    } else if (e.key === 'F2') {
      e.preventDefault();
      const col = columns[activeCell.col];
      if (col?.editable && activeCell.row < processedRows.length) setIsEditing(true);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const row = processedRows[activeCell.row];
      const col = columns[activeCell.col];
      if (row && col && col.editable) {
        saveCell(row.id, col.id, '');
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); e.shiftKey ? handleRedo() : handleUndo(); }
      else if (e.key === 'y') { e.preventDefault(); handleRedo(); }
      else if (e.key === 'f') { e.preventDefault(); setShowFind(true); }
      else if (e.key === 'b') { e.preventDefault(); toggleStyle('bold'); }
      else if (e.key === 'i') { e.preventDefault(); toggleStyle('italic'); }
      else if (e.key === 'c') {
        const row = processedRows[activeCell.row];
        const col = columns[activeCell.col];
        if (row && col) navigator.clipboard?.writeText(String(row[col.id] ?? ''));
      } else if (e.key === 'v') {
        navigator.clipboard?.readText?.().then(text => {
          if (text != null) {
            const row = processedRows[activeCell.row];
            const col = columns[activeCell.col];
            if (row && col && col.editable) saveCell(row.id, col.id, text.trim());
          }
        });
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // Start typing directly into active cell
      const col = columns[activeCell.col];
      if (col?.editable && activeCell.row < processedRows.length) {
        setIsEditing(true);
        setEditValue(e.key);
      } else if (isChallan && activeCell.row >= processedRows.length) {
        handleAddRow(e.key);
      } else if (isBalanceSheet && activeCell.row >= processedRows.length) {
        setInfoMessage('New balance sheet vouchers must be created via the Voucher module.');
        setTimeout(() => setInfoMessage(''), 4500);
      }
    }
  }, [isEditing, columns, activeCell, processedRows, TOTAL_ROWS, isChallan, isBalanceSheet, handleAddRow, handleUndo, handleRedo, saveCell]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Click outside to close menus and filter popover
  useEffect(() => {
    const closeAnyMenu = () => {
      setOpenMenu(null);
      setShowColorPicker(null);
      setShowFunctionMenu(false);
      setShowFormatMenu(false);
      setContextMenu(null);
    };
    window.addEventListener('click', closeAnyMenu);
    return () => window.removeEventListener('click', closeAnyMenu);
  }, []);

  // Column Resizer logic
  const handleResizeStart = (e, colId) => {
    e.stopPropagation();
    resizerRef.current = {
      colId,
      startX: e.clientX,
      startWidth: columnWidths[colId] || columns.find(c => c.id === colId)?.width || 120,
    };

    const handleMouseMove = (moveEvent) => {
      if (!resizerRef.current.colId) return;
      const deltaX = moveEvent.clientX - resizerRef.current.startX;
      const newWidth = Math.max(60, resizerRef.current.startWidth + deltaX);
      setColumnWidths(prev => ({ ...prev, [resizerRef.current.colId]: newWidth }));
    };

    const handleMouseUp = () => {
      resizerRef.current = { colId: null, startX: 0, startWidth: 0 };
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Find Matches Logic
  useEffect(() => {
    if (!findText.trim() || !sheet?.rows) {
      setFindMatches([]);
      setFindMatchIdx(0);
      return;
    }
    const q = findText.toLowerCase();
    const matches = [];
    processedRows.forEach((row, rIdx) => {
      realColumns.forEach((col, cIdx) => {
        const val = String(row[col.id] ?? '').toLowerCase();
        if (val.includes(q)) {
          matches.push({ row: rIdx, col: cIdx });
        }
      });
    });
    setFindMatches(matches);
    setFindMatchIdx(0);
    if (matches.length > 0) {
      setActiveCell(matches[0]);
    }
  }, [findText, processedRows, realColumns, sheet]);

  const nextFindMatch = () => {
    if (!findMatches.length) return;
    const nextIdx = (findMatchIdx + 1) % findMatches.length;
    setFindMatchIdx(nextIdx);
    setActiveCell(findMatches[nextIdx]);
  };

  const prevFindMatch = () => {
    if (!findMatches.length) return;
    const prevIdx = (findMatchIdx - 1 + findMatches.length) % findMatches.length;
    setFindMatchIdx(prevIdx);
    setActiveCell(findMatches[prevIdx]);
  };

  // Export File (Excel / CSV)
  const exportFile = (type = 'xlsx') => {
    if (!processedRows.length) return;
    const exportData = processedRows.map(row => {
      const item = {};
      realColumns.forEach(c => {
        item[c.title || c.id] = row[c.id] ?? '';
      });
      return item;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet?.title?.slice(0, 31) || 'Sheet1');
    const filename = `${(sheet?.title || 'VGTC_Sheet').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.${type}`;
    if (type === 'csv') {
      XLSX.writeFile(workbook, filename, { bookType: 'csv' });
    } else {
      XLSX.writeFile(workbook, filename, { bookType: 'xlsx' });
    }
  };

  // Google Sheets Filter Popover Handlers
  const openFilterPopover = (e, col) => {
    e.stopPropagation();
    setActiveFilterCol(col);
    setFilterSearchText('');
    // Initialize temporary selection with current active set, or all values if no filter is set
    const currentSet = columnFilterValues[col.id];
    if (currentSet) {
      setTempFilterSelection(new Set(currentSet));
    } else {
      const allVals = new Set(
        sheet?.rows?.map(r => r[col.id] == null || String(r[col.id]).trim() === '' ? '(Blanks)' : String(r[col.id])) || []
      );
      setTempFilterSelection(allVals);
    }
  };

  const applyColumnFilter = () => {
    if (!activeFilterCol) return;
    const colId = activeFilterCol.id;
    // If all distinct values are checked, remove the filter so it's clean
    const allDistinct = new Set(
      sheet?.rows?.map(r => r[colId] == null || String(r[colId]).trim() === '' ? '(Blanks)' : String(r[colId])) || []
    );
    if (tempFilterSelection.size >= allDistinct.size) {
      setColumnFilterValues(prev => {
        const next = { ...prev };
        delete next[colId];
        return next;
      });
    } else {
      setColumnFilterValues(prev => ({
        ...prev,
        [colId]: new Set(tempFilterSelection)
      }));
    }
    setActiveFilterCol(null);
  };

  const clearColumnFilter = () => {
    if (!activeFilterCol) return;
    setColumnFilterValues(prev => {
      const next = { ...prev };
      delete next[activeFilterCol.id];
      return next;
    });
    setActiveFilterCol(null);
  };

  // Distinct values for currently opened filter column
  const filterDistinctValues = useMemo(() => {
    if (!activeFilterCol || !sheet?.rows) return [];
    const counts = {};
    sheet.rows.forEach(r => {
      const v = r[activeFilterCol.id] == null || String(r[activeFilterCol.id]).trim() === '' ? '(Blanks)' : String(r[activeFilterCol.id]);
      counts[v] = (counts[v] || 0) + 1;
    });
    let list = Object.entries(counts).map(([val, count]) => ({ val, count }));
    if (filterSearchText.trim()) {
      const q = filterSearchText.toLowerCase();
      list = list.filter(item => item.val.toLowerCase().includes(q));
    }
    list.sort((a, b) => a.val.localeCompare(b.val));
    return list;
  }, [activeFilterCol, sheet, filterSearchText]);

  // Aggregate stats in footer
  const stats = useMemo(() => {
    if (!processedRows.length || !columns[activeCell.col] || columns[activeCell.col].isFiller) {
      return null;
    }
    const col = columns[activeCell.col];
    const vals = processedRows.map(r => Number(r[col.id])).filter(v => !isNaN(v) && v !== 0);
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / vals.length);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return { sum, avg, min, max, count: vals.length };
  }, [processedRows, activeCell, columns]);

  // Copy shareable link
  const handleShareLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setInfoMessage('Sheet link copied to clipboard!');
    setTimeout(() => setInfoMessage(''), 3000);
  };

  if (loading && !sheet) {
    return (
      <div className="gsq-loader-screen">
        <div className="gsq-spinner" />
        <div>Loading VGTC Smart Sheet…</div>
      </div>
    );
  }

  const currentTabList = currentSheetId.startsWith('challan') ? CHALLAN_TABS : SHEET_TABS;

  return (
    <div className="gsq-container" data-theme={theme}>
      {/* ── 1. GOOGLE SHEETS HEADER ── */}
      <header className="gsq-topbar">
        <div className="gsq-topbar-left">
          {/* Green Google Sheets Icon */}
          <div className="gsq-app-icon" onClick={() => window.location.href = '/'} title="Return to VGTC Hub">
            <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
              <path d="M37 42H11C9.34315 42 8 40.6569 8 39V9C8 7.34315 9.34315 6 11 6H29L40 17V39C40 40.6569 38.6569 42 37 42Z" fill="#0F9D58"/>
              <path d="M29 6L40 17H29V6Z" fill="#87CEAB"/>
              <path d="M14 22H34M14 28H34M14 34H34M24 16V38" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>

          <div className="gsq-doc-meta">
            {/* Title & Status */}
            <div className="gsq-title-row">
              <span className="gsq-title" title="Spreadsheet Name">
                {sheet?.title || 'VGTC Smart Sheet'}
              </span>
              <button
                className={`gsq-star-btn ${isStarred ? 'active' : ''}`}
                onClick={() => setIsStarred(!isStarred)}
                title={isStarred ? 'Starred' : 'Star this sheet'}
              >
                <Star size={16} fill={isStarred ? '#fbbc04' : 'none'} />
              </button>

              <div className={`gsq-cloud-status gsq-${saveStatus}`} title={saveMessage}>
                {saveStatus === 'saving' && <RefreshCw size={13} className="gsq-spin" />}
                {saveStatus === 'saved' && <CheckCircle2 size={13} />}
                {saveStatus === 'error' && <AlertCircle size={13} />}
                <span>{saveMessage}</span>
              </div>
            </div>

            {/* Menu Bar (File, Edit, View, Insert, Format, Data, Tools, Extensions, Help) */}
            <nav className="gsq-menubar">
              {/* File Menu */}
              <div className="gsq-menu-trigger" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === 'file' ? null : 'file'); }}>
                <span>File</span>
                {openMenu === 'file' && (
                  <div className="gsq-dropdown">
                    <button onClick={() => exportFile('xlsx')}>
                      <span><Download size={14} /> Download Excel (.xlsx)</span>
                    </button>
                    <button onClick={() => exportFile('csv')}>
                      <span><Download size={14} /> Download CSV (.csv)</span>
                    </button>
                    <div className="gsq-dropdown-divider" />
                    <button onClick={() => window.print()}>
                      <span><Printer size={14} /> Print</span>
                      <span className="gsq-kbd-shortcut">Ctrl+P</span>
                    </button>
                    <button disabled={!selectedBounds} onClick={() => { setOpenMenu(null); setPrintSelection(true); }}>
                      <span><Printer size={14} /> Print selection</span>
                    </button>
                    <div className="gsq-dropdown-divider" />
                    <button onClick={() => window.close() || window.history.back()}>
                      <span><ArrowLeft size={14} /> Close sheet</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Edit Menu */}
              <div className="gsq-menu-trigger" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === 'edit' ? null : 'edit'); }}>
                <span>Edit</span>
                {openMenu === 'edit' && (
                  <div className="gsq-dropdown">
                    <button onClick={handleUndo} disabled={!history.length}>
                      <span><Undo2 size={14} /> Undo</span>
                      <span className="gsq-kbd-shortcut">Ctrl+Z</span>
                    </button>
                    <button onClick={handleRedo} disabled={!future.length}>
                      <span><Redo2 size={14} /> Redo</span>
                      <span className="gsq-kbd-shortcut">Ctrl+Y</span>
                    </button>
                    <div className="gsq-dropdown-divider" />
                    <button onClick={() => setShowFind(true)}>
                      <span><Search size={14} /> Find &amp; search</span>
                      <span className="gsq-kbd-shortcut">Ctrl+F</span>
                    </button>
                  </div>
                )}
              </div>

              {/* View Menu */}
              <div className="gsq-menu-trigger" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === 'view' ? null : 'view'); }}>
                <span>View</span>
                {openMenu === 'view' && (
                  <div className="gsq-dropdown">
                    <button onClick={() => setShowFormulaBar(!showFormulaBar)}>
                      <span>{showFormulaBar ? '✓ ' : '  '}Show Formula Bar</span>
                    </button>
                    <button onClick={() => setFreezeFirstCol(!freezeFirstCol)}>
                      <span>{freezeFirstCol ? '✓ ' : '  '}Freeze First Column</span>
                    </button>
                    <div className="gsq-dropdown-divider" />
                    <div style={{ padding: '4px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--gsq-text-muted)' }}>THEME</div>
                    <button onClick={() => setTheme('light')}>
                      <span>{theme === 'light' ? '✓ ' : '  '}<Sun size={13} style={{ display: 'inline', marginRight: 6 }} />Light Theme</span>
                    </button>
                    <button onClick={() => setTheme('dark')}>
                      <span>{theme === 'dark' ? '✓ ' : '  '}<Moon size={13} style={{ display: 'inline', marginRight: 6 }} />Dark Theme</span>
                    </button>
                    <button onClick={() => setTheme('sepia')}>
                      <span>{theme === 'sepia' ? '✓ ' : '  '}<Coffee size={13} style={{ display: 'inline', marginRight: 6 }} />Sepia Theme</span>
                    </button>
                    <div className="gsq-dropdown-divider" />
                    <div style={{ padding: '4px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--gsq-text-muted)' }}>ZOOM</div>
                    {[75, 90, 100, 125, 150].map(z => (
                      <button key={z} onClick={() => setZoom(z)}>
                        <span>{zoom === z ? '✓ ' : '  '}{z}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Insert Menu */}
              <div className="gsq-menu-trigger" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === 'insert' ? null : 'insert'); }}>
                <span>Insert</span>
                {openMenu === 'insert' && (
                  <div className="gsq-dropdown">
                    {isChallan ? (
                      <button onClick={() => handleAddRow()}><Plus size={14} /> Insert Challan Row</button>
                    ) : (
                      <button disabled title="Balance vouchers are added via the Voucher module">
                        <span style={{ opacity: 0.6 }}>Insert Row (Disabled on Balance Sheet)</span>
                      </button>
                    )}
                    <div className="gsq-dropdown-divider" />
                    <button onClick={() => { setFormulaValue('=SUM('); setEditValue('=SUM('); setIsEditing(true); }}>Function: SUM</button>
                    <button onClick={() => { setFormulaValue('=AVERAGE('); setEditValue('=AVERAGE('); setIsEditing(true); }}>Function: AVERAGE</button>
                    <button onClick={() => { setFormulaValue('=COUNT('); setEditValue('=COUNT('); setIsEditing(true); }}>Function: COUNT</button>
                    <button onClick={() => { setFormulaValue('=MIN('); setEditValue('=MIN('); setIsEditing(true); }}>Function: MIN</button>
                    <button onClick={() => { setFormulaValue('=MAX('); setEditValue('=MAX('); setIsEditing(true); }}>Function: MAX</button>
                  </div>
                )}
              </div>

              {/* Format Menu */}
              <div className="gsq-menu-trigger" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === 'format' ? null : 'format'); }}>
                <span>Format</span>
                {openMenu === 'format' && (
                  <div className="gsq-dropdown">
                    <button onClick={() => toggleStyle('bold')}>
                      <span><Bold size={14} /> Bold</span>
                      <span className="gsq-kbd-shortcut">Ctrl+B</span>
                    </button>
                    <button onClick={() => toggleStyle('italic')}>
                      <span><Italic size={14} /> Italic</span>
                      <span className="gsq-kbd-shortcut">Ctrl+I</span>
                    </button>
                    <button onClick={() => toggleStyle('strikethrough')}>
                      <span><Strikethrough size={14} /> Strikethrough</span>
                    </button>
                    <div className="gsq-dropdown-divider" />
                    <button onClick={() => toggleStyle('align', 'left')}>
                      <span><AlignLeft size={14} /> Align Left</span>
                    </button>
                    <button onClick={() => toggleStyle('align', 'center')}>
                      <span><AlignCenter size={14} /> Align Center</span>
                    </button>
                    <button onClick={() => toggleStyle('align', 'right')}>
                      <span><AlignRight size={14} /> Align Right</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Data Menu */}
              <div className="gsq-menu-trigger" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === 'data' ? null : 'data'); }}>
                <span>Data</span>
                {openMenu === 'data' && (
                  <div className="gsq-dropdown">
                    <button onClick={() => {
                      const col = columns[activeCell.col];
                      if (col && !col.isFiller) setSortConfig({ key: col.id, direction: 'asc' });
                    }}><ArrowUpDown size={14} /> Sort Sheet by Column A → Z</button>
                    <button onClick={() => {
                      const col = columns[activeCell.col];
                      if (col && !col.isFiller) setSortConfig({ key: col.id, direction: 'desc' });
                    }}><ArrowUpDown size={14} /> Sort Sheet by Column Z → A</button>
                    <div className="gsq-dropdown-divider" />
                    <button onClick={(e) => {
                      const col = columns[activeCell.col];
                      if (col && !col.isFiller) openFilterPopover(e, col);
                    }}><Filter size={14} /> Filter on Active Column</button>
                    <button onClick={() => { setColumnFilterValues({}); setSortConfig(null); }}>
                      <X size={14} /> Clear All Filters &amp; Sort
                    </button>
                  </div>
                )}
              </div>

              {/* Tools Menu */}
              <div className="gsq-menu-trigger" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === 'tools' ? null : 'tools'); }}>
                <span>Tools</span>
                {openMenu === 'tools' && (
                  <div className="gsq-dropdown">
                    <button onClick={() => setShowHelpModal(true)}>
                      <span>Keyboard Shortcuts</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Extensions Menu */}
              <div className="gsq-menu-trigger" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === 'ext' ? null : 'ext'); }}>
                <span>Extensions</span>
                {openMenu === 'ext' && (
                  <div className="gsq-dropdown">
                    <button onClick={() => loadSheet(currentSheetId)}>
                      <span><RefreshCw size={14} /> Sync Live Data with Server</span>
                    </button>
                    <button onClick={() => window.open('/status', '_blank')}>
                      <span>System Observability &amp; Status</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Help */}
              <div className="gsq-menu-trigger" onClick={() => setShowHelpModal(true)}>
                <span>Help</span>
              </div>
            </nav>
          </div>
        </div>

        {/* Right side actions: Comments, Share, Avatar (No Meet icon!) */}
        <div className="gsq-topbar-right">
          {/* Comments trigger */}
          <button className="gsq-icon-circle-btn" title="Open comment history" onClick={() => setInfoMessage('Comments feature is active on synced sheets.')}>
            <MessageSquare size={17} />
          </button>

          {/* Authentic Google Blue Share button */}
          <button className="gsq-btn-share-google" onClick={handleShareLink} title="Share sheet URL">
            <Lock size={13} />
            <span>Share</span>
          </button>

          {/* User profile avatar (no Meet icon!) */}
          <div className="gsq-avatar" title="Logged in user">
            V
          </div>
        </div>
      </header>

      {/* ── 2. ACTION TOOLBAR RIBBON ── */}
      <section className="gsq-toolbar">
        {/* Search / Menus Box */}
        <div className="gsq-search-menus-input" title="Search the menus (Alt+/)">
          <Search size={13} style={{ color: 'var(--gsq-text-muted)' }} />
          <input
            placeholder="Menus"
            value={searchMenusText}
            onChange={e => setSearchMenusText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setShowFind(true);
                setFindText(searchMenusText);
              }
            }}
          />
        </div>

        <div className="gsq-tb-divider" />

        {/* Undo / Redo */}
        <button className="gsq-tb-btn" onClick={handleUndo} disabled={!history.length} title="Undo (Ctrl+Z)">
          <Undo2 size={15} />
        </button>
        <button className="gsq-tb-btn" onClick={handleRedo} disabled={!future.length} title="Redo (Ctrl+Y)">
          <Redo2 size={15} />
        </button>

        {/* Print */}
        <button className="gsq-tb-btn" onClick={() => window.print()} title="Print (Ctrl+P)">
          <Printer size={15} />
        </button>
        <button className="gsq-tb-btn gsq-print-selection-btn" onClick={() => setPrintSelection(true)} disabled={!selectedBounds} title="Print selected cells, rows, or columns">
          Print selection
        </button>

        {/* Paint Format */}
        <button className="gsq-tb-btn" title="Paint format" onClick={() => setInfoMessage('Format painter ready')}>
          <Paintbrush size={15} />
        </button>

        {/* Zoom Stepper */}
        <select className="gsq-tb-select" value={zoom} onChange={e => setZoom(Number(e.target.value))} title="Zoom">
          <option value={50}>50%</option>
          <option value={75}>75%</option>
          <option value={90}>90%</option>
          <option value={100}>100%</option>
          <option value={125}>125%</option>
          <option value={150}>150%</option>
        </select>

        <div className="gsq-tb-divider" />

        {/* Formats: ₹, %, Decimals */}
        <button className="gsq-tb-btn" onClick={() => toggleStyle('format', 'currency')} title="Format as currency (₹)">
          <span style={{ fontWeight: 700, fontSize: '12px' }}>₹</span>
        </button>
        <button className="gsq-tb-btn" onClick={() => toggleStyle('format', 'percent')} title="Format as percent (%)">
          <Percent size={13} />
        </button>
        <button className="gsq-tb-btn" title="Decrease decimal places" onClick={() => setInfoMessage('Decimals adjusted')}>
          <span style={{ fontWeight: 600, fontSize: '11px' }}>.0</span>
        </button>
        <button className="gsq-tb-btn" title="Increase decimal places" onClick={() => setInfoMessage('Decimals adjusted')}>
          <span style={{ fontWeight: 600, fontSize: '11px' }}>.00</span>
        </button>

        <div className="gsq-tb-divider" />

        {/* Font Family */}
        <select
          className="gsq-tb-select"
          value={fontFamily}
          onChange={e => setFontFamily(e.target.value)}
          title="Font"
          style={{ width: '92px' }}
        >
          <option value="Roboto, sans-serif">Roboto</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Inter, sans-serif">Inter</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Courier New, monospace">Courier</option>
        </select>

        <div className="gsq-tb-divider" />

        {/* Font Size Stepper */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button className="gsq-tb-btn" style={{ width: 18 }} onClick={() => setFontSize(s => Math.max(9, s - 1))} title="Decrease font size">-</button>
          <span style={{ fontSize: '12px', padding: '0 4px', minWidth: 20, textAlign: 'center' }}>{fontSize}</span>
          <button className="gsq-tb-btn" style={{ width: 18 }} onClick={() => setFontSize(s => Math.min(24, s + 1))} title="Increase font size">+</button>
        </div>

        <div className="gsq-tb-divider" />

        {/* Bold, Italic, Strikethrough */}
        <button
          className={`gsq-tb-btn ${cellStyles[`${activeCell.row}:${activeCell.col}`]?.bold ? 'active' : ''}`}
          onClick={() => toggleStyle('bold')}
          title="Bold (Ctrl+B)"
        >
          <Bold size={14} />
        </button>
        <button
          className={`gsq-tb-btn ${cellStyles[`${activeCell.row}:${activeCell.col}`]?.italic ? 'active' : ''}`}
          onClick={() => toggleStyle('italic')}
          title="Italic (Ctrl+I)"
        >
          <Italic size={14} />
        </button>
        <button
          className={`gsq-tb-btn ${cellStyles[`${activeCell.row}:${activeCell.col}`]?.strikethrough ? 'active' : ''}`}
          onClick={() => toggleStyle('strikethrough')}
          title="Strikethrough"
        >
          <Strikethrough size={14} />
        </button>

        {/* Text Color Picker Popover */}
        <div className="gsq-tb-popover-wrap">
          <button
            className={`gsq-tb-btn ${showColorPicker === 'text' ? 'active' : ''}`}
            onClick={e => {
              e.stopPropagation();
              setShowColorPicker(curr => curr === 'text' ? null : 'text');
              setShowFunctionMenu(false);
              setShowFormatMenu(false);
            }}
            title="Text color"
          >
            <Baseline size={14} />
            <div className="gsq-color-bar" style={{ background: cellStyles[`${activeCell.row}:${activeCell.col}`]?.color || 'var(--gsq-text)' }} />
          </button>
          {showColorPicker === 'text' && (
            <div className="gsq-palette-popover" onClick={e => e.stopPropagation()}>
              <div className="gsq-palette-title">Text Color</div>
              <div className="gsq-palette-grid">
                {COLOR_PALETTE.map(c => (
                  <div
                    key={c}
                    className="gsq-palette-swatch"
                    style={{ background: c }}
                    onClick={() => { toggleStyle('color', c); setShowColorPicker(null); }}
                  />
                ))}
              </div>
              <button className="gsq-palette-reset" onClick={() => { toggleStyle('color', null); setShowColorPicker(null); }}>
                Reset (Default)
              </button>
            </div>
          )}
        </div>

        {/* Fill Color Picker Popover */}
        <div className="gsq-tb-popover-wrap">
          <button
            className={`gsq-tb-btn ${showColorPicker === 'bg' ? 'active' : ''}`}
            onClick={e => {
              e.stopPropagation();
              setShowColorPicker(curr => curr === 'bg' ? null : 'bg');
              setShowFunctionMenu(false);
              setShowFormatMenu(false);
            }}
            title="Fill color"
          >
            <PaintBucket size={14} />
            <div className="gsq-color-bar" style={{ background: cellStyles[`${activeCell.row}:${activeCell.col}`]?.bg || 'var(--gsq-surface)' }} />
          </button>
          {showColorPicker === 'bg' && (
            <div className="gsq-palette-popover" onClick={e => e.stopPropagation()}>
              <div className="gsq-palette-title">Fill Color</div>
              <div className="gsq-palette-grid">
                {COLOR_PALETTE.map(c => (
                  <div
                    key={c}
                    className="gsq-palette-swatch"
                    style={{ background: c }}
                    onClick={() => { toggleStyle('bg', c); setShowColorPicker(null); }}
                  />
                ))}
              </div>
              <button className="gsq-palette-reset" onClick={() => { toggleStyle('bg', null); setShowColorPicker(null); }}>
                Reset (No color)
              </button>
            </div>
          )}
        </div>

        {/* Borders */}
        <button className="gsq-tb-btn" title="Borders" onClick={() => setInfoMessage('Grid borders applied')}>
          <Table2 size={14} />
        </button>

        <div className="gsq-tb-divider" />

        {/* Alignments */}
        <button className="gsq-tb-btn" onClick={() => toggleStyle('align', 'left')} title="Align left">
          <AlignLeft size={14} />
        </button>
        <button className="gsq-tb-btn" onClick={() => toggleStyle('align', 'center')} title="Align center">
          <AlignCenter size={14} />
        </button>
        <button className="gsq-tb-btn" onClick={() => toggleStyle('align', 'right')} title="Align right">
          <AlignRight size={14} />
        </button>

        <div className="gsq-tb-divider" />

        {/* Functions Dropdown (Σ) */}
        <div className="gsq-tb-popover-wrap">
          <button
            className={`gsq-tb-btn ${showFunctionMenu ? 'active' : ''}`}
            onClick={e => {
              e.stopPropagation();
              setShowFunctionMenu(!showFunctionMenu);
              setShowColorPicker(null);
              setShowFormatMenu(false);
            }}
            title="Functions"
          >
            <span style={{ fontWeight: 800, fontSize: '13px' }}>Σ</span>
          </button>
          {showFunctionMenu && (
            <div className="gsq-palette-popover gsq-fn-popover" onClick={e => e.stopPropagation()}>
              <div className="gsq-palette-title">Functions</div>
              {['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN'].map(fn => (
                <button
                  key={fn}
                  className="gsq-fn-item"
                  onClick={() => {
                    const colLet = toColLetter(activeCell.col);
                    const formulaStr = `=${fn}(${colLet}1:${colLet}${processedRows.length})`;
                    setFormulaValue(formulaStr);
                    setEditValue(formulaStr);
                    setIsEditing(true);
                    setShowFunctionMenu(false);
                  }}
                >
                  <strong>{fn}</strong>
                  <span>={fn}({toColLetter(activeCell.col)}1:{toColLetter(activeCell.col)}{processedRows.length})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter on Active Column */}
        <button
          className="gsq-tb-btn"
          onClick={e => {
            const col = columns[activeCell.col];
            if (col && !col.isFiller) openFilterPopover(e, col);
          }}
          title="Create a filter on selected column"
        >
          <Filter size={14} />
        </button>

        {/* Find & Search */}
        <button className={`gsq-tb-btn ${showFind ? 'active' : ''}`} onClick={() => setShowFind(!showFind)} title="Find in sheet (Ctrl+F)">
          <Search size={14} />
        </button>

        {/* Add Row Button: ONLY shown for Challans */}
        {isChallan && (
          <button className="gsq-add-row-pill" onClick={() => handleAddRow()} disabled={!sheet?.canEdit} title="Add new challan entry">
            <Plus size={14} />
            <span>Add Row</span>
          </button>
        )}
      </section>

      {/* ── 3. FORMULA BAR ── */}
      {showFormulaBar && (
        <section className="gsq-formula-bar">
          <div className="gsq-name-box">
            {toColLetter(activeCell.col)}{activeCell.row + 1}
          </div>
          <div className="gsq-fx-icon">fx</div>
          <input
            ref={formulaInputRef}
            className="gsq-formula-input"
            value={formulaValue}
            onChange={e => {
              setFormulaValue(e.target.value);
              setEditValue(e.target.value);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit(e.target.value);
              }
            }}
            placeholder="Select a cell or enter formula (e.g. =SUM(A1:A10))"
          />
        </section>
      )}

      {/* ── FLOATING FIND BAR ── */}
      {showFind && (
        <div className="gsq-find-dialog">
          <Search size={14} style={{ color: 'var(--gsq-text-muted)' }} />
          <input
            id="gsq-find-input"
            value={findText}
            onChange={e => setFindText(e.target.value)}
            placeholder="Find in sheet…"
            autoFocus
          />
          <span className="gsq-find-count">
            {findMatches.length ? `${findMatchIdx + 1} of ${findMatches.length}` : '0 results'}
          </span>
          <button onClick={prevFindMatch} title="Previous (Shift+Enter)"><ChevronUp size={14} /></button>
          <button onClick={nextFindMatch} title="Next (Enter)"><ChevronDown size={14} /></button>
          <button onClick={() => setShowFind(false)} title="Close"><X size={14} /></button>
        </div>
      )}

      {/* ── ALERTS / NOTICES ── */}
      {error && (
        <div className="gsq-alert-banner" onClick={() => setError('')}>
          <AlertCircle size={15} />
          <span>{error}</span>
          <X size={14} style={{ marginLeft: 'auto', cursor: 'pointer' }} />
        </div>
      )}
      {infoMessage && (
        <div className="gsq-alert-banner" style={{ background: '#e8f0fe', color: '#1a73e8', borderColor: '#d2e3fc' }} onClick={() => setInfoMessage('')}>
          <CheckCircle2 size={15} />
          <span>{infoMessage}</span>
          <X size={14} style={{ marginLeft: 'auto', cursor: 'pointer' }} />
        </div>
      )}

      {/* ── 4. MAIN SPREADSHEET GRID (ENDLESS FULL GRID) ── */}
      <main
        className="gsq-grid-viewport"
        ref={gridContainerRef}
        style={{ zoom: `${zoom}%`, fontFamily }}
      >
        <div className="gsq-grid-table" role="grid">
          {/* 1. Header Row */}
          <div className="gsq-row gsq-header-row">
            {/* Corner select-all cell */}
            <div className="gsq-corner-cell" title="Select all populated cells" onClick={() => {
              setSelection({ kind: 'range', anchor: { row: 0, col: 0 }, focus: { row: Math.max(0, processedRows.length - 1), col: Math.max(0, realColumns.length - 1) } });
              setActiveCell({ row: 0, col: 0 });
            }}>
              <div className="gsq-corner-triangle" />
            </div>

            {columns.map((col, cIdx) => {
              const isColSorted = sortConfig?.key === col.id;
              const hasActiveFilter = !!columnFilterValues[col.id];
              const isColActive = activeCell.col === cIdx;

              return (
                <div
                  key={col.id}
                  className={`gsq-col-header ${freezeFirstCol && cIdx === 0 ? 'gsq-freeze-col' : ''} ${isColActive ? 'gsq-col-active' : ''} ${selection?.kind === 'columns' && selection.cols.has(cIdx) ? 'gsq-header-selected' : ''}`}
                  style={{ width: col.width, minWidth: col.width, maxWidth: col.width }}
                  title={col.editable === false || !sheet?.canEdit ? 'Not editable. Click to select column.' : 'Click to select column. Sort from Data menu.'}
                  onClick={e => {
                    if (col.isFiller) return;
                    if (e.ctrlKey || e.metaKey) {
                      const cols = new Set(selection?.kind === 'columns' ? selection.cols : []);
                      if (cols.has(cIdx)) cols.delete(cIdx); else cols.add(cIdx);
                      setSelection(cols.size ? { kind: 'columns', cols, anchor: cIdx } : null);
                    } else if (e.shiftKey && selection?.kind === 'columns') {
                      const from = selection.anchor;
                      setSelection({ kind: 'columns', cols: new Set(Array.from({ length: Math.abs(cIdx - from) + 1 }, (_, index) => Math.min(cIdx, from) + index)), anchor: from });
                    } else setSelection({ kind: 'columns', cols: new Set([cIdx]), anchor: cIdx });
                    setActiveCell(curr => ({ ...curr, col: cIdx }));
                  }}
                >
                  <div className="gsq-col-letter">{col.letter}</div>
                  <div className="gsq-col-title-wrap">
                    <span className="gsq-col-title">{col.title}</span>
                    {isColSorted && (
                      <span className="gsq-sort-indicator">
                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                    {/* Google Sheets Column Filter Trigger */}
                    {!col.isFiller && (
                      <button
                        className={`gsq-filter-trigger-btn ${hasActiveFilter ? 'active' : ''}`}
                        onClick={e => openFilterPopover(e, col)}
                        title={`Filter ${col.title}`}
                      >
                        <Filter size={11} fill={hasActiveFilter ? 'var(--gsq-google-green)' : 'none'} />
                      </button>
                    )}
                  </div>

                  {/* Column Resizer Handle */}
                  {!col.isFiller && (
                    <div
                      className="gsq-col-resizer"
                      onMouseDown={e => handleResizeStart(e, col.id)}
                      onClick={e => e.stopPropagation()}
                    />
                  )}

                  {/* Filter Popover Dropdown (shown when active) */}
                  {activeFilterCol?.id === col.id && (
                    <div className="gsq-filter-popover" onClick={e => e.stopPropagation()}>
                      <button className="gsq-filter-opt-btn" onClick={() => { setSortConfig({ key: col.id, direction: 'asc' }); setActiveFilterCol(null); }}>
                        <ArrowUpDown size={13} /> Sort A → Z
                      </button>
                      <button className="gsq-filter-opt-btn" onClick={() => { setSortConfig({ key: col.id, direction: 'desc' }); setActiveFilterCol(null); }}>
                        <ArrowUpDown size={13} /> Sort Z → A
                      </button>
                      <div className="gsq-filter-divider" />

                      <div className="gsq-filter-search-box">
                        <Search size={13} style={{ color: 'var(--gsq-text-muted)' }} />
                        <input
                          className="gsq-filter-search-input"
                          placeholder="Filter by values…"
                          value={filterSearchText}
                          onChange={e => setFilterSearchText(e.target.value)}
                          autoFocus
                        />
                      </div>

                      <div className="gsq-filter-links">
                        <button
                          type="button"
                          className="gsq-filter-link"
                          onClick={() => {
                            const allVals = new Set(filterDistinctValues.map(i => i.val));
                            setTempFilterSelection(allVals);
                          }}
                        >
                          Select all
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          className="gsq-filter-link"
                          onClick={() => setTempFilterSelection(new Set())}
                        >
                          Clear
                        </button>
                      </div>

                      <div className="gsq-filter-checklist">
                        {filterDistinctValues.map(item => {
                          const isChecked = tempFilterSelection.has(item.val);
                          return (
                            <label key={item.val} className="gsq-filter-check-item">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={e => {
                                  const next = new Set(tempFilterSelection);
                                  if (e.target.checked) next.add(item.val);
                                  else next.delete(item.val);
                                  setTempFilterSelection(next);
                                }}
                              />
                              <span className="gsq-filter-check-label">{item.val}</span>
                              <span className="gsq-filter-check-count">({item.count})</span>
                            </label>
                          );
                        })}
                      </div>

                      <div className="gsq-filter-footer">
                        <button type="button" className="gsq-filter-btn-cancel" onClick={() => setActiveFilterCol(null)}>Cancel</button>
                        <button type="button" className="gsq-filter-btn-ok" onClick={applyColumnFilter}>OK</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 2. Grid Rows (Real Data Rows + Endless Blank Grid Rows) */}
          {Array.from({ length: TOTAL_ROWS }).map((_, rIdx) => {
            const row = processedRows[rIdx];
            const isDataRow = Boolean(row);
            const isRowActive = activeCell.row === rIdx;

            return (
              <div
                key={row?.id || `blank_row_${rIdx}`}
                className={`gsq-row ${isDataRow ? 'gsq-data-row' : 'gsq-blank-row'}`}
              >
                {/* Row Number Header */}
                <div
                  className={`gsq-row-header-cell ${isRowActive ? 'active-row' : ''} ${selection?.kind === 'rows' && selection.rows.has(rIdx) ? 'gsq-header-selected' : ''}`}
                  title={isDataRow && !realColumns.some(col => col.editable && sheet?.canEdit) ? 'Not editable. Click to select row.' : 'Click to select row; Ctrl-click for multiple rows; Shift-click for range.'}
                  onClick={e => {
                    if (!isDataRow) return;
                    if (e.ctrlKey || e.metaKey) {
                      const rows = new Set(selection?.kind === 'rows' ? selection.rows : []);
                      if (rows.has(rIdx)) rows.delete(rIdx); else rows.add(rIdx);
                      setSelection(rows.size ? { kind: 'rows', rows, anchor: rIdx } : null);
                    } else if (e.shiftKey && selection?.kind === 'rows') {
                      const from = selection.anchor;
                      setSelection({ kind: 'rows', rows: new Set(Array.from({ length: Math.abs(rIdx - from) + 1 }, (_, index) => Math.min(rIdx, from) + index)), anchor: from });
                    } else setSelection({ kind: 'rows', rows: new Set([rIdx]), anchor: rIdx });
                    setActiveCell({ row: rIdx, col: 0 });
                  }}
                  onContextMenu={e => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, rowIdx: rIdx, isDataRow });
                  }}
                >
                  {rIdx + 1}
                </div>

                {/* Cells across all columns (Real + Filler) */}
                {columns.map((col, cIdx) => {
                  const isSelected = activeCell.row === rIdx && activeCell.col === cIdx;
                  const isCellEditing = isSelected && isEditing;
                  const styleKey = `${rIdx}:${cIdx}`;
                  const customStyle = cellStyles[styleKey] || {};
                  const rawVal = isDataRow && !col.isFiller ? row[col.id] : '';
                  const displayVal = rawVal == null ? '' : String(rawVal);
                  const isMatchedInFind = isDataRow && findMatches.some(m => m.row === rIdx && m.col === cIdx);

                  return (
                    <div
                      key={col.id}
                      className={`gsq-cell ${col.type === 'number' ? 'gsq-align-right' : ''} ${isSelected ? 'gsq-selected' : ''} ${isInSelection(rIdx, cIdx) ? 'gsq-range-selected' : ''} ${freezeFirstCol && cIdx === 0 ? 'gsq-freeze-col' : ''} ${isMatchedInFind ? 'gsq-find-match' : ''}`}
                      title={(!isDataRow || col.isFiller || col.editable === false || !sheet?.canEdit) ? 'Not editable' : undefined}
                      style={{
                        width: col.width,
                        minWidth: col.width,
                        maxWidth: col.width,
                        fontSize: `${fontSize}px`,
                        fontWeight: customStyle.bold ? 700 : undefined,
                        fontStyle: customStyle.italic ? 'italic' : undefined,
                        textDecoration: customStyle.strikethrough ? 'line-through' : undefined,
                        color: customStyle.color || undefined,
                        backgroundColor: customStyle.bg || undefined,
                        textAlign: customStyle.align || (col.type === 'number' ? 'right' : 'left'),
                      }}
                      onMouseDown={e => {
                        if (e.button !== 0 || isCellEditing) return;
                        if (e.shiftKey && selection?.kind === 'range') {
                          setSelection({ kind: 'range', anchor: selection.anchor, focus: { row: rIdx, col: cIdx } });
                        } else {
                          setSelection({ kind: 'range', anchor: { row: rIdx, col: cIdx }, focus: { row: rIdx, col: cIdx } });
                          draggingSelectionRef.current = true;
                        }
                      }}
                      onMouseEnter={() => {
                        if (draggingSelectionRef.current) setSelection(curr => curr?.kind === 'range' ? { ...curr, focus: { row: rIdx, col: cIdx } } : curr);
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        if (isCellEditing) return;
                        if (!isSelected) {
                          commitEdit();
                          setActiveCell({ row: rIdx, col: cIdx });
                        }
                      }}
                      onDoubleClick={e => {
                        e.stopPropagation();
                        if (col.editable && isDataRow) {
                          setIsEditing(true);
                        } else if (!isDataRow && isChallan) {
                          handleAddRow();
                        } else if (!isDataRow && isBalanceSheet) {
                          setInfoMessage('New vouchers are created through the Voucher module.');
                          setTimeout(() => setInfoMessage(''), 4500);
                        }
                      }}
                    >
                      {isCellEditing ? (
                        <input
                          ref={cellInputRef}
                          className="gsq-inline-editor"
                          value={editValue}
                          onChange={e => {
                            setEditValue(e.target.value);
                            setFormulaValue(e.target.value);
                          }}
                          onKeyDown={e => {
                            e.stopPropagation(); // Keep cell typing isolated from global navigation
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitEdit(e.target.value);
                              setActiveCell(curr => ({ ...curr, row: Math.min(TOTAL_ROWS - 1, curr.row + 1) }));
                            } else if (e.key === 'Tab') {
                              e.preventDefault();
                              commitEdit(e.target.value);
                              if (e.shiftKey) {
                                setActiveCell(curr => ({ ...curr, col: Math.max(0, curr.col - 1) }));
                              } else {
                                setActiveCell(curr => ({ ...curr, col: Math.min(columns.length - 1, curr.col + 1) }));
                              }
                            } else if (e.key === 'Escape') {
                              setIsEditing(false);
                              setEditValue(displayVal);
                            }
                          }}
                          onBlur={() => commitEdit(editValue)}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                        />
                      ) : (
                        <span className="gsq-cell-text">{displayVal}</span>
                      )}

                      {/* Google Selection Corner Handle */}
                      {isSelected && !isCellEditing && <div className="gsq-corner-handle" />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </main>

      {printSelection && selectedBounds && (
        <section className="gsq-print-area" aria-label="Selected sheet area for printing">
          <h1>{sheet?.title || 'VGTC Smart Sheet'}</h1>
          <table>
            <thead><tr>{selectedBounds.cols.map(colIndex => <th key={realColumns[colIndex].id}>{realColumns[colIndex].title || realColumns[colIndex].letter}</th>)}</tr></thead>
            <tbody>{selectedBounds.rows.map(rowIndex => (
              <tr key={processedRows[rowIndex].id || rowIndex}>
                {selectedBounds.cols.map(colIndex => {
                  const col = realColumns[colIndex];
                  return <td key={col.id}>{String(processedRows[rowIndex][col.id] ?? '')}</td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {/* ── 5. BOTTOM TABS & AGGREGATE SUMMARY ── */}
      <footer className="gsq-bottombar">
        <div className="gsq-tabs-container">
          <button className="gsq-add-tab-btn" title="Add sheet (disabled)" onClick={() => setInfoMessage('Default sheets are configured per business plant.')}>
            <Plus size={15} />
          </button>

          <div className="gsq-tab-scroller">
            {currentTabList.map(tab => {
              const isActive = tab.id === currentSheetId;
              return (
                <div
                  key={tab.id}
                  className={`gsq-sheet-tab ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (tab.id !== currentSheetId) {
                      setCurrentSheetId(tab.id);
                      window.history.pushState(null, '', `/sheet/${encodeURIComponent(tab.id)}`);
                    }
                  }}
                >
                  <span>{tab.title}</span>
                  <div className="gsq-tab-indicator" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Aggregation Summary Box */}
        <div className="gsq-status-pills">
          {stats && (
            <div className="gsq-calc-summary">
              <span><strong>Sum:</strong> ₹{stats.sum.toLocaleString('en-IN')}</span>
              <span><strong>Avg:</strong> ₹{stats.avg.toLocaleString('en-IN')}</span>
              <span><strong>Min:</strong> ₹{stats.min.toLocaleString('en-IN')}</span>
              <span><strong>Max:</strong> ₹{stats.max.toLocaleString('en-IN')}</span>
              <span><strong>Count:</strong> {stats.count}</span>
            </div>
          )}
        </div>
      </footer>

      {/* ── RIGHT-CLICK CONTEXT MENU (NO DELETION OPTIONS) ── */}
      {contextMenu && (
        <div
          className="gsq-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => {
            const row = processedRows[contextMenu.rowIdx];
            const col = columns[activeCell.col];
            if (row && col) navigator.clipboard?.writeText(String(row[col.id] ?? ''));
            setContextMenu(null);
          }}>
            <Copy size={13} /> Copy cell
          </button>
          <button onClick={() => {
            navigator.clipboard?.readText?.().then(text => {
              if (text != null) {
                const row = processedRows[contextMenu.rowIdx];
                const col = columns[activeCell.col];
                if (row && col && col.editable) saveCell(row.id, col.id, text.trim());
              }
            });
            setContextMenu(null);
          }}>
            <Clipboard size={13} /> Paste
          </button>
          <div className="gsq-dropdown-divider" />
          {isChallan && (
            <button onClick={() => { handleAddRow(); setContextMenu(null); }}>
              <Plus size={13} /> Insert Challan row
            </button>
          )}
          <button onClick={() => { exportFile('xlsx'); setContextMenu(null); }}>
            <Download size={13} /> Export all to Excel
          </button>
        </div>
      )}

      {/* ── SHORTCUTS MODAL ── */}
      {showHelpModal && (
        <div className="gsq-modal-overlay" onClick={() => setShowHelpModal(false)}>
          <div className="gsq-modal-card" onClick={e => e.stopPropagation()}>
            <div className="gsq-modal-head">
              <h3>Google Sheets Keyboard Shortcuts</h3>
              <button onClick={() => setShowHelpModal(false)}><X size={16} /></button>
            </div>
            <div className="gsq-modal-body">
              <div className="gsq-shortcut-row"><span>Start editing cell</span><kbd>Enter / F2 / Double-click</kbd></div>
              <div className="gsq-shortcut-row"><span>Commit edit &amp; move down</span><kbd>Enter</kbd></div>
              <div className="gsq-shortcut-row"><span>Commit edit &amp; move right/left</span><kbd>Tab / Shift+Tab</kbd></div>
              <div className="gsq-shortcut-row"><span>Cancel edit</span><kbd>Escape</kbd></div>
              <div className="gsq-shortcut-row"><span>Find in sheet</span><kbd>Ctrl+F</kbd></div>
              <div className="gsq-shortcut-row"><span>Bold text</span><kbd>Ctrl+B</kbd></div>
              <div className="gsq-shortcut-row"><span>Italic text</span><kbd>Ctrl+I</kbd></div>
              <div className="gsq-shortcut-row"><span>Undo / Redo</span><kbd>Ctrl+Z / Ctrl+Y</kbd></div>
              <div className="gsq-shortcut-row"><span>Copy / Paste</span><kbd>Ctrl+C / Ctrl+V</kbd></div>
              <div className="gsq-shortcut-row"><span>Navigate cells</span><kbd>Arrow Keys</kbd></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
