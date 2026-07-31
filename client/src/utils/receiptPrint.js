/**
 * receiptPrint.js — the shared 79mm counter-receipt shell.
 *
 * Loading receipts, vouchers and sell receipts all come off the same 79mm
 * thermal roll, and none of them has a knowable height: a voucher with eight
 * deduction lines is taller than one with two, and a loading receipt grows with
 * every material added to it. Roll paper has no page boundary — the printer is
 * only being told how far to feed, which is exactly what the height in `@page`
 * does. Get it wrong and the slip is either cut through the signature line or
 * followed by a hand-span of blank paper.
 *
 * So the height cannot be a constant in the stylesheet. The document measures
 * itself once everything that moves the layout has settled (webfonts, images),
 * rewrites its own `@page` rule, and only then opens the print dialog — which
 * therefore opens already showing the true length.
 *
 * MIN_HEIGHT_MM is a floor, not a target. A two-line receipt still feeds a full
 * slip so there is something to tear off.
 *
 * That floor used to be put on the body, which made it two things at once: the
 * paper feed AND the height the content was laid out in. A short slip was then
 * stretched to the floor and its `margin-top: auto` signature block was pushed
 * to the bottom of it, leaving a hand-span of white down the middle of the
 * page. `fitContent` separates them — the content box is left at its natural
 * height (so the signature follows the last row) and the floor applies only to
 * the page. Callers that want a true tear-off tail leave it off.
 */

export const RECEIPT_WIDTH_MM = 79;
export const RECEIPT_MIN_HEIGHT_MM = 150;

/** The `@page` rule lives alone in this element so the script can replace it wholesale. */
const PAGE_STYLE_ID = 'receipt-page-size';

const shellCss = ({ width, minHeight, padding, fontSize, lineHeight, fitContent }) => `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: #fff; }
  body {
    /**
     * Fills the page box rather than pinning ${width}mm.
     *
     * A printer that cannot offer a ${width}mm page makes Chrome drop the @page
     * size and fall back to the printer's own paper as the page box. A body
     * hard-set to ${width}mm then sits in the corner of a much larger sheet —
     * the receipt comes out tiny and the operator has to raise Scale by hand
     * every time. Filling the box prints identically on a true ${width}mm page
     * and adapts by itself when it is something else.
     */
    width: 100%;
    ${fitContent ? '' : `min-height: ${minHeight}mm;`}
    padding: ${padding};
    margin: 0;
    display: flex;
    flex-direction: column;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    font-size: ${fontSize};
    line-height: ${lineHeight};
    /* Thermal heads lay down thin strokes unevenly and the paper is read at a
       loading gate, not a desk. Everything on a slip is bold by default; the
       templates only go heavier, never lighter. */
    font-weight: 700;
    word-break: break-word;
    overflow-wrap: break-word;
  }
  /* On screen the slip is held at the real paper width — it keeps the preview
     honest, and it is the width the height measurement is taken against. */
  @media screen {
    body { width: ${width}mm; margin: 0 auto; }
  }
  /* The template's outer wrapper fills the slip, so a \`margin-top: auto\`
     signature block sits at the bottom of a short receipt and is simply pushed
     further down by a long one. */
  body > .container { flex: 1 0 auto; display: flex; flex-direction: column; }
  /* Floated out of flow deliberately: the height measurement runs on screen,
     where this button is still displayed. In normal flow it added its own
     height to the slip and every receipt asked for a page a centimetre or so
     longer than the receipt actually was. */
  .no-print {
    position: fixed;
    right: 8px;
    bottom: 8px;
    padding: 8px 18px;
    background: #10b981;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-weight: 800;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  @media print { .no-print { display: none; } }
`;

/**
 * Runs inside the receipt window. Kept dependency-free and inline because the
 * popup is written with document.write and loads nothing of its own.
 */
