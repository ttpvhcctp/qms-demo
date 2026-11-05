/* =========================================================
   MÀN HÌNH HIỂN THỊ TẠI QUẦY – QMS ĐA ĐIỂM · Bản demo
   - Mỗi màn hình gắn 1 quầy (?counter=01). Nội dung đổi theo thao tác trên giao diện Cán bộ
     (bản thật: sự kiện WebSocket từ Local Server).
   - "Sắp gọi" = hàng riêng của quầy (chuyển đến / quay lại) + hàng đợi CHUNG của lĩnh vực.
     Thứ tự hàng chung do queue-engine.js quyết định theo quy tắc chèn đã thống nhất
     (ưu tiên sau 1 người, đặt lịch sau 2 người, phục hồi sau 3 người, khóa số đã hiện sau 3 lần bị vượt).
   - CALL-05: phải Hoàn thành / Bỏ qua / Chuyển số hiện tại trước khi gọi số mới.
   - Không hiển thị họ tên công dân và đồng hồ SLA trên màn hình công khai.
   ========================================================= */
(() => {
  'use strict';

  const CFG = {
    callSec: 12,          // thời gian nhãn "MỜI SỐ" (bằng thời lượng loa đọc)
    thanksSec: 10,        // màn hình cảm ơn sau khi Hoàn thành
    lostSec: 60,          // mất kết nối quá ngưỡng này thì dải dưới chuyển sang lời nhắc theo dõi loa
    photoPath: 'photos/{counter}.jpg'   // ảnh thẻ cán bộ (vuông, sẽ được cắt tròn); thiếu ảnh thì hiện chữ viết tắt
  };

  /* ---------- Danh mục lĩnh vực và quầy (theo bảng danh mục trong đặc tả) ---------- */
  const SERVICES = {
    A: { name: 'Đất đai · Cấp mới, cấp đổi giấy chứng nhận', short: 'Đất đai · Cấp mới, cấp đổi', counters: ['01', '02', '03'], sla: 20, next: 64, waiting: 23 },
    B: { name: 'Đất đai · Giao dịch bảo đảm', short: 'Đất đai · Giao dịch bảo đảm', counters: ['04', '05'], sla: 10, next: 27, waiting: 5 },
    C: { name: 'Tư pháp · Quốc tịch, hộ tịch', short: 'Tư pháp · Hộ tịch', counters: ['06', '07'], sla: 15, next: 42, waiting: 7 },
    D: { name: 'Tư pháp · Công chứng', short: 'Tư pháp · Công chứng', counters: ['08'], sla: 10, next: 38, waiting: 3 },
    F: { name: 'Vận tải và phù hiệu xe', short: 'Vận tải, phù hiệu xe', counters: ['11'], sla: 15, next: 10, waiting: 3 },
    G: { name: 'Bảo hiểm xã hội, bảo hiểm y tế', short: 'BHXH, BHYT', counters: ['12', '13'], sla: 15, next: 32, waiting: 9 },
    K: { name: 'Trả kết quả chung', short: 'Trả kết quả', counters: ['18', '19', '20'], sla: 2, next: 54, waiting: 2 }
  };

  /* ---------- Cán bộ mẫu (tên minh họa, thay bằng danh mục cán bộ thật) ---------- */
  const STAFF = {
    '01': ['Nguyễn Thị Thanh Hương', 'Chuyên viên'], '02': ['Trần Minh Khoa', 'Chuyên viên'], '03': ['Lê Hoàng Phúc', 'Chuyên viên chính'],
    '04': ['Phạm Thu Trang', 'Chuyên viên'], '05': ['Võ Quốc Bảo', 'Chuyên viên'], '06': ['Đặng Ngọc Anh', 'Chuyên viên'],
    '07': ['Bùi Văn Tâm', 'Chuyên viên'], '08': ['Huỳnh Mỹ Linh', 'Công chứng viên'], '11': ['Ngô Đức Thịnh', 'Chuyên viên'],
    '12': ['Dương Thị Hạnh', 'Chuyên viên'], '13': ['Lý Gia Huy', 'Chuyên viên'], '18': ['Mai Thanh Tùng', 'Cán sự'],
    '19': ['Tô Kim Ngân', 'Cán sự'], '20': ['Hồ Nhật Minh', 'Cán sự']
  };
  const ALL = Object.values(SERVICES).flatMap((s) => s.counters).sort();

  /* ---------- Trạng thái ---------- */
  const S = {
    counter: '01', code: 'A',
    Q: new QueueEngine(), ownQ: [], lastIssued: 0, lastV: 5,   // hàng chung của lĩnh vực / hàng riêng của quầy
    cur: null, state: 'serving', recalls: 0,
    paused: false, closed: false, offline: false, offlineSince: 0,
    lastTransferred: null
  };

  /* ---------- Tiện ích ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(4, '0');
  const svg = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
  const hhmm = (d) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const svc = () => SERVICES[S.code];
  const codeOf = (counter) => Object.keys(SERVICES).find((k) => SERVICES[k].counters.includes(counter));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Co giãn canvas ---------- */
  const params = new URLSearchParams(location.search);
  const isFull = params.get('full') === '1';
  if (isFull) document.body.classList.add('is-full');
  let SCALE = 1;
  function fit() {
    const panel = isFull ? 0 : $('#sim').offsetWidth + 24;
    const gap = isFull ? 0 : 60;
    SCALE = Math.min((innerWidth - panel - gap) / 1920, (innerHeight - gap) / 1080);
    $('#frame').style.width = 1920 * SCALE + 'px';
    $('#frame').style.height = 1080 * SCALE + 'px';
    $('#scr').style.transform = `scale(${SCALE})`;
  }
  addEventListener('resize', fit);

  /* =========================================================
     DỮ LIỆU QUẦY
     ========================================================= */
  function loadCounter(counter, animate) {
    S.counter = counter;
    S.code = codeOf(counter);
    const s = svc();
    seedQueue(s.waiting);
    S.Q.add({ num: 'V-0005', cls: 'priority' });
    S.ownQ = [];
    S.cur = { num: `${S.code}-${pad(s.next - 1)}` };
    S.state = 'serving'; S.recalls = 0;
    renderIdentity(animate);
    renderMain();
    renderStrip(false);
    $('#pCnt').textContent = $('#cCnt').textContent = counter;
    $('#cField').textContent = s.name;
  }

  function seedQueue(count) {
    const s = svc();
    S.Q = new QueueEngine();
    for (let i = 0; i < count; i++) S.Q.add({ num: `${S.code}-${pad(s.next + i)}`, issuedAt: Date.now() - (40 - i * 1.5) * 60000 });
    S.lastIssued = s.next + count - 1;
  }

  function initialsOf(name) {
    const w = name.trim().split(/\s+/);
    return (w.length > 1 ? w[w.length - 2][0] + w[w.length - 1][0] : w[0][0]).toUpperCase();
  }

  function renderIdentity(animate) {
    const [name, role] = STAFF[S.counter] || ['Cán bộ', 'Chuyên viên'];
    $('#cntNum').textContent = S.counter;
    $('#stName').textContent = name;
    $('#stRole').textContent = role;
    $('#stField').textContent = svc().short;
    $('#initials').textContent = initialsOf(name);
    const av = $('#avatar'), img = $('#photo');
    av.classList.remove('has-photo');
    img.onload = () => av.classList.add('has-photo');
    img.onerror = () => av.classList.remove('has-photo');
    img.src = CFG.photoPath.replace('{counter}', S.counter);
    fitName();
    if (animate) { const l = $('.left'); l.classList.remove('is-swap'); void l.offsetWidth; l.classList.add('is-swap'); }
  }

  /* Tên dài: giảm cỡ chữ cho vừa tối đa 2 dòng (40 px → tối thiểu 30 px) */
  function fitName() {
    const el = $('#stName');
    let size = 40;
    el.style.fontSize = size + 'px';
    while (size > 30 && (el.scrollHeight > size * 1.22 * 2 + 2 || el.scrollWidth > el.clientWidth)) {
      size -= 2; el.style.fontSize = size + 'px';
    }
  }

  /* ---------- Thứ tự "Sắp gọi" ---------- */
  function upcoming() {
    return [
      ...S.ownQ,
      ...S.Q.items.map((x) => ({ num: x.num, tag: x.cls === 'priority' || x.cls === 'booking' ? x.cls : null }))
    ];
  }
  const waitingTotal = () => S.ownQ.length + S.Q.length;
  function eta() {
    const open = svc().counters.length - (S.paused ? 1 : 0) || 1;
    const w = waitingTotal();
    return w ? Math.max(5, Math.round((w * svc().sla) / open / 5) * 5) : 0;
  }

  /* =========================================================
     RENDER
     ========================================================= */
  const CAP = {
    priority: () => 'ƯU TIÊN',
    booking: () => 'ĐẶT LỊCH',
    transfer: (c) => `CHUYỂN ĐẾN · Q.${c.from}`,
    return: (c) => `QUAY LẠI · Q.${c.from}`
  };

  function renderStrip(shift, newIdx = -1) {
    const s = svc();
    $('#sGroup').textContent = s.short.split(' · ')[0];
    $('#sCounters').textContent = `Quầy ${s.counters.join(', ')}`;
    const list = upcoming().slice(0, 3);
    $('#chips').innerHTML = list.map((c, i) => `
      <div class="chip ${c.tag ? 'c-' + c.tag : ''} ${i === newIdx ? 'is-new' : ''}" style="--i:${i}" data-num="${c.num}">
        <span class="cap">${c.tag ? CAP[c.tag](c) : 'THỨ ' + (i + 1)}</span>
        <span class="num">${c.num}</span>
      </div>`).join('');
    const chips = $('#chips');
    chips.classList.remove('is-shift');
    if (shift) { void chips.offsetWidth; chips.classList.add('is-shift'); }
    $('#strip').classList.toggle('is-empty', !list.length);
    setStat('#stWait', waitingTotal());
    const e = eta();
    setStat('#stEta', e);
  }
  function setStat(sel, v) {
    const el = $(sel);
    if (el.textContent !== String(v)) { el.textContent = v; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  function renderMain() {
    const blk = $('#mBlock');
    blk.dataset.state = S.state;
    const lbl = $('#mLbl');
    lbl.classList.toggle('is-calling', S.state === 'calling');
    lbl.textContent = S.state === 'calling'
      ? (S.recalls ? `MỜI LẠI SỐ · LẦN ${S.recalls + 1}` : 'MỜI SỐ')
      : S.state === 'serving' ? 'ĐANG PHỤC VỤ' : 'QUẦY ' + S.counter;
    if (S.cur) {
      $('#curNum').textContent = S.cur.num;
      const own = SERVICES[S.cur.num[0]];          // số chuyển đến giữ tên lĩnh vực gốc; số V dùng lĩnh vực của quầy
      $('#mSvc').textContent = own ? own.name : svc().name;
      const tags = [];
      if (S.cur.tag === 'priority') tags.push(`<span class="tag tag-priority">ƯU TIÊN</span>`);
      if (S.cur.tag === 'booking') tags.push(`<span class="tag tag-booking">ĐẶT LỊCH TRƯỚC</span>`);
      if (S.cur.tag === 'transfer') tags.push(`<span class="tag tag-transfer">${svg('i-arrow')} CHUYỂN TỪ QUẦY ${S.cur.from}</span>`);
      if (S.cur.tag === 'return') tags.push(`<span class="tag tag-return">${svg('i-redo')} KHÁCH QUAY LẠI TỪ QUẦY ${S.cur.from}</span>`);
      $('#mTags').innerHTML = tags.join('');
    }
    const nx = upcoming()[0];
    $('#readyNext').innerHTML = nx ? `Số tiếp theo: <span class="num">${nx.num}</span>` : 'Hiện chưa có khách chờ';
  }

  /* =========================================================
     THAO TÁC CÁN BỘ
     ========================================================= */
  let callT, thanksT;

  function takeFirst() {
    if (S.ownQ.length) return S.ownQ.shift();
    const x = S.Q.takeHead();
    return x ? { num: x.num, tag: x.cls === 'priority' || x.cls === 'booking' ? x.cls : null } : null;
  }

  async function callNext() {
    if (blocked()) return;
    if (['calling', 'serving'].includes(S.state)) return toast(`Hoàn thành, bỏ qua hoặc chuyển ${S.cur.num} trước khi gọi số mới (CALL-05).`);
    const first = upcoming()[0];
    if (!first) return toast('Không còn khách chờ.');
    const chip = $(`.chip[data-num="${first.num}"] .num`);
    const from = chip ? rectIn(chip) : null;
    S.cur = takeFirst();
    S.state = 'calling'; S.recalls = 0;
    clearTimeout(thanksT);
    renderMain();
    const cur = $('#curNum');
    cur.classList.add('is-hidden');
    cur.classList.remove('is-pulse');
    renderStrip(true);
    await flyTo(from, cur);
    cur.classList.remove('is-hidden');
    void cur.offsetWidth; cur.classList.add('is-pulse');
    armCall();
  }

  function armCall() {
    clearTimeout(callT);
    callT = setTimeout(() => { if (S.state === 'calling') { S.state = 'serving'; renderMain(); } }, CFG.callSec * 1000);
  }

  function recall() {
    if (blocked()) return;
    if (!S.cur || !['calling', 'serving'].includes(S.state)) return toast('Chưa có số đang phục vụ để gọi lại.');
    S.recalls++;
    S.state = 'calling';
    renderMain();
    const cur = $('#curNum');
    cur.classList.remove('is-pulse'); void cur.offsetWidth; cur.classList.add('is-pulse');
    armCall();
  }

  function finish(kind) {
    if (blocked()) return;
    if (!S.cur || !['calling', 'serving'].includes(S.state)) return toast('Chưa có số đang phục vụ.');
    clearTimeout(callT);
    if (kind === 'transfer') { S.lastTransferred = S.cur.num; toast(`${S.cur.num} đã chuyển sang quầy 15.`); }
    S.cur = null;
    if (kind === 'done') {
      S.state = 'thanks';
      renderMain();
      thanksT = setTimeout(() => { if (S.state === 'thanks') { S.state = 'ready'; renderMain(); } }, CFG.thanksSec * 1000);
    } else {
      S.state = 'ready';
      renderMain();
    }
  }

  /* ---------- Hiệu ứng số bay từ dải "Sắp gọi" lên khối đỏ ---------- */
  function rectIn(el) {
    const r = el.getBoundingClientRect(), root = $('#scr').getBoundingClientRect();
    return { x: (r.left - root.left) / SCALE, y: (r.top - root.top) / SCALE, w: r.width / SCALE, h: r.height / SCALE };
  }
  function flyTo(from, target) {
    return new Promise((res) => {
      const to = rectIn(target);
      const fly = document.createElement('div');
      fly.className = 'fly';
      fly.textContent = target.textContent;
      const start = from || { x: to.x + to.w * 0.36, y: 1080, h: to.h * 0.27 };
      const fs = 104;
      Object.assign(fly.style, { left: start.x + 'px', top: start.y + 'px', fontSize: fs + 'px', color: from ? '#002A66' : '#fff' });
      $('#scr').appendChild(fly);
      const s = to.h / (from ? from.h : start.h);
      const anim = fly.animate([
        { transform: 'translate(0,0) scale(1)', color: from ? '#002A66' : '#fff', opacity: 1 },
        { transform: `translate(${to.x - start.x}px, ${to.y - start.y}px) scale(${s})`, color: '#fff', opacity: 1 }
      ], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      anim.onfinish = () => { fly.remove(); res(); };
    });
  }

  /* =========================================================
     SỰ KIỆN HÀNG ĐỢI
     ========================================================= */
  function issue() {
    const pos = S.ownQ.length + S.Q.add({ num: `${S.code}-${pad(++S.lastIssued)}` });
    renderStrip(false, pos < 3 ? pos : -1);
    if (S.state === 'ready') renderMain();
  }
  async function otherCalls() {
    if (!S.Q.length) return toast('Hàng đợi lĩnh vực đang trống.');
    const n = S.Q.items[0].num;
    const others = svc().counters.filter((c) => c !== S.counter);
    if (!others.length) return toast('Lĩnh vực này chỉ có 1 quầy.');
    const chip = $(`.chip[data-num="${n}"]`);
    if (chip) { chip.classList.add('is-gone'); await sleep(420); }
    S.Q.takeHead();
    toast(`Quầy ${others[0]} vừa gọi ${n}.`);
    renderStrip(true);
    if (S.state === 'ready') renderMain();
  }
  function vip() {
    const pos = S.ownQ.length + S.Q.add({ num: `V-${pad(++S.lastV)}`, cls: 'priority' });
    renderStrip(false, pos < 3 ? pos : -1);
    toast(`Số ưu tiên V-${pad(S.lastV)} xếp vị trí thứ ${pos + 1}.`);
    if (S.state === 'ready') renderMain();
  }
  function booking() {
    const n = `${S.code}-${pad(++S.lastIssued)}`;
    const pos = S.ownQ.length + S.Q.add({ num: n, cls: 'booking' });
    renderStrip(false, pos < 3 ? pos : -1);
    toast(`Đặt lịch ${n} check-in, xếp vị trí thứ ${pos + 1}.`);
    if (S.state === 'ready') renderMain();
  }
  function example() {
    S.ownQ = []; seedQueue(7); S.lastV = 4;
    renderStrip(true);
    toast('Ví dụ: 4 bước chèn số. Theo dõi dải "Sắp gọi".');
    [vip, booking, vip, vip].forEach((f, i) => setTimeout(f, 2200 * (i + 1)));
    setTimeout(() => toast('Các số đã hiện bị vượt đủ 3 lần nên bị khóa. V-0007 xếp sau các số này.'), 2200 * 4 + 400);
  }
  function incoming() {
    S.ownQ.push({ num: 'C-0040', tag: 'transfer', from: '06' });
    renderStrip(false, S.ownQ.length - 1);
    if (S.state === 'ready') renderMain();
  }
  function returned() {
    const n = S.lastTransferred || `${S.code}-${pad(svc().next - 3)}`;
    S.ownQ.unshift({ num: n, tag: 'return', from: '15' });
    S.lastTransferred = null;
    renderStrip(false, 0);
    if (S.state === 'ready') renderMain();
  }
  function clearQ() { S.Q.items = []; S.ownQ = []; renderStrip(false); if (S.state === 'ready') renderMain(); }

  /* =========================================================
     TẠM NGƯNG / CHƯA MỞ / MẤT KẾT NỐI
     ========================================================= */
  function blocked() {
    if (S.closed) { toast('Quầy chưa mở. Bấm "Mở lại quầy" để đăng nhập.'); return true; }
    if (S.paused) { toast('Quầy đang tạm ngưng. Bấm "Mở lại quầy".'); return true; }
    return false;
  }
  function pause(min) {
    S.paused = true; S.closed = false;
    const back = new Date(Date.now() + min * 60000);
    $('#pBack').innerHTML = `Dự kiến mở lại lúc <span class="num">${hhmm(back)}</span>`;
    const sib = svc().counters.filter((c) => c !== S.counter);
    $('#pRedirect').innerHTML = sib.length ? `${svg('i-arrow')} Mời Quý công dân đến quầy <span class="num">${sib.join(', ')}</span>` : '';
    $('#pause').classList.add('is-on'); $('#closed').classList.remove('is-on');
    renderStrip(false);
  }
  function resume() {
    S.paused = false; S.closed = false;
    $('#pause').classList.remove('is-on'); $('#closed').classList.remove('is-on');
    if (!S.cur) { S.state = 'ready'; }
    renderMain(); renderStrip(false);
  }
  function logout() {
    S.closed = true; S.paused = false; S.cur = null; S.state = 'ready';
    clearTimeout(callT); clearTimeout(thanksT);
    $('#closed').classList.add('is-on'); $('#pause').classList.remove('is-on');
    renderMain();
  }

  function renderOffline() {
    $('#scr').classList.toggle('is-offline', S.offline);
    if (!S.offline) { $('#strip').classList.remove('is-lost'); $('#sEmptyTxt').textContent = 'Hiện không có khách chờ, mời Quý khách lấy số'; return; }
    const sec = Math.floor((Date.now() - S.offlineSince) / 1000);
    $('#mOffTxt').textContent = `Mất kết nối ${sec} giây`;
    const lost = sec >= CFG.lostSec;
    $('#strip').classList.toggle('is-lost', lost);
    if (lost) $('#sEmptyTxt').textContent = 'Vui lòng theo dõi loa thông báo và màn hình sảnh';
  }

  /* =========================================================
     BẢNG MÔ PHỎNG
     ========================================================= */
  let toastT;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('is-on'), 3200);
  }
  $('#counterSel').innerHTML = ALL.map((c) => `<option value="${c}">Quầy ${c} · ${SERVICES[codeOf(c)].short}</option>`).join('');
  $('#counterSel').addEventListener('change', (e) => { resume(); loadCounter(e.target.value, true); });

  const ACT = {
    next: callNext, recall, done: () => finish('done'), skip: () => finish('skip'), transfer: () => finish('transfer'),
    pause: () => pause(+$('#pauseSel').value), resume, logout,
    issue, other: otherCalls, vip, booking, example, incoming, return: returned, clear: clearQ
  };
  $('#sim').addEventListener('click', (e) => { const b = e.target.closest('[data-sim]'); if (b && ACT[b.dataset.sim]) ACT[b.dataset.sim](); });
  $('#offline').addEventListener('change', (e) => { S.offline = e.target.checked; S.offlineSince = Date.now(); renderOffline(); });
  $('#auto').addEventListener('change', (e) => (e.target.checked ? startAuto() : stopAuto()));

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === 'n') callNext();
    if (k === 'r') recall();
    if (k === 'h') finish('done');
    if (k === 's') finish('skip');
  });

  /* ---------- Tự động mô phỏng ca làm việc ---------- */
  let autoTimers = [];
  function startAuto() {
    stopAuto();
    autoTimers.push(setInterval(issue, 9000));
    autoTimers.push(setInterval(() => { if (Math.random() < 0.6) otherCalls(); }, 13000));
    autoTimers.push(setInterval(() => {
      if (S.paused || S.closed) return;
      if (S.state === 'serving' && Math.random() < 0.6) finish('done');
      else if (S.state === 'ready') callNext();
    }, 8000));
  }
  function stopAuto() { autoTimers.forEach(clearInterval); autoTimers = []; }

  /* ---------- Đồng hồ ---------- */
  function tick() { $('#clock').textContent = hhmm(new Date()); if (S.offline) renderOffline(); }

  /* ---------- Khởi động ---------- */
  const startCounter = ALL.includes(params.get('counter')) ? params.get('counter') : '01';
  $('#counterSel').value = startCounter;
  fit();
  loadCounter(startCounter, false);
  tick(); setInterval(tick, 1000);
  if (isFull && params.get('auto') !== '0') { $('#auto').checked = true; startAuto(); }
  if (document.fonts) document.fonts.ready.then(() => { fit(); fitName(); });
})();
