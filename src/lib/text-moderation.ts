const BLOCKED_PATTERNS = [
  /(?:^|[^a-zа-яё])(хуй|хуи|хуя|хуе|хуйня|хуйн|хер(?:ня|ню|ни)?|ебал|ебан|ебат|ебет|ебёт|ебуч|ебло|еблан|пизд|пизж|бляд|бля(?!x)|блять|сучк|сука|мудак|мудил|гандон|петух)(?:[^a-zа-яё]|$)/iu
];

function normalizeForModeration(value: string) {
  return value
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/gu, 'е')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[0-9]+/gu, ' ')
    .replace(/[\s_\-.,!?@#$%^&*()+=[\]{};:'"\\|/<>`~]+/gu, ' ')
    .trim();
}

export function containsBlockedWords(value: string) {
  const normalized = normalizeForModeration(value);
  if (!normalized) return false;
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(` ${normalized} `));
}
