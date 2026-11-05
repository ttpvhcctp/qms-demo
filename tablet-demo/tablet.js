/* =========================================================
   MÁY TÍNH BẢNG ĐÁNH GIÁ HÀI LÒNG – QMS ĐA ĐIỂM · Bản demo
   - Màn hình đổi theo thao tác cán bộ (bản thật: sự kiện WebSocket từ Local Server)
   - Thang 5 mức: 5 Rất hài lòng · 4 Hài lòng · 3 Bình thường · 2 Không hài lòng · 1 Rất không hài lòng
   - Mức 1–3 hỏi thêm lý do. Mỗi lượt chỉ đánh giá 1 lần, gắn với số phiếu.
   - Phiên đánh giá không bị lần gọi số mới cắt ngang. Hết 15 giây không chạm → "Không đánh giá".
   - Mất kết nối: lưu tạm trên máy, tự gửi khi có mạng. Đánh giá < 1 giây sau Hoàn thành → đánh dấu nghi bấm hộ.
   ========================================================= */
(() => {
  'use strict';

  const CFG = { rateSec: 15, whySec: 15, thanksSec: 4, moveSec: 20, proxyMs: 1000 };
  const STAFF = { name: 'Nguyễn Thị Thanh Hương', role: 'Chuyên viên', field: 'Đất đai · Cấp mới, cấp đổi' };
  const SVC = 'Đất đai · Cấp mới, cấp đổi giấy chứng nhận';
  const LABEL = { 5: 'Rất hài lòng', 4: 'Hài lòng', 3: 'Bình thường', 2: 'Không hài lòng', 1: 'Rất không hài lòng' };
  const COLOR = { 5: '#1B873F', 4: '#1D9E75', 3: '#BA7517', 2: '#D85A30', 1: '#E24B4A' };
  const REASONS = ['Thời gian chờ lâu', 'Thái độ chưa tốt', 'Quy trình phức tạp', 'Hướng dẫn chưa rõ', 'Phải đi lại nhiều lần', 'Lý do khác'];
  const TICKETS = ['A-0063', 'A-0064', 'V-0005', 'A-0065', 'A-0066', 'A-0067', 'A-0068', 'V-0006', 'A-0069', 'A-0070'];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const now = () => Date.now();
  const hhmm = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });

  /* ---------- Trạng thái ---------- */
  const S = {
    screen: 'idle',
    staff: 'ready',            // ready | calling | serving   (trạng thái phía cán bộ)
    cur: null, seq: 0, lastTransferred: null, paused: false,
    session: null,             // { num, t0, level, reasons:Set, left, kind:'rate'|'why' }
    offline: false, queued: 0,
    rec: [], none: 2
  };
  /* Số liệu sẵn có trong ngày để bảng chỉ số có nghĩa */
  [[5, 7], [4, 3], [3, 1], [2, 1]].forEach(([l, n]) => { for (let i = 0; i < n; i++) S.rec.push({ num: '—', level: l, reasons: l <= 3 ? ['Thời gian chờ lâu'] : [], ms: 4000, seed: true }); });

  /* ---------- Co giãn ---------- */
  const params = new URLSearchParams(location.search);
  const isFull = params.get('full') === '1';
  if (isFull) document.body.classList.add('is-full');
  function fit() {
    const bez = isFull ? 0 : 20;
    const panel = isFull ? 0 : $('#sim').offsetWidth + 28;
    const gap = isFull ? 0 : 60;
    const s = Math.min((innerWidth - panel - gap - bez * 2) / 1280, (innerHeight - gap - bez * 2) / 720);
    const d = $('#device');
    d.style.width = 1280 * s + bez * 2 + 'px';
    d.style.height = 720 * s + bez * 2 + 'px';
    Object.assign($('#tab').style, { left: bez + 'px', top: bez + 'px', transform: `scale(${s})` });
  }
  addEventListener('resize', fit);

  /* ---------- Mặt cười vẽ bằng SVG ---------- */
  function face(l) {
    const m = {
      5: '<path class="fm fill" d="M28 56 Q50 86 72 56 Z"/>',
      4: '<path class="fm" d="M30 60 Q50 77 70 60"/>',
      3: '<path class="fm" d="M33 66 L67 66"/>',
      2: '<path class="fm" d="M32 71 Q50 58 68 71"/>',
      1: '<path class="fm" d="M30 75 Q50 54 70 75"/><path class="fm" d="M26 30 L41 37 M74 30 L59 37"/>'
    }[l];
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="fc" cx="50" cy="50" r="44"/><circle class="fe" cx="36" cy="43" r="5.5"/><circle class="fe" cx="64" cy="43" r="5.5"/>${m}</svg>`;
  }
  $('#faces').innerHTML = [5, 4, 3, 2, 1].map((l, i) => `<button class="face lv${l}" style="--i:${i}" data-lv="${l}">${face(l)}<b>${LABEL[l]}</b></button>`).join('');

  /* ---------- Trình chiếu khi chờ ---------- */
  const SLIDES = [
    { cap: 'Thành phố Hồ Chí Minh', sub: 'Ảnh minh họa', sky: 'linear-gradient(180deg,#F6B26B 0%,#E07A5F 35%,#3D405B 100%)', land: '#2B2D42', water: '#3D5A80' },
    { cap: 'Sông Sài Gòn', sub: 'Ảnh minh họa', sky: 'linear-gradient(180deg,#8EC5FC 0%,#BFE3F8 55%,#E0F2FE 100%)', land: '#1F4E5F', water: '#4A90A4' },
    { cap: 'Công viên và không gian xanh', sub: 'Ảnh minh họa', sky: 'linear-gradient(180deg,#A8E6CF 0%,#DCEDC1 60%,#FFF6D6 100%)', land: '#2D6A4F', water: '#52B788' }
  ];
  $('#slides').innerHTML = SLIDES.map((s) => `
    <div class="slide"><div class="sky" style="background:${s.sky}"></div>
      <svg viewBox="0 0 1280 446" preserveAspectRatio="xMidYMax slice">
        <g fill="${s.land}" opacity=".55"><rect x="60" y="150" width="90" height="296"/><rect x="170" y="90" width="70" height="356"/><rect x="900" y="120" width="110" height="326"/><rect x="1030" y="60" width="80" height="386"/><rect x="1130" y="170" width="120" height="276"/></g>
        <g fill="${s.land}"><rect x="300" y="200" width="130" height="246"/><path d="M520 446V110l40-60 40 60v336z"/><rect x="640" y="170" width="160" height="276"/><rect x="820" y="230" width="90" height="216"/></g>
        <path d="M0 400 Q 160 380 320 400 T 640 400 T 960 400 T 1280 400 V446 H0z" fill="${s.water}" opacity=".85"/>
      </svg></div>`).join('');
  let slideI = 0;
  function showSlide(i) {
    slideI = i;
    $$('.slide').forEach((el, k) => el.classList.toggle('is-on', k === i));
    $('#idleCap').innerHTML = `${SLIDES[i].cap}<small>${SLIDES[i].sub}</small>`;
  }
  showSlide(0);
  setInterval(() => { if (S.screen === 'idle') showSlide((slideI + 1) % SLIDES.length); }, 9000);

  /* ---------- Chuyển màn hình ---------- */
  function show(name) {
    S.screen = name;
    $$('.scr').forEach((el) => el.classList.toggle('is-on', el.dataset.s === name));
  }

  /* =========================================================
     THAO TÁC CỦA CÁN BỘ
     ========================================================= */
  function call() {
    if (S.paused) return toast('Quầy đang tạm ngưng.');
    if (S.staff !== 'ready') return toast(`Hoàn thành, bỏ qua hoặc chuyển ${S.cur.num} trước (CALL-05).`);
    const num = TICKETS[S.seq++ % TICKETS.length];
    S.cur = { num, note: num[0] === 'V' ? 'pri' : null };
    S.staff = 'calling';
    renderServe(true);
    if (!S.session) show('serve');
    else toast(`Máy tính bảng giữ màn hình đánh giá lượt ${S.session.num}, sau đó mới chuyển sang ${num}.`);
  }
  function arrive() {
    if (S.staff !== 'calling') return toast('Chưa có số đang gọi.');
    S.staff = 'serving'; renderServe(false);
  }
  function done(proxy) {
    if (S.staff === 'ready') return toast('Chưa có số đang phục vụ.');
    const num = S.cur.num;
    S.staff = 'ready'; S.cur = null;
    startRating(num);
    if (proxy) setTimeout(() => pick(5), 500);
  }
  function skip() {
    if (S.staff !== 'calling') return toast('Bỏ qua chỉ dùng khi đang gọi mà khách chưa đến.');
    S.staff = 'ready'; S.cur = null;
    if (!S.session) show('idle');
  }
  let moveT, moveIv;
  function transfer() {
    if (S.staff !== 'serving') return toast('Chỉ chuyển quầy khi đang phục vụ (bấm "Khách đã đến" trước).');
    S.lastTransferred = S.cur.num;
    $('#mvNum').textContent = S.cur.num;
    S.staff = 'ready'; S.cur = null;
    show('move');
    const t0 = now();
    clearInterval(moveIv); clearTimeout(moveT);
    $('#mvBar').style.transform = 'scaleX(1)';
    moveIv = setInterval(() => { $('#mvBar').style.transform = `scaleX(${Math.max(0, 1 - (now() - t0) / (CFG.moveSec * 1000))})`; }, 200);
    moveT = setTimeout(() => { clearInterval(moveIv); if (S.screen === 'move') show(S.paused ? 'pause' : 'idle'); }, CFG.moveSec * 1000);
  }
  function back() {
    if (S.staff !== 'ready') return toast('Hoàn thành số hiện tại trước.');
    const num = S.lastTransferred || 'A-0058';
    S.cur = { num, note: 'back' }; S.staff = 'calling'; S.lastTransferred = null;
    renderServe(true);
    if (!S.session) show('serve');
  }
  function pause() {
    if (S.paused) { S.paused = false; if (!S.session) show('idle'); return; }
    if (S.staff !== 'ready') return toast('Hoàn thành số hiện tại trước khi tạm ngưng.');
    S.paused = true; if (!S.session) show('pause');
  }

  function renderServe(isNew) {
    const c = S.cur;
    $('#tLbl').textContent = S.staff === 'calling' ? 'MỜI SỐ' : 'ĐANG PHỤC VỤ SỐ';
    $('#tLbl').classList.toggle('is-call', S.staff === 'calling');
    const n = $('#tNum');
    n.textContent = c.num;
    if (isNew) { n.classList.remove('is-new'); void n.offsetWidth; n.classList.add('is-new'); }
    $('#tSvc').textContent = SVC;
    const note = $('#tNote');
    note.className = 't-note ' + (c.note || '');
    note.textContent = c.note === 'back' ? 'Chào mừng Quý công dân quay lại quầy 01' : c.note === 'pri' ? 'Đối tượng ưu tiên' : '';
  }

  /* =========================================================
     PHIÊN ĐÁNH GIÁ
     ========================================================= */
  let tickIv;
  function startRating(num) {
    S.session = { num, t0: now(), level: null, reasons: new Set(), left: CFG.rateSec, kind: 'rate' };
    $('#rateSub').textContent = `Lượt ${num} · Cán bộ ${STAFF.name} · chạm 1 lần để đánh giá`;
    $$('.face').forEach((f) => f.classList.remove('is-picked', 'is-dim'));
    show('rate');
    runTimer();
  }
  function runTimer() {
    clearInterval(tickIv);
    drawRing();
    tickIv = setInterval(() => {
      const s = S.session; if (!s) return clearInterval(tickIv);
      s.left--;
      drawRing();
      if (s.left <= 0) {
        clearInterval(tickIv);
        if (s.kind === 'rate') { S.none++; logNone(s.num); endSession(); }
        else submit();
      }
    }, 1000);
  }
  function drawRing() {
    const s = S.session; if (!s) return;
    const total = s.kind === 'rate' ? CFG.rateSec : CFG.whySec;
    const ring = s.kind === 'rate' ? $('#ring1') : $('#ring2');
    ring.querySelector('b').textContent = Math.max(0, s.left);
    ring.querySelector('.p').style.strokeDashoffset = 106.8 * (1 - Math.max(0, s.left) / total);
  }
  /* Mỗi lần chạm: đếm lại từ đầu */
  $('#tab').addEventListener('pointerdown', () => {
    const s = S.session;
    if (s && !s.done) { s.left = s.kind === 'rate' ? CFG.rateSec : CFG.whySec; drawRing(); }
  });

  function pick(level) {
    const s = S.session; if (!s || s.level) return;
    s.level = level; s.tPick = now();
    $$('.face').forEach((f) => { const on = +f.dataset.lv === level; f.classList.toggle('is-picked', on); f.classList.toggle('is-dim', !on); });
    setTimeout(() => {
      if (level >= 4) return submit();
      s.kind = 'why'; s.left = CFG.whySec;
      $('#whyFace').innerHTML = face(level);
      $('#whyFace').className = `why-face lv${level}`;
      $('#reasons').innerHTML = REASONS.map((r, i) => `<button class="rs" data-rs="${i}"><i><svg class="ic"><use href="#i-check"/></svg></i>${r}</button>`).join('');
      show('why');
      runTimer();
    }, 380);
  }
  function submit() {
    const s = S.session; if (!s || s.done) return;
    s.done = true; clearInterval(tickIv);
    const rec = { num: s.num, level: s.level, reasons: [...s.reasons].map((i) => REASONS[i]), ms: s.tPick - s.t0, ts: now() };
    rec.flag = rec.ms < CFG.proxyMs;
    S.rec.push(rec);
    if (S.offline) S.queued++;
    renderStats();
    $('#thMsg').textContent = s.level <= 2
      ? 'Ý kiến của Quý công dân được chuyển đến Lãnh đạo Trung tâm để xem xét.'
      : 'Ý kiến của Quý công dân giúp Trung tâm phục vụ tốt hơn.';
    show('thanks');
    setTimeout(endSession, CFG.thanksSec * 1000);
  }
  function endSession() {
    S.session = null; clearInterval(tickIv);
    if (S.staff !== 'ready' && S.cur) { renderServe(true); show('serve'); }
    else show(S.paused ? 'pause' : 'idle');
  }

  $('#tab').addEventListener('click', (e) => {
    const f = e.target.closest('[data-lv]'); if (f) return pick(+f.dataset.lv);
    const r = e.target.closest('[data-rs]');
    if (r && S.session) { const i = +r.dataset.rs; S.session.reasons.has(i) ? S.session.reasons.delete(i) : S.session.reasons.add(i); r.classList.toggle('on'); return; }
    const a = e.target.closest('[data-a]');
    if (a && S.session) { if (a.dataset.a === 'skipWhy') S.session.reasons.clear(); submit(); }
  });

  /* =========================================================
     SỐ LIỆU GỬI VỀ DASHBOARD
     ========================================================= */
  function logNone(num) {
    const el = document.createElement('div');
    el.innerHTML = `<b>${num}</b> · Không đánh giá (hết ${CFG.rateSec} giây)`;
    $('#log').prepend(el);
    renderStats();
  }
  function renderStats() {
    const r = S.rec, n = r.length;
    const avg = n ? r.reduce((a, x) => a + x.level, 0) / n : 0;
    const good = r.filter((x) => x.level >= 4).length, bad = r.filter((x) => x.level <= 2).length;
    const flags = r.filter((x) => x.flag).length;
    const noneRate = Math.round((S.none / (n + S.none)) * 100);
    $('#kpi').innerHTML = `
      <div><span>Lượt đánh giá</span><b>${n}</b></div>
      <div><span>Điểm trung bình</span><b>${avg.toFixed(2).replace('.', ',')} / 5</b></div>
      <div><span>% hài lòng (4–5)</span><b>${n ? Math.round((good / n) * 100) : 0}%</b></div>
      <div><span>Phiếu kém (1–2)</span><b>${bad}</b></div>
      <div><span>Không đánh giá</span><b>${noneRate}%</b></div>
      <div><span>Nghi bấm hộ</span><b>${flags}</b></div>`;
    const max = Math.max(1, ...[5, 4, 3, 2, 1].map((l) => r.filter((x) => x.level === l).length));
    $('#dist').innerHTML = [5, 4, 3, 2, 1].map((l) => {
      const c = r.filter((x) => x.level === l).length;
      return `<div><span>${LABEL[l]}</span><i><em style="width:${(c / max) * 100}%;background:${COLOR[l]}"></em></i><b>${c}</b></div>`;
    }).join('');
    const last = r[r.length - 1];
    if (last && !last.seed && !last.logged) {
      last.logged = true;
      const el = document.createElement('div');
      if (last.flag) el.className = 'flag';
      el.innerHTML = `<b>${last.num}</b> · ${last.level} ${LABEL[last.level]} · ${(last.ms / 1000).toFixed(1).replace('.', ',')} giây sau Hoàn thành${last.reasons.length ? `<br>Lý do: ${last.reasons.join(', ')}` : ''}${last.flag ? '<br>⚠ Phản hồi dưới 1 giây, đánh dấu nghi bấm hộ' : ''}${S.offline ? '<br>Đang lưu tạm trên máy' : ''}`;
      $('#log').prepend(el);
    }
    $('#queued').innerHTML = S.offline ? `Đang lưu tạm <b>${S.queued}</b> đánh giá, sẽ tự gửi khi có mạng.` : '';
  }

  /* =========================================================
     BẢNG MÔ PHỎNG
     ========================================================= */
  let toastT;
  function toast(m) { const el = $('#toast'); el.textContent = m; el.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('is-on'), 3400); }
  const SIM = { call, arrive, done: () => done(false), skip, transfer, back, pause, proxy: () => { if (S.staff === 'ready') call(); arrive(); done(true); } };
  $('#sim').addEventListener('click', (e) => { const b = e.target.closest('[data-sim]'); if (b) SIM[b.dataset.sim](); });
  $('#offline').addEventListener('change', (e) => {
    S.offline = e.target.checked;
    if (!S.offline && S.queued) { toast(`Đã có mạng lại, đã gửi ${S.queued} đánh giá lưu tạm.`); S.queued = 0; }
    renderStats();
  });

  /* Tự động mô phỏng một ca làm việc */
  let autoOn = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function autoLoop() {
    while (autoOn) {
      if (S.staff === 'ready' && !S.paused) call();
      await wait(3000); if (!autoOn) break;
      if (S.staff === 'calling') arrive();
      await wait(7000); if (!autoOn) break;
      if (S.staff === 'serving') done(false);
      await wait(2500); if (!autoOn) break;
      if (S.session && !S.session.level && Math.random() < 0.85) {
        const l = [5, 5, 5, 4, 4, 3, 2, 1][Math.floor(Math.random() * 8)];
        pick(l);
        if (l <= 3) { await wait(1500); const rb = $$('.rs')[Math.floor(Math.random() * 3)]; if (rb) rb.click(); await wait(1200); submit(); }
      }
      await wait(6500);
    }
  }
  $('#auto').addEventListener('change', (e) => { autoOn = e.target.checked; if (autoOn) autoLoop(); });

  /* ---------- Đồng hồ, khởi động ---------- */
  const tick = () => $$('[data-clock]').forEach((el) => { el.textContent = hhmm(now()); });
  setInterval(tick, 1000); tick();
  fit(); renderStats(); show('idle');
  if (isFull && params.get('auto') !== '0') { $('#auto').checked = true; autoOn = true; autoLoop(); }
  if (document.fonts) document.fonts.ready.then(fit);
})();