const autoHeightScript = ({ width, minHeight }) => `
(function () {
  var PX_PER_MM = 96 / 25.4;            // the print box is laid out at 96dpi
  var sheet = document.getElementById('${PAGE_STYLE_ID}');
  var started = false;

  function heightMm() {
    // Body only, deliberately. The root element's scroll height is floored at
    // the viewport, so measuring it reported the height of the popup window
    // rather than of the receipt: every slip asked for a page as tall as the
    // window, and the printer then shrank the whole thing to fit that page.
    // getBoundingClientRect is sub-pixel, which scrollHeight is not.
    var px = Math.max(
      document.body.getBoundingClientRect().height,
      document.body.scrollHeight
    );
    // Always round UP, with a hair of slack on top.
    //
    // This used to round down by up to half a millimetre to avoid asking for a
    // pointless extra millimetre. But the page it produces is the page the
    // content has to fit in: shave a fraction off and the last sliver of the
    // slip — which is the signature block, sitting at the very bottom — is
    // pushed onto a second sheet. A blank millimetre is cheap; a second label
    // carrying nothing but the signature is not.
    return Math.max(${minHeight}, Math.ceil(px / PX_PER_MM + 0.4));
  }

  function fit() {
    sheet.textContent = '@page { size: ${width}mm ' + heightMm() + 'mm; margin: 0; }';
  }

  // The reprint button re-measures too — the window stays open after a cancel,
  // and by then a slow image may have changed the length.
  window.__printReceipt = function () { fit(); window.print(); };

  function open() {
    if (started) return;
    started = true;
    fit();
    // window.print() blocks until the dialog is dismissed, so the handler has to
    // be in place before the call — assigning it afterwards missed the event and
    // left the window open behind the app.
    window.onafterprint = function () { window.close(); };
    // One frame, so the rewritten rule is in the stylesheet before the dialog reads it.
    requestAnimationFrame(function () { window.print(); });
  }

  var settled = [new Promise(function (done) {
    if (document.readyState === 'complete') done();
    else window.addEventListener('load', done);
  })];
  if (document.fonts && document.fonts.ready) settled.push(document.fonts.ready);
  Promise.all(settled).then(open);
  // A font or image that never resolves must not leave the receipt unprinted.
  setTimeout(open, 2000);
})();
`;

/**
 * Opens a receipt in a print window.
 *
 * @param {object}  o
 * @param {string}  o.title       document title (shows in the print dialog)
 * @param {string}  o.body        the receipt markup; wrap it in `.container` to
 *                                get bottom-anchored signature blocks
 * @param {string} [o.styles]     template CSS. Do not set width/height on body —
 *                                that is what makes the height dynamic.
 * @param {string} [o.padding]    slip padding, default 3mm
 * @param {string} [o.fontSize]   base font size, default 9pt
 * @param {string} [o.lineHeight] base line height, default 1.35
 * @param {number} [o.minHeightMm] page floor; the page never feeds shorter
 * @param {boolean} [o.fitContent] lay the content out at its natural height
 *                                 instead of stretching it to the floor, so
 *                                 the page is exactly as long as the slip
 */
export function openReceiptWindow({
    title,
    body,
    styles = '',
    padding = '3mm',
    fontSize = '9pt',
    lineHeight = '1.35',
    minHeightMm = RECEIPT_MIN_HEIGHT_MM,
    width = RECEIPT_WIDTH_MM,
    fitContent = false,
}) {
    const opts = { width, minHeight: minHeightMm, padding, fontSize, lineHeight, fitContent };

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style id="${PAGE_STYLE_ID}">@page { size: ${width}mm ${minHeightMm}mm; margin: 0; }</style>
<style>${shellCss(opts)}</style>
<style>${styles}</style>
</head>
<body>
${body}
<button class="no-print" onclick="window.__printReceipt()">Print</button>
<script>${autoHeightScript(opts)}<\/script>
</body>
</html>`;

    /**
     * Sized for Chrome's print dialog, not for the slip.
     *
     * The window used to open at roughly slip width so the page behind the
     * dialog looked like the paper. But the dialog opens *inside* this window
     * and lays its settings pane out at a fixed width, so at 420px there was
     * nothing left for the preview — it collapsed to a sliver at the edge and
     * the operator could not see what was about to be printed.
     *
     * The slip is pinned to its own width on screen, so a wider window changes
     * nothing about the receipt or the height it is measured at.
     */
    const scr = window.screen || {};
    const availW = scr.availWidth || 1040;
    const availH = scr.availHeight || 880;
    const winW = Math.min(1040, availW - 60);
    const winH = Math.min(880, availH - 60);
    const left = Math.max(0, Math.round((availW - winW) / 2));
    const top = Math.max(0, Math.round((availH - winH) / 2));
    const w = window.open('', '_blank', `width=${winW},height=${winH},left=${left},top=${top}`);
    if (!w) {
        alert('Allow pop-ups for this site to print the receipt.');
        return null;
    }
    w.document.write(html);
    w.document.close();
    return w;
}
