import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Autoplant-style pagination component.
 *
 * Props:
 *   currentPage   : number (1-based)
 *   totalItems    : number
 *   pageSize      : number
 *   onPageChange  : (page: number) => void
 *   onPageSizeChange? : (size: number) => void  — pass to enable page-size selector
 */
export default function Pagination({ currentPage, totalItems, pageSize, onPageChange, onPageSizeChange }) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 0) return null;

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx   = Math.min(currentPage * pageSize, totalItems);

  /* build visible page numbers with at most 5 buttons */
  const getPageNumbers = () => {
    const pages = [];
    const max = 5;
    if (totalPages <= max) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end   = Math.min(totalPages, start + max - 1);
      if (end === totalPages) start = Math.max(1, end - max + 1);
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  };

  return (
    <div className="ap-pagination">
      {/* left — row count info */}
      <div className="ap-pagination-info">
        <strong>{startIdx} - {endIdx}</strong>
        &nbsp;of&nbsp;
        <strong>{totalItems}</strong>
      </div>

      {/* centre — page buttons */}
      <div className="ap-pagination-controls">
        <button
          className="ap-page-btn"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          title="Previous page"
        >
          <ChevronLeft size={14} />
        </button>

        {getPageNumbers().map(p => (
          <button
            key={p}
            className={`ap-page-btn${currentPage === p ? ' active' : ''}`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}

        <button
          className="ap-page-btn"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* right — page size */}
      {onPageSizeChange && (
        <div className="ap-page-size">
          <select
            value={pageSize}
            onChange={e => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
          >
            {PAGE_SIZE_OPTIONS.map(s => (
              <option key={s} value={s}>{s} / page</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
