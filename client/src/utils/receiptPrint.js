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

/**
 * The company mark, printed faintly behind everything.
 *
 * Absolute, not relative: a print window is opened blank and written into, so
 * its base URL is `about:blank` and `/vgtc-watermark.png` resolves to nothing.
 * The window is same-origin with the app, so the file is served and cached
 * normally — which is why this is a URL and not a quarter-megabyte of base64
 * pasted into every slip.
 *
 * `position: fixed` is what puts it on every page of a long report rather than
 * only the first. `print-color-adjust: exact` is what stops the browser
 * helpfully dropping it as a background when the job goes to paper.
 *
 * Opacity is deliberately low. This sits under columns of figures on documents
 * people are paid to read correctly, and a watermark that competes with a digit
 * is worse than no watermark.
 *
 * Reports and exports only. Slips carry the logo at their head instead: a
 * watermark behind the figures was doing the same job twice on the one document
 * where space and legibility are tightest, and on 79mm thermal paper the mark
 * competed with the numbers rather than sitting behind them.
 *
 * @param {number} [scale]   width as a fraction of the page, 0-1
 * @param {number} [opacity] how strongly it prints
 */
export const watermarkCss = (scale = 0.72, opacity = 0.09) => `
  body::after {
    content: '';
    position: fixed;
    top: 50%;
    left: 50%;
    width: ${Math.round(scale * 100)}%;
    aspect-ratio: 1185 / 389;
    transform: translate(-50%, -50%) rotate(-30deg);
    background-image: url('${typeof window !== 'undefined' ? window.location.origin : ''}/vgtc-watermark.png');
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    opacity: ${opacity};
    pointer-events: none;
    /* Over the document, not under it.
       Painted behind the content it was invisible wherever anything opaque sat
       on top — and a voucher is a stack of bordered white boxes, so the mark
       survived only in the gaps between rows. That was reported as "not
       visible on the receipt" and it was: three quarters of it was covered.
       An overlay lands evenly across the whole slip. It has to stay faint for
       exactly this reason, and pointer-events none keeps the Print button
       underneath it clickable. */
    z-index: 2147483647;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
`;

/** The mark for an A4 report or export, under columns of figures. */
export const reportWatermarkCss = () => watermarkCss(0.6, 0.09);

/**
 * The logo across the head of a slip.
 *
 * Same absolute URL as the watermark, for the same reason: the print window is
 * blank and written into, so a relative path resolves to nothing. The slip
 * measures its own height once images have loaded, so this does not need to be
 * inlined to be counted.
 */
export const receiptLogoHtml = (isDark = false) =>
  `<img class="rcpt-logo" src="${typeof window !== 'undefined' ? window.location.origin : ''}${isDark ? '/vgtc-logo-dark.png' : '/vgtc-logo.png'}" alt="VGTC">`;

/**
 * Sized in millimetres, not pixels — this is paper.
 * Slightly enlarged to 7.5mm for higher clarity and prominence on receipts.
 */
export const receiptLogoCss = `
  .rcpt-logo {
    display: block;
    height: 7.5mm;
    width: auto;
    max-width: 55%;
    margin: 0 auto 1.5mm;
    /* A logo is a picture, and browsers drop pictures they think are
       decorative backgrounds when printing. This one is content. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    filter: brightness(0);
  }
`;

const shellCss = ({ width, minHeight, padding, fontSize, lineHeight, fitContent }) => `
  ${receiptLogoCss}
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
    window.onafterprint = function () { window.close(); };
    setTimeout(function () {
      try { window.opener = null; } catch(e) {}
      window.focus();
      window.print();
    }, 200);
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
    archive = null,
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
${receiptLogoHtml()}
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
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const w = window.open(blobUrl, '_blank', `width=${winW},height=${winH},left=${left},top=${top}`);
    if (!w) {
        alert('Allow pop-ups for this site to print the receipt.');
        return null;
    }
    w.focus();
    setTimeout(() => { URL.revokeObjectURL(blobUrl); }, 15000);

    // File the identical HTML. After the window opens, so a slow or unreachable
    // Drive cannot delay the slip appearing.
    if (archive) fileCopy(html, archive);
    return w;
}

/**
 * Archive a document that builds its own page rather than going through
 * openReceiptWindow — the balance-sheet statements, the challan, the fleet
 * dashboard, and the list exports.
 *
 * @param {string} html the exact markup handed to the print window
 * @param {object} archive see archiveDoc()
 */
export function fileCopy(html, archive) {
    if (!archive) return;
    import('./archiveDoc')
        .then(({ archiveDoc }) => archiveDoc({ ...archive, html }))
        .catch(() => { /* the copy is best-effort; printing already succeeded */ });
}

/**
 * Opens an arbitrary HTML document for printing and files the same markup.
 *
 * The six places that called window.open + document.write directly each had
 * their own idea of window size and none of them archived anything. One funnel
 * means adding a document type cannot quietly skip the archive.
 *
 * @param {string} html complete document markup
 * @param {object} [o]
 * @param {number} [o.width] window width in px
 * @param {number} [o.height] window height in px
 * @param {object} [o.archive] see archiveDoc(); omit to print without filing
 */
export function printHtml(html, { width = 1000, height = 700, archive = null } = {}) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const w = window.open(blobUrl, '_blank', `width=${width},height=${height}`);
    if (!w) {
        alert('Allow pop-ups for this site to print.');
        return null;
    }
    w.focus();
    setTimeout(() => { URL.revokeObjectURL(blobUrl); }, 15000);
    if (archive) fileCopy(html, archive);
    return w;
}
