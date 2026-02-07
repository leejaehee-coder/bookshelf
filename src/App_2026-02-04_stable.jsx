import React, { useEffect, useMemo, useRef, useState } from "react";

// ✅ localStorage keys (절대 바꾸지 말기)
const LS_BOOKS = "bookshelf_books_v2";
const LS_VERSION = "bookshelf_schema_v2";

// ✅ 샘플 초기 데이터(원하면 비워도 됨). 구글시트 업로드로 대체 가능.
const SEED_BOOKS = [];

const GENRES = ["로판", "로맨스", "판타지", "현대물", "무협", "SF", "추리", "에세이", "기타"];
const STATUSES = ["읽을 예정", "읽는 중", "읽음", "보류"];

function safeJsonParse(str, fallback) {
  try {
    if (str == null) return fallback;
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

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { rows: [], errors: ["붙여넣을 내용이 비어있어요."] };

  const delim = lines[0].includes("\t") ? "\t" : ",";

  const splitLine = (line) => {
    if (delim === "\t") return line.split("\t");
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
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

    if (!title) continue;

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

function DetailModal({ book, onClose, onUpdate, onDelete }) {
  // Esc로 닫기
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!book) return null;

  return (
    <div className="modalBackdrop" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <div className="modalTitle">📘 책 상세</div>
          <button className="iconBtn" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>

        <div className="modalBody">
          <div className="modalGrid">
            <div className="field">
              <label className="label">제목</label>
              <input className="input" value={book.title} onChange={(e) => onUpdate({ title: e.target.value })} />
            </div>
            <div className="field">
              <label className="label">작가</label>
              <input
                className="input"
                value={book.author || ""}
                onChange={(e) => onUpdate({ author: e.target.value })}
                placeholder="작가 미입력"
              />
            </div>

            <div className="field">
              <label className="label">장르</label>
              <select className="select" value={book.genre || "기타"} onChange={(e) => onUpdate({ genre: e.target.value })}>
                {[...new Set([...GENRES, book.genre].filter(Boolean))].map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">상태</label>
              <select className="select" value={book.status || "읽을 예정"} onChange={(e) => onUpdate({ status: e.target.value })}>
                {[...new Set([...STATUSES, book.status].filter(Boolean))].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label className="label">나의 감상 / 메모</label>
            <textarea
              className="textarea"
              rows={8}
              value={book.notes || ""}
              onChange={(e) => onUpdate({ notes: e.target.value })}
              placeholder="예) 인상 깊었던 장면, 캐릭터, 문장, 다음에 읽을 때 기억할 포인트..."
            />
            <div className="smallHint">자동 저장돼요. (책장 데이터와 함께 localStorage에 저장)</div>
          </div>

          <div className="modalActions">
            <button className="btn btnDangerGhost" onClick={onDelete}>
              이 책 삭제
            </button>
            <button className="btn" onClick={onClose}>
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ✅ 책 객체 정규화(구버전/필드 누락/cover키명 다양성 흡수)
function normalizeBook(b) {
  return {
    id: b?.id ?? crypto.randomUUID(),
    title: normalizeText(b?.title ?? ""),
    author: normalizeText(b?.author ?? ""),
    genre: normalizeText(b?.genre ?? "기타") || "기타",
    status: normalizeText(b?.status ?? "읽을 예정") || "읽을 예정",
    coverDataUrl: b?.coverDataUrl ?? b?.cover ?? "",
    notes: b?.notes ?? "",
  };
}

// ✅ 로딩: schema 없어도 books 배열이 있으면 그걸 최우선으로 살림
function loadBooksFromStorage() {
  const rawV2 = safeJsonParse(localStorage.getItem(LS_BOOKS), null);
  if (Array.isArray(rawV2)) return rawV2.map(normalizeBook);

  // legacy 키 흡수(추가로 많이 찾음)
  const legacyKeys = ["bookshelf_books", "books", "bookshelf_books_v1", "bookshelf_edits_v1"];
  for (const k of legacyKeys) {
    const raw = safeJsonParse(localStorage.getItem(k), null);
    if (Array.isArray(raw) && raw.length) {
      const migrated = raw.map(normalizeBook);
      // v2로 승격 저장
      try {
        localStorage.setItem(LS_VERSION, "2");
        localStorage.setItem(LS_BOOKS, JSON.stringify(migrated));
      } catch {
        // 저장 실패는 아래 저장 useEffect에서 사용자에게 표시
      }
      return migrated;
    }
  }

  // 아무것도 없으면 seed
  const seed = Array.isArray(SEED_BOOKS) ? SEED_BOOKS : [];
  return seed.map(normalizeBook);
}

export default function App() {
  // ✅ 최초 로드는 useState 초기화로(개발모드 effect 2번에도 안전)
  const [books, setBooks] = useState(() => loadBooksFromStorage());

  const [query, setQuery] = useState("");
  const [filterGenre, setFilterGenre] = useState("전체");
  const [filterStatus, setFilterStatus] = useState("전체");

  // 단권 추가 폼
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState("로판");
  const [status, setStatus] = useState("읽을 예정");

  // 대량 업로드
  const [sheetText, setSheetText] = useState("");
  const [sheetErrors, setSheetErrors] = useState([]);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // 표지 업로드 input
  const coverInputRef = useRef(null);
  const [pendingCoverBookId, setPendingCoverBookId] = useState(null);

  // ✅ 상세 모달
  const [selectedBookId, setSelectedBookId] = useState(null);

  // ✅ 백업/복구 input
  const backupInputRef = useRef(null);

  // ✅ 저장 상태(용량 초과/권한 문제 등 사용자에게 표시)
  const [saveError, setSaveError] = useState("");

  // ✅ 저장(try/catch + 에러표시)
  useEffect(() => {
    try {
      localStorage.setItem(LS_VERSION, "2");
      localStorage.setItem(LS_BOOKS, JSON.stringify(books));
      setSaveError("");
    } catch (e) {
      // 보통 QUOTA_EXCEEDED_ERR (표지 base64가 많으면 특히)
      setSaveError("저장 실패(용량 부족 가능). JSON 백업을 먼저 해주세요.");
      // 콘솔 로그는 개발 때만 도움
      // eslint-disable-next-line no-console
      console.error("Save failed:", e);
    }
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
        (b.status ?? "").toLowerCase().includes(q) ||
        (b.notes ?? "").toLowerCase().includes(q);

      const okG = filterGenre === "전체" || b.genre === filterGenre;
      const okS = filterStatus === "전체" || b.status === filterStatus;

      return okQ && okG && okS;
    });
  }, [books, query, filterGenre, filterStatus]);

  const selectedBook = useMemo(() => books.find((b) => b.id === selectedBookId) || null, [books, selectedBookId]);

  function addOneBook() {
    const t = normalizeText(title);
    if (!t) return;

    const newBook = normalizeBook({
      id: crypto.randomUUID(),
      title: t,
      author: normalizeText(author),
      genre: normalizeText(genre) || "기타",
      status: normalizeText(status) || "읽을 예정",
      coverDataUrl: "",
      notes: "",
    });

    setBooks((prev) => [newBook, ...prev]);

    setTitle("");
    setAuthor("");
    setGenre("로판");
    setStatus("읽을 예정");
  }

  function openCoverPicker(bookId) {
    setPendingCoverBookId(bookId);
    if (coverInputRef.current) coverInputRef.current.click();
  }

  function onCoverFileChange(e) {
    const file = e.target.files?.[0];
    if (!file || !pendingCoverBookId) return;

    if (!file.type.startsWith("image/")) {
      alert("이미지 파일만 선택할 수 있어요.");
      e.target.value = "";
      setPendingCoverBookId(null);
      return;
    }

    // ✅ base64(Data URL)로 저장: 재접속해도 깨지지 않음
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      setBooks((prev) => prev.map((b) => (b.id === pendingCoverBookId ? { ...b, coverDataUrl: dataUrl } : b)));
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
    setSelectedBookId((cur) => (cur === bookId ? null : cur));
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

    const imported = rows.map((r) =>
      normalizeBook({
        id: crypto.randomUUID(),
        title: r.title,
        author: r.author,
        genre: r.genre || "기타",
        status: r.status || "읽을 예정",
        coverDataUrl: "",
        notes: "",
      })
    );

    setBooks((prev) => [...imported, ...prev]);

    setSheetText("");
    setIsImportOpen(false);
  }

  function wipeAll() {
    const ok = confirm("책장 데이터를 전부 삭제할까요? (되돌리기 어려워요)");
    if (!ok) return;
    setBooks([]);
    setSelectedBookId(null);
  }

  // ✅ JSON 백업(표지 포함)
  function exportBackup() {
    const payload = {
      app: "bookshelf",
      schema: 2,
      exportedAt: new Date().toISOString(),
      books,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `bookshelf-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  function openImportBackup() {
    if (backupInputRef.current) backupInputRef.current.click();
  }

  async function onBackupFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = safeJsonParse(text, null);

      // 형식 A: {books:[...]}
      if (data && Array.isArray(data.books)) {
        const next = data.books.map(normalizeBook);
        setBooks(next);
        alert("백업 복구 완료!");
      } else {
        // 형식 B: 배열만 저장된 json
        const arr = safeJsonParse(text, null);
        if (Array.isArray(arr)) {
          const next = arr.map(normalizeBook);
          setBooks(next);
          alert("백업 복구 완료!");
        } else {
          alert("백업 파일 형식이 올바르지 않아요. (.json) 파일을 확인해줘.");
        }
      }
    } catch (err) {
      alert("백업 파일을 읽는 중 오류가 났어요. 파일을 다시 확인해줘.");
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="logo">📚</div>
          <div className="brandText">
            <div className="title">내 전자책 책장</div>
            <div className="subtitle">구글시트로 한꺼번에 넣고, 책을 눌러 감상 메모까지</div>
          </div>
        </div>

        <div className="topActions">
          <button className="btn btnGhost" onClick={() => setIsImportOpen((v) => !v)}>
            {isImportOpen ? "대량 업로드 닫기" : "구글시트 대량 업로드"}
          </button>

          {/* ✅ 백업/복구 버튼 추가 (UI 훼손 최소) */}
          <button className="btn btnGhost" onClick={exportBackup} title="표지 포함 백업(.json) 저장">
            백업
          </button>
          <button className="btn btnGhost" onClick={openImportBackup} title="백업(.json) 불러오기">
            복구
          </button>

          <button className="btn btnDangerGhost" onClick={wipeAll} title="전체 삭제">
            전체 삭제
          </button>

          {/* ✅ 저장 실패 표시 */}
          {saveError && (
            <div className="saveWarn" title="표지가 많으면 localStorage 용량이 부족할 수 있어요. JSON 백업을 권장해요.">
              ⚠️ {saveError}
            </div>
          )}
        </div>
      </header>

      <main className="content">
        {isImportOpen && (
          <section className="panel">
            <div className="panelHead">
              <div className="panelTitle">구글시트 대량 입력 (연동 아님)</div>
              <div className="panelDesc">
                시트에서 <b>헤더 포함</b>으로 복사해서 붙여넣기.
                <span className="hint"> (지원 헤더: 제목/제목(title), 저자(author), 장르(genre), 상태(status))</span>
              </div>
            </div>

            <textarea
              className="textarea"
              value={sheetText}
              onChange={(e) => setSheetText(e.target.value)}
              rows={7}
              placeholder={`예시(탭/CSV 모두 가능):
title	author	genre	status
향기로 치유하는 황녀님	홍길동	로판	읽을 예정`}
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

        <section className="panel compact">
          <div className="filters">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색: 제목, 작가, 장르, 상태, 메모"
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

        <section className="panel">
          <div className="panelHead">
            <div className="panelTitle">책 1권 추가</div>
            <div className="panelDesc">추가 즉시 책장에 반영되고, 자동 저장돼요.</div>
          </div>

          <div className="formGrid">
            <div className="field">
              <label className="label">제목 *</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label className="label">작가</label>
              <input className="input" value={author} onChange={(e) => setAuthor(e.target.value)} />
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
                  {/* 표지는 표지 업로드 */}
                  <button
                    className="coverButton"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCoverPicker(b.id);
                    }}
                    title="표지 업로드/변경"
                  >
                    <BookCover coverDataUrl={b.coverDataUrl} title={b.title} />
                  </button>

                  {/* ✅ 본문 영역 클릭 = 상세 모달 */}
                  <button className="metaButton" onClick={() => setSelectedBookId(b.id)} title="상세 열기 (메모 작성)">
                    <div className="meta">
                      <div className="bookTitle" title={b.title}>
                        {b.title}
                      </div>
                      <div className="bookSub" title={b.author || ""}>
                        {b.author ? b.author : "작가 미입력"}
                      </div>

                      <div className="chips">
                        <span className="chipPill">{b.genre || "기타"}</span>
                        <span className="chipPill">{b.status || "읽을 예정"}</span>
                        {b.notes && <span className="chipPill notePill">메모 있음</span>}
                      </div>

                      <div className="rowActions" onClick={(e) => e.stopPropagation()}>
                        <button className="miniBtn" onClick={() => setSelectedBookId(b.id)}>
                          상세
                        </button>
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
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <input ref={coverInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onCoverFileChange} />

        {/* ✅ 백업 복구용 input */}
        <input
          ref={backupInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={onBackupFileChange}
        />
      </main>

      <DetailModal
        book={selectedBook}
        onClose={() => setSelectedBookId(null)}
        onUpdate={(patch) => selectedBook && updateBook(selectedBook.id, patch)}
        onDelete={() => selectedBook && removeBook(selectedBook.id)}
      />

      <style>{css}</style>
    </div>
  );
}

// ✅ 파스텔 연보라 책장 + 반응형 5/4/3/2 + 카드 높이 균일 + 상세 모달 스타일 포함
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
    flex-wrap: wrap;
    align-items:center;
  }

  .saveWarn{
    background: rgba(255, 180, 60, .16);
    border: 1px solid rgba(255, 180, 60, .28);
    color: rgba(120, 70, 10, .95);
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
    box-shadow: var(--shadow2);
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

  .smallHint{
    margin-top: 6px;
    font-size: 12px;
    color: var(--muted);
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

  .grid{
    --cols: 5;
    display:grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 14px;
    align-items: stretch;
  }

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

  .card{
    background: rgba(255,255,255,.78);
    border: 1px solid rgba(255,255,255,.90);
    border-radius: 20px;
    box-shadow: var(--shadow2);
    overflow:hidden;
    display:flex;
    flex-direction:column;
    min-width:0;
    height: 100%;
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
    aspect-ratio: 3 / 4;
    background: linear-gradient(180deg, rgba(210,190,255,.55), rgba(255,255,255,.75));
    border-bottom: 1px solid rgba(255,255,255,.85);
    display:grid;
    place-items:center;
  }
  /* ✅ 표지 hover(튀어오름): 데스크톱에서만 */
  .coverWrap,
  .coverImg,
  .coverPlaceholder{
    transition: transform .16s ease, box-shadow .16s ease;
    will-change: transform;
  }

  @media (hover: hover) and (pointer: fine){
    .card:hover .coverWrap{
      transform: translateY(-6px);
      box-shadow: 0 10px 22px rgba(40, 20, 70, .18);
    }

    /* 이미지가 있을 때도 더 자연스럽게 */
    .card:hover .coverImg{
      transform: scale(1.01);
    }
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

  /* ✅ meta 전체를 버튼으로 만들어 상세로 들어가게 */
  .metaButton{
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }

  .meta{
    padding: 12px;
    display:flex;
    flex-direction:column;
    gap: 8px;
    min-width:0;
    flex: 1 1 auto;
  }

  .bookTitle{
    font-weight: 900;
    letter-spacing: -0.2px;
    line-height: 1.15;
    display:-webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow:hidden;
    min-height: 2.35em;
  }

  .bookSub{
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    overflow:hidden;
    text-overflow: ellipsis;
    min-height: 1.2em;
  }

  .chips{
    display:flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .chipPill{
    border-radius: 999px;
    border: 1px solid rgba(120,90,170,.20);
    background: rgba(255,255,255,.75);
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 800;
    color: rgba(60,40,95,.95);
  }

  .notePill{
    background: rgba(210,190,255,.55);
  }

  .rowActions{
    display:flex;
    gap: 8px;
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 2px;
    margin-top: auto;
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

  /* ✅ 상세 모달 */
  .modalBackdrop{
    position: fixed;
    inset: 0;
    background: rgba(20, 10, 40, .35);
    display: grid;
    place-items: center;
    padding: 16px;
    z-index: 999;
  }

  .modal{
    width: min(820px, 100%);
    background: rgba(255,255,255,.92);
    border: 1px solid rgba(255,255,255,.9);
    border-radius: 22px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }

  .modalHeader{
    display:flex;
    align-items:center;
    justify-content: space-between;
    padding: 14px 14px;
    border-bottom: 1px solid rgba(120,90,170,.12);
    background: linear-gradient(180deg, rgba(255,255,255,.85), rgba(255,255,255,.65));
  }

  .modalTitle{
    font-weight: 900;
    letter-spacing: -0.2px;
  }

  .iconBtn{
    border: 1px solid rgba(255,255,255,.9);
    background: rgba(255,255,255,.7);
    border-radius: 12px;
    padding: 8px 10px;
    cursor: pointer;
    box-shadow: var(--shadow2);
  }

  .modalBody{
    padding: 14px;
  }

  .modalGrid{
    display:grid;
    grid-template-columns: 1.4fr 1fr 180px 180px;
    gap: 10px;
  }

  @media (max-width: 820px){
    .modalGrid{
      grid-template-columns: 1fr 1fr;
    }
  }

  .modalActions{
    display:flex;
    gap: 10px;
    justify-content: flex-end;
    flex-wrap: wrap;
    margin-top: 12px;
  }
`;
