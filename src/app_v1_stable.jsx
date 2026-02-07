import React, { useEffect, useMemo, useRef, useState } from "react";

// ✅ localStorage keys (절대 바꾸지 말기)
const LS_BOOKS = "bookshelf_books_v2";
const LS_VERSION = "bookshelf_schema_v2";

// ✅ 샘플 초기 데이터(원하면 비워도 됨). 구글시트 업로드로 대체 가능.
const SEED_BOOKS = [
  // { id: crypto.randomUUID(), title: "샘플 책", author: "작가", genre: "로판", status: "읽을 예정", coverDataUrl: "" },
];

const GENRES = ["로판", "로맨스", "판타지", "현대물", "무협", "SF", "추리", "에세이", "기타"];
const STATUSES = ["읽을 예정", "읽는 중", "읽음", "보류"];

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * 구글시트에서 복사-붙여넣기/CSV를 처리
 * 지원:
 * - TSV(탭 구분, 구글시트 복사)
 * - CSV(쉼표 구분)
 * - 헤더 자동 인식 (title/제목, author/저자, genre/장르, status/상태)
 */
function parseSheetText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { rows: [], errors: ["붙여넣을 내용이 비어있어요."] };

  // 줄 정리
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], errors: ["붙여넣을 내용이 비어있어요."] };

  // 구분자 추정: 탭 우선, 없으면 콤마
  const delim = lines[0].includes("\t") ? "\t" : ",";

  const splitLine = (line) => {
    if (delim === "\t") return line.split("\t");
    // CSV 간단 파서(따옴표 기본 처리)
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        // "" 이스케이프
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const cells = lines.map(splitLine).map((row) => row.map((c) => normalizeText(c)));

  // 헤더 판정
  const header = cells[0].map((h) => h.toLowerCase());

  const headerMap = {
    title: ["title", "제목", "책제목", "book", "book title", "book_title"],
    author: ["author", "저자", "작가", "writer"],
    genre: ["genre", "장르", "카테고리", "category"],
    status: ["status", "상태", "읽기상태", "state"],
  };

  const findIndex = (keys) => {
    for (const k of keys) {
      const idx = header.findIndex((h) => h === String(k).toLowerCase());
      if (idx >= 0) return idx;
    }
    // 포함 검색도 한 번
    for (const k of keys) {
      const idx = header.findIndex((h) => h.includes(String(k).toLowerCase()));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idxTitle = findIndex(headerMap.title);
  const idxAuthor = findIndex(headerMap.author);
  const idxGenre = findIndex(headerMap.genre);
  const idxStatus = findIndex(headerMap.status);

  const hasHeader =
    idxTitle >= 0 ||
    idxAuthor >= 0 ||
    idxGenre >= 0 ||
    idxStatus >= 0 ||
    header.some((h) => ["title", "author", "genre", "status", "제목", "저자", "장르", "상태"].includes(h));

  const startRow = hasHeader ? 1 : 0;

  const errors = [];
  const rows = [];

  for (let r = startRow; r < cells.length; r++) {
    const row = cells[r];
    const title = normalizeText(idxTitle >= 0 ? row[idxTitle] : row[0]);
    const author = normalizeText(idxAuthor >= 0 ? row[idxAuthor] : row[1] ?? "");
    const genre = normalizeText(idxGenre >= 0 ? row[idxGenre] : row[2] ?? "");
    const status = normalizeText(idxStatus >= 0 ? row[idxStatus] : row[3] ?? "");

    if (!title) continue; // 제목 없으면 스킵

    rows.push({
      title,
      author,
      genre: genre || "기타",
      status: status || "읽을 예정",
    });
  }

  if (rows.length === 0) errors.push("유효한 책이 하나도 없어요. (최소한 제목은 있어야 해요)");

  return { rows, errors };
}

function BookCover({ coverDataUrl, title }) {
  return (
    <div className="coverWrap" aria-label={`${title} 표지`}>
      {coverDataUrl ? (
        <img className="coverImg" src={coverDataUrl} alt={`${title} cover`} />
      ) : (
        <div className="coverPlaceholder">
          <div className="phIcon">📖</div>
          <div className="phText">표지 추가</div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [books, setBooks] = useState([]);
  const [query, setQuery] = useState("");
  const [filterGenre, setFilterGenre] = useState("전체");
  const [filterStatus, setFilterStatus] = useState("전체");

  // 단권 추가 폼
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState("로판");
  const [status, setStatus] = useState("읽을 예정");

  // 대량 업로드(구글시트 붙여넣기)
  const [sheetText, setSheetText] = useState("");
  const [sheetErrors, setSheetErrors] = useState([]);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // 표지 업로드용 input (숨김, 책 클릭하면 트리거)
  const coverInputRef = useRef(null);
  const [pendingCoverBookId, setPendingCoverBookId] = useState(null);

  // ✅ 최초 로드: localStorage 우선, 없으면 SEED
  useEffect(() => {
    const schema = localStorage.getItem(LS_VERSION);
    const stored = safeJsonParse(localStorage.getItem(LS_BOOKS), null);

    if (schema === "2" && Array.isArray(stored)) {
      setBooks(stored);
      return;
    }

    // 신규/마이그레이션: 기존 키가 있으면 흡수 시도
    const legacy = safeJsonParse(localStorage.getItem("bookshelf_books"), null);
    if (Array.isArray(legacy)) {
      const migrated = legacy.map((b) => ({
        id: b.id ?? crypto.randomUUID(),
        title: normalizeText(b.title ?? ""),
        author: normalizeText(b.author ?? ""),
        genre: normalizeText(b.genre ?? "기타") || "기타",
        status: normalizeText(b.status ?? "읽을 예정") || "읽을 예정",
        coverDataUrl: b.coverDataUrl ?? b.cover ?? "",
      }));
      setBooks(migrated);
      localStorage.setItem(LS_VERSION, "2");
      localStorage.setItem(LS_BOOKS, JSON.stringify(migrated));
      return;
    }

    setBooks(SEED_BOOKS);
    localStorage.setItem(LS_VERSION, "2");
    localStorage.setItem(LS_BOOKS, JSON.stringify(SEED_BOOKS));
  }, []);

  // ✅ 저장: books 변경마다 localStorage에 즉시 반영
  useEffect(() => {
    localStorage.setItem(LS_VERSION, "2");
    localStorage.setItem(LS_BOOKS, JSON.stringify(books));
  }, [books]);

  const genreOptions = useMemo(() => {
    const set = new Set(books.map((b) => b.genre).filter(Boolean));
    const list = Array.from(set);
    list.sort((a, b) => a.localeCompare(b, "ko"));
    return ["전체", ...list];
  }, [books]);

  const statusOptions = useMemo(() => {
    const set = new Set(books.map((b) => b.status).filter(Boolean));
    const list = Array.from(set);
    list.sort((a, b) => a.localeCompare(b, "ko"));
    return ["전체", ...list];
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = normalizeText(query).toLowerCase();
    return books.filter((b) => {
      const okQ =
        !q ||
        b.title.toLowerCase().includes(q) ||
        (b.author ?? "").toLowerCase().includes(q) ||
        (b.genre ?? "").toLowerCase().includes(q) ||
        (b.status ?? "").toLowerCase().includes(q);

      const okG = filterGenre === "전체" || b.genre === filterGenre;
      const okS = filterStatus === "전체" || b.status === filterStatus;

      return okQ && okG && okS;
    });
  }, [books, query, filterGenre, filterStatus]);

  function addOneBook() {
    const t = normalizeText(title);
    if (!t) return;

    const newBook = {
      id: crypto.randomUUID(),
      title: t,
      author: normalizeText(author),
      genre: normalizeText(genre) || "기타",
      status: normalizeText(status) || "읽을 예정",
      coverDataUrl: "",
    };

    setBooks((prev) => [newBook, ...prev]);

    // 폼 리셋
    setTitle("");
    setAuthor("");
    setGenre("로판");
    setStatus("읽을 예정");
  }

  function openCoverPicker(bookId) {
    setPendingCoverBookId(bookId);
    // 클릭으로 파일 선택창 열기
    if (coverInputRef.current) coverInputRef.current.click();
  }

  function onCoverFileChange(e) {
    const file = e.target.files?.[0];
    if (!file || !pendingCoverBookId) return;

    // 이미지 파일만
    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 선택할 수 있어요.");
      e.target.value = "";
      setPendingCoverBookId(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setBooks((prev) =>
        prev.map((b) => (b.id === pendingCoverBookId ? { ...b, coverDataUrl: dataUrl } : b))
      );
      e.target.value = "";
      setPendingCoverBookId(null);
    };
    reader.readAsDataURL(file);
  }

  function removeCover(bookId) {
    setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, coverDataUrl: "" } : b)));
  }

  function removeBook(bookId) {
    setBooks((prev) => prev.filter((b) => b.id !== bookId));
  }

  function updateBook(bookId, patch) {
    setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, ...patch } : b)));
  }

  function handleImport() {
    const { rows, errors } = parseSheetText(sheetText);
    if (errors.length) {
      setSheetErrors(errors);
      return;
    }
    setSheetErrors([]);

    const imported = rows.map((r) => ({
      id: crypto.randomUUID(),
      title: r.title,
      author: r.author,
      genre: r.genre || "기타",
      status: r.status || "읽을 예정",
      coverDataUrl: "",
    }));

    // ✅ “덮어쓰기”가 아니라 “추가”가 기본 (요구사항)
    setBooks((prev) => [...imported, ...prev]);

    // 입력창 정리
    setSheetText("");
    setIsImportOpen(false);
  }

  function wipeAll() {
    const ok = confirm("책장 데이터를 전부 삭제할까요? (되돌리기 어려워요)");
    if (!ok) return;
    setBooks([]);
  }

  // ========= UI =========
  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="logo">📚</div>
          <div className="brandText">
            <div className="title">내 전자책 책장</div>
            <div className="subtitle">구글시트로 한꺼번에 넣고, 앱에서 하나씩 계속 키우기</div>
          </div>
        </div>

        <div className="topActions">
          <button className="btn btnGhost" onClick={() => setIsImportOpen((v) => !v)}>
            {isImportOpen ? "대량 업로드 닫기" : "구글시트 대량 업로드"}
          </button>
          <button className="btn btnDangerGhost" onClick={wipeAll} title="전체 삭제">
            전체 삭제
          </button>
        </div>
      </header>

      <main className="content">
        {/* ✅ 대량 업로드 패널 */}
        {isImportOpen && (
          <section className="panel">
            <div className="panelHead">
              <div className="panelTitle">구글시트 대량 입력 (연동 아님)</div>
              <div className="panelDesc">
                시트에서 <b>헤더 포함</b>으로 복사해서 여기 붙여넣기.
                <span className="hint"> (지원 헤더: 제목/제목(title), 저자(author), 장르(genre), 상태(status))</span>
              </div>
            </div>

            <textarea
              className="textarea"
              value={sheetText}
              onChange={(e) => setSheetText(e.target.value)}
              placeholder={`예시(탭/CSV 모두 가능):
title	author	genre	status
향기로 치유하는 황녀님	홍길동	로판	읽을 예정
...`}
              rows={7}
            />

            {sheetErrors.length > 0 && (
              <div className="errorBox">
                {sheetErrors.map((er, i) => (
                  <div key={i}>• {er}</div>
                ))}
              </div>
            )}

            <div className="panelActions">
              <button className="btn" onClick={handleImport}>
                붙여넣은 책 추가하기
              </button>
              <button className="btn btnGhost" onClick={() => setSheetText("")}>
                입력 지우기
              </button>
            </div>
          </section>
        )}

        {/* ✅ 검색/필터 */}
        <section className="panel compact">
          <div className="filters">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색: 제목, 작가, 장르, 상태"
            />
            <select className="select" value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
              {genreOptions.map((g) => (
                <option key={g} value={g}>
                  장르: {g}
                </option>
              ))}
            </select>
            <select className="select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  상태: {s}
                </option>
              ))}
            </select>
            <div className="countPill">
              {filteredBooks.length} / {books.length}
            </div>
          </div>
        </section>

        {/* ✅ 단권 추가 */}
        <section className="panel">
          <div className="panelHead">
            <div className="panelTitle">책 1권 추가</div>
            <div className="panelDesc">추가 즉시 책장에 반영되고, 자동 저장돼요.</div>
          </div>

          <div className="formGrid">
            <div className="field">
              <label className="label">제목 *</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 엑스트라는 가장 먼저 버려진다"
              />
            </div>
            <div className="field">
              <label className="label">작가</label>
              <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="예: ○○" />
            </div>
            <div className="field">
              <label className="label">장르</label>
              <select className="select" value={genre} onChange={(e) => setGenre(e.target.value)}>
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label">상태</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <button className="btn addBtn" onClick={addOneBook} disabled={!normalizeText(title)}>
              + 추가
            </button>
          </div>
        </section>

        {/* ✅ 책장 */}
        <section className="shelf">
          {filteredBooks.length === 0 ? (
            <div className="emptyState">
              <div className="emptyIcon">🪻</div>
              <div className="emptyText">아직 표시할 책이 없어요. 구글시트로 넣거나, 1권 추가해봐요.</div>
            </div>
          ) : (
            <div className="grid">
              {filteredBooks.map((b) => (
                <article key={b.id} className="card">
                  <button className="coverButton" onClick={() => openCoverPicker(b.id)} title="표지 업로드/변경">
                    <BookCover coverDataUrl={b.coverDataUrl} title={b.title} />
                  </button>

                  <div className="meta">
                    <div className="bookTitle" title={b.title}>
                      {b.title}
                    </div>
                    <div className="bookSub" title={b.author || ""}>
                      {b.author ? b.author : "작가 미입력"}
                    </div>

                    <div className="chips">
                      <select
                        className="chipSelect"
                        value={b.genre || "기타"}
                        onChange={(e) => updateBook(b.id, { genre: e.target.value })}
                        title="장르 변경"
                      >
                        {[...new Set([...GENRES, ...genreOptions.filter((x) => x !== "전체")])].map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>

                      <select
                        className="chipSelect"
                        value={b.status || "읽을 예정"}
                        onChange={(e) => updateBook(b.id, { status: e.target.value })}
                        title="상태 변경"
                      >
                        {[...new Set([...STATUSES, ...statusOptions.filter((x) => x !== "전체")])].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rowActions">
                      <button className="miniBtn" onClick={() => openCoverPicker(b.id)}>
                        표지
                      </button>
                      <button className="miniBtn" onClick={() => removeCover(b.id)} disabled={!b.coverDataUrl}>
                        표지 제거
                      </button>
                      <button className="miniBtn danger" onClick={() => removeBook(b.id)}>
                        삭제
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* 숨김 파일 입력 */}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={onCoverFileChange}
        />
      </main>

      {/* ✅ 스타일: App.jsx 단독으로 완성되게 내장 */}
      <style>{css}</style>
    </div>
  );
}

// ✅ 파스텔 연보라 책장 + 반응형 5~2권 + 버튼 안 잘림 + 여백 확보
const css = `
  :root{
    --bg1:#f3ecff;
    --bg2:#efe6ff;
    --ink:#1e1a2b;
    --muted:#6b647a;
    --card:#ffffffcc;
    --stroke:#ffffffa8;
    --shadow: 0 10px 30px rgba(40, 20, 70, .12);
    --shadow2: 0 6px 16px rgba(40, 20, 70, .10);
    --radius: 18px;
  }

  *{ box-sizing:border-box; }
  body{
    margin:0;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Apple SD Gothic Neo, "Noto Sans KR", Arial;
    color:var(--ink);
  }
  button, input, select, textarea{ font:inherit; }

  .page{
    min-height:100vh;
    background: radial-gradient(1200px 700px at 20% 0%, var(--bg2), transparent 65%),
                radial-gradient(1100px 700px at 90% 10%, #f8f2ff, transparent 60%),
                linear-gradient(180deg, var(--bg1), #fbf9ff);
  }

  .topbar{
    position:sticky;
    top:0;
    z-index:10;
    backdrop-filter: blur(10px);
    background: linear-gradient(180deg, rgba(255,255,255,.70), rgba(255,255,255,.45));
    border-bottom: 1px solid rgba(255,255,255,.7);
    padding: 14px 16px;
  }

  .brand{
    display:flex;
    align-items:center;
    gap:12px;
    max-width: 1100px;
    margin: 0 auto;
    padding: 2px 0;
  }

  .logo{
    width:44px;
    height:44px;
    display:grid;
    place-items:center;
    border-radius: 14px;
    background: rgba(255,255,255,.75);
    box-shadow: var(--shadow2);
    border: 1px solid rgba(255,255,255,.9);
    flex: 0 0 auto;
  }

  .brandText{ flex:1 1 auto; min-width:0; }
  .title{ font-size: 18px; font-weight: 800; letter-spacing: -0.2px; }
  .subtitle{ font-size: 12px; color: var(--muted); margin-top: 2px; }

  .topActions{
    max-width:1100px;
    margin: 10px auto 0;
    display:flex;
    gap:10px;
    flex-wrap: wrap; /* ✅ 버튼이 잘리지 않게 줄바꿈 */
  }

  .content{
    max-width:1100px;
    margin: 0 auto;
    padding: 16px 16px 40px;
  }

  .panel{
    background: var(--card);
    border: 1px solid var(--stroke);
    border-radius: var(--radius);
    box-shadow: var(--shadow2);
    padding: 14px;
    margin: 14px 0;
  }
  .panel.compact{ padding: 12px; }

  .panelHead{ display:flex; flex-direction:column; gap:6px; margin-bottom: 10px; }
  .panelTitle{ font-weight: 800; }
  .panelDesc{ color: var(--muted); font-size: 12px; line-height: 1.35; }
  .hint{ opacity: .9; margin-left: 6px; }

  .textarea{
    width:100%;
    border-radius: 14px;
    border: 1px solid rgba(120,90,170,.18);
    background: rgba(255,255,255,.8);
    padding: 12px;
    outline: none;
    resize: vertical;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.65);
  }

  .errorBox{
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255, 80, 120, .10);
    border: 1px solid rgba(255, 80, 120, .22);
    color: rgba(120, 20, 50, .95);
    font-size: 13px;
  }

  .panelActions{
    display:flex;
    gap:10px;
    flex-wrap: wrap;
    margin-top: 10px;
  }

  .filters{
    display:grid;
    grid-template-columns: 1fr 220px 220px auto;
    gap:10px;
    align-items:center;
  }

  .input, .select{
    width:100%;
    border-radius: 14px;
    border: 1px solid rgba(120,90,170,.18);
    background: rgba(255,255,255,.85);
    padding: 10px 12px;
    outline:none;
  }

  .countPill{
    justify-self:end;
    background: rgba(255,255,255,.8);
    border: 1px solid rgba(255,255,255,.9);
    border-radius: 999px;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--muted);
    box-shadow: var(--shadow2);
    white-space: nowrap;
  }

  .formGrid{
    display:grid;
    grid-template-columns: 1.5fr 1fr 180px 180px 120px;
    gap:10px;
    align-items:end;
  }

  .field{ display:flex; flex-direction:column; gap:6px; min-width:0; }
  .label{ font-size: 12px; color: var(--muted); }

  .btn{
    border: 1px solid rgba(255,255,255,.85);
    background: rgba(255,255,255,.85);
    border-radius: 14px;
    padding: 10px 12px;
    cursor: pointer;
    box-shadow: var(--shadow2);
    transition: transform .06s ease, background .12s ease;
    font-weight: 700;
  }
  .btn:hover{ transform: translateY(-1px); background: rgba(255,255,255,.95); }
  .btn:active{ transform: translateY(0); }
  .btn:disabled{ opacity: .55; cursor: not-allowed; transform:none; }

  .btnGhost{ background: rgba(255,255,255,.60); }
  .btnDangerGhost{
    background: rgba(255, 80, 120, .10);
    border: 1px solid rgba(255, 80, 120, .20);
  }

  .addBtn{ height: 42px; }

  .shelf{ margin-top: 18px; }

  /* ✅ 핵심: 컬럼 수를 변수로 강제해서 “반드시 5/4/3/2”로만 보이게 */
  .grid{
    --cols: 5;
    display:grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 14px;
    align-items: stretch; /* ✅ 카드 높이 균일화에 도움 */
  }

  /* ✅ 너의 요구대로: 5 → 4 → 3 → 2 */
  @media (max-width: 1100px){
    .grid{ --cols: 4; }
    .filters{ grid-template-columns: 1fr 200px 200px auto; }
  }
  @media (max-width: 900px){
    .grid{ --cols: 3; }
    .formGrid{ grid-template-columns: 1fr 1fr 1fr 1fr; }
    .addBtn{ grid-column: 1 / -1; }
    .filters{ grid-template-columns: 1fr 1fr; }
    .countPill{ justify-self:start; }
  }
  @media (max-width: 560px){
    .grid{ --cols: 2; }
  }

  /* ✅ “책 길이가 다름” 해결: 카드 내부 높이 규격화 */
  .card{
    background: rgba(255,255,255,.78);
    border: 1px solid rgba(255,255,255,.90);
    border-radius: 20px;
    box-shadow: var(--shadow2);
    overflow:hidden;
    display:flex;
    flex-direction:column;
    min-width:0;
    height: 100%; /* ✅ 같은 row 안에서 카드 높이 동일 */
  }

  .coverButton{
    border:0;
    padding:0;
    cursor:pointer;
    background: transparent;
    text-align: left;
  }

  .coverWrap{
    width:100%;
    aspect-ratio: 3 / 4; /* ✅ 표지 영역은 무조건 동일 비율 */
    background: linear-gradient(180deg, rgba(210,190,255,.55), rgba(255,255,255,.75));
    border-bottom: 1px solid rgba(255,255,255,.85);
    display:grid;
    place-items:center;
  }

  .coverImg{
    width:100%;
    height:100%;
    object-fit: cover;
    display:block;
  }

  .coverPlaceholder{
    width: 88%;
    height: 88%;
    border-radius: 16px;
    border: 1px dashed rgba(120,90,170,.35);
    background: rgba(255,255,255,.55);
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap: 6px;
    color: rgba(80,60,120,.85);
    user-select:none;
  }
  .phIcon{ font-size: 22px; }
  .phText{ font-size: 12px; font-weight: 800; }

  .meta{
    padding: 12px;
    display:flex;
    flex-direction:column;
    gap: 8px;
    min-width:0;
    flex: 1 1 auto; /* ✅ 아래 영역을 카드 높이 안에서 균등하게 */
  }

  .bookTitle{
    font-weight: 900;
    letter-spacing: -0.2px;
    line-height: 1.15;
    display:-webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow:hidden;

    /* ✅ 제목이 1줄/2줄이여도 영역 높이 고정 */
    min-height: 2.35em;
  }

  .bookSub{
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    overflow:hidden;
    text-overflow: ellipsis;
    min-height: 1.2em; /* ✅ 작가 유무로 높이 흔들림 방지 */
  }

  .chips{
    display:flex;
    gap: 8px;
    flex-wrap: nowrap;      /* ✅ 줄바꿈으로 카드 높이 달라지는 것 방지 */
    overflow-x: auto;       /* ✅ 대신 옆으로 스크롤 */
    padding-bottom: 2px;
  }
  .chips::-webkit-scrollbar{ height: 6px; }
  .chips::-webkit-scrollbar-thumb{ background: rgba(120,90,170,.18); border-radius: 999px; }

  .chipSelect{
    border-radius: 999px;
    border: 1px solid rgba(120,90,170,.20);
    background: rgba(255,255,255,.75);
    padding: 6px 10px;
    font-size: 12px;
    cursor:pointer;
    flex: 0 0 auto;
  }

  .rowActions{
    display:flex;
    gap: 8px;
    flex-wrap: nowrap;   /* ✅ 버튼 줄바꿈 금지(카드 높이 균일화 핵심) */
    overflow-x: auto;    /* ✅ 작은 화면에서는 옆으로 스크롤 */
    padding-bottom: 2px;
    margin-top: auto;    /* ✅ 버튼은 항상 아래쪽에 붙음 */
  }
  .rowActions::-webkit-scrollbar{ height: 6px; }
  .rowActions::-webkit-scrollbar-thumb{ background: rgba(120,90,170,.18); border-radius: 999px; }

  .miniBtn{
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,.85);
    background: rgba(255,255,255,.75);
    padding: 6px 10px;
    cursor:pointer;
    font-size: 12px;
    font-weight: 800;
    flex: 0 0 auto;
  }
  .miniBtn:disabled{ opacity:.5; cursor:not-allowed; }
  .miniBtn.danger{
    background: rgba(255, 80, 120, .10);
    border: 1px solid rgba(255, 80, 120, .20);
  }

  .emptyState{
    background: rgba(255,255,255,.65);
    border: 1px solid rgba(255,255,255,.9);
    border-radius: 22px;
    box-shadow: var(--shadow2);
    padding: 26px 18px;
    text-align:center;
  }
  .emptyIcon{ font-size: 28px; }
  .emptyText{ margin-top: 6px; color: var(--muted); font-weight: 700; }
`;

