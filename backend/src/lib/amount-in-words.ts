/**
 * Сумма прописью на русском языке
 * Поддерживает суммы до 999 999 999 999.99 (триллион)
 */

const ONES_MASCULINE = [
  "", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
  "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать",
];

const ONES_FEMININE = [
  "", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать",
  "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать",
];

const TENS = [
  "", "", "двадцать", "тридцать", "сорок", "пятьдесят",
  "шестьдесят", "семьдесят", "восемьдесят", "девяносто",
];

const HUNDREDS = [
  "", "сто", "двести", "триста", "четыреста", "пятьсот",
  "шестьсот", "семьсот", "восемьсот", "девятьсот",
];

type PluralForms = [string, string, string]; // 1, 2-4, 5+

function pluralize(n: number, forms: PluralForms): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function tripletToWords(n: number, feminine: boolean): string {
  if (n === 0) return "";

  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const remainder = n % 100;
  const t = Math.floor(remainder / 10);
  const o = remainder % 10;

  if (h > 0) parts.push(HUNDREDS[h]);

  if (remainder >= 10 && remainder <= 19) {
    parts.push(feminine ? ONES_FEMININE[remainder] : ONES_MASCULINE[remainder]);
  } else {
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(feminine ? ONES_FEMININE[o] : ONES_MASCULINE[o]);
  }

  return parts.join(" ");
}

const GROUPS: Array<{ divisor: number; feminine: boolean; forms: PluralForms }> = [
  { divisor: 1_000_000_000, feminine: false, forms: ["миллиард", "миллиарда", "миллиардов"] },
  { divisor: 1_000_000, feminine: false, forms: ["миллион", "миллиона", "миллионов"] },
  { divisor: 1_000, feminine: true, forms: ["тысяча", "тысячи", "тысяч"] },
];

/**
 * Конвертирует число в текст на русском
 */
function numberToWords(n: number): string {
  if (n === 0) return "ноль";

  const parts: string[] = [];
  let remaining = Math.floor(n);

  for (const group of GROUPS) {
    const count = Math.floor(remaining / group.divisor);
    if (count > 0) {
      parts.push(tripletToWords(count, group.feminine));
      parts.push(pluralize(count, group.forms));
      remaining %= group.divisor;
    }
  }

  if (remaining > 0) {
    parts.push(tripletToWords(remaining, false));
  }

  return parts.filter(Boolean).join(" ");
}

/**
 * Сумма прописью в рублях и копейках
 *
 * @example
 * amountInWords(1234.56) => "Одна тысяча двести тридцать четыре рубля 56 копеек"
 * amountInWords(100) => "Сто рублей 00 копеек"
 * amountInWords(0.5) => "Ноль рублей 50 копеек"
 */
export function amountInWords(amount: number): string {
  const rubles = Math.floor(Math.abs(amount));
  const kopecks = Math.round((Math.abs(amount) - rubles) * 100);

  const rublesText = numberToWords(rubles);
  const rublesUnit = pluralize(rubles, ["рубль", "рубля", "рублей"]);
  const kopecksStr = String(kopecks).padStart(2, "0");
  const kopecksUnit = pluralize(kopecks, ["копейка", "копейки", "копеек"]);

  // Первая буква заглавная
  const capitalized = rublesText.charAt(0).toUpperCase() + rublesText.slice(1);

  return `${capitalized} ${rublesUnit} ${kopecksStr} ${kopecksUnit}`;
}

/**
 * Краткий формат: "Сто двадцать три руб. 45 коп."
 */
export function amountInWordsShort(amount: number): string {
  const rubles = Math.floor(Math.abs(amount));
  const kopecks = Math.round((Math.abs(amount) - rubles) * 100);

  const rublesText = numberToWords(rubles);
  const kopecksStr = String(kopecks).padStart(2, "0");

  const capitalized = rublesText.charAt(0).toUpperCase() + rublesText.slice(1);

  return `${capitalized} руб. ${kopecksStr} коп.`;
}
