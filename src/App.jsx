import React, { useEffect, useMemo, useRef, useState } from "react";

// ✅ localStorage keys (절대 바꾸지 말기)
const LS_BOOKS = "bookshelf_books_v2";
const LS_VERSION = "bookshelf_schema_v2";

// ✅ 스키마 버전
const SCHEMA_VERSION = "v2";

// ✅ 앱 내 장르/상태 (원하면 여기만 수정)
const GENRES = ["로판", "로맨스", "판타지", "현대물", "무협", "SF", "추리", "에세이", "기타"];
const STATUSES = ["읽을 예정", "읽는 중", "읽음", "하차", "보류"];

// ✅ 유틸
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeText(v) {
  return (v ?? "").toString().trim();
}

function parseCSV(text) {
  // 아주 안정적인 “간단 CSV” 파서 (쉼표/탭 둘 다 지원, 큰따옴표 일부 지원)
  // 컬럼 예시: title,author,genre,status,platform,coverUrl,note
  const raw = (text ?? "").replace(/\r/g, "").trim();
  if (!raw) return [];

  const lines = raw.split("\n").filter(Boolean);
  if (lines.length === 0) return [];

  const splitLine = (line) => {
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
      } else if (!inQ && (ch === "," || ch === "\t")) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map(splitLine);

  const hasHeader = header.includes("title") || header.includes("제목");
  if (!hasHeader) {
    const all = lines.map(splitLine);
    return all.map((cols) => ({
      title: normalizeText(cols[0]),
      author: normalizeText(cols[1]),
      genre: normalizeText(cols[2]),
      status: normalizeText(cols[3]),
      platform: normalizeText(cols[4]),
      coverUrl: normalizeText(cols[5]),
      note: normalizeText(cols[6]),
    }));
  }

  const idx = (key, altKey) => {
    let i = header.indexOf(key);
    if (i === -1 && altKey) i = header.indexOf(altKey);
    return i;
  };

  const iTitle = idx("title", "제목");
  const iAuthor = idx("author", "작가");
  const iGenre = idx("genre", "장르");
  const iStatus = idx("status", "상태");
  const iPlatform = idx("platform", "플랫폼");
  const iCover = idx("coverurl", "표지");
  const iNote = idx("note", "메모");

  return rows.map((cols) => ({
    title: normalizeText(cols[iTitle] ?? cols[0]),
    author: normalizeText(cols[iAuthor] ?? ""),
    genre: normalizeText(cols[iGenre] ?? ""),
    status: normalizeText(cols[iStatus] ?? ""),
    platform: normalizeText(cols[iPlatform] ?? ""),
    coverUrl: normalizeText(cols[iCover] ?? ""),
    note: normalizeText(cols[iNote] ?? ""),
  }));
}

