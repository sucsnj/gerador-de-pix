/**
 * src/utils/pix.js
 *
 * Geração do payload PIX estático no padrão EMVCo (Manual PIX / BACEN):
 *  - string de dados no formato TLV (Tag-Length-Value)
 *  - cálculo de CRC16-CCITT (FALSE, polinônio 0x1021)
 *  - normalização de campos e validação de chaves PIX
 */

// ---------------------------------------------------------------------------
// Campos EMVCo (TLV) e constantes do padrão
// ---------------------------------------------------------------------------

const PAYLOAD_FORMAT_INDICATOR = '000201';
const MERCHANT_ACCOUNT_INFO_ID = '26';
const GUI_SUBFIELD = '00';
const GUI_VALUE = 'br.gov.bcb.pix';
const KEY_SUBFIELD = '01';
const MERCHANT_CATEGORY_CODE = '52040000';
const TRANSACTION_CURRENCY = '5303986';
const COUNTRY_CODE = '5802BR';
const ADDITIONAL_DATA_ID = '62';
const TXID_SUBFIELD = '05';
const DEFAULT_TXID = '***';
const CRC_ID = '6304';

const MAX_MERCHANT_NAME_LEN = 25;
const MAX_MERCHANT_CITY_LEN = 15;
const MAX_AMOUNT_LENGTH = 13;

/**
 * Monta um campo TLV: "ID" + len(2 dígitos) + valor.
 *
 * @param {string} id   Identificador do campo (Ex.: '59', '26').
 * @param {string} value Valor do campo.
 * @returns {string}
 */
export function emv(id, value) {
  const length = String(value === null || value === undefined ? '' : value).length;
  return `${id}${String(length).padStart(2, '0')}${value}`;
}

/**
 * Calcula o CRC16 (CCITT-FALSE) sobre a string dada.
 * Polinômio 0x1021, valor inicial 0xFFFF, sem reflexão.
 *
 * @param {string} payload Texto sobre o qual calcular o CRC.
 * @returns {string} CRC em hexadecimal MAIÚSCULO com 4 dígitos.
 */
