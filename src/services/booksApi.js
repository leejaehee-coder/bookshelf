const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTrV1-mr1FHNjNxvhS0bZxUPK2ixeGyqyCu_JzDZ9GNGoF0P09Sic2mRXR_v-ESf-a17i8FqUXL7IDN/pub?gid=1667091408&single=true&output=csv";

// 따옴표/쉼표를 어느 정도 처리하는 CSV 파서
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && inQuotes && next === '"') {
      field += '"';
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }
    if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && next === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => String(x).trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((x) => String(x).trim() !== "")) rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => String(h).trim());
  const dataRows = rows.slice(1);

  return dataRows
    .filter((r) => r.some((x) => String(x).trim() !== ""))
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h || `col_${idx}`] = r[idx] ?? "";
      });
      return obj;
    });
}

// 여러 헤더명을 자동으로 흡수해서 "표준 Book" 형태로 정규화
function normalizeBook(raw) {
  const title = raw.title ?? raw.제목 ?? raw.name ?? raw.col_0 ?? "";
  const author = raw.author ?? raw.저자 ?? raw.writer ?? raw.col_1 ?? "";
  const genre = raw.genre ?? raw.장르 ?? raw.category ?? raw.col_2 ?? "";
  const coverUrl =
    raw.coverUrl ?? raw.cover ?? raw.표지 ?? raw.표지사진 ?? raw.col_3 ?? "";
  const note = raw.note ?? raw.memo ?? raw.메모 ?? raw.col_4 ?? "";

  return {
    title: String(title).trim(),
    author: String(author).trim(),
    genre: String(genre).trim(),
    coverUrl: String(coverUrl).trim(),
    note: String(note).trim(),
  };
}

export async function fetchBooksFromSheet() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Sheet fetch failed (HTTP ${res.status})`);
  const csvText = await res.text();
  const parsed = parseCSV(csvText);
  return parsed.map(normalizeBook).filter((b) => b.title || b.author || b.genre);
}