export default function App() {
  // ✅ 데이터 로드
  const [books, setBooks] = useState(() => {
    const ver = localStorage.getItem(LS_VERSION);
    const saved = safeJsonParse(localStorage.getItem(LS_BOOKS), []);
    if (ver !== SCHEMA_VERSION || !Array.isArray(saved)) return [];
    return saved;
  });

  // ✅ 저장
  useEffect(() => {
    localStorage.setItem(LS_VERSION, SCHEMA_VERSION);
    localStorage.setItem(LS_BOOKS, JSON.stringify(books));
  }, [books]);

  // ✅ 추가 폼 상태
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [status, setStatus] = useState(STATUSES[0]);
  const [platform, setPlatform] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [note, setNote] = useState("");

  // ✅ 검색/필터
  const [q, setQ] = useState("");
  const [filterGenre, setFilterGenre] = useState("전체");
  const [filterStatus, setFilterStatus] = useState("전체");
  const [sortKey, setSortKey] = useState("added_desc"); // added_desc, added_asc, title_asc

  // ✅ 대량 CSV 입력
  const [csvText, setCsvText] = useState("");
  const [csvMode, setCsvMode] = useState(false);

  // ✅ 백업/복원
  const fileInputRef = useRef(null);

  // ✅ 표지 업로드(로컬 파일 -> dataURL)
  const coverFileRef = useRef(null);

  const addOne = () => {
    const t = normalizeText(title);
    if (!t) return;

    const newBook = {
      id: uid(),
      title: t,
      author: normalizeText(author),
      genre: normalizeText(genre) || "기타",
      status: normalizeText(status) || "읽을 예정",
      platform: normalizeText(platform),
      coverUrl: normalizeText(coverUrl),
      note: normalizeText(note),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setBooks((prev) => [newBook, ...prev]);

    // 입력 초기화
    setTitle("");
    setAuthor("");
    setPlatform("");
    setCoverUrl("");
    setNote("");
  };

  const removeBook = (id) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
  };

  const updateBook = (id, patch) => {
    setBooks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b))
    );
  };

  const clearAll = () => {
    if (!confirm("정말 전체 삭제할까? (되돌리기 어려움)")) return;
    setBooks([]);
  };

  const exportJSON = () => {
    const payload = {
      schema: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      books,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookshelf_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSONFile = async (file) => {
    const text = await file.text();
    const data = safeJsonParse(text, null);
    if (!data || !Array.isArray(data.books)) {
      alert("이 파일은 백업 형식이 아닌 것 같아.");
      return;
    }
    if (!confirm(`백업에서 ${data.books.length}권을 불러올까? (현재 데이터는 덮어씀)`)) return;
    setBooks(data.books);
  };

  const importCSVNow = () => {
    const rows = parseCSV(csvText);
    const cleaned = rows
      .map((r) => ({
        id: uid(),
        title: normalizeText(r.title),
        author: normalizeText(r.author),
        genre: normalizeText(r.genre) || "기타",
        status: normalizeText(r.status) || "읽을 예정",
        platform: normalizeText(r.platform),
        coverUrl: normalizeText(r.coverUrl),
        note: normalizeText(r.note),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))
      .filter((r) => r.title);

    if (cleaned.length === 0) {
      alert("가져올 책이 없어. (title/제목 컬럼이 비었을 수 있어)");
      return;
    }
    setBooks((prev) => [...cleaned, ...prev]);
    setCsvText("");
    setCsvMode(false);
  };

  const onPickCoverFile = async (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      if (!confirm("파일이 좀 커(3MB+). 저장이 무거워질 수 있어. 그래도 할까?")) return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result?.toString() ?? "";
      if (dataUrl) setCoverUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const filtered = useMemo(() => {
    const qq = normalizeText(q).toLowerCase();
    let list = books;

    if (filterGenre !== "전체") list = list.filter((b) => (b.genre || "기타") === filterGenre);
    if (filterStatus !== "전체") list = list.filter((b) => (b.status || "읽을 예정") === filterStatus);

    if (qq) {
      list = list.filter((b) => {
        const hay = [b.title, b.author, b.genre, b.status, b.platform, b.note]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(qq);
      });
    }

    if (sortKey === "added_asc") {
      list = [...list].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    } else if (sortKey === "title_asc") {
      list = [...list].sort((a, b) => (a.title || "").localeCompare(b.title || "", "ko"));
    } else {
      list = [...list].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    }

    return list;
  }, [books, q, filterGenre, filterStatus, sortKey]);

  const genreOptions = useMemo(() => ["전체", ...GENRES], []);
  const statusOptions = useMemo(() => ["전체", ...STATUSES], []);

  return (
    <div className="app">
      <style>{css}</style>

      <header className="top">
        <div className="brand">
          <div className="logo">📚</div>
          <div>
            <div className="title">내 전자책 책장</div>
            <div className="sub">{books.length}권 저장됨 (자동 저장)</div>
          </div>
        </div>

        <div className="topActions">
          <button className="btn" onClick={exportJSON} title="백업(JSON)">
            백업
          </button>
          <button className="btn" onClick={() => fileInputRef.current?.click()} title="복원(JSON)">
            복원
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) importJSONFile(f);
            }}
          />
          <button className="btn danger" onClick={clearAll} title="전체 삭제">
            전체삭제
          </button>
        </div>
      </header>

      {/* ✅ 위쪽: 입력 영역 (변경 없음) */}
      <section className="panel">
        <div className="panelHead">
          <div className="panelTitle">빠른 추가</div>
          <div className="panelToggles">
            <button className={"chip " + (!csvMode ? "on" : "")} onClick={() => setCsvMode(false)}>
              1권씩
            </button>
            <button className={"chip " + (csvMode ? "on" : "")} onClick={() => setCsvMode(true)}>
              CSV 대량
            </button>
          </div>
        </div>

        {!csvMode ? (
          <div className="form">
            <div className="row">
              <label>
                제목*
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 향기로 치유하는 황녀님"
                />
              </label>
              <label>
                작가
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="예: 홍길동"
                />
              </label>
            </div>

            <div className="row">
              <label>
                장르
                <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                  {GENRES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                상태
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                플랫폼
                <input
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  placeholder="예: 카카오페이지"
                />
              </label>
            </div>

            <div className="row">
              <label className="grow">
                표지 URL (붙여넣기)
                <input
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://... 또는 이미지 dataURL"
                />
              </label>

              <div className="coverPick">
                <div className="coverPickLabel">표지 파일</div>
                <button className="btn" onClick={() => coverFileRef.current?.click()}>
                  업로드
                </button>
                <input
                  ref={coverFileRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) onPickCoverFile(f);
                  }}
                />
              </div>
            </div>

            <div className="row">
              <label className="grow">
                메모
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="예: 3권부터 재밌어짐 / 하차 사유 등"
                />
              </label>
              <button className="btn primary" onClick={addOne} disabled={!normalizeText(title)}>
                추가
              </button>
            </div>

            {coverUrl ? (
              <div className="previewRow">
                <div className="previewLabel">표지 미리보기</div>
                <div className="coverPreview">
                  <img
                    src={coverUrl}
                    alt="cover preview"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="csv">
            <div className="hint">
              구글시트에서 <b>파일 → 다운로드 → CSV</b> 하거나, 시트 내용을 그대로 복사해서 붙여넣어도 돼.
              <div className="mini">
                권장 헤더: <code>title,author,genre,status,platform,coverUrl,note</code>
              </div>
            </div>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`예시:
title,author,genre,status,platform,coverUrl,note
향기로 치유하는 황녀님,작가명,로판,읽는 중,카카오페이지,https://...,"2권부터 급상승"`}
            />
            <div className="csvActions">
              <button className="btn" onClick={() => { setCsvText(""); setCsvMode(false); }}>
                취소
              </button>
              <button className="btn primary" onClick={importCSVNow} disabled={!normalizeText(csvText)}>
                대량 추가
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ✅ 아래쪽: 책장 영역(선반 느낌은 여기만 적용) */}
      <section className="panel shelfPanel">
        <div className="controls">
          <input
            className="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색: 제목/작가/메모/플랫폼…"
          />
          <select value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)}>
            {genreOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="added_desc">최근 추가 순</option>
            <option value="added_asc">오래된 추가 순</option>
            <option value="title_asc">제목 가나다 순</option>
          </select>
        </div>

        <div className="grid">
          {filtered.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              onRemove={() => removeBook(b.id)}
              onUpdate={(patch) => updateBook(b.id, patch)}
            />
          ))}

          {filtered.length === 0 ? (
            <div className="empty">
              <div className="emptyIcon">🫧</div>
              <div className="emptyTitle">아직 책이 없어</div>
              <div className="emptySub">위에서 1권 추가 또는 CSV 대량 추가해줘.</div>
            </div>
          ) : null}
        </div>
      </section>

      <footer className="foot">
        <span>표지 URL은 이미지 주소가 바로 끝나는 게 안정적이야. (jpg/png/webp)</span>
      </footer>
    </div>
  );
}

