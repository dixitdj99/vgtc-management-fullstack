/**
 * A wide table, with a scrollbar above it as well as below.
 *
 * The bar underneath a long list is a screen or more away: reaching the
 * right-hand columns meant scrolling to the bottom of the page, dragging
 * sideways, then scrolling back up to read the rows. This adds a second bar
 * directly above the header that does the same job, and keeps the two in step.
 *
 * A drop-in replacement for `<div className="tbl-wrap">`. Extra classes still
 * work — `tbl-cards`, which turns the table into cards on a phone, comes
 * through unchanged and simply never overflows, so no rail is drawn.
 */

import React, { useState, useEffect, useRef } from 'react';

/**
 * Keep two horizontal scrollbars in step.
 *
 * Setting one box's `scrollLeft` fires that box's scroll event, which would set
 * the first back, and so on for as long as the mouse is held — a locked tab,
 * not a slow one. The box being driven is marked and ignores the event it is
 * about to receive; the mark clears on the next frame, by which time the echo
 * has been and gone.
 *
 * @param {{current: any}} driving  the element currently being written to
 * @param {{current: any}} from     the box the user is actually scrolling
 * @param {{current: any}} to       the box to bring along
 */
export function mirrorScroll(driving, from, to) {
  const a = from.current, b = to.current;
  if (!a || !b || driving.current === a) return;
  driving.current = b;
  b.scrollLeft = a.scrollLeft;
  const clear = () => { if (driving.current === b) driving.current = null; };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(clear);
  else clear();
}

export default function TableScroll({ className = '', children, ...rest }) {
  const wrapRef = useRef(null);
  const railRef = useRef(null);
  const driving = useRef(null);
  const [tableW, setTableW] = useState(0);
  const [wrapW, setWrapW] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Measured, not assumed: column widths come from the data, so a longer
    // destination or a five-figure gross moves them.
    let queued = false;
    const measure = () => {
      queued = false;
      setTableW(wrap.scrollWidth);
      setWrapW(wrap.clientWidth);
    };
    // Rows arriving one render at a time would otherwise measure on every one.
    const schedule = () => {
      if (queued) return;
      queued = true;
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(measure);
      else measure();
    };
    measure();

    // The box changes size with the window; the table changes size with the
    // rows in it. Watching only the box missed every data change, which is
    // most of them.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    ro?.observe(wrap);
    const table = wrap.querySelector('table');
    if (table) ro?.observe(table);

    // Rows are added and removed without the box resizing, and a replaced
    // <table> would leave the observer watching a detached node.
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    mo?.observe(wrap, { childList: true, subtree: true });

    return () => { ro?.disconnect(); mo?.disconnect(); };
  }, []);

  // A rail over a table that already fits is a control that does nothing.
  const needsRail = tableW > wrapW + 1;

  return (
    <>
      {needsRail && (
        <div ref={railRef} className="tbl-scroll-top" aria-hidden="true"
          onScroll={() => mirrorScroll(driving, railRef, wrapRef)}>
          <div style={{ width: `${tableW}px`, height: '1px' }} />
        </div>
      )}
      <div {...rest} ref={wrapRef} className={`tbl-wrap ${className}`.trim()}
        onScroll={() => mirrorScroll(driving, wrapRef, railRef)}>
        {children}
      </div>
    </>
  );
}
