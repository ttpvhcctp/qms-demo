/* =========================================================
   QUEUE ENGINE – Quy tắc chèn số vào hàng đợi chung của một lĩnh vực
   Dùng chung cho demo Giao diện cán bộ và Màn hình tại quầy.

   5 lớp:  0 chuyển đến / quay lại  → hàng riêng của quầy (không nằm trong engine này)
           1 ưu tiên theo luật (V)   → có ít nhất Delay_Priority người đứng trước (mặc định 1)
           2 đặt lịch đã check-in    → Delay_Booking (mặc định 2)
           3 phục hồi từ chờ nhỡ     → Delay_Restore (mặc định 3) hoặc cuối hàng
           4 thường                  → cuối hàng (FIFO)
   3 quy tắc bảo vệ:
           (1) không chèn trước số đang đứng THỨ 1
           (2) lớp cao đứng trước lớp thấp; cùng lớp thì ai đến trước đứng trước
           (3) số ĐÃ TỪNG HIỆN trong "Sắp gọi" (Show_Window = 3 số đầu) chỉ bị vượt tối đa
               Max_Overtake lần (mặc định 3); số đã chờ quá Wait_Lock phút (mặc định 45) cũng bị khóa.
               Số bị khóa thì không ai được chèn lên trước nữa.
               Lý do chỉ đếm số đã hiện: nếu đếm cho mọi số, sau 3 lần chèn cả hàng cùng bị khóa
               và số ưu tiên đến sau phải đứng cuối hàng. Phần đuôi hàng (chưa hiện) được bảo vệ
               bằng khóa thời gian chờ.
   Gọi chỉ định một số đang chờ: các số đã hiện đứng trước nó được cộng 1 lần bị vượt.
   ========================================================= */
(function (g) {
  'use strict';
  const RANK = { priority: 1, booking: 2, restore: 3, normal: 4 };

  class QueueEngine {
    constructor(params) {
      this.p = Object.assign({ delayPriority: 1, delayBooking: 2, delayRestore: 3, maxOvertake: 3, waitLockMin: 45, showWindow: 3 }, params || {});
      this.items = [];
      this.clock = () => Date.now();
    }

    /* Đánh dấu các số đang nằm trong "Sắp gọi" là đã hiện */
    markSeen() { this.items.forEach((x, k) => { if (k < this.p.showWindow) x.seen = true; }); }

    delayOf(cls) {
      return cls === 'priority' ? this.p.delayPriority : cls === 'booking' ? this.p.delayBooking : cls === 'restore' ? this.p.delayRestore : Infinity;
    }
    waitMin(it) { return (this.clock() - it.issuedAt) / 60000; }

    /* Lý do khóa: 'head' | 'overtake' | 'wait' | null */
    lockOf(it, idx) {
      if (idx === 0) return 'head';
      if (it.overtaken >= this.p.maxOvertake) return 'overtake';
      if (this.p.waitLockMin && this.waitMin(it) >= this.p.waitLockMin) return 'wait';
      return null;
    }

    /* Thêm số. item = { num, cls, issuedAt?, ...dữ liệu khác }, opts.toEnd = true để xếp cuối hàng */
    add(item, opts) {
      const it = Object.assign({ cls: 'normal', overtaken: 0, seen: false, issuedAt: this.clock() }, item);
      if (it.cls === 'normal' || (opts && opts.toEnd)) { this.items.push(it); this.markSeen(); return this.items.length - 1; }
      const rank = RANK[it.cls];
      let i = Math.max(this.delayOf(it.cls), 1);
      this.items.forEach((x, k) => {
        if (this.lockOf(x, k)) i = Math.max(i, k + 1);          // quy tắc (1) và (3)
        if (RANK[x.cls] <= rank) i = Math.max(i, k + 1);         // quy tắc (2)
      });
      i = Math.min(i, this.items.length);
      this.items.splice(i, 0, it);
      for (let k = i + 1; k < this.items.length; k++) if (this.items[k].seen) this.items[k].overtaken++;
      this.markSeen();
      return i;
    }

    takeHead() { const x = this.items.shift() || null; this.markSeen(); return x; }

    /* Lấy một số cụ thể. manual = true: các số đã hiện đứng trước bị tính 1 lần vượt */
    take(num, manual) {
      const idx = this.indexOf(num);
      if (idx < 0) return null;
      if (manual) for (let k = 0; k < idx; k++) if (this.items[k].seen) this.items[k].overtaken++;
      const res = { item: this.items.splice(idx, 1)[0], jumped: idx };
      this.markSeen();
      return res;
    }

    indexOf(num) { return this.items.findIndex((x) => x.num === num); }
    get length() { return this.items.length; }
    shiftTime(min) { this.items.forEach((x) => { x.issuedAt -= min * 60000; }); }
  }

  g.QueueEngine = QueueEngine;
})(typeof window !== 'undefined' ? window : globalThis);
