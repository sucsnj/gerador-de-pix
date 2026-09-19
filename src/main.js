/**
 * src/main.js
 *
 * Ponto de entrada: conecta o formulário, a lógica PIX, a renderização do
 * QR Code e as ações (copiar / baixar / imprimir).
 */

import './style.css';
import { buildPixPayload, amountToPayload } from './utils/pix.js';
import { initIcons } from './utils/icons.js';
import { initForm } from './components/form.js';
import { renderQr, pulseQr } from './components/qr.js';
import { copyToClipboard, downloadQrPng, printPixSheet, showToast } from './components/actions.js';

const $ = (id) => document.getElementById(id);

// Recebedor definido via variáveis de ambiente (usado como padrão quando o
// respectivo campo do formulário estiver em branco).
const MERCHANT_NAME = import.meta.env.VITE_MERCHANT_NAME ?? '';
const MERCHANT_KEY = import.meta.env.VITE_MERCHANT_KEY ?? '';
const MERCHANT_BANK = import.meta.env.VITE_MERCHANT_BANK ?? '';
const MERCHANT_CITY = import.meta.env.VITE_MERCHANT_CITY ?? '';

// Altera os valores no placeholder do formulário
// Para o valor / chave
document.getElementById('input-key').placeholder = import.meta.env.VITE_MERCHANT_KEY;
// Para o nome do recebedor
document.getElementById('input-merchant-name').placeholder = import.meta.env.VITE_MERCHANT_NAME;
// Para o banco
document.getElementById('input-merchant-bank').placeholder = import.meta.env.VITE_MERCHANT_BANK;

const els = {
  form: $('pix-form'),
  key: $('input-key'),
  keyTypeLabel: $('key-type-label'),
  keyFeedback: $('key-feedback'),
  keyToggle: $('key-toggle'),
  merchantKeyFallback: $('merchant-key-fallback'),
  amount: $('input-amount'),
  merchantName: $('input-merchant-name'),
  merchantBank: $('input-merchant-bank'),
  merchantNameFallback: $('merchant-name-fallback'),
  merchantBankFallback: $('merchant-bank-fallback'),
  placeholder: $('qr-placeholder'),
  stage: $('qr-stage'),
  canvas: $('qr-canvas'),
  pixCode: $('pix-code'),
  pixCodeRaw: $('pix-code-raw'),
  statusBadge: $('status-badge'),
  statusText: $('status-text'),
  btnCopy: $('btn-copy'),
  btnDownload: $('btn-download'),
  btnPrint: $('btn-print'),
  btnReset: $('btn-reset'),
  qrWrap: document.querySelector('#qr-stage .qr-anim'),
};

const form = initForm(els, { merchantKey: MERCHANT_KEY });

let lastPayload = '';
let lastBuild = null;

function setStatus(state, text) {
  const palette = {
    idle: 'border-slate-200 bg-slate-100 text-slate-500',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    error: 'border-rose-200 bg-rose-50 text-rose-600',
  };
  els.statusBadge.className = `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${palette[state]}`;
  els.statusText.textContent = text;
}

function updatePreview() {
  const s = form.getState();
  const amount = amountToPayload(s.amountRaw);
  const name = s.merchantName.trim() || MERCHANT_NAME;
  const bank = s.merchantBank.trim() || MERCHANT_BANK;

  if (!name.trim() || !MERCHANT_CITY.trim()) {
    setStatus('error', 'Configure o recebedor no .env');
    els.placeholder.classList.remove('hidden');
    els.stage.classList.add('hidden');
    lastPayload = '';
    lastBuild = null;
    els.pixCode.value = '';
    els.pixCodeRaw.value = '';
    return;
  }

  if (!s.keyValid) {
    setStatus('error', 'Preencha a chave PIX');
    els.placeholder.classList.remove('hidden');
    els.stage.classList.add('hidden');
    lastPayload = '';
    lastBuild = null;
    els.pixCode.value = '';
    els.pixCodeRaw.value = '';
    return;
  }

  try {
    const build = buildPixPayload({
      pixKey: s.key,
      merchantName: name,
      merchantCity: MERCHANT_CITY,
      amount,
    });
    lastBuild = build;
    lastPayload = build.payload;

    els.pixCode.value = build.payload;
    els.pixCodeRaw.value = build.payload;

    els.placeholder.classList.add('hidden');
    els.stage.classList.remove('hidden');

    setStatus(build.payload.length > 512 ? 'error' : 'ok', 'QR Code pronto');

    renderQr(els.canvas, build.payload)
      .then(() => pulseQr(els.qrWrap))
      .catch((err) => {
        console.error('Falha ao renderizar QR Code:', err);
        setStatus('error', 'Erro ao gerar QR Code');
      });
  } catch (err) {
    console.error(err);
    setStatus('error', 'Não foi possível gerar o payload');
    lastPayload = '';
    lastBuild = null;
  }
}

// ---- Ações ----

els.btnCopy.addEventListener('click', () => {
  if (!lastPayload) return;
  copyToClipboard(
    lastPayload,
    () => {
      showToast('Código PIX Copia e Cola copiado!');
      flashCopyButton('Copiado!', 'check');
    },
    () => {
      showToast('Não foi possível copiar automaticamente.', 'error');
      els.pixCode.select();
    },
  );
});

function flashCopyButton(label, iconName = 'copy') {
  els.btnCopy.innerHTML = `<i data-lucide="${iconName}" class="h-3.5 w-3.5"></i> ${label}`;
  initIcons(els.btnCopy);
  window.setTimeout(() => {
    els.btnCopy.innerHTML = `<i data-lucide="copy" class="h-3.5 w-3.5"></i> Copiar`;
    initIcons(els.btnCopy);
  }, 1800);
}

els.pixCode.addEventListener('click', () => els.pixCode.select());

els.btnDownload.addEventListener('click', async () => {
  if (!lastPayload) return;
  try {
    await downloadQrPng(lastPayload);
    showToast('QR Code baixado em PNG!');
  } catch (err) {
    console.error(err);
    showToast('Falha ao baixar a imagem.', 'error');
  }
});

els.btnPrint.addEventListener('click', async () => {
  if (!lastPayload || !lastBuild) return;
  const s = form.getState();
  try {
    await printPixSheet({
      payload: lastBuild.payload,
      name: lastBuild.fields.name,
      bank: s.merchantBank.trim() || MERCHANT_BANK,
      amount: lastBuild.fields.amount,
      key: lastBuild.fields.key,
    });
  } catch (err) {
    console.error(err);
    showToast('Falha ao preparar a impressão.', 'error');
  }
});

els.btnReset.addEventListener('click', () => {
  form.reset();
  els.placeholder.classList.remove('hidden');
  els.stage.classList.add('hidden');
  lastPayload = '';
  lastBuild = null;
  setStatus('idle', 'Aguardando dados');
  showToast('Formulário limpo.');
});

// ---- Inicialização ----

form.onInput(updatePreview);
initIcons();

els.merchantKeyFallback.textContent = MERCHANT_KEY || '(não definido no .env)';
els.merchantNameFallback.textContent = MERCHANT_NAME || '(não definido no .env)';
els.merchantBankFallback.textContent = MERCHANT_BANK || '(não definido no .env)';

updatePreview();