export function crc16(payload) {
  let crc = 0xffff;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Normalização de texto (nome / cidade)
// ---------------------------------------------------------------------------

/**
 * Remove acentos, caracteres especiais, coloca em CAIXA ALTA e limita o tamanho.
 *
 * @param {string} value Texto de entrada.
 * @param {number} maxLen Comprimento máximo.
 * @returns {string}
 */
export function normalizeText(value, maxLen) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9@.\-&()/\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// Validação das chaves PIX
// ---------------------------------------------------------------------------

export const KEY_TYPES = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  phone: 'Telefone',
  random: 'Chave Aleatória',
  unknown: 'Desconhecida',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida e classifica uma chave PIX. Retorna o tipo, a chave normalizada
 * e um eventual erro.
 *
 * Quando o valor tem 11 dígitos pode ser CPF ou celular com DDD; nesse caso
 * a função marca `ambiguous: true` com as opções disponíveis e respeita o
 * tipo forçado via `forcedType`.
 *
 * @param {string} value Chave bruta digitada pelo usuário.
 * @param {('cpf'|'phone'|null)} [forcedType] Tipo escolhido manualmente quando ambíguo.
 * @returns {{
 *   type: string,
 *   label: string,
 *   key: string,
 *   valid: boolean,
 *   error: string | null,
 *   ambiguous?: boolean,
 *   options?: string[],
 * }}
 */
export function validatePixKey(value, forcedType = null) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return { type: 'unknown', label: '', key: '', valid: false, error: 'Informe a chave PIX.' };
  }

  // E-mail
  if (raw.includes('@')) {
    if (!EMAIL_RE.test(raw)) {
      return { type: 'email', label: KEY_TYPES.email, key: raw, valid: false, error: 'E-mail inválido.' };
    }
    return { type: 'email', label: KEY_TYPES.email, key: raw.toLowerCase(), valid: true, error: null };
  }

  // Numéricos (CPF, CNPJ ou telefone)
  if (/^[\d./-]+$/.test(raw)) {
    const digitsRaw = raw.replace(/[^\d]/g, '');

    if (digitsRaw.length === 11) {
      const cpfValid = isValidCpf(digitsRaw);
      const options = ['cpf', 'phone'];

      if (forcedType === 'phone') {
        return {
          type: 'phone',
          label: KEY_TYPES.phone,
          key: normalizePhone(digitsRaw),
          valid: true,
          error: null,
          ambiguous: true,
          options,
        };
      }
      if (forcedType === 'cpf') {
        return {
          type: 'cpf',
          label: KEY_TYPES.cpf,
          key: digitsRaw,
          valid: cpfValid,
          error: cpfValid ? null : 'CPF inválido (dígitos verificadores não conferem).',
          ambiguous: true,
          options,
        };
      }
      // Sem tipo forçado: prefere CPF quando válido, senão assume celular.
      if (cpfValid) {
        return {
          type: 'cpf',
          label: KEY_TYPES.cpf,
          key: digitsRaw,
          valid: true,
          error: null,
          ambiguous: true,
          options,
        };
      }
      return {
        type: 'phone',
        label: KEY_TYPES.phone,
        key: normalizePhone(digitsRaw),
        valid: true,
        error: null,
        ambiguous: true,
        options,
      };
    }
    if (digitsRaw.length === 14) {
      const valid = isValidCnpj(digitsRaw);
      return {
        type: 'cnpj',
        label: KEY_TYPES.cnpj,
        key: digitsRaw,
        valid,
        error: valid ? null : 'CNPJ inválido (dígitos verificadores não conferem).',
      };
    }
    if (digitsRaw.length >= 10 && digitsRaw.length <= 13) {
      return {
        type: 'phone',
        label: KEY_TYPES.phone,
        key: normalizePhone(digitsRaw),
        valid: true,
        error: null,
      };
    }
    return {
      type: 'unknown',
      label: '',
      key: raw,
      valid: false,
      error: 'Chave numérica não reconhecida. Use CPF (11), CNPJ (14) ou telefone com DDD (10–13 dígitos).',
    };
  }

  // Telefone com "+" (e.164)
  if (/^\+[\d]+$/.test(raw)) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 12 && digits.length <= 14) {
      return { type: 'phone', label: KEY_TYPES.phone, key: `+${digits}`, valid: true, error: null };
    }
    return {
      type: 'phone',
      label: KEY_TYPES.phone,
      key: raw,
      valid: false,
      error: 'Telefone deve conter código do país, DDD e número (Ex.: +5511999999999).',
    };
  }

  // Chave aleatória (UUID)
  if (/^[0-9a-f-]+$/i.test(raw) && raw.length >= 32) {
    const uuidLike = UUID_RE.test(raw) || /^[0-9a-f]{32}$/i.test(raw);
    if (!uuidLike) {
      return {
        type: 'random',
        label: KEY_TYPES.random,
        key: raw,
        valid: false,
        error: 'Chave aleatória deve estar no formato UUID (8-4-4-4-12) ou 32 caracteres hexadecimais.',
      };
    }
    return { type: 'random', label: KEY_TYPES.random, key: raw.replace(/-/g, '').toUpperCase(), valid: true, error: null };
  }

  return {
    type: 'unknown',
    label: '',
    key: raw,
    valid: false,
    error: 'Formato de chave PIX não reconhecido.',
  };
}

/**
 * Normaliza um telefone para e.164 assumindo DDI 55 (Brasil) quando ausente.
 *
 * @param {string} value
 * @returns {string}
 */
function normalizePhone(value) {
  let digits = value.replace(/\D/g, '');
  if (!digits.startsWith('55')) digits = `55${digits}`;
  return `+${digits}`;
}

