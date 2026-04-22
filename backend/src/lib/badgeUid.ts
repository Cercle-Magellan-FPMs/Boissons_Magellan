const directCharMap: Record<string, string> = {
  "à": "0",
  "&": "1",
  "!": "1",
  "é": "2",
  "\"": "3",
  "'": "4",
  "(": "5",
  "-": "6",
  "è": "7",
  "_": "8",
  "ç": "9",
};

function compactUid(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function translateScannerLayout(value: string) {
  return Array.from(value).map((char) => directCharMap[char] ?? char).join("");
}

function keepUidChars(value: string) {
  return value.replace(/[^0-9A-Z]/gi, "");
}

export function normalizeBadgeUid(value: string) {
  const compact = compactUid(value);
  const translated = translateScannerLayout(compact);
  return keepUidChars(translated).toUpperCase();
}

export function badgeUidCandidates(value: string) {
  const compact = compactUid(value).toUpperCase();
  const normalized = normalizeBadgeUid(value);
  return Array.from(new Set([compact, normalized].filter(Boolean)));
}
