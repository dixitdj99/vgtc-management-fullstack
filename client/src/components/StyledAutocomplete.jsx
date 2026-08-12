import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

/**
 * StyledAutocomplete — Theme-aware dropdown autocomplete component.
 * Uses CSS custom properties (--bg-card, --border, --text, --primary, etc.)
 * so it automatically adapts to light, dark, sepia and any future themes.
 */
export default function StyledAutocomplete({
    value = '',
    onChange,
    onSelectOption,
    options = [], // Array of strings OR objects { label, value, sublabel }
    placeholder = '',
    uppercase = true,
    icon = null,
    required = false,
    disabled = false,
    style = {},
    inputStyle = {},
    className = '',
    id = '',
    name = '',
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
    const inputRef = useRef(null);
    const containerRef = useRef(null);

    // Standardize options array
    const normalizedOptions = options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
            return {
                label: String(opt.label || opt.value || ''),
                value: String(opt.value || opt.label || ''),
                sublabel: opt.sublabel || '',
                raw: opt
            };
        }
        const str = String(opt || '');
        return { label: str, value: str, sublabel: '', raw: opt };
    });

    // Filter options matching user text
    const filteredOptions = normalizedOptions.filter(opt =>
        opt.label.toLowerCase().includes(String(value || '').toLowerCase())
    );

    // Calculate fixed dropdown portal coordinates
    const updateCoords = () => {
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + 4,
                left: rect.left,
                width: Math.max(rect.width, 160)
            });
        }
    };

    useEffect(() => {
        if (isOpen) {
            updateCoords();
            const handleScrollOrResize = () => updateCoords();
            window.addEventListener('scroll', handleScrollOrResize, true);
            window.addEventListener('resize', handleScrollOrResize);
            return () => {
                window.removeEventListener('scroll', handleScrollOrResize, true);
                window.removeEventListener('resize', handleScrollOrResize);
            };
        }
    }, [isOpen]);

    // Close dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (
                containerRef.current && !containerRef.current.contains(e.target) &&
                !e.target.closest('.styled-autocomplete-portal')
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e) => {
        let val = e.target.value;
        if (uppercase) val = val.toUpperCase();
        onChange(val);
        setIsOpen(true);
        setHighlightIndex(0);
    };

    const handleSelect = (option) => {
        const val = uppercase ? option.value.toUpperCase() : option.value;
        onChange(val);
        if (onSelectOption) onSelectOption(option);
        setIsOpen(false);
    };

    const handleKeyDown = (e) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                setIsOpen(true);
                updateCoords();
                return;
            }
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        } else if (e.key === 'Enter') {
            if (isOpen && highlightIndex >= 0 && filteredOptions[highlightIndex]) {
                e.preventDefault();
                handleSelect(filteredOptions[highlightIndex]);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    // Read the current theme's CSS variables for portal dropdown
    // We read from the document element since the portal is appended to body
    const getVar = (name) => {
        try {
            return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        } catch {
            return '';
        }
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }} className={className}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                {icon && (
                    <span style={{ position: 'absolute', left: '10px', display: 'flex', alignItems: 'center', pointerEvents: 'none', zIndex: 1, color: 'var(--text-muted)' }}>
                        {icon}
                    </span>
                )}
                <input
                    ref={inputRef}
                    id={id}
                    name={name}
                    type="text"
                    className="fi"
                    placeholder={placeholder}
                    value={value}
                    onChange={handleInputChange}
                    onFocus={() => { setIsOpen(true); updateCoords(); }}
                    onKeyDown={handleKeyDown}
                    required={required}
                    disabled={disabled}
                    autoComplete="off"
                    style={{
                        paddingLeft: icon ? '32px' : '10px',
                        paddingRight: '28px',
                        textTransform: uppercase ? 'uppercase' : 'none',
                        letterSpacing: uppercase ? '0.04em' : 'normal',
                        fontWeight: uppercase ? 700 : 500,
                        ...inputStyle
                    }}
                />
                <ChevronDown
                    size={14}
                    onClick={() => {
                        if (!disabled) {
                            setIsOpen(prev => !prev);
                            updateCoords();
                        }
                    }}
                    style={{
                        position: 'absolute',
                        right: '10px',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        transform: isOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s ease'
                    }}
                />
            </div>

            {/* Theme-aware dropdown portal */}
            {isOpen && !disabled && ReactDOM.createPortal(
                <div
                    className="styled-autocomplete-portal"
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        width: coords.width,
                        zIndex: 999999,
                        background: getVar('--bg-card') || '#ffffff',
                        border: `1px solid ${getVar('--border') || '#e2e8f0'}`,
                        borderRadius: '10px',
                        boxShadow: getVar('--shadow-md') || '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 4px 6px -2px rgba(0, 0, 0, 0.08)',
                        maxHeight: '240px',
                        overflowY: 'auto',
                        padding: '4px 0',
                        boxSizing: 'border-box',
                        // Scrollbar styling via inline won't work, but container still looks clean
                    }}
                >
                    {filteredOptions.length === 0 ? (
                        <div style={{ padding: '10px 14px', fontSize: '12.5px', color: getVar('--text-muted') || '#94a3b8', textAlign: 'center', fontWeight: 500 }}>
                            No matching items
                        </div>
                    ) : (
                        filteredOptions.map((opt, idx) => {
                            const isSelected = String(value || '').toUpperCase() === opt.value.toUpperCase();
                            const isHighlighted = idx === highlightIndex;
                            const isLast = idx === filteredOptions.length - 1;
                            const primary = getVar('--primary') || '#4f46e5';
                            const bgCard = getVar('--bg-card') || '#ffffff';
                            const bgHover = getVar('--bg-hover') || '#f1f5f9';
                            const bgActive = getVar('--bg-active') || '#eef2ff';
                            const borderRow = getVar('--border-row') || '#f1f5f9';
                            const textColor = getVar('--text') || '#0f172a';
                            return (
                                <div
                                    key={opt.value + '_' + idx}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleSelect(opt);
                                    }}
                                    onMouseEnter={() => setHighlightIndex(idx)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '9px 14px',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        color: isSelected ? primary : textColor,
                                        cursor: 'pointer',
                                        background: isHighlighted ? bgHover : isSelected ? bgActive : bgCard,
                                        borderBottom: isLast ? 'none' : `1px solid ${borderRow}`,
                                        transition: 'background 0.1s ease',
                                        letterSpacing: uppercase ? '0.04em' : 'normal'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>{opt.label}</span>
                                        {opt.sublabel && (
                                            <span style={{ fontSize: '11px', color: getVar('--text-muted') || '#64748b', fontWeight: 600 }}>
                                                ({opt.sublabel})
                                            </span>
                                        )}
                                    </div>
                                    {isSelected && <Check size={14} color={primary} />}
                                </div>
                            );
                        })
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