function BookCard({ book, onRemove, onUpdate }) {
  const [edit, setEdit] = useState(false);
  const cardCoverRef = useRef(null);

  const onPickCardCover = (file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      if (!confirm("파일이 좀 커(3MB+). 저장이 무거워질 수 있어. 그래도 할까?")) return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result?.toString() ?? "";
      if (dataUrl) onUpdate({ coverUrl: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const g = book.genre || "기타";
  const s = book.status || "읽을 예정";

  return (
    <div className="card">
      <div
        className="coverWrap"
        onClick={() => cardCoverRef.current?.click()}
        title="표지 클릭해서 추가/변경"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") cardCoverRef.current?.click();
        }}
      >
        {book.coverUrl ? (
          <img
            className="coverImg"
            src={book.coverUrl}
            alt={book.title}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="coverFallback">
            <div className="coverEmoji">📘</div>
            <div className="coverHint">표지 없음 (클릭)</div>
          </div>
        )}

        <input
          ref={cardCoverRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPickCardCover(f);
          }}
        />
      </div>

      <div className="meta">
        <div className="metaTop">
          <div className="name" title={book.title}>
            {book.title}
          </div>
          <button className="iconBtn" onClick={() => setEdit((v) => !v)} title="편집">
            ✏️
          </button>
        </div>

        <div className="line">
          <span className="pill">{g}</span>
          <span className={"pill " + statusClass(s)}>{s}</span>
        </div>

        {book.author ? <div className="small">작가: {book.author}</div> : null}
        {book.platform ? <div className="small">플랫폼: {book.platform}</div> : null}
        {book.note ? (
          <div className="note" title={book.note}>
            {book.note}
          </div>
        ) : null}

        {edit ? (
          <div className="editBox">
            <label className="editRow">
              상태
              <select value={s} onChange={(e) => onUpdate({ status: e.target.value })}>
                {STATUSES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>

            <label className="editRow">
              장르
              <select value={g} onChange={(e) => onUpdate({ genre: e.target.value })}>
                {GENRES.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>

            <label className="editRow">
              표지 URL
              <input
                value={book.coverUrl || ""}
                onChange={(e) => onUpdate({ coverUrl: e.target.value })}
                placeholder="https://..."
              />
            </label>

            <label className="editRow">
              메모
              <input
                value={book.note || ""}
                onChange={(e) => onUpdate({ note: e.target.value })}
                placeholder="짧게"
              />
            </label>

            <div className="editActions">
              <button className="btn danger" onClick={onRemove}>
                삭제
              </button>
              <button className="btn" onClick={() => setEdit(false)}>
                닫기
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function statusClass(s) {
  if (s === "읽음") return "stDone";
  if (s === "읽는 중") return "stNow";
  if (s === "하차") return "stDrop";
  if (s === "보류") return "stHold";
  return "stPlan";
}

const css = `
  :root{
    --bg1:#f7f2ff;
    --bg2:#efe9ff;
    --card:#ffffffcc;
    --line:#e6ddff;
    --ink:#1c1b22;
    --muted:#6b6880;
    --shadow: 0 10px 30px rgba(34, 20, 80, .12);
    --radius: 18px;
  }

  *{ box-sizing:border-box; }
  body{
    margin:0;
    background: radial-gradient(1200px 600px at 20% 0%, var(--bg2), var(--bg1));
    color:var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Apple SD Gothic Neo", "Noto Sans KR", Arial;
  }

  .app{
    max-width: 1100px;
    margin: 0 auto;
    padding: 18px 14px 40px;
  }

  .top{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    padding: 10px 6px 16px;
  }

  .brand{
    display:flex;
    gap:10px;
    align-items:center;
  }
  .logo{
    width:44px; height:44px;
    border-radius:14px;
    display:grid;
    place-items:center;
    background: linear-gradient(180deg, rgba(180,140,255,.35), rgba(255,255,255,.75));
    border: 1px solid rgba(255,255,255,.9);
    box-shadow: var(--shadow);
    font-size: 22px;
  }
  .title{ font-weight: 800; font-size: 18px; letter-spacing:-.2px; }
  .sub{ color: var(--muted); font-size: 12px; margin-top:2px; }

  .topActions{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  .btn{
    border:1px solid rgba(255,255,255,.9);
    background: rgba(255,255,255,.72);
    padding: 9px 12px;
    border-radius: 14px;
    cursor:pointer;
    box-shadow: 0 6px 18px rgba(34, 20, 80, .10);
    transition: transform .05s ease;
    font-weight: 700;
  }
  .btn:active{ transform: scale(.98); }
  .btn.primary{
    background: linear-gradient(180deg, rgba(165,120,255,.55), rgba(255,255,255,.8));
    border-color: rgba(165,120,255,.25);
  }
  .btn.danger{
    background: rgba(255, 230, 236, .9);
    border-color: rgba(255, 170, 190, .55);
  }
  .btn:disabled{
    opacity: .55;
    cursor:not-allowed;
  }

  .panel{
    background: rgba(255,255,255,.55);
    border: 1px solid rgba(255,255,255,.8);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 14px;
    margin-bottom: 12px;
    backdrop-filter: blur(10px);
  }

  .panelHead{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    margin-bottom: 10px;
  }
  .panelTitle{ font-weight: 900; }
  .panelToggles{ display:flex; gap:8px; }
  .chip{
    border: 1px solid rgba(255,255,255,.9);
    background: rgba(255,255,255,.65);
    padding: 7px 10px;
    border-radius: 999px;
    cursor:pointer;
    font-weight: 800;
    color: var(--muted);
  }
  .chip.on{
    color: var(--ink);
    background: rgba(210,180,255,.45);
    border-color: rgba(190,155,255,.45);
  }

  .form .row{
    display:flex;
    gap:10px;
    margin-bottom: 10px;
    flex-wrap:wrap;
  }
  label{
    display:flex;
    flex-direction:column;
    gap:6px;
    font-size: 12px;
    color: var(--muted);
    font-weight: 800;
    min-width: 160px;
    flex: 1;
  }
  label.grow{ flex: 2; min-width: 240px; }
  input, select, textarea{
    border: 1px solid rgba(160,140,210,.35);
    border-radius: 14px;
    padding: 10px 12px;
    background: rgba(255,255,255,.75);
    outline: none;
    font-size: 14px;
    color: var(--ink);
  }
  textarea{ min-height: 160px; resize: vertical; }

  .coverPick{
    display:flex;
    align-items:flex-end;
    gap:8px;
    padding-bottom: 2px;
  }
  .coverPickLabel{
    font-size:12px;
    color: var(--muted);
    font-weight: 900;
    padding: 0 2px 8px;
  }

  .previewRow{
    display:flex;
    align-items:center;
    gap:12px;
    margin-top: 6px;
  }
  .previewLabel{ font-size:12px; color: var(--muted); font-weight: 900; }
  .coverPreview{
    width: 72px;
    aspect-ratio: 3/4;
    border-radius: 14px;
    overflow:hidden;
    border: 1px solid rgba(160,140,210,.35);
    background: rgba(255,255,255,.75);
  }
  .coverPreview img{
    width:100%; height:100%; object-fit: cover; display:block;
  }

  .csv .hint{
    font-size: 13px;
    color: var(--ink);
    margin-bottom: 10px;
  }
  .csv .mini{ color: var(--muted); margin-top: 6px; font-size: 12px; }
  .csvActions{
    display:flex;
    justify-content:flex-end;
    gap:10px;
    margin-top: 10px;
  }

  .controls{
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    align-items:center;
  }
  .search{
    flex: 2;
    min-width: 220px;
  }

  .grid{
    margin-top: 12px;
    display:grid;
    gap: 40px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: 720px){
    .grid{ grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (min-width: 980px){
    .grid{ grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }
  @media (min-width: 1180px){
    .grid{ grid-template-columns: repeat(5, minmax(0, 1fr)); }
  }

  /* ✅ 카드: 제목 길어도 높이 안정 + 호버시 살짝 부풀어오름 */
  .card{
    overflow:hidden;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,.85);
    background: rgba(255,255,255,.65);
    box-shadow: 0 8px 22px rgba(34, 20, 80, .10);
    transition: transform .12s ease, box-shadow .12s ease;
    transform: translateZ(0);
  }
  .card:hover{
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 12px 30px rgba(34, 20, 80, .16);
  }
.card{
  transition: transform .12s ease, box-shadow .12s ease;
}

.card:hover{
  transform: translateY(-3px) scale(1.02);
  box-shadow: 0 14px 34px rgba(34, 20, 80, .18);
}
  .coverWrap{
    width:100%;
    aspect-ratio: 3 / 4;
    background: linear-gradient(180deg, rgba(210,190,255,.55), rgba(255,255,255,.75));
    border-bottom: 1px solid rgba(255,255,255,.85);
    display:grid;
    place-items:center;
    position:relative;
  }
  .coverImg{
    width:100%;
    height:100%;
    object-fit: cover;
    display:block;
  }
  .coverFallback{
    text-align:center;
    color: rgba(70,60,110,.8);
    font-weight: 900;
  }
  .coverEmoji{ font-size: 26px; }
  .coverHint{ font-size: 12px; margin-top: 6px; }

  .meta{
    padding: 10px 10px 12px;
  }
  .metaTop{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:8px;
  }
  .name{
    font-weight: 1000;
    letter-spacing: -0.2px;
    line-height: 1.15;
    font-size: 14px;
    display:-webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow:hidden;
    min-height: 34px; /* ✅ 제목 길어도 카드 높이 흔들림 방지 */
  }
  .iconBtn{
    border: 1px solid rgba(160,140,210,.35);
    background: rgba(255,255,255,.75);
    border-radius: 12px;
    padding: 6px 8px;
    cursor:pointer;
  }

  .line{
    display:flex;
    gap:6px;
    flex-wrap:wrap;
    margin: 8px 0 6px;
  }
  .pill{
    font-size: 11px;
    padding: 5px 8px;
    border-radius: 999px;
    background: rgba(255,255,255,.72);
    border: 1px solid rgba(160,140,210,.25);
    color: rgba(60,55,85,.92);
    font-weight: 900;
  }

  .stPlan{ background: rgba(240,235,255,.9); }
  .stNow{ background: rgba(220,245,255,.9); }
  .stDone{ background: rgba(225,255,235,.9); }
  .stDrop{ background: rgba(255,235,240,.9); }
  .stHold{ background: rgba(255,250,225,.9); }

  .small{
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
    font-weight: 700;
  }
  .note{
    margin-top: 6px;
    font-size: 12px;
    color: rgba(40,36,60,.92);
    background: rgba(255,255,255,.55);
    border: 1px dashed rgba(160,140,210,.35);
    padding: 8px 10px;
    border-radius: 14px;
    display:-webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow:hidden;
    min-height: 44px; /* ✅ 메모 유무로 카드 높이 흔들림 방지 */
  }

  .editBox{
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(160,140,210,.22);
    display:flex;
    flex-direction:column;
    gap:8px;
  }
  .editRow{
    display:flex;
    flex-direction:column;
    gap:6px;
    font-size: 12px;
    color: var(--muted);
    font-weight: 900;
  }
  .editActions{
    display:flex;
    gap:8px;
    justify-content:flex-end;
    margin-top: 4px;
  }

  .empty{
    grid-column: 1 / -1;
    text-align:center;
    padding: 26px 10px;
    color: var(--muted);
  }
  .emptyIcon{ font-size: 28px; }
  .emptyTitle{ font-weight: 1000; margin-top: 6px; color: var(--ink); }
  .emptySub{ margin-top: 4px; font-size: 13px; }

  .foot{
    margin-top: 10px;
    text-align:center;
    color: var(--muted);
    font-size: 12px;
    padding: 6px;
  }

  /* ===== 책장(선반) 느낌: 아래 책장 영역만 ===== */
  .shelfPanel{
    background: linear-gradient(180deg, rgba(255,255,255,.55), rgba(245,238,255,.75));
    border: 1px solid rgba(255,255,255,.85);
  }

  .shelfPanel .grid{
  padding-bottom: 60px;
    position: relative;
    padding: 12px 8px 60px; /* ✅ 선반 그림자 여유 */
    border-radius: 18px;
    gap: 44px;
    background:
      repeating-linear-gradient(
        to bottom,
        rgba(120, 90, 200, .10) 0px,
        rgba(120, 90, 200, .10) 2px,
        transparent 2px,
        transparent 380px
      );
  }

  .shelfPanel .card{
    position: relative;
  }

  .shelfPanel .card::after{
    content:"";
    position:absolute;
    left:10px; right:10px;
    bottom:-14px;
    height:14px;
    border-radius:999px;
    background: rgba(80, 60, 140, .16);
    filter: blur(1px);
    pointer-events:none;
  }

  .shelfPanel .card::before{
    content:"";
    position:absolute;
    left:-6px; right:-6px;
    bottom:-22px;
    height:10px;
    border-radius: 12px;
    background: rgba(140, 110, 220, .18);
    border: 1px solid rgba(255,255,255,.55);
    pointer-events:none;
  }
  

`;