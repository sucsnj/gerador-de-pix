/**
 * src/components/actions.js
 *
 * Ações do painel: copiar "PIX Copia e Cola", baixar PNG de alta
 * resolução, imprimir a folha do PIX e notificações (toast).
 */

import { initIcons } from '../utils/icons.js';
import QRCode from 'qrcode';
import { generateHighResPng } from './qr.js';

const TOAST_MS = 2600;

/**
 * Exibe um toast temporário.
 *
 * @param {string} message
 * @param {('success'|'error')} [type]
 */
export function showToast(message, type = 'success') {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const toast = document.createElement('div');
  const icon = type === 'success' ? 'check' : 'circle-alert';

  toast.className =
    'flex items-center gap-2.5 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium ' +
    'text-white shadow-2xl ring-1 ring-white/10 toast-enter';
  toast.innerHTML = `<i data-lucide="${icon}" class="h-4 w-4 ${type === 'success' ? 'text-emerald-400' : 'text-rose-400'}"></i><span></span>`;
  toast.querySelector('span').textContent = message;
  root.appendChild(toast);

  initIcons(root);

  window.setTimeout(() => {
    toast.classList.add('toast-leave');
    toast.addEventListener(
      'transitionend',
      () => toast.remove(),
      { once: true },
    );
    window.setTimeout(() => toast.remove(), 400);
  }, TOAST_MS);
}

/**
 * Copia texto para a área de transferência com fallback.
 *
 * @param {string} text
 * @param {() => void} [onSuccess]
 * @param {(e: unknown) => void} [onError]
 */
export async function copyToClipboard(text, onSuccess, onError) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const ok = document.execCommand('copy');
      textArea.remove();
      if (!ok) throw new Error('execCommand falhou');
    }
    onSuccess?.();
  } catch (err) {
    onError?.(err);
  }
}

/**
 * Baixa o QR Code em PNG de alta resolução.
 *
 * @param {string} payload
 */
export async function downloadQrPng(payload) {
  const dataUrl = await generateHighResPng(payload);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `pix-qrcode-${new Date().toISOString().slice(0, 10)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Preenche a folha de impressão com os dados atuais + QR Code (alta resolução)
 * e dispara o window.print().
 *
 * @param {object} data
 * @param {string} data.payload
 * @param {string} data.name
 * @param {string} data.bank Banco recebedor exibido no lugar da cidade.
 * @param {string} data.amount Valor formatado ("15.00") ou null.
 * @param {string} data.key Chave normalizada.
 */
export async function printPixSheet(data) {
  const canvas = document.getElementById('print-canvas');
  if (!canvas) return;

  await generatePrintQr(canvas, data.payload);

  document.getElementById('print-name').textContent = data.name || '—';
  document.getElementById('print-bank').textContent = data.bank || '—';
  document.getElementById('print-amount').textContent = data.amount
    ? formatBRL(data.amount)
    : 'Valor aberto';
  document.getElementById('print-key').textContent = data.key || '—';
  document.getElementById('print-date').textContent = new Date().toLocaleString(
    'pt-BR',
    { dateStyle: 'long', timeStyle: 'short' },
  );
  document.getElementById('print-code').textContent = data.payload;

  document.body.classList.add('printing');
  window.print();
  window.setTimeout(() => document.body.classList.remove('printing'), 300);
}

async function generatePrintQr(canvas, payload) {
  await QRCode.toCanvas(canvas, payload, {
    width: 240,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}

/** Formata "15.00" como "R$ 15,00". */
function formatBRL(value) {
  const parts = String(value).split('.');
  const reais = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cents = (parts[1] || '').padEnd(2, '0');
  return `R$ ${reais},${cents}`;
}