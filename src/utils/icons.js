/**
 * src/utils/icons.js
 *
 * Centraliza os ícones do lucide utilizados pela aplicação e a função que
 * os injeta no DOM (evita importar o objeto completo de ícones no bundle).
 */

import {
  createIcons,
  Check,
  CircleAlert,
  Copy,
  Download,
  Info,
  KeyRound,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Wallet,
} from 'lucide';

const icons = {
  Check,
  CircleAlert,
  Copy,
  Download,
  Info,
  KeyRound,
  Printer,
  QrCode,
  RefreshCw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Wallet,
};

/** Injeta os ícones `data-lucide` em todo o documento (ou em um root). */
export function initIcons(root) {
  createIcons({ icons, nameAttr: 'data-lucide', root });
}