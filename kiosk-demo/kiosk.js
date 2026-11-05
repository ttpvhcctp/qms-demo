/* =========================================================
   KIOSK LẤY SỐ – QMS ĐA ĐIỂM (Bản demo giao diện)
   - Máy trạng thái màn hình: idle → menu → services → identify → printing → success
   - Luồng QR đặt lịch: checking → printing | error
   - Dữ liệu dưới đây là dữ liệu mẫu; bản thật lấy qua API/WebSocket từ Local Server
   ========================================================= */
(() => {
  'use strict';

  /* ---------- Cấu hình Kiosk (Kiosk SiteID Mapping) ---------- */
  const KIOSK = { siteCode: 'HCM', siteName: { vi: 'Trung tâm TP. Hồ Chí Minh', en: 'Ho Chi Minh City Center' } };
  const TIMEOUTS = { menu: 30, services: 30, identify: 20, success: 10, error: 15 }; // giây
  const PAD = 4; // Ticket Padding theo GEN-01

  /* ---------- Danh mục dịch vụ mẫu (tiền tố theo bảng danh mục, mỗi tiền tố là duy nhất trong khu vực) ---------- */
  const GROUPS = [
    { id: 'land', icon: 'i-land', name: { vi: 'Đất đai', en: 'Land' },
      dept: { vi: 'Sở Nông nghiệp và Môi trường', en: 'Dept. of Agriculture and Environment' },
      services: [
        { code: 'A', name: { vi: 'Cấp mới, cấp đổi giấy chứng nhận', en: 'New or renewed land certificate' }, counters: '01, 02, 03', open: 3, sla: 20, waiting: 18, quota: 100, issued: 62 },
        { code: 'B', name: { vi: 'Đăng ký giao dịch bảo đảm', en: 'Secured transaction registration' }, counters: '04, 05', open: 2, sla: 10, waiting: 5, quota: null, issued: 31 }
      ] },
    { id: 'justice', icon: 'i-scale', name: { vi: 'Tư pháp', en: 'Justice' },
      dept: { vi: 'Sở Tư pháp', en: 'Department of Justice' },
      services: [
        { code: 'C', name: { vi: 'Quốc tịch, hộ tịch', en: 'Nationality and civil status' }, counters: '06, 07', open: 2, sla: 15, waiting: 3, quota: 80, issued: 74 },
        { code: 'D', name: { vi: 'Công chứng', en: 'Notarization' }, counters: '08', open: 1, sla: 10, waiting: 0, quota: 40, issued: 40 }
      ] },
    { id: 'transport', icon: 'i-truck', name: { vi: 'Vận tải', en: 'Transport' },
      dept: { vi: 'Sở Xây dựng · Phù hiệu xe', en: 'Dept. of Construction · Vehicle badges' },
      services: [
        { code: 'F', name: { vi: 'Vận tải và phù hiệu xe', en: 'Transport and vehicle badges' }, counters: '11', open: 1, sla: 15, waiting: 3, quota: null, issued: 12 }
      ] },
    { id: 'social', icon: 'i-shield', name: { vi: 'BHXH, BHYT', en: 'Social insurance' },
      dept: { vi: 'Bảo hiểm xã hội', en: 'Social Insurance Agency' },
      services: [
        { code: 'G', name: { vi: 'Bảo hiểm xã hội, bảo hiểm y tế', en: 'Social and health insurance' }, counters: '12, 13', open: 2, sla: 15, waiting: 4, quota: null, issued: 40 }
      ] },
    { id: 'result', icon: 'i-file', name: { vi: 'Trả kết quả', en: 'Collect results' },
      dept: { vi: 'Nhận kết quả hồ sơ', en: 'Pick up processed documents' },
      services: [
        { code: 'K', name: { vi: 'Trả kết quả chung', en: 'General result return' }, counters: '18, 19, 20', open: 3, sla: 2, waiting: 2, quota: null, issued: 55 }
      ] }
  ];
  const PRIORITY = { code: 'V', pendingPrefix: 'XN', pendingIssued: 6, pendingValidMin: 30 };

  /* ---------- Mã QR đặt lịch mẫu (định dạng giả lập: QMS|mã đặt lịch|khu vực|tiền tố|giờ hẹn) ---------- */
  const BOOKINGS = {
    'qr-ok':    { raw: 'QMS|BK-24117|HCM|A|09:30', fail: null },
    'qr-site':  { raw: 'QMS|BK-30552|BD|A|09:30',  fail: 0 },
    'qr-early': { raw: 'QMS|BK-24190|HCM|C|14:30', fail: 1, why: 'early' },
    'qr-late':  { raw: 'QMS|BK-23988|HCM|G|07:45', fail: 1, why: 'late' },
    'qr-used':  { raw: 'QMS|BK-24003|HCM|B|09:00', fail: 2 },
    'qr-bad':   { raw: '###', fail: -1 }
  };

  /* ---------- Chuỗi giao diện song ngữ ---------- */
  const I18N = {
    vi: {
      org1: 'TRUNG TÂM PHỤC VỤ HÀNH CHÍNH CÔNG', org2: 'THÀNH PHỐ HỒ CHÍ MINH', online: 'Trực tuyến', offline: 'Ngoại tuyến', siteLabel: 'Cơ sở',
      welcome: 'Kính chào Quý công dân', idleTitle: 'Lấy số thứ tự<br>tự động', idleSub: 'Chọn lĩnh vực và nhận phiếu chỉ với tối đa 3 lần chạm',
      tapToStart: 'CHẠM VÀO ĐÂY ĐỂ LẤY SỐ', idleQrTitle: 'Đã đặt lịch trên ứng dụng?', idleQrSub: 'Đưa mã QR vào đầu đọc bên dưới, không cần chạm màn hình',
      menuTitle: 'Chọn lĩnh vực cần giải quyết', menuSub: 'Chạm vào ô tương ứng để lấy số thứ tự',
      qrTitle: 'QUÉT MÃ QR ĐẶT LỊCH TRƯỚC', qrSub: 'Đưa mã QR trên điện thoại vào đầu đọc phía dưới màn hình',
      qrOffTitle: 'CHECK-IN ĐẶT LỊCH TẠM NGƯNG', qrOffSub: 'Mất kết nối máy chủ. Vui lòng chọn lĩnh vực phía trên để lấy số thường.',
      help: 'Hướng dẫn', hours: 'Giờ làm việc', hoursVal: 'Sáng 07:30–11:30 · Chiều 13:30–16:30',
      svcTitle: 'Chọn thủ tục cụ thể', askReception: 'Không thấy thủ tục cần làm? Vui lòng hỏi bàn lễ tân gần cửa ra vào.',
      back: 'Quay lại', home: 'Trang chủ', step: 'Bước {n}/3',
      idTitle: 'Xác nhận và in phiếu', idSub: 'Định danh là không bắt buộc, chạm IN PHIẾU để nhận số ngay',
      idPanelTitle: 'Cắm CCCD gắn chip để in họ tên lên phiếu', or: 'hoặc', vneidHint: 'Quét mã QR trên ứng dụng VNeID tại đầu đọc phía dưới',
      privacy: 'Thông tin chỉ dùng để in phiếu và giải quyết hồ sơ, theo Nghị định 13/2023/NĐ-CP.',
      csWait: 'Chưa nhận thẻ · có thể bỏ qua', csReading: 'Đang đọc thẻ, vui lòng giữ nguyên…', csOk: 'Đã nhận: {name}', csVneid: 'Đã xác thực VNeID: {name}',
      printNow: 'IN PHIẾU', printHintAnon: 'In ngay, không cần định danh', printHintId: 'Phiếu sẽ in kèm họ tên', printHintPriority: 'In phiếu chờ lễ tân xác nhận',
      selLabel: 'Bạn đã chọn', counters: 'Quầy {c}',
      checkingTitle: 'Đang kiểm tra mã đặt lịch…', chk0: 'Đúng Trung tâm đã đặt lịch', chk1: 'Đúng khung giờ hẹn (±15 phút)', chk2: 'Mã chưa được sử dụng',
      printingTitle: 'Đang in phiếu…', printingSub: 'Vui lòng nhận phiếu tại khe in phía dưới màn hình',
      okTitle: 'Lấy số thành công', okSub: 'Vui lòng nhận phiếu và chờ gọi số trên màn hình sảnh',
      okPendingTitle: 'Đã in phiếu chờ xác nhận', okPendingSub: 'Phiếu này chưa vào hàng đợi',
      tkLabel: 'PHIẾU SỐ THỨ TỰ', tkPendingLabel: 'PHIẾU CHỜ XÁC NHẬN ƯU TIÊN', tkBooking: 'ƯU TIÊN · ĐẶT LỊCH TRƯỚC',
      ahead: 'Trước bạn', people: 'người', eta: 'Dự kiến chờ', minutes: 'phút', noWait: 'Không phải chờ',
      counter: 'Quầy phục vụ', booking: 'Mã đặt lịch', appt: 'Giờ hẹn', holder: 'Người làm thủ tục', issuedAt: 'Giờ lấy số',
      pend1: 'Mang phiếu đến <b>bàn lễ tân</b> gần cửa ra vào để xác nhận đối tượng ưu tiên.',
      pend2: 'Sau khi xác nhận, lễ tân cấp <b>số ưu tiên V-xxxx</b> theo lĩnh vực cần giải quyết.',
      pend3: 'Phiếu có hiệu lực trong <b>{m} phút</b> kể từ lúc in.',
      removeCard: 'Vui lòng rút thẻ CCCD khỏi đầu đọc', done: 'HOÀN TẤT', autoClose: 'Tự đóng sau {s}s',
      errSiteT: 'Mã đặt lịch không thuộc Trung tâm này', errSiteM: 'Kiosk chỉ check-in cho lịch hẹn tại Trung tâm đang đứng. Quý công dân có thể lấy số thường tại đây.',
      errSiteA: 'Mã đặt lịch thuộc', errSiteB: 'Kiosk này thuộc',
      errEarlyT: 'Chưa đến khung giờ check-in', errEarlyM: 'Lịch hẹn chỉ được check-in trước tối đa 15 phút. Vui lòng quay lại đúng giờ hoặc lấy số thường.',
      errLateT: 'Đã quá khung giờ check-in', errLateM: 'Lịch hẹn chỉ được check-in trễ tối đa 15 phút. Vui lòng lấy số thường để được phục vụ.',
      errApptA: 'Giờ hẹn', errApptB: 'Cho phép check-in', errNow: 'Bây giờ',
      errUsedT: 'Mã đặt lịch đã được sử dụng', errUsedM: 'Mỗi mã chỉ check-in được một lần. Nếu chưa nhận phiếu, vui lòng liên hệ bàn lễ tân.',
      errUsedA: 'Đã check-in lúc',
      errBadT: 'Không đọc được mã QR', errBadM: 'Vui lòng tăng độ sáng màn hình điện thoại và đưa mã QR vào giữa vùng quét, cách đầu đọc khoảng 10 cm.',
      errPaperT: 'Máy in tạm hết giấy', errPaperM: 'Số của Quý công dân đã vào hàng đợi. Vui lòng ghi nhớ số dưới đây hoặc đến bàn lễ tân để nhận phiếu.',
      errPaperA: 'Số thứ tự của bạn',
      takeWalkin: 'LẤY SỐ THƯỜNG', rescan: 'Quét lại mã', toHome: 'VỀ TRANG CHỦ',
      closedTitle: 'NGOÀI GIỜ LÀM VIỆC', closedSub: 'Kiosk tạm ngưng cấp số. Quý công dân vui lòng quay lại trong giờ làm việc.',
      morning: 'Buổi sáng', afternoon: 'Buổi chiều', closedApp: 'Có thể đặt lịch trước qua ứng dụng di động.',
      helpTitle: 'Hướng dẫn lấy số', understood: 'ĐÃ HIỂU',
      h1t: 'Chọn lĩnh vực', h1d: 'Chạm vào ô lĩnh vực cần giải quyết, sau đó chọn thủ tục nếu được hỏi.',
      h2t: 'In phiếu', h2d: 'Cắm CCCD nếu muốn in họ tên, rồi chạm IN PHIẾU và nhận phiếu ở khe in.',
      h3t: 'Đã đặt lịch?', h3d: 'Mở mã QR trên ứng dụng và đưa vào đầu đọc. Phiếu ưu tiên sẽ được in tự động.',
      h4t: 'Cần hỗ trợ?', h4d: 'Bàn lễ tân ở gần cửa ra vào luôn sẵn sàng giúp đỡ Quý công dân.',
      waiting: 'đang chờ', procs: '{n} thủ tục', loadLow: 'Vắng', loadMid: 'Vừa', loadHigh: 'Đông',
      outToday: 'Đã hết số hôm nay', quotaLeft: 'Còn {n} số hôm nay', quotaLow: 'Sắp hết · còn {n} số',
      outToast: 'Lĩnh vực này đã hết số hôm nay. Vui lòng quay lại vào ngày làm việc tiếp theo hoặc đặt lịch qua ứng dụng.',
      prioName: 'Ưu tiên', prioDept: 'Người cao tuổi, phụ nữ mang thai, người khuyết tật…', prioMeta: 'Lễ tân xác nhận',
      prioSel: 'Đối tượng ưu tiên', prioSelSub: 'Lễ tân xác nhận và chọn lĩnh vực cho bạn',
      qrOffToast: 'Check-in đặt lịch tạm ngưng do mất kết nối. Vui lòng chọn lĩnh vực để lấy số thường.',
      closedToast: 'Ngoài giờ làm việc, kiosk tạm ngưng cấp số.',
      cardOnlyToast: 'Đầu đọc CCCD chỉ hoạt động ở bước In phiếu.', qrHelpToast: 'Mở mã QR trên ứng dụng và đưa vào đầu đọc ngay phía dưới màn hình.'
    },
    en: {
      org1: 'PUBLIC ADMINISTRATIVE SERVICE CENTER', org2: 'HO CHI MINH CITY', online: 'Online', offline: 'Offline', siteLabel: 'Site',
      welcome: 'Welcome', idleTitle: 'Get your<br>queue number', idleSub: 'Choose a service and get your ticket in 3 taps or fewer',
      tapToStart: 'TOUCH HERE TO START', idleQrTitle: 'Booked in the app?', idleQrSub: 'Hold your QR code under the scanner below, no need to touch the screen',
      menuTitle: 'Choose a service area', menuSub: 'Touch a tile to get your queue number',
      qrTitle: 'SCAN YOUR BOOKING QR CODE', qrSub: 'Hold the QR code on your phone under the scanner below the screen',
      qrOffTitle: 'BOOKING CHECK-IN PAUSED', qrOffSub: 'Server connection lost. Please pick a service above to get a regular number.',
      help: 'Help', hours: 'Opening hours', hoursVal: 'Morning 07:30–11:30 · Afternoon 13:30–16:30',
      svcTitle: 'Choose a procedure', askReception: "Can't find your procedure? Please ask the reception desk near the entrance.",
      back: 'Back', home: 'Home', step: 'Step {n}/3',
      idTitle: 'Confirm and print', idSub: 'ID is optional, touch PRINT to get your number now',
      idPanelTitle: 'Insert your chip ID card to print your name', or: 'or', vneidHint: 'Scan the QR code in the VNeID app at the scanner below',
      privacy: 'Your data is used only for this ticket and your application, per Decree 13/2023/ND-CP.',
      csWait: 'No card yet · optional', csReading: 'Reading card, please hold…', csOk: 'Card read: {name}', csVneid: 'VNeID verified: {name}',
      printNow: 'PRINT', printHintAnon: 'Print now, no ID needed', printHintId: 'Your name will be printed', printHintPriority: 'Print a ticket for reception to confirm',
      selLabel: 'You selected', counters: 'Counter {c}',
      checkingTitle: 'Checking your booking…', chk0: 'Booked at this center', chk1: 'Within appointment window (±15 min)', chk2: 'Code not used yet',
      printingTitle: 'Printing your ticket…', printingSub: 'Please take your ticket from the slot below the screen',
      okTitle: 'Your number is ready', okSub: 'Take your ticket and watch the lobby screen',
      okPendingTitle: 'Confirmation ticket printed', okPendingSub: 'This ticket is not in the queue yet',
      tkLabel: 'QUEUE TICKET', tkPendingLabel: 'PRIORITY CONFIRMATION TICKET', tkBooking: 'PRIORITY · BOOKED',
      ahead: 'Ahead of you', people: 'people', eta: 'Estimated wait', minutes: 'min', noWait: 'No wait',
      counter: 'Counters', booking: 'Booking code', appt: 'Appointment', holder: 'Applicant', issuedAt: 'Issued at',
      pend1: 'Bring this ticket to the <b>reception desk</b> near the entrance to confirm your priority status.',
      pend2: 'Reception will then issue a <b>priority number V-xxxx</b> for your service.',
      pend3: 'This ticket is valid for <b>{m} minutes</b>.',
      removeCard: 'Please remove your ID card from the reader', done: 'DONE', autoClose: 'Closes in {s}s',
      errSiteT: 'This booking is for another center', errSiteM: 'This kiosk can only check in bookings for this center. You can take a regular number here.',
      errSiteA: 'Booking center', errSiteB: 'This kiosk',
      errEarlyT: 'Too early to check in', errEarlyM: 'Check-in opens 15 minutes before your appointment. Please come back on time or take a regular number.',
      errLateT: 'Check-in window has passed', errLateM: 'Check-in closes 15 minutes after your appointment. Please take a regular number.',
      errApptA: 'Appointment', errApptB: 'Check-in window', errNow: 'Now',
      errUsedT: 'This booking was already used', errUsedM: 'Each code can be checked in once. If you have no ticket, please ask reception.',
      errUsedA: 'Checked in at',
      errBadT: 'Unable to read the QR code', errBadM: 'Turn up your phone brightness and hold the code in the center, about 10 cm from the scanner.',
      errPaperT: 'Printer is out of paper', errPaperM: 'Your number is in the queue. Please remember it or ask reception for a ticket.',
      errPaperA: 'Your number',
      takeWalkin: 'GET A REGULAR NUMBER', rescan: 'Scan again', toHome: 'BACK TO HOME',
      closedTitle: 'OUTSIDE OPENING HOURS', closedSub: 'Ticketing is paused. Please come back during opening hours.',
      morning: 'Morning', afternoon: 'Afternoon', closedApp: 'You can book in advance in the mobile app.',
      helpTitle: 'How to get a number', understood: 'GOT IT',
      h1t: 'Choose a service', h1d: 'Touch the service tile, then pick a procedure if asked.',
      h2t: 'Print', h2d: 'Insert your ID card to print your name, then touch PRINT and take the ticket.',
      h3t: 'Booked already?', h3d: 'Open the QR code in the app and hold it under the scanner.',
      h4t: 'Need help?', h4d: 'The reception desk near the entrance is ready to help.',
      waiting: 'waiting', procs: '{n} procedures', loadLow: 'Quiet', loadMid: 'Moderate', loadHigh: 'Busy',
      outToday: 'Fully booked today', quotaLeft: '{n} numbers left today', quotaLow: 'Almost full · {n} left',
      outToast: 'This service is fully booked today. Please come back on the next working day or book in the app.',
      prioName: 'Priority', prioDept: 'Elderly, pregnant women, people with disabilities…', prioMeta: 'Reception confirms',
      prioSel: 'Priority citizen', prioSelSub: 'Reception will confirm and choose the service with you',
      qrOffToast: 'Booking check-in is paused (offline). Please pick a service for a regular number.',
      closedToast: 'Outside opening hours, ticketing is paused.',
      cardOnlyToast: 'The ID reader works at the Print step only.', qrHelpToast: 'Open the QR code in the app and hold it under the scanner below the screen.'
    }
  };

  /* ---------- Trạng thái ---------- */
  const S = {
    screen: 'idle', lang: 'vi', group: null, service: null, mode: 'walkin',
    card: null,            // null | 'reading' | { name, via }
    cardInReader: false,
    offline: false, closed: false, paperOut: false,
    busy: false, booking: null
  };

  /* ---------- Tiện ích ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const kiosk = $('#kiosk');
  const t = (k, v = {}) => (I18N[S.lang][k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const L = (o) => (typeof o === 'string' ? o : o[S.lang]);
  const pad = (n) => String(n).padStart(PAD, '0');
  const svg = (id) => `<svg class="ic"><use href="#${id}"/></svg>`;
  const now = () => new Date();
  const hhmm = (d) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });

  const etaOf = (s) => (s.waiting === 0 ? 0 : Math.max(5, Math.round((s.waiting * s.sla) / s.open / 5) * 5));
  const isOut = (s) => s.quota != null && s.issued >= s.quota;
  const loadOf = (eta) => (eta < 15 ? 'low' : eta <= 35 ? 'mid' : 'high');
  const groupStats = (g) => {
    const open = g.services.filter((s) => !isOut(s));
    return {
      waiting: g.services.reduce((a, s) => a + s.waiting, 0),
      eta: open.length ? Math.max(...open.map(etaOf)) : 0,
      out: open.length === 0
    };
  };
  const etaText = (m) => (m === 0 ? t('noWait') : `~${m} ${t('minutes')}`);

  /* ---------- Scale canvas 1080×1920 cho vừa màn hình ---------- */
  const isKioskMode = new URLSearchParams(location.search).get('kiosk') === '1';
  if (isKioskMode) document.body.classList.add('is-kiosk');
  let SCALE = 1;
  function fit() {
    const panel = isKioskMode ? 0 : $('#demoPanel').offsetWidth + 28;
    const pad = isKioskMode ? 0 : 44;
    SCALE = Math.min((innerWidth - panel - pad) / 1080, (innerHeight - pad) / 1920);
    const f = $('#frame');
    f.style.width = 1080 * SCALE + 'px';
    f.style.height = 1920 * SCALE + 'px';
    kiosk.style.transform = `scale(${SCALE})`;
  }
  addEventListener('resize', fit);

  /* ---------- Đồng hồ ---------- */
  function tick() {
    const d = now();
    $('#clockTime').textContent = hhmm(d);
    $('#clockDate').textContent = d.toLocaleDateString(S.lang === 'vi' ? 'vi-VN' : 'en-GB', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  /* ---------- Toast ---------- */
  let toastT;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('is-on'), 3600);
  }

  /* ---------- Chuyển màn hình ---------- */
  let leaveT;
  function go(next, dir = 'fwd') {
    if (S.closed && next !== 'closed') next = 'closed';
    const cur = $(`.screen[data-screen="${S.screen}"]`);
    const nx = $(`.screen[data-screen="${next}"]`);
    if (cur === nx) { enter(next); return; }
    const off = dir === 'back' ? -70 : 70;
    nx.style.transition = 'none';
    nx.style.transform = `translateX(${off}px)`;
    void nx.offsetWidth;
    nx.style.transition = '';
    nx.style.transform = '';
    cur.style.transform = `translateX(${-off}px)`;
    cur.classList.remove('is-active');
    nx.classList.add('is-active');
    clearTimeout(leaveT);
    leaveT = setTimeout(() => { cur.style.transform = ''; }, 460);
    S.screen = next;
    enter(next);
  }

  function enter(name) {
    resetTimer();
    if (name === 'menu') renderMenu();
    if (name === 'services') renderServices();
    if (name === 'identify') renderIdentify();
    if (name === 'idle' || name === 'menu') { S.group = null; S.service = null; S.mode = 'walkin'; S.booking = null; S.card = null; }
    updateSteps();
  }

  /* ---------- Hẹn giờ không thao tác ---------- */
  let idleT, countT;
  function resetTimer() {
    clearTimeout(idleT); clearInterval(countT);
    const sec = TIMEOUTS[S.screen];
    const bar = $('#timeoutBar'), fill = bar.firstElementChild;
    fill.style.transition = 'none'; fill.style.transform = 'scaleX(1)';
    bar.classList.toggle('is-on', !!sec && S.screen !== 'success');
    if (!sec) return;
    void fill.offsetWidth;
    fill.style.transition = `transform ${sec}s linear`;
    fill.style.transform = 'scaleX(0)';
    if (S.screen === 'success') startDoneCountdown(sec);
    idleT = setTimeout(() => {
      if (S.screen === 'identify' || S.screen === 'error') go('menu', 'back');
      else go('idle', 'back');
    }, sec * 1000);
  }
  function startDoneCountdown(sec) {
    const p = $('.done-progress');
    p.style.transition = 'none'; p.style.transform = 'scaleX(1)';
    void p.offsetWidth;
    p.style.transition = `transform ${sec}s linear`; p.style.transform = 'scaleX(0)';
    let left = sec;
    $('#doneCount').textContent = t('autoClose', { s: left });
    countT = setInterval(() => { left = Math.max(0, left - 1); $('#doneCount').textContent = t('autoClose', { s: left }); }, 1000);
  }

  function updateSteps() {
    $$('.steps').forEach((el) => {
      let n = +el.dataset.step;
      if (S.screen === 'identify' && S.group && S.group.services.length === 1) n = 3;
      el.querySelector('.steps-label').textContent = t('step', { n });
    });
  }

  /* ---------- S1. Menu lĩnh vực ---------- */
  function renderMenu() {
    const html = GROUPS.map((g, i) => {
      const st = groupStats(g);
      const more = g.services.length > 1 ? `<span class="tile-more">${t('procs', { n: g.services.length })} ${svg('i-next')}</span>` : '';
      const meta = st.out
        ? `<span class="tile-meta"><span>${svg('i-clock')} ${t('outToday')}</span></span>`
        : `<span class="tile-meta"><span>${svg('i-users')} <b data-live="gw-${g.id}">${st.waiting}</b> ${t('waiting')}</span><span data-live="ge-${g.id}">${svg('i-clock')} ${etaText(st.eta)}</span></span>`;
      const load = st.out ? '' : `<span class="load load--${loadOf(st.eta)}" data-live="gl-${g.id}">${t('load' + cap(loadOf(st.eta)))}</span>`;
      return `<button class="tile pressable rise ${st.out ? 'is-out' : ''}" style="--i:${i}" data-group="${g.id}">
        ${load}
        <span class="tile-ic">${svg(g.icon)}</span>
        <span class="tile-name">${L(g.name)}</span>
        <span class="tile-dept">${L(g.dept)}</span>
        ${more}${meta}
      </button>`;
    }).join('') +
      `<button class="tile tile--priority pressable rise" style="--i:${GROUPS.length}" data-group="priority">
        <span class="tile-ic">${svg('i-heart')}</span>
        <span class="tile-name">${t('prioName')}</span>
        <span class="tile-dept">${t('prioDept')}</span>
        <span class="tile-meta"><span>${svg('i-desk')} ${t('prioMeta')}</span></span>
      </button>`;
    const grid = $('#groupGrid');
    grid.innerHTML = html;
    const rows = Math.ceil((GROUPS.length + 1) / 2);
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  }
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  /* ---------- S2. Chọn thủ tục ---------- */
  function renderServices() {
    const g = S.group;
    $('#crumb').innerHTML = `${svg(g.icon)} ${L(g.name)} ${svg('i-next')}`;
    $('#svcList').innerHTML = g.services.map((s, i) => {
      const out = isOut(s);
      let quota = '';
      if (s.quota != null && !out) {
        const left = s.quota - s.issued, low = left / s.quota <= 0.1;
        quota = `<span class="quota ${low ? 'is-low' : ''}"><span class="quota-bar"><i style="width:${(s.issued / s.quota) * 100}%"></i></span>${low ? t('quotaLow', { n: left }) : t('quotaLeft', { n: left })}</span>`;
      }
      const stats = out
        ? `<span class="svc-stats"><span class="out-label">${t('outToday')}</span></span>`
        : `<span class="svc-stats"><span>${svg('i-users')} <b data-live="sw-${s.code}">${s.waiting}</b> ${t('waiting')}</span><span data-live="se-${s.code}">${svg('i-clock')} ${etaText(etaOf(s))}</span></span>`;
      return `<button class="svc-row pressable rise ${out ? 'is-out' : ''}" style="--i:${i}" data-svc="${s.code}">
        <span class="svc-code">${s.code}</span>
        <span class="svc-main"><span class="svc-name">${L(s.name)}</span><span class="svc-sub">${t('counters', { c: s.counters })}</span>${quota}</span>
        ${stats}
        <span class="svc-go">${svg('i-next')}</span>
      </button>`;
    }).join('');
  }

  /* ---------- S3. Định danh ---------- */
  function renderIdentify() {
    const sel = $('#selCard'), btn = $('#printBtn');
    const pri = S.mode === 'priority';
    sel.classList.toggle('is-priority', pri);
    btn.classList.toggle('is-priority', pri);
    btn.classList.remove('is-busy');
    if (pri) {
      sel.innerHTML = `<span class="svc-code">${svg('i-heart')}</span><span><span class="sel-label">${t('selLabel')}</span><span class="sel-name">${t('prioSel')}</span><span class="sel-sub">${t('prioSelSub')}</span></span>`;
    } else {
      const s = S.service;
      sel.innerHTML = `<span class="svc-code">${s.code}</span><span><span class="sel-label">${t('selLabel')} · ${L(S.group.name)}</span><span class="sel-name">${L(s.name)}</span><span class="sel-sub">${t('counters', { c: s.counters })} · ${etaText(etaOf(s))}</span></span>`;
    }
    renderCardState();
  }

  function renderCardState() {
    const st = $('#cardStatus'), ill = $('#readerIll');
    let state = 'wait', text = t('csWait');
    if (S.card === 'reading') { state = 'reading'; text = t('csReading'); }
    else if (S.card && S.card.name) { state = 'ok'; text = t(S.card.via === 'vneid' ? 'csVneid' : 'csOk', { name: S.card.name }); }
    st.dataset.state = state;
    st.querySelector('.cs-text').textContent = text;
    ill.classList.toggle('is-reading', state === 'reading');
    ill.classList.toggle('is-read', state === 'ok');
    $('#printHint').textContent = S.mode === 'priority' ? t('printHintPriority') : state === 'ok' ? t('printHintId') : t('printHintAnon');
  }

  /* ---------- In phiếu ---------- */
  async function print() {
    if (S.busy) return;           // chống chạm đúp → in 2 phiếu
    S.busy = true;
    $('#printBtn').classList.add('is-busy');
    // Đang đọc thẻ: chờ tối đa 2 giây rồi in không kèm định danh
    const t0 = Date.now();
    while (S.card === 'reading' && Date.now() - t0 < 2000) await sleep(100);
    if (S.card === 'reading') S.card = null;

    const ticket = issueTicket();
    $('#paperNum').textContent = ticket.number;
    go('printing');
    await sleep(1900);            // demo kéo dài để thấy hiệu ứng; bản thật < 1 giây
    S.busy = false;
    if (S.paperOut) return showError('paper', ticket);
    renderSuccess(ticket);
    go('success');
  }

  function issueTicket() {
    const d = now();
    const holder = S.card && S.card.name ? S.card.name : null;
    if (S.mode === 'priority') {
      PRIORITY.pendingIssued++;
      return { kind: 'pending', number: `${PRIORITY.pendingPrefix}-${pad(PRIORITY.pendingIssued)}`, time: d, holder };
    }
    const s = S.service;
    s.issued++;
    let ahead = s.waiting;
    if (S.mode === 'booking') ahead = Math.min(s.waiting, 1); // QUE-02: chèn vào vị trí thứ 2
    s.waiting++;
    return { kind: S.mode, number: `${s.code}-${pad(s.issued)}`, service: s, group: S.group, ahead,
      eta: ahead === 0 ? 0 : Math.max(5, Math.round((ahead * s.sla) / s.open / 5) * 5), time: d, holder, booking: S.booking };
  }

  /* ---------- S5. Thành công ---------- */
  function renderSuccess(tk) {
    const pending = tk.kind === 'pending';
    const el = $('#ticket');
    el.classList.toggle('is-pending', pending);
    el.classList.toggle('has-badge', tk.kind === 'booking');
    $('#okTitle').textContent = pending ? t('okPendingTitle') : t('okTitle');
    $('#okSub').textContent = pending ? t('okPendingSub') : t('okSub');
    $('#tkLabel').textContent = pending ? t('tkPendingLabel') : t('tkLabel');
    $('#tkStamp').textContent = `${KIOSK.siteCode} · ${tk.time.toLocaleDateString('vi-VN')} ${hhmm(tk.time)}`;
    $('#tkBadge').textContent = t('tkBooking');
    $('#tkNumber').textContent = tk.number;
    $('#tkService').textContent = pending ? (tk.holder || t('prioSel')) : `${L(tk.group.name)} · ${L(tk.service.name)}`;

    if (pending) {
      $('#tkBody').innerHTML = `<ol class="tk-steps"><li><i>1</i><span>${t('pend1')}</span></li><li><i>2</i><span>${t('pend2')}</span></li><li><i>3</i><span>${t('pend3', { m: PRIORITY.pendingValidMin })}</span></li></ol>`;
    } else {
      const cells = [
        `<div class="tk-cell"><span>${t('ahead')}</span><b class="num">${tk.ahead}<small>${t('people')}</small></b></div>`,
        `<div class="tk-cell"><span>${t('eta')}</span><b class="num">${tk.eta === 0 ? '0' : '~' + tk.eta}<small>${t('minutes')}</small></b></div>`,
        `<div class="tk-cell"><span>${t('counter')}</span><b>${tk.service.counters}</b></div>`,
        tk.booking
          ? `<div class="tk-cell"><span>${t('booking')} · ${t('appt')}</span><b>${tk.booking.id} · ${tk.booking.time}</b></div>`
          : `<div class="tk-cell"><span>${tk.holder ? t('holder') : t('issuedAt')}</span><b>${tk.holder || hhmm(tk.time)}</b></div>`
      ];
      $('#tkBody').innerHTML = cells.join('');
    }
    $('#cardAlert').classList.toggle('is-on', S.cardInReader);
  }

  /* ---------- Màn hình lỗi ---------- */
  function showError(type, data = {}) {
    const ic = $('#errIc');
    const row = (a, b, cls = '') => `<div><span>${a}</span><b class="${cls}">${b}</b></div>`;
    let title, msg, detail = '', primary = t('takeWalkin'), secondary = t('rescan'), red = false;
    if (type === 'site') {
      title = t('errSiteT'); msg = t('errSiteM');
      detail = row(t('errSiteA'), S.lang === 'vi' ? 'Trung tâm Bình Dương' : 'Binh Duong Center', 'bad') + row(t('errSiteB'), L(KIOSK.siteName));
    } else if (type === 'early' || type === 'late') {
      title = t(type === 'early' ? 'errEarlyT' : 'errLateT'); msg = t(type === 'early' ? 'errEarlyM' : 'errLateM');
      const [h, m] = data.time.split(':').map(Number);
      const f = (mm) => `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
      const base = h * 60 + m;
      detail = row(t('errApptA'), data.time) + row(t('errApptB'), `${f(base - 15)} – ${f(base + 15)}`) + row(t('errNow'), hhmm(now()), 'bad');
    } else if (type === 'used') {
      title = t('errUsedT'); msg = t('errUsedM');
      detail = row(t('booking'), data.id) + row(t('errUsedA'), '08:12', 'bad');
    } else if (type === 'bad') {
      title = t('errBadT'); msg = t('errBadM'); red = true; detail = '';
    } else if (type === 'paper') {
      title = t('errPaperT'); msg = t('errPaperM'); red = true;
      detail = row(t('errPaperA'), data.number, 'big');
      primary = t('toHome'); secondary = '';
    }
    ic.classList.toggle('is-red', red);
    $('#errTitle').textContent = title;
    $('#errMsg').textContent = msg;
    $('#errDetail').innerHTML = detail;
    $('#errPrimary').textContent = primary;
    $('#errSecondary').textContent = secondary;
    $('#errPrimary').dataset.go = type === 'paper' ? 'idle' : 'menu';
    go('error');
  }

  /* ---------- Luồng QR đặt lịch (kiểm tra chéo 3 bước) ---------- */
  async function handleBookingScan(raw) {
    if (S.closed) return toast(t('closedToast'));
    if (S.offline) return toast(t('qrOffToast'));
    if (['printing', 'checking'].includes(S.screen)) return;
    const parts = raw.split('|');
    const valid = parts[0] === 'QMS' && parts.length === 5;
    const sim = Object.values(BOOKINGS).find((b) => b.raw === raw) || { fail: valid ? null : -1 };
    const list = $('#checkList');
    list.innerHTML = [t('chk0'), t('chk1'), t('chk2')].map((x) => `<li><span class="cl-ic">${svg('i-check')}</span>${x}</li>`).join('');
    go('checking');
    await sleep(500);
    if (sim.fail === -1) { await sleep(400); return showError('bad'); }
    const [, id, site, code, time] = parts;
    const items = $$('li', list);
    for (let i = 0; i < 3; i++) {
      items[i].classList.add('is-run');
      await sleep(550);
      items[i].classList.remove('is-run');
      if (sim.fail === i) {
        items[i].classList.add('is-fail');
        items[i].querySelector('.cl-ic').innerHTML = svg('i-x');
        await sleep(900);
        return showError(i === 0 ? 'site' : i === 1 ? sim.why : 'used', { id, time, site });
      }
      items[i].classList.add('is-ok');
    }
    await sleep(350);
    const group = GROUPS.find((g) => g.services.some((s) => s.code === code));
    S.group = group; S.service = group.services.find((s) => s.code === code);
    S.mode = 'booking'; S.booking = { id, time }; S.card = null;
    const tk = issueTicket();
    $('#paperNum').textContent = tk.number;
    go('printing');
    await sleep(1900);
    if (S.paperOut) return showError('paper', tk);
    renderSuccess(tk);
    go('success');
  }

  /* ---------- Đầu đọc CCCD / VNeID ---------- */
  async function insertCard() {
    S.cardInReader = true;
    if (S.screen !== 'identify') return toast(t('cardOnlyToast'));
    S.card = 'reading'; renderCardState(); resetTimer();
    await sleep(1500);
    if (S.card === 'reading') { S.card = { name: 'NGUYỄN VĂN AN', via: 'card' }; renderCardState(); }
  }
  function removeCard() { S.cardInReader = false; $('#cardAlert').classList.remove('is-on'); if (S.card === 'reading') { S.card = null; renderCardState(); } }
  function vneidScan() {
    if (S.screen !== 'identify') return handleBookingScan('###');
    S.card = { name: 'TRẦN THỊ BÌNH', via: 'vneid' }; renderCardState(); resetTimer();
  }

  /* ---------- Bắt dữ liệu đầu đọc QR dạng bàn phím (USB HID, kết thúc bằng Enter) ---------- */
  let buf = '', bufT;
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('.demo-panel')) return;
    if (e.key === 'Enter') {
      const code = buf.trim(); buf = '';
      if (!code) return;
      if (S.screen === 'identify') return vneidScan();       // ở bước In phiếu: QR = VNeID
      return handleBookingScan(code);                        // các bước khác: QR = mã đặt lịch
    }
    if (e.key.length === 1) { buf += e.key; clearTimeout(bufT); bufT = setTimeout(() => (buf = ''), 300); }
  });

  /* ---------- Sự kiện chạm ---------- */
  kiosk.addEventListener('pointerdown', (e) => {
    resetTimer();
    const p = e.target.closest('.pressable');
    if (!p) return;
    p.classList.add('is-pressed');
    const r = p.getBoundingClientRect();
    const size = Math.max(r.width, r.height) / SCALE * 2.2;
    const rp = document.createElement('span');
    rp.className = 'ripple';
    rp.style.cssText = `width:${size}px;height:${size}px;left:${(e.clientX - r.left) / SCALE}px;top:${(e.clientY - r.top) / SCALE}px`;
    p.appendChild(rp);
    setTimeout(() => rp.remove(), 650);
  });
  const unpress = () => $$('.is-pressed').forEach((x) => x.classList.remove('is-pressed'));
  addEventListener('pointerup', unpress);
  addEventListener('pointercancel', unpress);
  kiosk.addEventListener('contextmenu', (e) => e.preventDefault());

  kiosk.addEventListener('click', (e) => {
    const el = e.target.closest('button, [data-screen="idle"]');
    if (!el) return;

    if (el.id === 'langBtn') return setLang(S.lang === 'vi' ? 'en' : 'vi');
    if (el.dataset && el.dataset.screen === 'idle' || el.id === 'idleCta') return go('menu');

    const act = el.dataset.action;
    if (act === 'help') return openHelp(true);
    if (act === 'closeHelp') return openHelp(false);
    if (act === 'home') return go('menu', 'back');
    if (act === 'back') {
      if (S.screen === 'identify' && S.mode === 'walkin' && S.group && S.group.services.length > 1) return go('services', 'back');
      return go('menu', 'back');
    }

    if (el.dataset.group) {
      if (el.dataset.group === 'priority') { S.mode = 'priority'; S.group = null; S.service = null; S.card = null; return go('identify'); }
      const g = GROUPS.find((x) => x.id === el.dataset.group);
      if (groupStats(g).out) return toast(t('outToast'));
      S.group = g; S.mode = 'walkin'; S.card = null;
      if (g.services.length === 1) { S.service = g.services[0]; return go('identify'); }
      return go('services');
    }
    if (el.dataset.svc) {
      const s = S.group.services.find((x) => x.code === el.dataset.svc);
      if (isOut(s)) return toast(t('outToast'));
      S.service = s; S.card = null;
      return go('identify');
    }
    if (el.id === 'qrBand') return toast(S.offline ? t('qrOffToast') : t('qrHelpToast'));
    if (el.id === 'printBtn') return print();
    if (el.id === 'doneBtn') return go('idle', 'back');
    if (el.id === 'errPrimary') return go(el.dataset.go || 'menu', 'back');
    if (el.id === 'errSecondary') { toast(t('qrHelpToast')); return go('menu', 'back'); }
  });

  function openHelp(on) { $('#helpModal').classList.toggle('is-open', on); }

  /* ---------- Ngôn ngữ ---------- */
  function setLang(lang) {
    S.lang = lang;
    document.documentElement.lang = lang;
    $$('#langBtn span').forEach((s) => s.classList.toggle('on', s.dataset.lang === lang));
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    $('#netPill b').textContent = t(S.offline ? 'offline' : 'online');
    tick(); updateSteps();
    if (S.screen === 'menu') renderMenu();
    if (S.screen === 'services') renderServices();
    if (S.screen === 'identify') renderIdentify();
  }

  /* ---------- Giả lập dữ liệu thời gian thực (thay bằng WebSocket từ Local Server) ---------- */
  setInterval(() => {
    const pool = GROUPS.flatMap((g) => g.services.map((s) => ({ g, s }))).filter(({ s }) => !isOut(s));
    const { g, s } = pool[Math.floor(Math.random() * pool.length)];
    s.waiting = Math.max(0, s.waiting + (Math.random() < 0.55 ? -1 : 1));
    const st = groupStats(g);
    const set = (key, html) => { const el = $(`[data-live="${key}"]`); if (el) { el.innerHTML = html; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick'); } };
    set(`gw-${g.id}`, st.waiting);
    set(`ge-${g.id}`, `${svg('i-clock')} ${etaText(st.eta)}`);
    const ld = $(`[data-live="gl-${g.id}"]`);
    if (ld) { ld.className = `load load--${loadOf(st.eta)}`; ld.textContent = t('load' + cap(loadOf(st.eta))); }
    set(`sw-${s.code}`, s.waiting);
    set(`se-${s.code}`, `${svg('i-clock')} ${etaText(etaOf(s))}`);
  }, 5000);

  /* ---------- Bảng mô phỏng ---------- */
  $('#demoPanel').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sim]');
    if (!b) return;
    const k = b.dataset.sim;
    if (BOOKINGS[k]) return handleBookingScan(BOOKINGS[k].raw);
    if (k === 'card-in') return insertCard();
    if (k === 'card-out') return removeCard();
    if (k === 'vneid') return vneidScan();
    if (k === 'idle') return go('idle', 'back');
  });
  $('#demoPanel').addEventListener('change', (e) => {
    const k = e.target.dataset.toggle, on = e.target.checked;
    if (k === 'offline') { S.offline = on; kiosk.classList.toggle('is-offline', on); $('#netPill b').textContent = t(on ? 'offline' : 'online'); }
    if (k === 'closed') { S.closed = on; go(on ? 'closed' : 'idle', 'back'); }
    if (k === 'paper') S.paperOut = on;
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Khởi động ---------- */
  fit(); tick(); setInterval(tick, 1000 * 15); updateSteps();
  if (document.fonts) document.fonts.ready.then(fit);
})();
