import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function Pagination({ currentPage, totalItems, pageSize, onPageChange }) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, totalItems);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisible - 1);
      
      if (end === totalPages) {
        start = Math.max(1, end - maxVisible + 1);
      }
      
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  };

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      padding: '16px 20px',
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border)',
      borderBottomLeftRadius: '16px',
      borderBottomRightRadius: '16px'
    }}>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
        Showing <span style={{ color: 'var(--text)' }}>{startIdx}-{endIdx}</span> of <span style={{ color: 'var(--text)' }}>{totalItems}</span> entries
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button 
          className="btn-icon" 
          disabled={currentPage === 1}
          onClick={() => onPageChange(1)}
          style={{ width: '32px', height: '32px', opacity: currentPage === 1 ? 0.4 : 1 }}
        >
          <ChevronsLeft size={16} />
        </button>
        <button 
          className="btn-icon" 
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          style={{ width: '32px', height: '32px', opacity: currentPage === 1 ? 0.4 : 1 }}
        >
          <ChevronLeft size={16} />
        </button>

        <div style={{ display: 'flex', gap: '4px', margin: '0 4px' }}>
          {getPageNumbers().map(p => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: currentPage === p ? 'var(--accent)' : 'transparent',
                color: currentPage === p ? '#fff' : 'var(--text-sub)',
              }}
              onMouseEnter={e => {
                if (currentPage !== p) e.currentTarget.style.background = 'var(--bg-row-hover)';
              }}
              onMouseLeave={e => {
                if (currentPage !== p) e.currentTarget.style.background = 'transparent';
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <button 
          className="btn-icon" 
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          style={{ width: '32px', height: '32px', opacity: currentPage === totalPages ? 0.4 : 1 }}
        >
          <ChevronRight size={16} />
        </button>
        <button 
          className="btn-icon" 
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(totalPages)}
          style={{ width: '32px', height: '32px', opacity: currentPage === totalPages ? 0.4 : 1 }}
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}
