import { useEffect, useMemo, useState } from "react";
import { fetchBooksFromSheet } from "./services/booksApi";

function safeKey(book) {
  // 같은 제목이 있을 수 있으니 author까지 포함 (없으면 빈 문자열)
  return `${book.title || ""}__${book.author || ""}`.trim();
}

function loadLocalEdits() {
  try {
    const raw = localStorage.getItem("bookshelf_edits_v1");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalEdits(edits) {
  localStorage.setItem("bookshelf_edits_v1", JSON.stringify(edits));
}

export default function App() {
  const [books, setBooks] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ok | error
  const [error, setError] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("전체");
  const [query, setQuery] = useState("");
  const [edits, setEdits] = useState(() => loadLocalEdits());
  const [activeKey, setActiveKey] = useState(null); // 모달에서 열려있는 책 key

  async function refresh() {
    try {
      setStatus("loading");
      setError("");
      const data = await fetchBooksFromSheet();
      setBooks(data);
      setStatus("ok");
    } catch (e) {
      setError(String(e));
      setStatus("error");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 시트에서 가져온 book + 로컬 편집(별점/메모) 합치기
  const mergedBooks = useMemo(() => {
    return books.map((b) => {
      const key = safeKey(b);
      const local = edits[key] || {};
      const rating =
        local.rating ?? b.rating ?? b.별점 ?? ""; // 시트에 rating 컬럼이 있으면 자동 반영
      const note = local.note ?? b.note ?? b.memo ?? b.메모 ?? "";
      return { ...b, _key: key, rating, note };
    });
  }, [books, edits]);

  const genres = useMemo(() => {
    const list = Array.from(
      new Set(mergedBooks.map((b) => b.genre).filter(Boolean))
    );
    return ["전체", ...list];
  }, [mergedBooks]);

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();

    let arr = mergedBooks;

    // 장르 필터
    if (selectedGenre !== "전체") {
      arr = arr.filter((b) => b.genre === selectedGenre);
    }

    // 검색 (제목/저자/장르/메모까지)
    if (q) {
      arr = arr.filter((b) => {
        const hay = `${b.title || ""} ${b.author || ""} ${b.genre || ""} ${
          b.note || ""
        }`.toLowerCase();
        return hay.includes(q);
      });
    }

    return arr;
  }, [mergedBooks, selectedGenre, query]);

  const activeBook = useMemo(() => {
    if (!activeKey) return null;
    return mergedBooks.find((b) => b._key === activeKey) || null;
  }, [activeKey, mergedBooks]);

  function setRating(key, value) {
    const next = { ...edits, [key]: { ...(edits[key] || {}), rating: value } };
    setEdits(next);
    saveLocalEdits(next);
  }

  function setNote(key, value) {
    const next = { ...edits, [key]: { ...(edits[key] || {}), note: value } };
    setEdits(next);
    saveLocalEdits(next);
  }

  function closeModal() {
    setActiveKey(null);
  }

  if (status === "loading") {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui" }}>
        불러오는 중...
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ padding: 16, fontFamily: "system-ui", color: "crimson" }}>
        불러오기 실패<br />
        <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
        <button
          onClick={refresh}
          style={{
            marginTop: 12,
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <style>{`
        /* 🪵 나무 책장 배경 (이미지 없이도 분위기 나는 패턴) */
        .page{
          min-height: 100vh;
          padding: 18px 16px 40px;
          font-family: system-ui;
          background:
            radial-gradient(1200px 800px at 20% 0%, rgba(255,255,255,.35), rgba(255,255,255,0)),
            repeating-linear-gradient(
              90deg,
              #6a4b2a 0px,
              #6a4b2a 18px,
              #5f4326 18px,
              #5f4326 36px
            );
        }

        .panel{
          max-width: 1600px;
          margin: 0 auto;
          background: rgba(255,255,255,.86);
          border: 1px solid rgba(0,0,0,.08);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 18px 40px rgba(0,0,0,.18);
          backdrop-filter: blur(4px);
        }

        .topRow{
          display:flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .title{
          font-weight: 900;
          font-size: 22px;
          margin: 0;
        }

        .controls{
          display:flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items:center;
        }

        .search{
          padding: 9px 12px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,.18);
          min-width: 240px;
          outline: none;
          background: rgba(255,255,255,.95);
        }

        .btn{
          padding: 9px 12px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,.18);
          background: rgba(255,255,255,.95);
          cursor: pointer;
        }

        .genreBar{
          display:flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 10px 0 12px;
        }

        .chip{
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,.16);
          background: rgba(255,255,255,.92);
          cursor: pointer;
          font-size: 13px;
        }
        .chipActive{
          background: #222;
          color: #fff;
          border-color: #222;
        }

        .count{
          margin: 0 0 10px 0;
          color:#333;
          font-size: 13px;
        }

        /* 📚 책장(커버 중심) */
        .shelfWrap{
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 16px;
          align-items: start;
        }

        .book{
          border-radius: 16px;
          background: white;
          border: 1px solid rgba(0,0,0,.10);
          overflow: hidden;
          box-shadow: 0 12px 26px rgba(0,0,0,.14);
          transition: transform .16s ease, box-shadow .16s ease;
          cursor: pointer;
        }
        .book:hover{
          transform: translateY(-6px);
          box-shadow: 0 18px 36px rgba(0,0,0,.20);
        }

        .coverFrame{
          position: relative;
          width: 100%;
          aspect-ratio: 3 / 4;
          background: #f1f1f1;
          overflow: hidden;
        }
        .coverImg{
          width: 100%;
          height: 100%;
          object-fit: cover;
          display:block;
        }
        .spine{
          position: absolute;
          left: 0;
          top: 0;
          width: 14px;
          height: 100%;
          background: linear-gradient(to right, rgba(0,0,0,.25), rgba(0,0,0,0));
          pointer-events:none;
        }
        .shine{
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,.35), rgba(255,255,255,0) 42%);
          pointer-events:none;
        }

        .meta{
          padding: 10px 12px 12px;
        }
        .t{
          font-weight: 900;
          font-size: 14px;
          margin: 0 0 6px 0;
          line-height: 1.22;
        }
        .s{
          margin: 0;
          font-size: 12px;
          color: #555;
          line-height: 1.35;
        }
        .row{
          display:flex;
          gap: 8px;
          align-items:center;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .pill{
          display:inline-block;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,.12);
          background: rgba(0,0,0,.04);
        }

        /* ⭐ 별점 표시 */
        .stars{
          font-size: 12px;
          color: #333;
          border: 1px solid rgba(0,0,0,.12);
          background: rgba(255,255,255,.9);
          border-radius: 999px;
          padding: 4px 8px;
        }

        /* 📖 모달 */
        .overlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.55);
          display:flex;
          align-items:center;
          justify-content:center;
          padding: 18px;
          z-index: 9999;
        }
        .modal{
          width: min(900px, 96vw);
          background: rgba(255,255,255,.96);
          border-radius: 18px;
          border: 1px solid rgba(0,0,0,.12);
          box-shadow: 0 24px 60px rgba(0,0,0,.35);
          overflow: hidden;
        }
        .modalInner{
          display:grid;
          grid-template-columns: 320px 1fr;
        }
        @media (max-width: 760px){
          .modalInner{ grid-template-columns: 1fr; }
        }

        .modalCover{
          background: #eee;
          padding: 14px;
        }
        .modalCoverFrame{
          width: 100%;
          aspect-ratio: 3 / 4;
          border-radius: 14px;
          overflow:hidden;
          background:#f2f2f2;
          position: relative;
          border: 1px solid rgba(0,0,0,.10);
        }

        .modalBody{
          padding: 14px;
        }
        .modalTop{
          display:flex;
          justify-content: space-between;
          gap: 12px;
          align-items: start;
        }
        .modalTitle{
          font-size: 20px;
          font-weight: 900;
          margin: 0;
        }
        .closeBtn{
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,.18);
          background: rgba(255,255,255,.95);
          cursor: pointer;
        }

        .field{
          margin-top: 10px;
          font-size: 13px;
          color:#333;
        }
        .label{
          font-weight: 800;
          margin-bottom: 6px;
        }
        .textarea{
          width: 100%;
          min-height: 120px;
          resize: vertical;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,.18);
          outline:none;
          background: rgba(255,255,255,.98);
        }
        .select{
          padding: 8px 10px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,.18);
          background: rgba(255,255,255,.98);
          outline:none;
        }
      `}</style>

      <div className="panel">
        <div className="topRow">
          <h1 className="title">📚 내 전자책 책장</h1>

          <div className="controls">
            <input
              className="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색: 제목 / 저자 / 장르 / 메모"
            />
            <button className="btn" onClick={refresh} title="시트에서 다시 불러오기">
              🔄 새로고침
            </button>
          </div>
        </div>

        <div className="genreBar">
          {genres.map((g) => (
            <button
              key={g}
              className={`chip ${selectedGenre === g ? "chipActive" : ""}`}
              onClick={() => setSelectedGenre(g)}
            >
              {g}
            </button>
          ))}
        </div>

        <p className="count">
          총 <b>{filteredBooks.length}</b>권
          {selectedGenre !== "전체" ? ` · 장르: ${selectedGenre}` : ""}
          {query.trim() ? ` · 검색: "${query.trim()}"` : ""}
        </p>

        <div className="shelfWrap">
          {filteredBooks.map((b, idx) => (
            <div className="book" key={b._key || idx} onClick={() => setActiveKey(b._key)}>
              <div className="coverFrame">
                {b.coverUrl ? (
                  <img className="coverImg" src={b.coverUrl} alt={b.title || "cover"} />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "grid",
                      placeItems: "center",
                      color: "#888",
                      fontSize: 12,
                    }}
                  >
                    no cover
                  </div>
                )}
                <div className="spine" />
                <div className="shine" />
              </div>

              <div className="meta">
                <p className="t">{b.title || "(제목 없음)"}</p>
                <p className="s">{b.author ? `✍️ ${b.author}` : "✍️ 저자 없음"}</p>

                <div className="row">
                  <span className="pill">{b.genre ? `🏷️ ${b.genre}` : "🏷️ 장르 없음"}</span>
                  <span className="stars">
                    ⭐ {String(b.rating || "").trim() ? b.rating : "미등록"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 📖 상세 모달 */}
      {activeBook && (
        <div
          className="overlay"
          onClick={(e) => {
            // 배경 클릭 시 닫기
            if (e.target.classList.contains("overlay")) closeModal();
          }}
        >
          <div className="modal">
            <div className="modalInner">
              <div className="modalCover">
                <div className="modalTop">
                  <div>
                    <p className="modalTitle">{activeBook.title || "(제목 없음)"}</p>
                    <p className="s" style={{ marginTop: 6 }}>
                      {activeBook.author ? `✍️ ${activeBook.author}` : "✍️ 저자 없음"}
                    </p>
                    <p className="s" style={{ marginTop: 6 }}>
                      {activeBook.genre ? `🏷️ ${activeBook.genre}` : "🏷️ 장르 없음"}
                    </p>
                  </div>
                  <button className="closeBtn" onClick={closeModal}>
                    닫기 ✖
                  </button>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div className="modalCoverFrame">
                    {activeBook.coverUrl ? (
                      <img
                        className="coverImg"
                        src={activeBook.coverUrl}
                        alt={activeBook.title || "cover"}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          display: "grid",
                          placeItems: "center",
                          color: "#888",
                          fontSize: 12,
                        }}
                      >
                        no cover
                      </div>
                    )}
                    <div className="spine" />
                    <div className="shine" />
                  </div>
                </div>
              </div>

              <div className="modalBody">
                <div className="field">
                  <div className="label">⭐ 별점</div>
                  <select
                    className="select"
                    value={String(activeBook.rating || "")}
                    onChange={(e) => setRating(activeBook._key, e.target.value)}
                  >
                    <option value="">미등록</option>
                    <option value="1">1</option>
                    <option value="1.5">1.5</option>
                    <option value="2">2</option>
                    <option value="2.5">2.5</option>
                    <option value="3">3</option>
                    <option value="3.5">3.5</option>
                    <option value="4">4</option>
                    <option value="4.5">4.5</option>
                    <option value="5">5</option>
                  </select>
                </div>

                <div className="field">
                  <div className="label">📝 메모</div>
                  <textarea
                    className="textarea"
                    value={activeBook.note || ""}
                    onChange={(e) => setNote(activeBook._key, e.target.value)}
                    placeholder="감상/인상 깊은 문장/후기 등을 적어두기"
                  />
                </div>

                <p className="s" style={{ marginTop: 10 }}>
                  저장은 자동이에요. (이 별점/메모는 브라우저에 저장돼요)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
