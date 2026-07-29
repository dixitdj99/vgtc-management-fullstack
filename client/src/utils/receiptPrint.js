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
 */

export const RECEIPT_WIDTH_MM = 79;
export const RECEIPT_MIN_HEIGHT_MM = 150;

/** The `@page` rule lives alone in this element so the script can replace it wholesale. */
const PAGE_STYLE_ID = 'receipt-page-size';

const shellCss = ({ width, minHeight, padding, fontSize, lineHeight }) => `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: #fff; }
  body {
    width: ${width}mm;
    min-height: ${minHeight}mm;
    padding: ${padding};
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    font-family: Arial, Helvetica, sans-serif;
    color: #000;
    background: #fff;
    font-size: ${fontSize};
    line-height: ${lineHeight};
    word-break: break-word;
    overflow-wrap: break-word;
  }
  /* The template's outer wrapper fills the slip, so a \`margin-top: auto\`
     signature block sits at the bottom of a short receipt and is simply pushed
     further down by a long one. */
  body > .container { flex: 1 0 auto; display: flex; flex-direction: column; }
  .no-print {
    display: block;
    width: 100%;
    margin-top: 4mm;
    padding: 8px;
    background: #10b981;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-weight: 800;
    font-size: 12px;
    cursor: pointer;
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
    var px = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight
    );
    // scrollHeight is a whole number of pixels, so a slip sitting exactly on the
    // ${minHeight}mm floor measures a shade over it and would round up to a
    // pointless extra millimetre. Half a millimetre of slack absorbs that; the
    // slip's own bottom padding covers the rounding either way.
    return Math.max(${minHeight}, Math.ceil(px / PX_PER_MM - 0.5));
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
    // One frame, so the rewritten rule is in the stylesheet before the dialog reads it.
    requestAnimationFrame(function () {
      window.print();
      window.onafterprint = function () { window.close(); };
    });
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
 * @param {number} [o.minHeightMm]
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
}) {
    const opts = { width, minHeight: minHeightMm, padding, fontSize, lineHeight };

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

    // Roughly the slip at screen scale, so the preview looks like the paper.
    const w = window.open('', '_blank', 'width=420,height=760');
    if (!w) {
        alert('Allow pop-ups for this site to print the receipt.');
        return null;
    }
    w.document.write(html);
    w.document.close();
    return w;
}
