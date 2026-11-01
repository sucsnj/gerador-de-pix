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
  btnClearHistory: $('btn-clear-history'),
  historyList: $('history-list'),
  historyEmpty: $('history-empty'),
  qrWrap: document.querySelector('#qr-stage .qr-anim'),
};

const form = initForm(els, { merchantKey: MERCHANT_KEY });

let lastPayload = '';
let lastBuild = null;
let lastSavedPayload = '';
let restoring = false;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem('pix-history')) || [];
  } catch {
    return [];
  }
}

function saveHistory(entry) {
  if (restoring) return;
  if (!entry.payload || entry.payload === lastSavedPayload) return;
  lastSavedPayload = entry.payload;
  const list = loadHistory();
  list.unshift(entry);
  if (list.length > 10) list.length = 10;
  try {
    localStorage.setItem('pix-history', JSON.stringify(list));
renderHistory();
updatePreview();
  } catch {
    // ignore quota errors
  }
}

function renderHistory() {
  const list = loadHistory();
  els.historyList.innerHTML = '';
  if (!list.length) {
    els.historyEmpty.classList.remove('hidden');
    return;
  }
  els.historyEmpty.classList.add('hidden');
  list.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'relative';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'flex w-full flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 pr-9 text-left text-sm transition hover:border-emerald-300 hover:bg-emerald-50/40';
    const date = entry.ts ? new Date(entry.ts).toLocaleString('pt-BR') : '';
    const keyShort = (entry.key || '').slice(0, 28);
    btn.innerHTML = `
      <span class="truncate font-semibold text-slate-700">${escapeHtml(entry.name || '(sem nome)')}</span>
      <span class="truncate text-xs text-slate-500">${escapeHtml(keyShort)}${keyShort.length < (entry.key || '').length ? '…' : ''}</span>
      <span class="text-xs text-slate-400">${entry.amount ? `R$ ${entry.amount}` : 'Valor aberto'}${date ? ' • ' + date : ''}</span>
    `;
    btn.addEventListener('click', () => fillFromHistory(entry));
    li.appendChild(btn);

    const del = document.createElement('button');
    del.type = 'button';
    del.setAttribute('aria-label', 'Excluir item do histórico');
    del.className =
      'absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600';
    del.innerHTML = '<i data-lucide="trash-2" class="h-3.5 w-3.5"></i>';
    del.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteHistoryItem(index);
    });
    li.appendChild(del);

    els.historyList.appendChild(li);
  });
  initIcons(els.historyList);
}

function deleteHistoryItem(index) {
  const list = loadHistory();
  if (index < 0 || index >= list.length) return;
  list.splice(index, 1);
  try {
    localStorage.setItem('pix-history', JSON.stringify(list));
  } catch {
    // ignore
  }
  lastSavedPayload = list.length ? list[0].payload : '';
  renderHistory();
  showToast('Item removido do histórico.');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fillFromHistory(entry) {
  restoring = true;
  els.key.value = entry.key || '';
  els.amount.value = entry.amount || '';
  els.merchantName.value = entry.name || '';
  els.merchantBank.value = entry.bank || '';
  els.key.dispatchEvent(new Event('input', { bubbles: true }));
  els.amount.dispatchEvent(new Event('input', { bubbles: true }));
  els.merchantName.dispatchEvent(new Event('input', { bubbles: true }));
  els.merchantBank.dispatchEvent(new Event('input', { bubbles: true }));
  restoring = false;
  updatePreview();
}

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

    saveHistory({
      key: els.key.value,
      amount: els.amount.value,
      name: els.merchantName.value,
      bank: els.merchantBank.value,
      payload: build.payload,
      ts: Date.now(),
    });

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

const DEBOUNCE_MS = 1800;
let previewTimer = null;
function schedulePreview() {
  if (previewTimer) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => {
    previewTimer = null;
    updatePreview();
  }, DEBOUNCE_MS);
}

form.onInput(schedulePreview);
initIcons();

els.key.placeholder = MERCHANT_KEY || els.key.placeholder;
els.merchantName.placeholder = MERCHANT_NAME || els.merchantName.placeholder;
els.merchantBank.placeholder = MERCHANT_BANK || els.merchantBank.placeholder;

// els.merchantKeyFallback.textContent = MERCHANT_KEY || '(não definido no .env)';
// els.merchantNameFallback.textContent = MERCHANT_NAME || '(não definido no .env)';
// els.merchantBankFallback.textContent = MERCHANT_BANK || '(não definido no .env)';

els.btnClearHistory.addEventListener('click', () => {
  try {
    localStorage.removeItem('pix-history');
  } catch {
    // ignore
  }
  lastSavedPayload = '';
  renderHistory();
  showToast('Histórico limpo.');
});

// Restaura o último PIX gerado como referência.
const history = loadHistory();
if (history.length) {
  fillFromHistory(history[0]);
}

renderHistory();