import html2canvas from 'html2canvas';
import ax from '../api';

const PX_PER_MM = 96 / 25.4;

function printableHtml(html) {
  const base = `<base href="${window.location.origin}/">`;
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<head([^>]*)>/i, `<head$1>${base}`);
}

async function waitForAssets(doc) {
  if (doc.fonts?.ready) await doc.fonts.ready.catch(() => {});
  const images = Array.from(doc.images || []);
  await Promise.all(images.map(image => {
    if (image.complete) return image.decode?.().catch(() => {}) || Promise.resolve();
    return new Promise(resolve => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 2500);
    });
  }));
}

/**
 * Rasterises the same HTML sent to the print window and sends that PNG through
 * the authenticated WhatsApp endpoint. A sandboxed, script-free iframe keeps
 * print()/window.close() code from running during capture.
 */
export async function sendPrintedVoucherToWhatsApp({
  html,
  voucher,
  captureSelector = 'body',
  widthMm = 79,
  viewportWidth,
}) {
  if (!voucher) throw new Error('Voucher data is required for WhatsApp.');

  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = [
    'position:fixed',
    'left:-12000px',
    'top:0',
    'border:0',
    `width:${viewportWidth || Math.ceil(widthMm * PX_PER_MM)}px`,
    'height:1200px',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(frame);

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Receipt image preparation timed out.')), 8000);
      frame.addEventListener('load', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      frame.srcdoc = printableHtml(html);
    });

    const doc = frame.contentDocument;
    if (!doc) throw new Error('Receipt image document could not be opened.');
    await waitForAssets(doc);

    const target = doc.querySelector(captureSelector);
    if (!target) throw new Error('Printed receipt layout was not found for WhatsApp capture.');
    const targetHeight = Math.max(target.scrollHeight, Math.ceil(target.getBoundingClientRect().height));
    frame.style.height = `${Math.max(200, targetHeight + 4)}px`;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const canvas = await html2canvas(target, {
      backgroundColor: '#ffffff',
      scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
      useCORS: true,
      allowTaint: false,
      logging: false,
      imageTimeout: 4000,
      ignoreElements: element => element.classList?.contains('no-print'),
      windowWidth: frame.clientWidth,
      windowHeight: Math.max(frame.clientHeight, targetHeight),
    });

    const imageDataUrl = canvas.toDataURL('image/png');
    const { data } = await ax.post('/whatsapp/send-voucher-receipt', { voucher, imageDataUrl });
    return data;
  } catch (error) {
    const apiMessage = error?.response?.data?.error || error?.response?.data?.message;
    throw new Error(apiMessage || error.message || 'WhatsApp receipt image failed to send.');
  } finally {
    frame.remove();
  }
}

export function showWhatsAppReceiptToast(showToast, documentName, result) {
  if (!showToast) return;
  const status = result?.status;
  if (status === 'sent') {
    showToast(`WhatsApp ${documentName} image sent successfully.`, 'success');
  } else if (status === 'mobile_not_found') {
    showToast(`WhatsApp ${documentName} not sent: mobile number not found.`, 'warning', 5000);
  } else if (status === 'partial') {
    const detail = result?.error ? ` Error: ${result.error}` : '';
    showToast(`${result.message || `WhatsApp ${documentName} was only partially delivered.`}${detail}`, 'warning', 6500);
  } else if (status === 'disabled') {
    showToast(result?.message || `WhatsApp ${documentName} not sent because WhatsApp is disabled.`, 'info', 5000);
  } else {
    showToast(`WhatsApp ${documentName} failed: ${result?.error || result?.message || 'Unknown error'}`, 'error', 6500);
  }
}
