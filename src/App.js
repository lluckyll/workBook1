import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, X, BookOpen, Calendar, TrendingUp, ChevronRight, ScanBarcode } from "lucide-react";

const SUBJECT_COLORS = [
  { bg: "#F4E4E1", border: "#D4816F", text: "#8A4030", dot: "#D4816F" },
  { bg: "#DCE8F2", border: "#5D8FB3", text: "#2C5573", dot: "#5D8FB3" },
  { bg: "#DEEBE6", border: "#5FA893", text: "#2A5C4D", dot: "#5FA893" },
  { bg: "#E6E0EE", border: "#8B76A8", text: "#4A3A63", dot: "#8B76A8" },
  { bg: "#F2E8D2", border: "#C9A24E", text: "#6B5321", dot: "#C9A24E" },
  { bg: "#F0DFE6", border: "#BC7392", text: "#6B3A4D", dot: "#BC7392" },
];

const STORAGE_KEY = "workbook-data";
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

function formatDate(d) {
  const dt = new Date(d + "T00:00:00");
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}

export default function App() {
  const [books, setBooks] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", subject: "", publisher: "", totalUnits: "", unitLabel: "쪽" });
  const [logInput, setLogInput] = useState({ date: todayStr(), amount: "", note: "" });

  const [scanOpen, setScanOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [scanSupported, setScanSupported] = useState(true);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

  async function openScanner() {
    setScanStatus("");
    setScanOpen(true);
    if (!("BarcodeDetector" in window)) {
      setScanSupported(false);
      return;
    }
    setScanSupported(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a"] });
      setScanStatus("책 뒤표지 바코드를 화면 중앙에 비춰주세요.");
      scanTimerRef.current = setInterval(async () => {
        if (!videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0) {
            const isbn = codes[0].rawValue;
            closeScanner();
            lookupByIsbn(isbn);
          }
        } catch (e) {}
      }, 600);
    } catch (e) {
      setScanStatus("카메라를 사용할 수 없어요. 브라우저 권한을 확인하거나 ISBN을 직접 입력해주세요.");
    }
  }

  function closeScanner() {
    if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    scanTimerRef.current = null;
    streamRef.current = null;
    setScanOpen(false);
  }

  async function lookupByIsbn(isbn) {
    setShowAddForm(true);
    setScanStatus("");
    setNewBook((prev) => ({ ...prev, title: "조회 중..." }));
    try {
      const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
      const data = await res.json();
      const info = data?.items?.[0]?.volumeInfo;
      if (info) {
        setNewBook((prev) => ({
          ...prev,
          title: info.title || "",
          publisher: info.publisher || "",
          subject: (info.categories && info.categories[0]) || prev.subject,
        }));
      } else {
        setNewBook((prev) => ({ ...prev, title: "" }));
        setScanStatus(`ISBN ${isbn}로 도서 정보를 찾지 못했어요. 직접 입력해주세요.`);
      }
    } catch (e) {
      setNewBook((prev) => ({ ...prev, title: "" }));
      setScanStatus("도서 정보 조회에 실패했어요. 직접 입력해주세요.");
    }
  }

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setBooks(parsed.books || []);
        setLogs(parsed.logs || []);
        if (parsed.books && parsed.books.length > 0) setSelectedId(parsed.books[0].id);
      }
    } catch (e) {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ books, logs }));
    } catch (e) {}
  }, [books, logs, loaded]);

  const selectedBook = books.find((b) => b.id === selectedId) || null;

  const progressFor = (bookId, total) => {
    const sum = logs.filter((l) => l.bookId === bookId).reduce((a, l) => a + l.amount, 0);
    return Math.min(sum, total);
  };

  const lastSolvedDate = (bookId) => {
    const bl = logs.filter((l) => l.bookId === bookId);
    if (bl.length === 0) return null;
    return bl.reduce((max, l) => (l.date > max ? l.date : max), bl[0].date);
  };

  const daysSince = (dateStr) => {
    if (!dateStr) return Infinity;
    const d = new Date(dateStr + "T00:00:00");
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.floor((now - d) / (1000 * 60 * 60 * 24));
  };

  const categoryFor = (subject) => {
    if (subject && subject.includes("수학")) return "수학";
    if (subject && subject.includes("국어")) return "국어";
    return "기타";
  };

  const groupedBooks = useMemo(() => {
    const groups = { 수학: [], 국어: [], 기타: [] };
    books.forEach((b) => groups[categoryFor(b.subject)].push(b));
    Object.keys(groups).forEach((k) => {
      groups[k].sort((a, b) => {
        const va = lastSolvedDate(a.id) || "0000-00-00";
        const vb = lastSolvedDate(b.id) || "0000-00-00";
        return va < vb ? -1 : va > vb ? 1 : 0;
      });
    });
    return groups;
  }, [books, logs]);

  const bookLogs = useMemo(
    () => (selectedBook ? logs.filter((l) => l.bookId === selectedBook.id).sort((a, b) => (a.date < b.date ? 1 : -1)) : []),
    [logs, selectedBook]
  );

  const weekTotal = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 6);
    const cutoff = weekAgo.toISOString().slice(0, 10);
    return logs.filter((l) => l.date >= cutoff).reduce((a, l) => a + l.amount, 0);
  }, [logs]);

  function addBook() {
    if (!newBook.title.trim() || !newBook.totalUnits || Number(newBook.totalUnits) <= 0) return;
    const color = SUBJECT_COLORS[books.length % SUBJECT_COLORS.length];
    const book = {
      id: uid(),
      title: newBook.title.trim(),
      subject: newBook.subject.trim() || "기타",
      publisher: newBook.publisher.trim(),
      totalUnits: Number(newBook.totalUnits),
      unitLabel: newBook.unitLabel || "쪽",
      color,
    };
    setBooks((prev) => [...prev, book]);
    setSelectedId(book.id);
    setNewBook({ title: "", subject: "", publisher: "", totalUnits: "", unitLabel: "쪽" });
    setShowAddForm(false);
  }

  function deleteBook(id) {
    setBooks((prev) => prev.filter((b) => b.id !== id));
    setLogs((prev) => prev.filter((l) => l.bookId !== id));
    if (selectedId === id) {
      const rest = books.filter((b) => b.id !== id);
      setSelectedId(rest.length ? rest[0].id : null);
    }
  }

  function addLog() {
    if (!selectedBook || !logInput.amount || Number(logInput.amount) <= 0) return;
    setLogs((prev) => [
      ...prev,
      { id: uid(), bookId: selectedBook.id, date: logInput.date, amount: Number(logInput.amount), note: logInput.note.trim() },
    ]);
    setLogInput({ date: todayStr(), amount: "", note: "" });
  }

  function deleteLog(id) {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  if (!loaded) {
    return <div style={{ padding: 40, textAlign: "center", color: "#8A8577", fontFamily: sans }}>불러오는 중...</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F7F5F0", fontFamily: sans, color: "#2B2A26" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>우리집 문제집 관리장</h1>
            <p style={{ fontSize: 14, color: "#8A8577", margin: "4px 0 0" }}>등록된 문제집 {books.length}권 · 최근 7일간 {weekTotal}{books[0]?.unitLabel || "쪽"} 풀이</p>
          </div>
          <button onClick={() => setShowAddForm((s) => !s)} style={btnPrimary}>
            <Plus size={16} /> 새 문제집
          </button>
        </div>

        {showAddForm && (
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E1D8", borderRadius: 14, padding: 18, marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontWeight: 600, fontSize: 15 }}>새 문제집 등록</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={openScanner} style={{ ...btnPrimary, background: "#5D8FB3", padding: "7px 12px" }}>
                  <ScanBarcode size={15} /> 바코드로 스캔
                </button>
                <button onClick={() => setShowAddForm(false)} style={iconBtn}><X size={16} /></button>
              </div>
            </div>

            {scanOpen && (
              <div style={{ background: "#F3F1EA", borderRadius: 10, padding: 12, marginBottom: 14 }}>
                {scanSupported ? (
                  <>
                    <video ref={videoRef} muted playsInline style={{ width: "100%", maxWidth: 320, borderRadius: 8, display: "block", margin: "0 auto" }} />
                    <p style={{ fontSize: 12, color: "#7A7568", textAlign: "center", margin: "8px 0 0" }}>{scanStatus || "카메라를 준비하는 중..."}</p>
                  </>
                ) : (
                  <p style={{ fontSize: 12, color: "#B08579", margin: 0 }}>이 브라우저는 바코드 스캔(BarcodeDetector)을 지원하지 않아요. 아래 ISBN 입력란을 이용해주세요.</p>
                )}
                <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                  <button onClick={closeScanner} style={iconBtn}><X size={14} /> 스캔 취소</button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                id="isbn-input"
                placeholder="또는 ISBN 번호를 직접 입력"
                style={{ ...input, flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    lookupByIsbn(e.currentTarget.value.trim());
                  }
                }}
              />
              <button
                onClick={() => {
                  const el = document.getElementById("isbn-input");
                  if (el && el.value.trim()) lookupByIsbn(el.value.trim());
                }}
                style={{ ...btnPrimary, background: "#8A8577" }}
              >
                조회
              </button>
            </div>
            {scanStatus && !scanOpen && <p style={{ fontSize: 12, color: "#B08579", margin: "-6px 0 10px" }}>{scanStatus}</p>}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
              <input placeholder="문제집 이름 (예: 디딤돌 수학)" value={newBook.title} onChange={(e) => setNewBook({ ...newBook, title: e.target.value })} style={input} />
              <input placeholder="과목 (예: 수학)" value={newBook.subject} onChange={(e) => setNewBook({ ...newBook, subject: e.target.value })} style={input} />
              <input placeholder="출판사 (선택)" value={newBook.publisher} onChange={(e) => setNewBook({ ...newBook, publisher: e.target.value })} style={input} />
              <input placeholder="전체 분량 (숫자)" type="number" value={newBook.totalUnits} onChange={(e) => setNewBook({ ...newBook, totalUnits: e.target.value })} style={input} />
              <select value={newBook.unitLabel} onChange={(e) => setNewBook({ ...newBook, unitLabel: e.target.value })} style={input}>
                <option value="쪽">쪽</option>
                <option value="단원">단원</option>
                <option value="회차">회차</option>
                <option value="문제">문제</option>
              </select>
            </div>
            <button onClick={addBook} style={{ ...btnPrimary, marginTop: 12 }}>등록하기</button>
          </div>
        )}

        {books.length === 0 && !showAddForm ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#8A8577" }}>
            <BookOpen size={36} style={{ opacity: 0.4, marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 15 }}>아직 등록된 문제집이 없어요.</p>
            <p style={{ margin: "4px 0 0", fontSize: 13 }}>위의 '새 문제집' 버튼으로 첫 문제집을 등록해보세요.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {["수학", "국어", "기타"].map((groupName) =>
                groupedBooks[groupName].length === 0 ? null : (
                  <div key={groupName}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#9A9587", marginBottom: 6, paddingLeft: 2 }}>{groupName}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {groupedBooks[groupName].map((b) => {
                        const done = progressFor(b.id, b.totalUnits);
                        const pct = Math.round((done / b.totalUnits) * 100);
                        const active = b.id === selectedId;
                        const last = lastSolvedDate(b.id);
                        const days = daysSince(last);
                        const overdue = days >= 3;
                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedId(b.id)}
                            style={{
                              cursor: "pointer",
                              background: overdue ? "#F6D6D0" : active ? "#FFFFFF" : "#FBFAF6",
                              border: `1px solid ${overdue ? "#C0503F" : active ? b.color.border : "#E5E1D8"}`,
                              borderLeft: `4px solid ${overdue ? "#C0503F" : b.color.border}`,
                              borderRadius: 10,
                              padding: "12px 14px",
                              transition: "background 0.15s",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.title}</div>
                                <div style={{ fontSize: 12, color: "#9A9587", marginTop: 2 }}>
                                  <span style={{ background: b.color.bg, color: b.color.text, borderRadius: 5, padding: "1px 6px", fontSize: 11 }}>{b.subject}</span>
                                </div>
                              </div>
                              <ChevronRight size={16} color="#C5C1B5" style={{ flexShrink: 0 }} />
                            </div>
                            <div style={{ marginTop: 10 }}>
                              <div style={{ height: 6, background: overdue ? "#E8B8AF" : "#EFEBE1", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: overdue ? "#C0503F" : b.color.border, borderRadius: 4 }} />
                              </div>
                              <div style={{ fontSize: 11, color: overdue ? "#7A3226" : "#9A9587", marginTop: 4, fontWeight: overdue ? 600 : 400 }}>
                                {done} / {b.totalUnits}{b.unitLabel} ({pct}%){overdue ? ` · ${last ? days + "일째" : "아직"} 안 풀었어요` : ""}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>

            {selectedBook && (
              <div style={{ background: "#FFFFFF", border: "1px solid #E5E1D8", borderRadius: 14, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: selectedBook.color.dot, display: "inline-block" }} />
                      <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{selectedBook.title}</h2>
                    </div>
                    <p style={{ fontSize: 13, color: "#9A9587", margin: "4px 0 0" }}>
                      {selectedBook.subject}{selectedBook.publisher ? ` · ${selectedBook.publisher}` : ""}
                    </p>
                  </div>
                  <button onClick={() => deleteBook(selectedBook.id)} style={iconBtn} title="문제집 삭제">
                    <Trash2 size={15} color="#B08579" />
                  </button>
                </div>

                {(() => {
                  const done = progressFor(selectedBook.id, selectedBook.totalUnits);
                  const pct = Math.round((done / selectedBook.totalUnits) * 100);
                  return (
                    <div style={{ margin: "18px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 26, fontWeight: 700 }}>{pct}%</span>
                        <span style={{ fontSize: 13, color: "#9A9587" }}>{done} / {selectedBook.totalUnits}{selectedBook.unitLabel} 완료</span>
                      </div>
                      <div style={{ height: 10, background: "#EFEBE1", borderRadius: 6, overflow: "hidden", marginTop: 8 }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: selectedBook.color.border, borderRadius: 6 }} />
                      </div>
                    </div>
                  );
                })()}

                <div style={{ background: "#FAF8F3", borderRadius: 10, padding: 14, marginBottom: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <Calendar size={14} /> 오늘 푼 만큼 기록하기
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input type="date" value={logInput.date} onChange={(e) => setLogInput({ ...logInput, date: e.target.value })} style={{ ...input, flex: "1 1 130px" }} />
                    <input type="number" placeholder={`푼 ${selectedBook.unitLabel} 수`} value={logInput.amount} onChange={(e) => setLogInput({ ...logInput, amount: e.target.value })} style={{ ...input, flex: "1 1 100px" }} />
                    <input placeholder="메모 (선택)" value={logInput.note} onChange={(e) => setLogInput({ ...logInput, note: e.target.value })} style={{ ...input, flex: "2 1 140px" }} />
                    <button onClick={addLog} style={btnPrimary}>기록</button>
                  </div>
                </div>

                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <TrendingUp size={14} /> 진행 기록
                </div>
                {bookLogs.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9A9587" }}>아직 기록이 없어요. 위에서 첫 기록을 남겨보세요.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                    {bookLogs.map((l) => (
                      <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#FBFAF6", borderRadius: 8, fontSize: 13 }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{formatDate(l.date)}</span>
                          <span style={{ color: "#9A9587", marginLeft: 8 }}>{l.amount}{selectedBook.unitLabel} 풀이{l.note ? ` · ${l.note}` : ""}</span>
                        </div>
                        <button onClick={() => deleteLog(l.id)} style={iconBtn}><X size={13} color="#B0AA9A" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const sans = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

const input = {
  border: "1px solid #E5E1D8",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  outline: "none",
  fontFamily: sans,
  minWidth: 0,
};

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#3B6E5E",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: sans,
};

const iconBtn = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  padding: 4,
  display: "flex",
  alignItems: "center",
};