/** Valida os dígitos verificadores de um CPF. */
export function isValidCpf(cpf) {
  const clean = String(cpf).replace(/\D/g, '');
  if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;

  const calcDigit = (sliceLen) => {
    let sum = 0;
    for (let i = 0; i < sliceLen; i++) sum += Number(clean[i]) * (sliceLen + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(9) === Number(clean[9]) && calcDigit(10) === Number(clean[10]);
}

/** Valida os dígitos verificadores de um CNPJ. */
export function isValidCnpj(cnpj) {
  const clean = String(cnpj).replace(/\D/g, '');
  if (clean.length !== 14 || /^(\d)\1{13}$/.test(clean)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calcDigit = (slice, weights) => {
    let sum = 0;
    weights.forEach((w, i) => (sum += Number(slice[i]) * w));
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const d1 = calcDigit(clean.slice(0, 12), weights1);
  if (d1 !== Number(clean[12])) return false;

  const d2 = calcDigit(clean.slice(0, 13), weights2);
  return d2 === Number(clean[13]);
}

// ---------------------------------------------------------------------------
// Valor (moeda)
// ---------------------------------------------------------------------------

/**
 * Converte uma string com vírgula/centavos ("15,50") em string com ponto e
 * duas casas decimais ("15.50"), formato exigido pelo campo 54 do EMVCo.
 *
 * @param {string} value
 * @returns {string | null} String formatada ou null se vazio/zero/inválido.
 */
export function amountToPayload(value) {
  const cleaned = String(value ?? '')
    .replace(/[^\d,]/g, '')
    .replace(',', '.');
  if (!cleaned) return null;

  const [intPart, decPart = ''] = cleaned.split('.');
  const digits = `${Number(intPart) || 0}${decPart.padEnd(2, '0').slice(0, 2)}`;
  const numeric = Number(digits);

  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const formatted = `${Number(digits.slice(0, -2)) || 0}.${digits.slice(-2)}`;
  if (Math.abs(Number(formatted)).toString().length > MAX_AMOUNT_LENGTH) return null;

  return formatted;
}

// ---------------------------------------------------------------------------
// Montagem do payload
// ---------------------------------------------------------------------------

/**
 * Gera a string completa do payload PIX estático.
 *
 * @param {object} opt
 * @param {string} opt.pixKey     Chave PIX (já normalizada).
 * @param {string} opt.merchantName Nome do recebedor (máx. 25, CAIXA ALTA).
 * @param {string} opt.merchantCity Cidade do recebedor (máx. 15, CAIXA ALTA).
 * @param {string|null} [opt.amount] Valor formatado com ponto ("15.00") ou null.
 * @param {string} [opt.txid]     TXID (padrão '***').
 * @returns {{ payload: string, fields: object }} Payload final e campos formatados.
 */
export function buildPixPayload({
  pixKey,
  merchantName,
  merchantCity,
  amount = null,
  txid = DEFAULT_TXID,
}) {
  const name = normalizeText(merchantName, MAX_MERCHANT_NAME_LEN);
  const city = normalizeText(merchantCity, MAX_MERCHANT_CITY_LEN);

  // 26 — Merchant Account Information: GUI + chave PIX
  const accountInfo = emv(GUI_SUBFIELD, GUI_VALUE) + emv(KEY_SUBFIELD, pixKey);

  const parts = [];
  parts.push(PAYLOAD_FORMAT_INDICATOR);
  parts.push(emv(MERCHANT_ACCOUNT_INFO_ID, accountInfo));
  parts.push(MERCHANT_CATEGORY_CODE);
  parts.push(TRANSACTION_CURRENCY);

  if (amount) parts.push(emv('54', amount));
  parts.push(COUNTRY_CODE);
  parts.push(emv('59', name));
  parts.push(emv('60', city));
  parts.push(emv(ADDITIONAL_DATA_ID, emv(TXID_SUBFIELD, txid)));

  const payload = `${parts.join('')}${CRC_ID}`;

  return {
    payload: `${payload}${crc16(payload)}`,
    fields: {
      key: pixKey,
      name,
      city,
      amount,
      txid,
    },
  };
}