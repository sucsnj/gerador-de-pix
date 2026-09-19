/**
 * src/components/qr.js
 *
 * Renderização do QR Code usando a biblioteca `qrcode` e utilitários
 * para exportação em PNG de alta resolução e re-renderização animada.
 */

import QRCode from 'qrcode';

export const QR_SIZE = 280;
const ERROR_CORRECTION = 'M';

/**
 * Renderiza o payload no canvas.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} payload
 * @param {number} [size]
 * @returns {Promise<void>}
 */
export function renderQr(canvas, payload, size = QR_SIZE) {
  return QRCode.toCanvas(canvas, payload, {
    width: size,
    margin: 2,
    errorCorrectionLevel: ERROR_CORRECTION,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/**
 * Gera um Data URL PNG de alta resolução.
 *
 * @param {string} payload
 * @param {number} [scale] Módulos por pixel (multiplicado pela largura).
 * @returns {Promise<string>}
 */
export function generateHighResPng(payload, scale = 12) {
  return QRCode.toDataURL(payload, {
    width: QR_SIZE,
    scale: scale,
    margin: 2,
    errorCorrectionLevel: ERROR_CORRECTION,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });
}

/**
 * Dispara a animação de entrada do QR Code ao ser atualizado.
 *
 * @param {HTMLElement} target Elemento a animar.
 */
export function pulseQr(target) {
  if (!target) return;
  target.classList.remove('qr-anim');
  // Força reflow para reiniciar a animação CSS.
  void target.getBoundingClientRect();
  target.classList.add('qr-anim');
}