/* =========================================================
   GIAO DIỆN CÁN BỘ – QMS ĐA ĐIỂM · Bản demo
   Máy trạng thái: ready → calling → serving → ready  (paused là trạng thái riêng)
   Quy tắc: CALL-01..05, TRF-01..04, QUE-02 (đã tinh chỉnh, xem queue-engine.js),
            gọi chỉ định có kiểm soát (xem trước, lý do bắt buộc khi vượt hàng, ghi nhận thống kê).
   Bản thật: mọi thao tác gửi lên Local Server qua WebSocket và chờ xác nhận trước khi đổi giao diện.
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Cấu hình ---------- */
  const COUNTER = '01', CODE = 'A';
  const CFG = { maxCalls: 3, recallGapSec: 10, pendingMin: 30, undoSec: 10 };
  const SVC = { A: 'Đất đai · Cấp mới, cấp đổi giấy chứng nhận', V: 'Ưu tiên · Đất đai · Cấp mới, cấp đổi', C: 'Tư pháp · Quốc tịch, hộ tịch' };
  const SLA_MIN = 20;
  const OTHER_FIELDS = { B: 'Đất đai · Giao dịch bảo đảm (quầy 04, 05)', C: 'Tư pháp · Hộ tịch (quầy 06, 07)', D: 'Tư pháp · Công chứng (quầy 08)', F: 'Vận tải, phù hiệu xe (quầy 11)', G: 'BHXH, BHYT (quầy 12, 13)', K: 'Trả kết quả (quầy 18–20)' };
  const TARGETS = [
    { c: '15', n: 'Thuế', s: 'Liên thông · nộp thuế', w: 2 },
    { c: '16', n: 'Kho bạc', s: 'Thu phí, lệ phí', w: 1 },
    { c: '04', n: 'Đất đai', s: 'Giao dịch bảo đảm', w: 5 },
    { c: '06', n: 'Tư pháp', s: 'Quốc tịch, hộ tịch', w: 7 },
    { c: '12', n: 'BHXH, BHYT', s: 'Bảo hiểm xã hội', w: 9 },
    { c: '18', n: 'Trả kết quả', s: 'Trả kết quả chung', w: 2 }
  ];
  const NAMES = ['Trần Văn Bình', 'Lê Thị Mai', 'Phạm Quốc Huy', 'Võ Thị Lan', 'Đỗ Minh Tuấn', 'Hoàng Thị Thu', 'Bùi Đức Long', 'Ngô Thị Hạnh', 'Nguyễn Văn An'];
  const MANUAL_REASONS = ['Bổ sung hồ sơ', 'Lễ tân chỉ định', 'Sự cố phiếu', 'Khác'];
  const CANCEL_REASONS = ['Sai lĩnh vực', 'Khách không làm thủ tục nữa', 'Trùng số / phiếu lỗi', 'Khác'];
  const PAUSE_REASONS = ['Nghỉ giải lao', 'Họp', 'Hỗ trợ quầy khác', 'Việc khác'];

  /* ---------- Tiện ích ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(4, '0');
  const svg = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
  const now = () => Date.now();
  const hhmm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const svcOf = (num) => SVC[num[0]] || SVC.A;

  /* ---------- Dữ liệu và trạng thái ---------- */
  const eng = new QueueEngine();
  let lastA = 86, lastV = 4;
  const S = {
    state: 'ready', cur: null, calls: 0, lastCallAt: 0, serveStart: 0,
    paused: null, offline: false, mini: false, tab: 'queue',
    ownQ: [], pending: [], served: [], others: { '02': 'A-0061', '03': 'A-0062' }, otherTurn: 0,
    cancelled: new Set(['A-0049']),
    stats: { done: 18, procMs: 18 * 14 * 60000, calls: 20, manual: 0 },
    tablet: 'ready', undo: null, lastTransferred: null, fresh: new Set()
  };
  function seed(fromNum, count, maxWait) {
    eng.items = [];
    for (let i = 0; i < count; i++) {
      const n = fromNum + i;
      eng.add({ num: `A-${pad(n)}`, issuedAt: now() - (maxWait - i * 1.7) * 60000, citizen: i % 3 === 0 ? NAMES[i % NAMES.length] : null, via: 'CCCD' });
    }
  }
  seed(64, 23, 41);
  S.pending = [
    { num: 'A-0052', skippedAt: now() - 12 * 60000, calls: 3, citizen: null },
    { num: 'A-0057', skippedAt: now() - 25 * 60000, calls: 3, citizen: 'Lê Thị Mai', via: 'CCCD' }
  ];
  S.served = [
    { num: 'A-0063', at: now() - 9 * 60000, res: 'Hoàn thành · 13\'' },
    { num: 'A-0060', at: now() - 24 * 60000, res: 'Hoàn thành · 15\'' },
    { num: 'A-0057', at: now() - 25 * 60000, res: 'Bỏ qua → chờ nhỡ' },
    { num: 'A-0056', at: now() - 41 * 60000, res: 'Chuyển quầy 15' },
    { num: 'A-0053', at: now() - 58 * 60000, res: 'Hoàn thành · 12\'' }
  ];

  /* ---------- Co giãn canvas ---------- */
  let SCALE = 1;
  function fit() {
    const panel = $('#sim').offsetWidth + 24;
    SCALE = Math.min((innerWidth - panel - 60) / 1920, (innerHeight - 60) / 1080);
    $('#frame').style.width = 1920 * SCALE + 'px';
    $('#frame').style.height = 1080 * SCALE + 'px';
    $('#screen').style.transform = `scale(${SCALE})`;
  }
  addEventListener('resize', fit);

  /* =========================================================
     THÔNG BÁO
     ========================================================= */
  function banner(type, html, ttl = 8000, id) {
    const icon = { info: 'i-bell', warn: 'i-alert', ok: 'i-redo', err: 'i-wifi-off' }[type];
    if (id) { const old = $(`.bn[data-id="${id}"]`); if (old) old.remove(); }
    const el = document.createElement('div');
    el.className = `bn bn-${type}`;
    if (id) el.dataset.id = id;
    el.innerHTML = `${svg(icon)}<span>${html}</span><button aria-label="Đóng">×</button>`;
    el.querySelector('button').onclick = () => el.remove();
    $('#banners').prepend(el);
    $$('.bn').slice(3).forEach((x) => x.remove());
    if (ttl) setTimeout(() => el.remove(), ttl);
    return el;
  }
  let toastT;
  function toast(html, btnLabel, onBtn, ttl = 4000) {
    const el = $('#pToast');
    el.innerHTML = `<span>${html}</span>${btnLabel ? `<button>${btnLabel}</button>` : ''}`;
    if (btnLabel) el.querySelector('button').onclick = onBtn;
    el.classList.add('is-on');
    clearTimeout(toastT);
    if (ttl) toastT = setTimeout(() => el.classList.remove('is-on'), ttl);
  }
  const hideToast = () => $('#pToast').classList.remove('is-on');
  let ac;
  function chime() {
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.55);
    } catch (e) { /* không có âm thanh cũng không sao */ }
  }

  /* =========================================================
     KIỂM TRA ĐIỀU KIỆN
     ========================================================= */
  function blocked() {
    if (S.offline) { toast('Mất kết nối Local Server. Thao tác tạm khóa, hệ thống đang thử kết nối lại.'); return true; }
    if (S.paused) { toast('Quầy đang tạm ngưng. Bấm "Mở lại quầy" trước.'); return true; }
    return false;
  }

  /* =========================================================
     THAO TÁC CHÍNH
     ========================================================= */
  function callNext() {
    if (blocked()) return;
    if (S.state !== 'ready') { flashHint(); return toast('Hoàn thành, bỏ qua hoặc chuyển số hiện tại trước khi gọi số mới (CALL-05).'); }
    const item = S.ownQ.length ? S.ownQ.shift() : eng.takeHead();
    if (!item) return toast('Hiện không có khách chờ.');
    startCall(item, {});
  }

  function startCall(item, opt) {
    S.cur = Object.assign({}, item, opt);
    S.calls = 1; S.lastCallAt = now(); S.state = 'calling'; S.stats.calls++;
    if (opt.manual) S.stats.manual++;
    closePreview();
    renderAll(true);
    mcCalled();
  }

  function arrived() {
    if (S.state !== 'calling') return;
    S.state = 'serving'; S.serveStart = now();
    $('#mcPop').classList.remove('is-on');
    renderAll();
  }

  function recall() {
    if (blocked()) return;
    if (S.state !== 'calling') return toast(S.state === 'serving' ? 'Khách đã có mặt, không cần gọi lại.' : 'Chưa có số nào đang gọi.');
    if (S.calls >= CFG.maxCalls) return toast(`Đã gọi tối đa ${CFG.maxCalls} lần. Có thể bấm Bỏ qua.`);
    const wait = CFG.recallGapSec * 1000 - (now() - S.lastCallAt);
    if (wait > 0) return toast(`Vui lòng chờ ${Math.ceil(wait / 1000)} giây giữa hai lần gọi.`);
    S.calls++; S.lastCallAt = now(); S.stats.calls++;
    renderAll();
  }

  function skip(force) {
    if (blocked()) return;
    if (S.state !== 'calling') return toast(S.state === 'serving' ? 'Khách đã có mặt. Dùng Hoàn thành, Chuyển quầy hoặc Hủy số.' : 'Chưa có số nào đang gọi.');
    if (!force && S.calls < CFG.maxCalls) {
      return dialog(`<h3>Bỏ qua ${S.cur.num}?</h3><p>Số này mới được gọi ${S.calls}/${CFG.maxCalls} lần. Sau khi bỏ qua, số được đưa vào danh sách Chờ nhỡ trong ${CFG.pendingMin} phút.</p>
        <div class="dlg-act"><button data-d="close">Gọi lại sau</button><button class="dng" data-d="skipForce">Vẫn bỏ qua</button></div>`);
    }
    S.pending.unshift({ ...S.cur, skippedAt: now(), calls: S.calls });
    S.served.unshift({ num: S.cur.num, at: now(), res: 'Bỏ qua → chờ nhỡ' });
    endCurrent();
  }

  function done() {
    if (blocked()) return;
    if (S.state !== 'serving') return toast(S.state === 'calling' ? 'Bấm "Khách đã đến" khi công dân có mặt, sau đó mới Hoàn thành.' : 'Chưa có số đang phục vụ.');
    const dur = now() - S.serveStart;
    S.stats.done++; S.stats.procMs += dur;
    S.served.unshift({ num: S.cur.num, at: now(), res: `Hoàn thành · ${Math.max(1, Math.round(dur / 60000))}'` });
    S.tablet = 'wait';
    setTimeout(() => { S.tablet = 'got'; renderFooter(); setTimeout(() => { S.tablet = 'ready'; renderFooter(); }, 4000); }, 6000);
    endCurrent();
  }

  function endCurrent() {
    S.cur = null; S.calls = 0; S.state = 'ready';
    mcReset();
    closeDialog();
    renderAll();
  }

  /* ---------- Chuyển quầy, có hoàn tác 10 giây (TRF-04) ---------- */
  function openTransfer() {
    if (blocked()) return;
    if (S.state !== 'serving') return toast('Chỉ chuyển quầy khi đang phục vụ khách.');
    const back = S.cur.from ? `<button class="opt hl" data-opt="${S.cur.from}"><span class="oc">${S.cur.from}</span><span class="on2">Chuyển về quầy ${S.cur.from}<small>Trả khách về quầy đã chuyển đến (TRF-03)</small></span></button>` : '';
    dialog(`<h3>Chuyển ${S.cur.num} sang quầy khác</h3><p>Giữ nguyên số phiếu. Số được xếp đầu hàng tại quầy nhận (TRF-01, TRF-02).</p>
      <div class="opts">${back}${TARGETS.filter((t) => t.c !== S.cur.from).map((t) => `<button class="opt" data-opt="${t.c}"><span class="oc">${t.c}</span><span class="on2">${t.n}<small>${t.s}</small></span><span class="ow">${t.w} chờ</span></button>`).join('')}</div>
      <div class="dlg-act"><button data-d="close">Đóng</button></div>`);
  }
  function doTransfer(to) {
    const snap = { cur: S.cur, serveStart: S.serveStart, calls: S.calls };
    closeDialog();
    S.cur = null; S.state = 'ready'; mcReset(); renderAll();
    let left = CFG.undoSec;
    const tick = () => toast(`Đã chuyển <b>${snap.cur.num}</b> sang quầy ${to}.`, `Hoàn tác (${left}s)`, undo, 0);
    const finalize = () => {
      clearInterval(S.undo.iv); S.undo = null; hideToast();
      S.served.unshift({ num: snap.cur.num, at: now(), res: `Chuyển quầy ${to}` });
      S.lastTransferred = { item: snap.cur, to };
      renderList();
    };
    const undo = () => {
      if (!S.undo) return;
      clearInterval(S.undo.iv); S.undo = null; hideToast();
      if (S.state !== 'ready') return toast('Không thể hoàn tác vì quầy đã gọi số khác.');
      S.cur = snap.cur; S.serveStart = snap.serveStart; S.calls = snap.calls; S.state = 'serving';
      renderAll(); toast(`Đã thu hồi lệnh chuyển ${snap.cur.num}.`);
    };
    tick();
    S.undo = { iv: setInterval(() => { left--; if (left <= 0) finalize(); else tick(); }, 1000) };
  }

  /* ---------- Hủy số ---------- */
  function openCancel() {
    if (blocked()) return;
    if (!S.cur) return toast('Chưa có số đang phục vụ để hủy.');
    dialog(`<h3>Hủy số ${S.cur.num}</h3><p>Số bị hủy không quay lại hàng đợi và được ghi vào báo cáo. Chọn lý do:</p>
      <div class="opts">${CANCEL_REASONS.map((r, i) => `<button class="opt" data-cancel="${i}"><span class="on2">${r}</span></button>`).join('')}</div>
      <div class="dlg-act"><button data-d="close">Không hủy</button></div>`);
  }

  /* ---------- Tạm ngưng ---------- */
  let pauseSel = { r: 0, m: 15 };
  function openPause() {
    if (S.offline) return blocked();
    if (S.state !== 'ready') return toast('Hoàn thành hoặc chuyển số hiện tại trước khi tạm ngưng.');
    dialog(`<h3>Tạm ngưng quầy ${COUNTER}</h3><p>Màn hình quầy chuyển sang "Quầy tạm ngưng phục vụ" và gợi ý quầy 02, 03.</p>
      <div class="opts">${PAUSE_REASONS.map((r, i) => `<button class="opt ${i === pauseSel.r ? 'on' : ''}" data-pr="${i}"><span class="on2">${r}</span></button>`).join('')}</div>
      <div class="rs" style="margin-top:12px">${[10, 15, 30].map((m) => `<button class="${m === pauseSel.m ? 'on' : ''}" data-pm="${m}">${m} phút</button>`).join('')}</div>
      <div class="dlg-act"><button data-d="close">Đóng</button><button class="pri" data-d="pauseGo">Tạm ngưng</button></div>`);
  }
  function doPause() {
    S.paused = { reason: PAUSE_REASONS[pauseSel.r], until: now() + pauseSel.m * 60000 };
    closeDialog();
    $('#paused').innerHTML = `${svg('i-pause')}<h3>QUẦY TẠM NGƯNG</h3><p>${S.paused.reason} · dự kiến mở lại lúc <b>${hhmm(S.paused.until)}</b><br>Hàng đợi chung vẫn được quầy 02, 03 phục vụ.</p><button data-act="resume">${svg('i-play')}MỞ LẠI QUẦY</button>`;
    $('#paused').classList.add('is-on');
    renderMini();
  }
  function resume() { S.paused = null; $('#paused').classList.remove('is-on'); renderAll(); }

  /* =========================================================
     GỌI / TRA CỨU SỐ CHỈ ĐỊNH
     ========================================================= */
  function parse(raw) {
    const s = String(raw || '').toUpperCase().replace(/[\s\-_.]/g, '');
    const m = s.match(/^([A-Z]?)(\d{1,4})$/);
    if (!m) return null;
    const code = m[1] || CODE;
    return { code, n: +m[2], num: `${code}-${pad(+m[2])}` };
  }
  function lookup(p) {
    if (!p) return { k: 'invalid' };
    if (p.code !== 'A' && p.code !== 'V') return OTHER_FIELDS[p.code] ? { k: 'field', field: OTHER_FIELDS[p.code] } : { k: 'invalid' };
    if (S.cur && S.cur.num === p.num) return { k: 'self' };
    const own = S.ownQ.find((x) => x.num === p.num);
    if (own) return { k: 'own', item: own };
    const idx = eng.indexOf(p.num);
    if (idx >= 0) return { k: 'wait', idx, item: eng.items[idx] };
    const pd = S.pending.find((x) => x.num === p.num);
    if (pd) return { k: 'pending', item: pd };
    for (const c in S.others) if (S.others[c] === p.num) return { k: 'other', counter: c };
    if (S.cancelled.has(p.num)) return { k: 'cancelled' };
    const max = p.code === 'V' ? lastV : lastA;
    if (!p.n || p.n > max) return { k: 'notissued', max: `${p.code}-${pad(max)}` };
    return { k: 'done' };
  }

  let PV = null;   // trạng thái thẻ xem trước: { p, r, reason, need, mode }
  function showPreview() {
    const raw = $('#srch').value.trim();
    $('#srchBox').classList.toggle('has-val', !!raw);
    if (!raw) return closePreview();
    const p = parse(raw), r = lookup(p);
    PV = { p, r, reason: null, need: false, mode: null };
    const ready = S.state === 'ready' && !S.paused;
    const busy = ready ? '' : `<p style="color:#6B4400"><b>Đang có số ${S.cur ? S.cur.num : ''} trong tay.</b> Hoàn thành hoặc bỏ qua trước khi gọi số khác (CALL-05).</p>`;
    const reasons = () => `<div class="pv-rs"><span>LÝ DO GỌI VƯỢT (BẮT BUỘC)</span><div class="rs">${MANUAL_REASONS.map((x, i) => `<button data-rs="${i}">${x}</button>`).join('')}</div></div><div class="pv-err" id="pvErr">Chọn lý do trước khi gọi.</div>`;
    let st = '', stc = 'st-bad', body = '', act = `<button data-pv="close">Đóng</button>`, bad = true;
    const num = p ? p.num : raw.toUpperCase();
    switch (r.k) {
      case 'wait': {
        bad = false; stc = 'st-wait'; st = `ĐANG CHỜ · THỨ ${r.idx + 1}`;
        const w = Math.round(eng.waitMin(r.item));
        const lock = eng.lockOf(r.item, r.idx);
        body = `<p>Đã chờ <b>${w} phút</b>${r.item.citizen ? ` · ${r.item.citizen}` : ''}${lock === 'overtake' ? ' · đã bị vượt đủ 3 lần' : ''}</p>`;
        if (r.idx === 0) body += `<p>Đang đứng đầu hàng, gọi như bình thường.</p>`;
        else { body += `<p>Gọi số này sẽ <b>vượt ${r.idx} người</b> đang chờ trước.</p>` + (ready ? reasons() : ''); PV.need = true; }
        if (ready) act = `<button data-pv="close">Hủy</button><button class="pri" data-pv="call">${svg('i-volume')} Gọi số này</button>`;
        break;
      }
      case 'own':
        bad = false; stc = 'st-wait'; st = 'CHỜ RIÊNG QUẦY NÀY';
        body = `<p>${r.item.cls === 'return' ? 'Khách quay lại' : 'Số chuyển đến'} từ quầy ${r.item.from}. Số này sẽ được gọi trước khi bấm Gọi số tiếp theo.</p>`;
        if (ready) act = `<button data-pv="close">Hủy</button><button class="pri" data-pv="call">${svg('i-volume')} Gọi số này</button>`;
        break;
      case 'pending': {
        bad = false; stc = 'st-pend';
        const left = Math.max(0, CFG.pendingMin - (now() - r.item.skippedAt) / 60000);
        st = `CHỜ NHỠ · CÒN ${Math.ceil(left)}'`;
        body = `<p>Bỏ qua lúc <b>${hhmm(r.item.skippedAt)}</b> sau ${r.item.calls} lần gọi. Mặc định phục hồi vào hàng sau 3 người (CALL-04).</p>`;
        act = `<button data-pv="end">Cuối hàng</button><button class="pri" data-pv="restore">Phục hồi · sau 3 người</button>`;
        if (ready) act += `</div><div class="pv-act"><button data-pv="callnow">${svg('i-volume')} Gọi ngay (cần lý do)</button>`;
        break;
      }
      case 'self': st = 'ĐANG PHỤC VỤ'; stc = 'st-wait'; bad = false; body = `<p>Đây là số quầy bạn đang phục vụ.</p>`; break;
      case 'other': st = 'KHÔNG GỌI ĐƯỢC'; body = `<p>Đang được phục vụ tại <b>quầy ${r.counter}</b>.</p>`; break;
      case 'done': st = 'KHÔNG GỌI ĐƯỢC'; body = `<p>Số này đã được phục vụ xong trong hôm nay. Nếu khách cần bổ sung hồ sơ, đề nghị lễ tân hỗ trợ.</p>`; break;
      case 'cancelled': st = 'KHÔNG GỌI ĐƯỢC'; body = `<p>Số này đã bị hủy (quá thời gian chờ nhỡ hoặc hủy tại quầy).</p>`; break;
      case 'notissued': st = 'KHÔNG GỌI ĐƯỢC'; body = `<p>Số này chưa được phát hôm nay. Số lớn nhất hiện tại: <b>${r.max}</b>. Phiếu của ngày khác không còn giá trị (GEN-04).</p>`; break;
      case 'field': st = 'KHÔNG GỌI ĐƯỢC'; body = `<p>Thuộc lĩnh vực <b>${r.field}</b>. Quầy ${COUNTER} không phụ trách lĩnh vực này. Nếu khách đang ở quầy, dùng Chuyển quầy.</p>`; break;
      default: st = 'KHÔNG HỢP LỆ'; body = `<p>Nhập theo dạng: <b>68</b>, <b>a68</b> hoặc <b>A-0068</b>.</p>`;
    }
    const pv = $('#pv');
    pv.className = 'pv is-on' + (bad ? ' bad' : '');
    pv.innerHTML = `<div class="pv-h"><span class="num">${num}</span><span class="pv-st ${stc}">${st}</span></div>${body}${['wait', 'own', 'pending'].includes(r.k) ? busy : ''}<div class="pv-act">${act}</div>`;
  }
  function closePreview() { PV = null; $('#pv').className = 'pv'; }
  function clearSearch() { $('#srch').value = ''; $('#srchBox').classList.remove('has-val'); closePreview(); syncKeypad(); }

  function pvAction(a) {
    if (!PV) return;
    if (a === 'close') return clearSearch();
    if (blocked()) return;
    const { r } = PV;
    if (a === 'call') {
      if (S.state !== 'ready') return toast('Hoàn thành hoặc bỏ qua số hiện tại trước (CALL-05).');
      if (r.k === 'own') { S.ownQ = S.ownQ.filter((x) => x.num !== r.item.num); startCall(r.item, {}); return clearSearch(); }
      if (PV.need && PV.reason == null) return $('#pvErr').classList.add('is-on');
      const res = eng.take(r.item.num, PV.need);
      startCall(res.item, PV.need ? { manual: true, reason: MANUAL_REASONS[PV.reason], jumped: res.jumped } : {});
      return clearSearch();
    }
    if (a === 'restore' || a === 'end') {
      S.pending = S.pending.filter((x) => x.num !== r.item.num);
      const pos = eng.add({ num: r.item.num, cls: 'restore', citizen: r.item.citizen, via: r.item.via, issuedAt: now() }, { toEnd: a === 'end' });
      S.fresh.add(r.item.num);
      banner('info', `Đã phục hồi <b>${r.item.num}</b> vào hàng đợi, vị trí thứ ${pos + 1}.`, 6000);
      clearSearch(); return renderAll();
    }
    if (a === 'callnow') {
      if (S.state !== 'ready') return toast('Hoàn thành hoặc bỏ qua số hiện tại trước (CALL-05).');
      if (!PV.need) {
        PV.need = true;
        $('#pv .pv-act:last-child').insertAdjacentHTML('beforebegin', `<div class="pv-rs"><span>LÝ DO GỌI NGAY (BẮT BUỘC)</span><div class="rs">${MANUAL_REASONS.map((x, i) => `<button data-rs="${i}">${x}</button>`).join('')}</div></div><div class="pv-err" id="pvErr">Chọn lý do trước khi gọi.</div>`);
        $('#pv [data-pv="callnow"]').innerHTML = `${svg('i-volume')} Xác nhận gọi ngay`;
        return;
      }
      if (PV.reason == null) return $('#pvErr').classList.add('is-on');
      S.pending = S.pending.filter((x) => x.num !== r.item.num);
      eng.items.slice(0, eng.p.showWindow).forEach((x) => { if (x.seen) x.overtaken++; });
      startCall({ ...r.item, cls: 'restore' }, { manual: true, reason: MANUAL_REASONS[PV.reason] });
      return clearSearch();
    }
  }

  /* ---------- Bàn phím ảo ---------- */
  function renderKeypad() {
    const pre = ['A', 'V'].map((c) => `<button class="k pre ${c === 'V' ? 'v' : ''}" data-k="${c}">${c}</button>`).join('');
    const dig = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => `<button class="k" data-k="${d}">${d}</button>`).join('');
    $('#kp').innerHTML = `<div class="kp-lbl">TIỀN TỐ ĐƯỢC PHÉP TẠI QUẦY ${COUNTER}</div>
      <div class="kp-pre">${pre}<button class="k fn" data-k="clear">Xóa hết</button><button class="k fn" data-k="back" aria-label="Xóa 1 ký tự">${svg('i-back')}</button></div>
      <div class="kp-dig">${dig}<button class="k fn" data-k="close">Đóng</button><button class="k" data-k="0">0</button><button class="k fn" data-k="dash">—</button></div>
      <button class="kp-go" data-k="go">${svg('i-volume')} XEM TRƯỚC VÀ GỌI <kbd>Enter</kbd></button>`;
  }
  function syncKeypad() {
    const v = $('#srch').value.toUpperCase();
    $$('#kp .pre').forEach((b) => b.classList.toggle('on', v.startsWith(b.dataset.k)));
  }
  function keypad(k) {
    const inp = $('#srch');
    let v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const letter = (v.match(/^[A-Z]/) || [''])[0], digits = v.replace(/^[A-Z]/, '');
    if (k === 'close') { $('#kp').classList.remove('is-on'); $('.kp-btn').classList.remove('on'); return; }
    if (k === 'go') { if (PV && PV.r && ['wait', 'own'].includes(PV.r.k)) return pvAction('call'); return showPreview(); }
    if (k === 'clear') v = '';
    else if (k === 'back') v = v.slice(0, -1);
    else if (k === 'dash') return;
    else if (/^[A-Z]$/.test(k)) v = (letter === k ? '' : k) + digits;
    else if (digits.length < 4) v = letter + digits + k;
    inp.value = v;
    syncKeypad();
    showPreview();
  }

  /* =========================================================
     MỘT CỬA (Cơ chế 1: QMS gọi số → Một cửa mở sẵn hồ sơ)
     ========================================================= */
  function mcCalled() {
    const c = S.cur;
    $('#mcPop').innerHTML = `<b>QMS · Quầy ${COUNTER} vừa gọi ${c.num}</b><p>Đã mở sẵn màn hình tiếp nhận hồ sơ mới${c.citizen ? ` và điền thông tin người nộp từ ${c.via || 'CCCD'}` : ''}.</p>
      <div class="row"><button data-mc="start">Bắt đầu tiếp nhận</button><button class="g" data-mc="later">Để sau</button></div>`;
    $('#mcPop').classList.add('is-on');
    const fill = (id, v) => { const el = $(id); el.value = v || ''; el.classList.toggle('fill', !!v); };
    fill('#fTicket', c.num); fill('#fName', c.citizen ? c.citizen.toUpperCase() : ''); fill('#fProc', c.svc || svcOf(c.num));
  }
  function mcReset() {
    $('#mcPop').classList.remove('is-on');
    ['#fTicket', '#fName', '#fProc'].forEach((id) => { $(id).value = ''; $(id).classList.remove('fill'); });
  }

  /* =========================================================
     RENDER
     ========================================================= */
  const TAGS = {
    priority: () => `<span class="tag t-priority">ƯU TIÊN</span>`,
    booking: (c) => `<span class="tag t-booking">ĐẶT LỊCH${c.appt ? ' · ' + c.appt : ''}</span>`,
    restore: () => `<span class="tag t-restore">PHỤC HỒI</span>`,
    transfer: (c) => `<span class="tag t-transfer">CHUYỂN TỪ QUẦY ${c.from}</span>`,
    return: (c) => `<span class="tag t-return">KHÁCH QUAY LẠI · Q.${c.from}</span>`
  };
  const SHORT = { priority: 'ƯU TIÊN', booking: 'ĐẶT LỊCH', restore: 'PHỤC HỒI', transfer: 'CHUYỂN ĐẾN', return: 'QUAY LẠI' };
  const TCLS = { priority: 't-priority', booking: 't-booking', restore: 't-restore', transfer: 't-transfer', return: 't-return' };

  function renderTicket(isNew) {
    const tk = $('#tk');
    if (S.state === 'ready') {
      const head = S.ownQ[0] || eng.items[0];
      const hw = head && head.issuedAt ? ` · đã chờ ${Math.round(eng.waitMin(head))} phút` : '';
      tk.className = 'tk';
      tk.innerHTML = `<div class="tk-row"><span class="chip chip-ready">QUẦY SẴN SÀNG</span></div>
        <div class="tk-ready"><h3>Chưa có số đang phục vụ</h3>
        <p>${head ? `Số tiếp theo: <span class="num">${head.num}</span>${head.cls && TAGS[head.cls] ? ' ' + TAGS[head.cls](head) : ''}${hw}` : 'Hiện không có khách chờ.'}</p>
        <p>Bấm <b>GỌI SỐ TIẾP THEO</b> hoặc <kbd>Ctrl+Alt+N</kbd></p></div>`;
      return;
    }
    const c = S.cur;
    const tags = [c.cls && TAGS[c.cls] ? TAGS[c.cls](c) : '', c.manual ? `<span class="tag t-manual">GỌI CHỈ ĐỊNH · ${c.reason}</span>` : ''].join('');
    const dots = Array.from({ length: CFG.maxCalls }, (_, i) => `<i class="${i < S.calls ? 'on' : ''}"></i>`).join('');
    const head = S.state === 'calling'
      ? `<span class="chip chip-call">ĐANG GỌI · CHỜ KHÁCH ĐẾN</span><span class="dots">${dots} Gọi ${S.calls}/${CFG.maxCalls}</span>`
      : `<span class="chip chip-serve">ĐANG PHỤC VỤ</span><span class="dots">Bắt đầu ${hhmm(S.serveStart)}</span>`;
    const foot = S.state === 'calling'
      ? `<button class="arrived" data-act="arrived">${svg('i-user-check')} Khách đã đến · bắt đầu tính giờ</button>`
      : `<div class="sla" id="sla"><div class="sla-row"><span>THỜI GIAN XỬ LÝ</span><b class="num" id="slaT">00:00<small>/ SLA ${SLA_MIN}:00</small></b></div><div class="sla-bar"><i id="slaB"></i></div></div>`;
    tk.className = 'tk' + (isNew ? ' is-new' : '');
    tk.innerHTML = `<div class="tk-row">${head}</div>
      <div class="tk-num num">${c.num}</div>
      <div class="tk-svc">${c.svc || svcOf(c.num)}</div>
      ${c.citizen ? `<div class="tk-who">${svg('i-id')}${c.citizen}<small>· ${c.via || 'CCCD'}</small></div>` : ''}
      <div class="tk-tags">${tags}</div>${foot}`;
    updateSla();
  }

  function updateSla() {
    if (S.state !== 'serving') return;
    const el = $('#sla'); if (!el) return;
    const ms = now() - S.serveStart, pct = ms / (SLA_MIN * 60000);
    el.className = 'sla ' + (pct < 0.8 ? 'ok' : pct <= 1 ? 'warn' : 'over');
    $('#slaT').innerHTML = (pct > 1 ? '+' + mmss(ms - SLA_MIN * 60000) : mmss(ms)) + `<small>/ SLA ${SLA_MIN}:00</small>`;
    $('#slaB').style.width = Math.min(100, pct * 100) + '%';
  }

  function renderCtl() {
    const st = S.state, block = S.offline || !!S.paused;
    const on = { next: st === 'ready', recall: st === 'calling' && S.calls < CFG.maxCalls, skip: st === 'calling', transfer: st === 'serving', done: st === 'serving' };
    $$('#ctl [data-act]').forEach((b) => b.classList.toggle('off', block || !on[b.dataset.act]));
    const head = S.ownQ[0] || eng.items[0];
    $('#nextHint').textContent = st !== 'ready' ? 'Hoàn thành hoặc bỏ qua số hiện tại trước'
      : head ? `Tiếp theo: ${head.num} · ${S.ownQ.length + eng.length} người chờ` : 'Hiện không có khách chờ';
    updateCooldown();
  }
  function updateCooldown() {
    const cd = $('#cd');
    if (S.state !== 'calling') { cd.style.width = '0'; $('#ctl [data-act="recall"] b').textContent = 'GỌI LẠI'; return; }
    const left = CFG.recallGapSec * 1000 - (now() - S.lastCallAt);
    cd.style.width = left > 0 ? (left / (CFG.recallGapSec * 1000)) * 100 + '%' : '0';
    const rb = $('#ctl [data-act="recall"] b');
    rb.textContent = left > 0 && S.calls < CFG.maxCalls ? `GỌI LẠI · ${Math.ceil(left / 1000)}s` : 'GỌI LẠI';
  }
  function renderCtlClassesOnly() { const b = $('#ctl [data-act="recall"]'); b.classList.toggle('off', !(S.state === 'calling' && S.calls < CFG.maxCalls) || S.offline || !!S.paused); }

  function flashHint() { const b = $('.b-next'); b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }

  function renderList() {
    $('#cQ').textContent = S.ownQ.length + eng.length;
    $('#cP').textContent = S.pending.length;
    $('#cS').textContent = S.served.length;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    const showOT = $('#showOT').checked;
    let html = '';
    if (S.tab === 'queue') {
      if (S.ownQ.length) {
        html += `<div class="sep">CHỜ RIÊNG QUẦY ${COUNTER}</div>` + S.ownQ.map((x) => `<div class="r own ${S.fresh.has(x.num) ? 'new' : ''}" data-num="${x.num}"><span class="pos">•</span><span class="num">${x.num}</span><span class="tag ${TCLS[x.cls]}">${SHORT[x.cls]} · Q.${x.from}</span><span class="w">mới</span></div>`).join('');
      }
      html += `<div class="sep">HÀNG ĐỢI CHUNG · ĐẤT ĐAI</div>`;
      html += eng.items.map((x, i) => {
        const lock = eng.lockOf(x, i), w = Math.round(eng.waitMin(x));
        const lk = lock === 'overtake' ? `<span class="lk ot" title="Đã bị vượt đủ ${eng.p.maxOvertake} lần, không ai được chèn lên trước">${svg('i-lock')}</span>`
          : lock === 'wait' ? `<span class="lk" title="Đã chờ quá ${eng.p.waitLockMin} phút">${svg('i-lock')}</span>` : '';
        const ot = showOT && x.overtaken ? `<span class="ot-n">vượt ${x.overtaken}</span>` : '';
        const tg = x.cls !== 'normal' ? `<span class="tag ${TCLS[x.cls]}">${SHORT[x.cls]}</span>` : '';
        return `<div class="r ${S.fresh.has(x.num) ? 'new' : ''}" data-num="${x.num}"><span class="pos">${i + 1}</span><span class="num">${x.num}</span>${tg}${lk}${ot}<span class="w ${w > 30 ? 'late' : ''}">${w}'</span></div>`;
      }).join('') || `<div class="empty">Hiện không có khách chờ.</div>`;
      $('#listFt').textContent = `Đất đai · quầy 01, 02, 03 dùng chung hàng đợi · ổ khóa: không được chèn trước`;
    } else if (S.tab === 'pending') {
      html = S.pending.map((x) => {
        const left = Math.max(0, CFG.pendingMin - (now() - x.skippedAt) / 60000);
        return `<div class="r" data-num="${x.num}"><span class="num">${x.num}</span><span class="exp">Bỏ qua ${hhmm(x.skippedAt)} · còn ${Math.ceil(left)}'<i><em style="width:${(left / CFG.pendingMin) * 100}%"></em></i></span><span class="w"><button class="act" data-restore="${x.num}">Phục hồi</button></span></div>`;
      }).join('') || `<div class="empty">Không có số chờ nhỡ.</div>`;
      $('#listFt').textContent = `Số chờ nhỡ tự hủy sau ${CFG.pendingMin} phút (CALL-04)`;
    } else {
      html = S.served.map((x) => `<div class="r" data-num="${x.num}"><span class="num">${x.num}</span><span class="exp">${hhmm(x.at)}</span><span class="w res">${x.res}</span></div>`).join('');
      $('#listFt').textContent = 'Các số quầy đã xử lý trong hôm nay';
    }
    $('#list').innerHTML = html;
    S.fresh.clear();
  }

  function renderFooter() {
    const avg = Math.round(S.stats.procMs / S.stats.done / 60000);
    const pct = S.stats.calls ? Math.round((S.stats.manual / S.stats.calls) * 100) : 0;
    const tab = { ready: ['', 'sẵn sàng'], wait: ['wait', 'chờ đánh giá'], got: ['', 'đã nhận đánh giá'] }[S.tablet];
    $('#pFtr').innerHTML = `<span>Xong <b>${S.stats.done}</b></span><span>TB <b>${avg}'</b></span><span>Chỉ định <b>${S.stats.manual}</b> (${pct}%)</span>
      <span class="tab-st ${tab[0]}" title="Máy tính bảng đánh giá">${svg('i-tablet')}<i></i>${tab[1]}</span>`;
  }

  function renderMini() {
    const m = $('#mini'), c = S.cur;
    let left, btns;
    if (S.paused) { left = `<span class="num idle">TẠM NGƯNG</span>`; btns = `<button class="mb" style="background:var(--cobalt);color:#fff" data-act="resume">Mở lại</button>`; }
    else if (S.state === 'ready') { left = `<span class="num idle">SẴN SÀNG</span><span class="t" style="background:var(--cobalt-50);color:var(--cobalt-900)">${S.ownQ.length + eng.length} chờ</span>`; btns = `<button class="mb" style="background:var(--cobalt);color:#fff" data-act="next">GỌI TIẾP</button>`; }
    else if (S.state === 'calling') { left = `<span class="num">${c.num}</span><span class="t" style="background:var(--amber-50);color:#6B4400">Gọi ${S.calls}/${CFG.maxCalls}</span>`; btns = `<button class="mb ${S.calls >= CFG.maxCalls ? 'off' : ''}" style="background:var(--gold);color:var(--gold-ink)" data-act="recall">GỌI LẠI</button><button class="mb" style="background:var(--green-50);color:var(--green-ink)" data-act="arrived">ĐÃ ĐẾN</button>`; }
    else { left = `<span class="num">${c.num}</span><span class="t" id="miniT" style="background:var(--green-50);color:var(--green-ink)">${mmss(now() - S.serveStart)}</span>`; btns = `<button class="mb" style="background:var(--green);color:#fff" data-act="done">HOÀN THÀNH</button>`; }
    m.innerHTML = `<span class="grip"></span>${left}<span class="sp"></span>${btns}<button class="ib" data-act="mini" title="Mở rộng (Ctrl+Alt+M)">${svg('i-max')}</button>`;
  }

  function renderAll(isNew) { renderTicket(isNew); renderCtl(); renderList(); renderFooter(); renderMini(); }

  /* =========================================================
     HỘP THOẠI
     ========================================================= */
  function dialog(html) { $('#dlg').innerHTML = html; $('#dlgWrap').classList.add('is-on'); }
  function closeDialog() { $('#dlgWrap').classList.remove('is-on'); }
  function keysDialog() {
    const rows = [['Gọi số tiếp theo', 'Ctrl+Alt+N'], ['Gọi lại', 'Ctrl+Alt+R'], ['Hoàn thành', 'Ctrl+Alt+H'], ['Bỏ qua', 'Ctrl+Alt+B'], ['Chuyển quầy', 'Ctrl+Alt+C'], ['Gọi / tra cứu số', 'Ctrl+Alt+G'], ['Thu gọn / mở rộng', 'Ctrl+Alt+M'], ['Khách đã đến', 'Ctrl+Alt+D']];
    dialog(`<h3>Phím tắt</h3><p>Bản thật dùng phím tắt toàn cục, hoạt động cả khi con trỏ đang ở phần mềm Một cửa.</p><table class="keys">${rows.map((r) => `<tr><td>${r[0]}</td><td><kbd>${r[1]}</kbd></td></tr>`).join('')}</table><div class="dlg-act"><button data-d="close">Đóng</button></div>`);
  }

  /* =========================================================
     SỰ KIỆN
     ========================================================= */
  const ACT = {
    next: callNext, recall, skip: () => skip(false), done, transfer: openTransfer, arrived,
    mini: () => { S.mini = !S.mini; $('#screen').classList.toggle('is-mini', S.mini); renderMini(); },
    menu: () => $('#menu').classList.toggle('is-on'),
    pause: () => { $('#menu').classList.remove('is-on'); openPause(); },
    cancel: () => { $('#menu').classList.remove('is-on'); openCancel(); },
    keys: () => { $('#menu').classList.remove('is-on'); keysDialog(); },
    resume,
    kp: () => { const on = !$('#kp').classList.contains('is-on'); $('#kp').classList.toggle('is-on', on); $('.kp-btn').classList.toggle('on', on); syncKeypad(); },
    clr: (e) => { e.preventDefault(); clearSearch(); }
  };

  $('#screen').addEventListener('click', (e) => {
    const t = e.target;
    const a = t.closest('[data-act]'); if (a && ACT[a.dataset.act]) { ACT[a.dataset.act](e); return; }
    const k = t.closest('[data-k]'); if (k) return keypad(k.dataset.k);
    const pv = t.closest('[data-pv]'); if (pv) return pvAction(pv.dataset.pv);
    const rs = t.closest('[data-rs]');
    if (rs && PV) { PV.reason = +rs.dataset.rs; $$('#pv [data-rs]').forEach((b) => b.classList.toggle('on', b === rs)); const er = $('#pvErr'); if (er) er.classList.remove('is-on'); return; }
    const tab = t.closest('[data-tab]'); if (tab) { S.tab = tab.dataset.tab; return renderList(); }
    const rst = t.closest('[data-restore]'); if (rst) { $('#srch').value = rst.dataset.restore; return showPreview(); }
    const row = t.closest('.r[data-num]'); if (row) { $('#srch').value = row.dataset.num; syncKeypad(); return showPreview(); }
    const opt = t.closest('[data-opt]'); if (opt) return doTransfer(opt.dataset.opt);
    const cn = t.closest('[data-cancel]');
    if (cn) { const reason = CANCEL_REASONS[+cn.dataset.cancel]; S.cancelled.add(S.cur.num); S.served.unshift({ num: S.cur.num, at: now(), res: `Hủy · ${reason}` }); return endCurrent(); }
    const pr = t.closest('[data-pr]'); if (pr) { pauseSel.r = +pr.dataset.pr; $$('[data-pr]').forEach((b) => b.classList.toggle('on', b === pr)); return; }
    const pm = t.closest('[data-pm]'); if (pm) { pauseSel.m = +pm.dataset.pm; $$('[data-pm]').forEach((b) => b.classList.toggle('on', b === pm)); return; }
    const d = t.closest('[data-d]');
    if (d) { if (d.dataset.d === 'close') return closeDialog(); if (d.dataset.d === 'skipForce') { closeDialog(); return skip(true); } if (d.dataset.d === 'pauseGo') return doPause(); }
    const mc = t.closest('[data-mc]'); if (mc) { if (mc.dataset.mc === 'start') arrived(); else $('#mcPop').classList.remove('is-on'); return; }
    if (t === $('#dlgWrap')) closeDialog();
    if (!t.closest('#menu') && !t.closest('[data-act="menu"]')) $('#menu').classList.remove('is-on');
  });

  $('#srch').addEventListener('input', () => { syncKeypad(); showPreview(); });
  $('#srch').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clearSearch(); $('#srch').blur(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!PV) return showPreview();
      if (['wait', 'own'].includes(PV.r.k)) pvAction('call');
      else if (PV.r.k === 'pending') pvAction('restore');
    }
  });

  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && e.altKey)) return;
    const map = { n: 'next', r: 'recall', h: 'done', b: 'skip', c: 'transfer', m: 'mini', d: 'arrived' };
    const k = e.key.toLowerCase();
    if (k === 'g') { e.preventDefault(); if (S.mini) ACT.mini(); $('#srch').focus(); return; }
    if (map[k]) { e.preventDefault(); ACT[map[k]](); }
  });

  /* Kéo thanh thu gọn */
  (() => {
    const m = $('#mini'); let drag = null;
    m.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = m.getBoundingClientRect();
      drag = { dx: (e.clientX - r.left) / SCALE, dy: (e.clientY - r.top) / SCALE };
      m.setPointerCapture(e.pointerId); m.style.cursor = 'grabbing';
    });
    m.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const s = $('#screen').getBoundingClientRect();
      const x = Math.min(1920 - 400, Math.max(0, (e.clientX - s.left) / SCALE - drag.dx));
      const y = Math.min(1032 - 56, Math.max(0, (e.clientY - s.top) / SCALE - drag.dy));
      Object.assign(m.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
    });
    m.addEventListener('pointerup', () => { drag = null; m.style.cursor = ''; });
  })();

  /* =========================================================
     BẢNG MÔ PHỎNG
     ========================================================= */
  const SIM = {
    issue: () => { const n = `A-${pad(++lastA)}`; eng.add({ num: n, citizen: Math.random() < 0.4 ? pick(NAMES) : null, via: 'CCCD' }); S.fresh.add(n); renderAll(); },
    vip: () => {
      const n = `V-${pad(++lastV)}`;
      const pos = eng.add({ num: n, cls: 'priority', citizen: pick(NAMES), via: 'CCCD' });
      S.fresh.add(n); banner('info', `Lễ tân xác nhận số ưu tiên <b>${n}</b> · xếp vị trí thứ ${pos + 1}.`, 6000); renderAll();
    },
    booking: () => {
      const n = `A-${pad(++lastA)}`, d = new Date(now() + 5 * 60000);
      const pos = eng.add({ num: n, cls: 'booking', citizen: pick(NAMES), via: 'VNeID', appt: hhmm(Math.round(d / 900000) * 900000) });
      S.fresh.add(n); banner('info', `Công dân đặt lịch check-in <b>${n}</b> · xếp vị trí thứ ${pos + 1}.`, 6000); renderAll();
    },
    other: () => {
      const x = eng.takeHead(); if (!x) return;
      const c = ['02', '03'][S.otherTurn++ % 2]; S.others[c] = x.num; renderAll();
    },
    incoming: () => {
      if (S.ownQ.some((x) => x.num === 'C-0040')) return;
      S.ownQ.push({ num: 'C-0040', cls: 'transfer', from: '06', citizen: 'Đặng Thu Hà', via: 'CCCD', svc: SVC.C });
      S.fresh.add('C-0040'); chime(); banner('ok', `Số chuyển đến: <b>C-0040</b> từ quầy 06 · được xếp đầu hàng riêng của quầy (TRF-02).`, 8000); renderAll();
    },
    return: () => {
      const lt = S.lastTransferred;
      const item = lt ? { ...lt.item, cls: 'return', from: lt.to } : { num: 'A-0056', cls: 'return', from: '15', citizen: 'Phạm Quốc Huy', via: 'CCCD' };
      if (S.ownQ.some((x) => x.num === item.num)) return;
      S.ownQ.unshift(item); S.lastTransferred = null; S.fresh.add(item.num);
      chime(); banner('ok', `<b>Khách đã quay lại:</b> ${item.num} từ quầy ${item.from} (TRF-03).`, 10000); renderAll();
    },
    example: () => {
      seed(64, 7, 41); lastA = 70; S.tab = 'queue'; $('#showOT').checked = true; renderAll();
      banner('info', 'Ví dụ: hàng đợi ban đầu A-0064 … A-0070. A-0064, A-0065, A-0066 đang hiện trên màn hình "Sắp gọi".', 5000);
      const steps = [
        () => { lastV = 4; SIM.vip(); },
        () => SIM.booking(),
        () => SIM.vip(),
        () => { SIM.vip(); banner('warn', 'A-0065 và A-0066 đã bị vượt đủ 3 lần nên bị khóa. V-0007 được xếp sau các số này nhưng vẫn trước phần đuôi chưa hiện.', 12000); }
      ];
      steps.forEach((f, i) => setTimeout(f, 1800 * (i + 1)));
    },
    ff: () => {
      const ms = 5 * 60000;
      eng.shiftTime(5); S.pending.forEach((x) => { x.skippedAt -= ms; });
      if (S.serveStart) S.serveStart -= ms; S.lastCallAt -= ms;
      banner('info', 'Đã tua nhanh 5 phút: thời gian chờ, SLA và hạn chờ nhỡ cùng tăng.', 4000, 'ff'); renderAll();
    }
  };
  $('#sim').addEventListener('click', (e) => { const b = e.target.closest('[data-sim]'); if (b && SIM[b.dataset.sim]) SIM[b.dataset.sim](); });
  $('#offline').addEventListener('change', (e) => {
    S.offline = e.target.checked;
    $('#pnl').classList.toggle('is-off', S.offline);
    $('#pNet b').textContent = S.offline ? 'Mất kết nối' : 'Trực tuyến';
    if (S.offline) banner('err', 'Mất kết nối Local Server. Thao tác gọi số tạm khóa, đang thử kết nối lại…', 0, 'off');
    else { const b = $('.bn[data-id="off"]'); if (b) b.remove(); banner('ok', 'Đã kết nối lại Local Server.', 3000); }
    renderAll();
  });
  $('#showOT').addEventListener('change', renderList);

  /* ---------- Đồng hồ và các bộ đếm ---------- */
  let tickN = 0;
  setInterval(() => {
    tickN++;
    const d = new Date();
    $('#tbClock').innerHTML = `${hhmm(d)}<br>${d.toLocaleDateString('vi-VN')}`;
    updateSla(); updateCooldown();
    if (S.state === 'serving' && $('#miniT')) $('#miniT').textContent = mmss(now() - S.serveStart);
    const exp = S.pending.filter((x) => now() - x.skippedAt >= CFG.pendingMin * 60000);
    if (exp.length) {
      exp.forEach((x) => { S.cancelled.add(x.num); S.served.unshift({ num: x.num, at: now(), res: 'Tự hủy sau 30\' chờ nhỡ' }); });
      S.pending = S.pending.filter((x) => !exp.includes(x));
      renderList();
    }
    if (tickN % 15 === 0 && !$('#list').matches(':hover')) renderList();
    if (S.state === 'calling') renderCtlClassesOnly();
  }, 1000);

  /* ---------- Khởi động ---------- */
  renderKeypad();
  fit();
  renderAll();
  $('#tbClock').innerHTML = `${hhmm(now())}<br>${new Date().toLocaleDateString('vi-VN')}`;
  if (document.fonts) document.fonts.ready.then(fit);
})();
