(() => {
const $ = s => document.querySelector(s);
const stage = $('#stage'), app = $('#app');
const P = new URLSearchParams(location.search);
const ZONES = ['send', 'receive', 'collect'];
const LOCK = ZONES.includes(P.get('zone')) ? P.get('zone') : null;
const IDLE_MS = (+P.get('idle') || 60) * 1000;
const QR_URL = P.get('qr') || 'https://example.com/visa-direct-booth';
const DEF_LANG = P.get('lang') === 'en' ? 'en' : 'vi';
const RELOAD_MS = (P.has('reload') ? +P.get('reload') : 2) * 3600e3;
const LOW_FX = P.get('fx') === 'low';
const LOADED = Date.now();

// Portrait phone → rotate the 16:9 stage 90° so it always reads landscape (browsers can't lock orientation outside fullscreen).
function fit() {
  const portrait = innerHeight > innerWidth;
  const s = portrait ? Math.min(innerHeight / 1920, innerWidth / 1080) : Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `translate(-50%,-50%)${portrait ? ' rotate(90deg)' : ''} scale(${s})`;
}
addEventListener('resize', fit); fit();
// Where supported (Android Chrome), also lock to landscape once fullscreen is entered.
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
});

/* ---------- state ---------- */
const S = { view: 'idle', zone: LOCK, step: 0, ctx: {}, fresh: false, lang: DEF_LANG };

/* ---------- i18n + formatting ---------- */
const V = () => S.lang === 'vi';
const L = (vi, en) => V() ? vi : en;
const tx = v => Array.isArray(v) ? v[V() ? 0 : 1] : v;
const NF = (n, d = 0) => n.toLocaleString(V() ? 'vi-VN' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const RF = n => n.toLocaleString(V() ? 'vi-VN' : 'en-US', { maximumFractionDigits: 2 });
const SYM = { USD: '$', EUR: '€', GBP: '£' };
// foreign currency: "$1,240.00" (en) / "1.240 USD" (vi)
const fx = (n, code = 'USD', sign = '') => V() ? `${sign}${NF(n, n % 1 ? 2 : 0)} ${code}` : `${sign}${SYM[code]}${NF(n, 2)}`;
const fxShort = (n, code = 'USD') => V() ? `${NF(n)} ${code}` : `${SYM[code]}${NF(n)}`;
// local currency: "₫5,080,000" (en) / "5.080.000 ₫" (vi)
const cur = (n, sym, sign = '') => V() ? `${sign}${NF(Math.round(n))} ${sym}` : `${sign}${sym}${NF(Math.round(n))}`;

/* ---------- helpers ---------- */
const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
const av = (name, bg) => `<div class="av" style="background:${bg}">${name.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>`;
const bar = (title, sub, back) => `<div class="appbar">${back ? '<button class="back" data-a="back">‹</button>' : ''}<div><h2>${title}</h2>${sub ? `<span>${sub}</span>` : ''}</div></div>`;
const body = x => `<div class="body">${x}</div>`;
const TICK = '<div class="tick"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg></div>';
const GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>';
const ICON = {
  send: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 38 38 10M18 10h20v20"/></svg>',
  receive: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M38 10 10 38M30 38H10V18"/></svg>',
  collect: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="27" r="6"/><path d="M6 7l11 11M42 7 31 18M24 46V37"/></svg>'
};
const VND = 25400, EUR_VND = 27500, GBP_VND = 32900;
const DONE = () => L('Xong', 'Done');

/* ---------- demo data ---------- */
const RECIPS = [
  { name: 'Linh Nguyen', cc: 'VN', country: ['Việt Nam', 'Vietnam'], cur: 'VND', sym: '₫', rate: VND, bg: '#1434cb' },
  { name: 'Maria Santos', cc: 'PH', country: ['Philippines', 'Philippines'], cur: 'PHP', sym: '₱', rate: 58.2, bg: '#e05a2a' },
  { name: 'Arjun Mehta', cc: 'IN', country: ['Ấn Độ', 'India'], cur: 'INR', sym: '₹', rate: 84.1, bg: '#14966b' }
];
const DESTS = [
  { t: ['Thẻ Visa •••• 4821', 'Visa card •••• 4821'], s: ['Theo thời gian thực nếu được hỗ trợ', 'Real-time where available'], i: '💳' },
  { t: ['Tài khoản ngân hàng •••• 2290', 'Bank account •••• 2290'], s: ['Chuyển thẳng vào tài khoản', 'Direct to account'], i: '🏦' },
  { t: ['Ví điện tử', 'Mobile wallet'], s: ['Liên kết số điện thoại', 'Linked to phone number'], i: '📱' }
];
const INC = [
  { f: ['Sàn thương mại điện tử', 'Online marketplace'], cc: 'US', amt: 1240, code: 'USD', rate: VND, name: ['Đô la Mỹ', 'US Dollar'] },
  { f: ['Khách hàng · Berlin', 'Client · Berlin'], cc: 'DE', amt: 860, code: 'EUR', rate: EUR_VND, name: ['Euro', 'Euro'] },
  { f: ['Khách hàng · London', 'Client · London'], cc: 'UK', amt: 420, code: 'GBP', rate: GBP_VND, name: ['Bảng Anh', 'British Pound'] }
];
const WD = [
  { t: ['Rút về ngân hàng trong nước', 'Withdraw to local bank'], s: ['Tài khoản •••• 6612', 'Bank account •••• 6612'], i: '🏦', done: ['Lệnh rút tiền đang được xử lý', 'Withdrawal on its way'] },
  { t: ['Thanh toán nhà cung cấp', 'Pay a supplier'], s: ['Trong nước hoặc quốc tế', 'Local or overseas'], i: '📦', done: ['Đã thanh toán nhà cung cấp', 'Supplier paid'] },
  { t: ['Giữ trong ví VND', 'Keep in VND wallet'], s: ['Chi tiêu hoặc chuyển sau', 'Spend or send later'], i: '👛', done: ['Đã lưu vào ví', 'Saved to your wallet'] }
];
const CONVERTED = INC[0].amt * VND;
const first = r => r.name.split(' ')[0];

/* ---------- the three journeys ---------- */
const FLOWS = {
  send: {
    name: 'SEND', color: '#2f9bff', intent: ['Tôi muốn gửi tiền.', 'I want to send money.'],
    hero: ['Chuyển tiền xuyên biên giới thật dễ dàng.', 'Move money across borders with ease.'],
    powered: ['Vận hành bởi Visa Direct', 'Powered by Visa Direct'], product: 'Visa Direct Account & Wallet', short: 'VDAW',
    verb: ['Bạn vừa chuyển tiền ra nước ngoài.', 'You just sent money across borders.'],
    summary: ['Chọn người nhận, nhập số tiền và nơi nhận — tiền được chuyển đi chỉ sau vài thao tác.', 'Choose a recipient, pick an amount and destination — the money is on its way in a few taps.'],
    explain: ['Visa Direct Account & Wallet giúp ngân hàng và đơn vị chuyển tiền chuyển tiền xuyên biên giới đến thẻ, tài khoản ngân hàng và ví điện tử.', 'Visa Direct Account & Wallet helps banks and money transfer providers push funds across borders to cards, bank accounts and digital wallets.'],
    route: c => L('Tài khoản USD → ', 'USD account → ') + (RECIPS[c.rc] ? tx(RECIPS[c.rc].country) : L('Toàn cầu', 'Worldwide')),
    steps: [['Chọn người nhận', 'Choose recipient'], ['Nhập số tiền', 'Enter amount'], ['Chọn nơi nhận', 'Select destination'], ['Xem lại giao dịch', 'Review transfer'], ['Gửi tiền', 'Send'], ['Xác nhận', 'Confirmation']],
    init: { rc: 0, amt: 250, dst: 0 },
    screens: [
      { r: c => bar(L('Chuyển tiền', 'Send money'), L('Đến bất kỳ ai, bất kỳ đâu', 'To anyone, anywhere')) + body(
        `<div class="p-h">${L('Bạn muốn gửi cho ai?', 'Who are you sending to?')}</div>` +
        RECIPS.map((r, i) => `<button class="row" data-a="choose" data-v="rc:${i}">${av(r.name, r.bg)}<div class="grow"><b>${r.name}</b><span><em class="cc">${r.cc}</em>${tx(r.country)} · ${r.cur}</span></div><i class="chev">›</i></button>`).join('') +
        `<div class="hint">${L('+ Người nhận mới', '+ New recipient')}</div>`) },
      { r: c => { const r = RECIPS[c.rc]; return bar(L('Nhập số tiền', 'Enter amount'), L('Gửi cho ', 'Sending to ') + r.name, true) + body(
        `<div class="amount">${fx(c.amt)}</div><div class="sub">${first(r)} ${L('nhận được', 'receives')} <b>${cur(c.amt * r.rate, r.sym)}</b></div>
         <div class="rate">1 USD = ${RF(r.rate)} ${r.cur}</div>
         <div class="chips" style="margin-top:12px">${[100, 250, 500, 1000].map(a => `<button class="chip ${a === c.amt ? 'on' : ''}" data-a="sel" data-v="amt:${a}">${fxShort(a)}</button>`).join('')}</div>
         <button class="cta" data-a="next">${L('Tiếp tục', 'Continue')}</button>`); } },
      { r: c => bar(L('Nhận tiền qua', 'Deliver to'), L('Tiền sẽ được chuyển đến đâu?', 'Where should the money go?'), true) + body(
        DESTS.map((d, i) => `<button class="row" data-a="choose" data-v="dst:${i}"><div class="av" style="background:#eaf0ff;font-size:26px">${d.i}</div><div class="grow"><b>${tx(d.t)}</b><span>${tx(d.s)}</span></div><i class="chev">›</i></button>`).join('')) },
      { r: c => { const r = RECIPS[c.rc]; return bar(L('Xem lại giao dịch', 'Review transfer'), L('Kiểm tra thông tin', 'Check the details'), true) + body(
        `<div class="card">${kv(L('Người nhận', 'To'), r.name)}${kv(L('Quốc gia', 'Country'), tx(r.country))}${kv(L('Nhận qua', 'Deliver to'), tx(DESTS[c.dst].t))}${kv(L('Bạn gửi', 'You send'), fx(c.amt))}${kv(L('Tỷ giá', 'Exchange rate'), `1 USD = ${RF(r.rate)} ${r.cur}`)}${kv(L('Người nhận được', 'They receive'), cur(c.amt * r.rate, r.sym))}</div>
         <button class="cta" data-a="next">${L('Gửi ', 'Send ')}${fx(c.amt)}</button>`); } },
      { r: c => { const r = RECIPS[c.rc]; const items = [L('Xác minh thông tin', 'Verifying details'), L('Định tuyến qua Visa Direct', 'Routing via Visa Direct'), L('Đã chuyển đến người nhận', 'Funds delivered')];
        return bar(L('Đang gửi…', 'Sending…'), '') + body(`<div class="proc"><div class="spin"></div><div class="amount sm">${fx(c.amt)}</div><div class="sub">${L('đến ', 'to ')}${r.name}</div>
          <div class="plist">${items.map((t, i) => `<div class="pi ${c.ph > i ? 'ok' : c.ph === i ? 'on' : ''}"><span></span>${t}</div>`).join('')}</div></div>`); },
        enter: c => { c.ph = 0; [1, 2, 3].forEach(i => later(() => { c.ph = i; draw(); }, i * 800)); later(nextStep, 3100); } },
      { r: c => { const r = RECIPS[c.rc]; return bar(L('Hoàn tất', 'Transfer complete'), '') + body(
        `<div class="success">${TICK}<h3>${L('Đã gửi tiền!', 'Money sent!')}</h3><p>${first(r)} ${L('đã nhận', 'received')}</p><div class="amount">${cur(c.amt * r.rate, r.sym)}</div></div>
         <div class="card">${kv(L('Nhận qua', 'Delivered to'), tx(DESTS[c.dst].t))}${kv(L('Mã giao dịch', 'Reference'), 'VD-48213')}${kv(L('Trạng thái', 'Status'), `<span style="color:#14a86b">${L('Thành công', 'Delivered')}</span>`)}</div>
         <button class="cta" data-a="finish">${DONE()}</button>`); } }
    ]
  },
  receive: {
    name: 'RECEIVE', color: '#f7b600', intent: ['Tôi muốn người khác gửi tiền cho tôi.', 'I want someone to send money to me.'],
    hero: ['Nhận tiền dễ như gửi một lời yêu cầu.', 'Make receiving money as easy as sending a request.'],
    powered: ['Vận hành bởi Visa Direct', 'Powered by Visa Direct'], product: 'Cross-Border Account Funding Transaction', short: 'XB AFT',
    verb: ['Bạn vừa nhận tiền từ nước ngoài.', 'You just got paid from abroad.'],
    summary: ['Tạo yêu cầu, chia sẻ đường link, người gửi thanh toán bằng thẻ Visa — tiền về thẳng tài khoản của bạn.', 'Request money, share a link, and the sender pays with their Visa card — funds land straight in your account.'],
    explain: ['Cross-Border AFT cho phép người gửi nạp tiền cho giao dịch từ thẻ Visa, giúp người nhận yêu cầu tiền từ nước ngoài chỉ bằng một đường link thanh toán.', 'Cross-Border AFT lets a sender fund a transfer from their Visa card, so recipients can request money from overseas with a simple payment link.'],
    route: () => L('Sydney, Úc → TP. Hồ Chí Minh', 'Sydney, AU → Ho Chi Minh City, VN'),
    steps: [['Yêu cầu nhận tiền', 'Request money'], ['Tạo link thanh toán', 'Generate payment link'], ['Chia sẻ cho người gửi', 'Share with sender'], ['Người gửi thanh toán', 'Sender completes payment'], ['Nhận tiền', 'Funds received'], ['Xác nhận', 'Confirmation']],
    init: { amt: 200 },
    screens: [
      { r: c => bar(L('Yêu cầu nhận tiền', 'Request money'), L('Nhận tiền từ nước ngoài', 'Get paid from abroad')) + body(
        `<div class="p-h">${L('Yêu cầu từ', 'Request from')}</div>
         <div class="row">${av('David Tran', '#e05a2a')}<div class="grow"><b>David Tran</b><span><em class="cc">AU</em>${L('Sydney, Úc', 'Sydney, Australia')}</span></div></div>
         <div class="p-h">${L('Số tiền', 'Amount')}</div><div class="amount">${fx(c.amt)}</div><div class="sub">≈ <b>${cur(c.amt * VND, '₫')}</b> ${L('vào tài khoản của bạn', 'into your account')}</div>
         <div class="chips" style="margin-top:8px">${[100, 200, 300, 500].map(a => `<button class="chip ${a === c.amt ? 'on' : ''}" data-a="sel" data-v="amt:${a}">${fxShort(a)}</button>`).join('')}</div>
         <button class="cta" data-a="next">${L('Tạo yêu cầu thanh toán', 'Create payment request')}</button>`) },
      { r: c => bar(L('Yêu cầu thanh toán', 'Payment request'), L('Gửi đến David Tran', 'For David Tran'), true) + body(c.link ?
        `<div class="success">${TICK}<h3>${L('Yêu cầu đã sẵn sàng', 'Request ready')}</h3><p>${L('Chia sẻ đường link bảo mật này cho David', 'Share this secure link with David')}</p></div>
         <div class="link"><span>pay.example/r/</span><b>7XK2-M9Q</b></div>
         <div class="card">${kv(L('Số tiền', 'Amount'), fx(c.amt))}${kv(L('Người gửi', 'From'), L('David Tran · Úc', 'David Tran · Australia'))}${kv(L('Hết hạn', 'Expires'), L('Sau 48 giờ', 'In 48 hours'))}</div>
         <button class="cta" data-a="next">${L('Chia sẻ yêu cầu', 'Share request')}</button>` :
        `<div class="proc"><div class="spin"></div><h3>${L('Đang tạo link thanh toán bảo mật…', 'Generating secure payment link…')}</h3></div>`),
        enter: c => { c.link = false; later(() => { c.link = true; draw(); }, 1400); } },
      { r: c => bar(L('Chia sẻ yêu cầu', 'Share request'), L('Gửi cho David', 'Send it to David'), true) + body(
        `<div class="link"><span>pay.example/r/</span><b>7XK2-M9Q</b></div><div class="p-h">${L('Chia sẻ qua', 'Share via')}</div>
         <div class="tiles">${[[L('Ứng dụng chat', 'Chat app'), '💬'], ['SMS', '📱'], ['Email', '✉️'], [L('Sao chép link', 'Copy link'), '🔗']].map(([t, i], k) => `<button class="tile" data-a="choose" data-v="via:${k}"><i>${i}</i>${t}</button>`).join('')}</div>`) },
      { r: c => `<div class="sender-tag">${L('ĐIỆN THOẠI NGƯỜI GỬI · SYDNEY, ÚC', "SENDER'S PHONE · SYDNEY, AUSTRALIA")}</div>` + bar(L('Yêu cầu thanh toán', 'Payment request'), L('Từ Minh Anh', 'From Minh Anh')) + body(c.paying ?
        `<div class="proc"><div class="spin"></div><h3>${L('Đang thanh toán bằng Visa…', 'Paying with Visa…')}</h3><div class="sub">${L('Tiền đang được chuyển về Việt Nam', 'Funds are moving to Vietnam')}</div></div>` :
        `<div class="card center">${av('Minh Anh', '#1434cb')}<p class="sub" style="margin-top:8px">${L('Minh Anh yêu cầu', 'Minh Anh requested')}</p><div class="amount">${fx(c.amt)}</div><span class="sub">${L('TP. Hồ Chí Minh, Việt Nam', 'Ho Chi Minh City, Vietnam')}</span></div>
         <div class="p-h">${L('Thanh toán bằng', 'Pay with')}</div>
         <div class="row"><div class="vcard">VISA</div><div class="grow"><b>${L('Thẻ Visa •••• 9104', 'Visa card •••• 9104')}</b><span>${L('Hết hạn 08/29', 'Expires 08/29')}</span></div><i class="okdot"></i></div>
         <button class="cta" data-a="pay">${L('Thanh toán ', 'Pay ')}${fx(c.amt)}</button>`),
        enter: c => { c.paying = false; } },
      { r: c => bar(L('Trang chủ', 'Home'), L('Xin chào, Minh Anh', 'Hi, Minh Anh')) + body(
        `<div class="notif"><div class="ic">+</div><div><b>${L('Đã nhận tiền', 'Money received')}</b><span>${cur(c.amt * VND, '₫', '+')} ${L('từ', 'from')} David Tran</span></div></div>
         <div class="balance"><span>${L('Số dư khả dụng', 'Available balance')}</span><div class="amount">${cur(12450000 + c.amt * VND, '₫')}</div><span class="up">${cur(c.amt * VND, '₫', '+')} ${L('vừa xong', 'just now')}</span></div>
         <div class="p-h">${L('Giao dịch gần đây', 'Recent activity')}</div>
         <div class="row">${av('David Tran', '#e05a2a')}<div class="grow"><b>David Tran</b><span>${L('Quốc tế · vừa xong', 'Cross-border · now')}</span></div><b class="pos">${cur(c.amt * VND, '₫', '+')}</b></div>
         <div class="row"><div class="av" style="background:#eaf0ff;font-size:24px">⚡</div><div class="grow"><b>${L('Tiền điện', 'Electricity bill')}</b><span>${L('Hôm qua', 'Yesterday')}</span></div><b class="neg">${cur(850000, '₫', '-')}</b></div>
         <button class="cta" data-a="next">${L('Xem chi tiết', 'View details')}</button>`) },
      { r: c => bar(L('Chi tiết giao dịch', 'Payment details'), '') + body(
        `<div class="success">${TICK}<h3>${L('Đã nhận tiền', 'Funds received')}</h3><p>${L('Thanh toán bởi David Tran', 'Paid by David Tran')}</p><div class="amount">${cur(c.amt * VND, '₫')}</div></div>
         <div class="card">${kv(L('Người gửi trả', 'Sender paid'), fx(c.amt))}${kv(L('Từ', 'From'), L('Úc · Thẻ Visa', 'Australia · Visa card'))}${kv(L('Phương thức', 'Method'), L('Link thanh toán', 'Payment link'))}${kv(L('Thời gian', 'Received'), L('Vừa xong', 'Just now'))}</div>
         <button class="cta" data-a="finish">${DONE()}</button>`) }
    ]
  },
  collect: {
    name: 'COLLECT', color: '#22d3ae', intent: ['Tôi muốn nhận và quản lý tiền từ khắp thế giới.', 'I want to receive and manage payments from around the world.'],
    hero: ['Thu, quản lý và chuyển tiền toàn cầu.', 'Collect, manage and move money globally.'],
    powered: ['Vận hành bởi Visa Cross-Border Solutions', 'Powered by Visa Cross-Border Solutions'], product: 'Visa Cross-Border Solutions', short: 'VXBS',
    verb: ['Bạn vừa thu tiền từ khắp thế giới.', 'You just collected money globally.'],
    summary: ['Nhận tiền từ khách hàng và nền tảng nước ngoài, giữ nhiều loại tiền tệ, quy đổi và rút tiền — tất cả ở một nơi.', 'Get paid by overseas customers and platforms, hold multiple currencies, convert and withdraw — all in one place.'],
    explain: ['Visa Cross-Border Solutions giúp người bán hàng online, doanh nghiệp SME, freelancer và nhà sáng tạo nội dung nhận tiền từ nước ngoài, rồi lưu giữ, quy đổi và sử dụng tại Việt Nam.', 'Visa Cross-Border Solutions help sellers, SMEs, freelancers and creators receive funds from overseas, then hold, convert and use them locally.'],
    route: () => L('Mỹ · Đức · Anh → Việt Nam', 'US · DE · UK → Vietnam'),
    steps: [['Xem thông tin tài khoản', 'Access account details'], ['Chia sẻ cho người trả / nền tảng', 'Share with payer / platform'], ['Nhận tiền từ nước ngoài', 'Receive overseas funds'], ['Xem số dư', 'View balance'], ['Quy đổi ngoại tệ', 'Convert currency'], ['Rút / quản lý tiền', 'Withdraw / manage funds']],
    init: { acc: 'USD' },
    screens: [
      { r: c => { const NAME = [L('Tên tài khoản', 'Account name'), 'Lan Ceramics Co.'], NUM = L('Số tài khoản', 'Account number');
        const A = {
          USD: [NAME, [NUM, '8301 2294 5521'], ['Routing number', '026 073 150']],
          EUR: [NAME, ['IBAN', 'DE89 3704 0044 0532 01'], ['BIC', 'DEMOXXDE1']],
          GBP: [NAME, [NUM, '4821 7730'], ['Sort code', '04-00-75']]
        }[c.acc];
        return bar(L('Nhận tiền toàn cầu', 'Get paid globally'), L('Lan Ceramics Co. · Bán hàng online', 'Lan Ceramics Co. · Online seller')) + body(
          `<div class="seg">${['USD', 'EUR', 'GBP'].map(k => `<button class="${c.acc === k ? 'on' : ''}" data-a="sel" data-v="acc:${k}">${k}</button>`).join('')}</div>
           <div class="card"><div class="cardh">${L(`Tài khoản nhận ${c.acc}`, `${c.acc} receiving account`)}</div>${A.map(([k, v]) => kv(k, v)).join('')}</div>
           <p class="note">${L('Chia sẻ thông tin này cho khách hàng và sàn thương mại nước ngoài để nhận tiền như một doanh nghiệp bản địa.', 'Share these details with overseas customers and marketplaces to get paid like a local business.')}</p>
           <button class="cta" data-a="next">${L('Chia sẻ thông tin', 'Share details')}</button>`); } },
      { r: c => bar(L('Chia sẻ thông tin', 'Share details'), L('Ai sẽ thanh toán cho bạn?', 'Who is paying you?'), true) + body(
        `<div class="tiles">${[[L('Sàn thương mại điện tử', 'Online marketplace'), '🛒'], [L('Hoá đơn khách hàng', 'Client invoice'), '🧾'], [L('Nền tảng thanh toán', 'Payment platform'), '🌐'], [L('Sao chép thông tin', 'Copy details'), '🔗']].map(([t, i], k) => `<button class="tile" data-a="choose" data-v="via:${k}"><i>${i}</i>${t}</button>`).join('')}</div>
         <p class="note">${L(`Thông tin tài khoản ${c.acc} được đính kèm tự động.`, `Your ${c.acc} account details are attached automatically.`)}</p>`) },
      { r: c => bar(L('Tiền đang về', 'Incoming payments'), L('Từ khắp thế giới', 'From around the world')) + body(
        `<div class="p-h">${c.inc < 3 ? L('Đang chờ thanh toán…', 'Waiting for payments…') : L('Đã nhận 3 khoản thanh toán', '3 payments received')}</div>` +
        INC.slice(0, c.inc).map((x, i) => `<div class="row ${i === c.inc - 1 ? 'new' : ''}"><div class="av" style="background:#14a88a">${x.cc}</div><div class="grow"><b>${tx(x.f)}</b><span>${L('Đã nhận · vừa xong', 'Received · just now')}</span></div><b class="pos">${fx(x.amt, x.code, '+')}</b></div>`).join('') +
        (c.inc < 3 ? '<div class="spin sm"></div>' : '') +
        `<button class="cta" data-a="next" ${c.inc < 3 ? 'disabled' : ''}>${L('Xem số dư', 'View balance')}</button>`),
        enter: c => { c.inc = 0; [1, 2, 3].forEach(i => later(() => { c.inc = i; draw(); }, i * 900)); } },
      { r: c => bar(L('Số dư', 'Balances'), L('Ví đa tiền tệ', 'Multi-currency wallet'), true) + body(
        `<div class="balance"><span>${L('Tổng số dư (ước tính)', 'Total balance (est.)')}</span><div class="amount">${cur(INC.reduce((t, x) => t + x.amt * x.rate, 0), '₫')}</div><span class="up">${L('3 loại tiền tệ', '3 currencies')}</span></div>` +
        INC.map(x => `<div class="row"><div class="av" style="background:#0b1240;font-size:15px">${x.code}</div><div class="grow"><b>${fx(x.amt, x.code)}</b><span>${tx(x.name)} · ≈ ${cur(x.amt * x.rate, '₫')}</span></div></div>`).join('') +
        `<button class="cta" data-a="next">${L('Quy đổi ngoại tệ', 'Convert currency')}</button>`) },
      { r: c => bar(L('Quy đổi', 'Convert'), 'USD → VND', true) + body(
        `<div class="cbox"><span>${L('Bạn quy đổi', 'You convert')}</span><b>${L('Số dư USD', 'USD balance')}</b><div class="amount sm">${fx(INC[0].amt)}</div></div>
         <div class="swap">↓</div>
         <div class="cbox"><span>${L('Bạn nhận', 'You get')}</span><b>${L('Số dư VND', 'VND balance')}</b><div class="amount sm">${cur(CONVERTED, '₫')}</div></div>
         <div class="rate" style="margin-top:6px">1 USD = ${RF(VND)} VND · ${L('tỷ giá được giữ trong 30 giây', 'rate locked for 30s')}</div>
         <button class="cta" data-a="next">${L('Quy đổi ngay', 'Convert now')}</button>`),
        enter: c => { c.wd = null; } },
      { r: c => c.wd != null ?
        bar(L('Hoàn tất', 'All done'), '') + body(`<div class="success">${TICK}<h3>${tx(WD[c.wd].done)}</h3><p>${tx(WD[c.wd].t)}</p><div class="amount">${cur(CONVERTED, '₫')}</div></div>
          <div class="card">${kv(L('Từ', 'From'), L('Số dư VND', 'VND balance'))}${kv(L('Đến', 'To'), tx(WD[c.wd].s))}${kv(L('Quy đổi từ', 'Converted from'), fx(INC[0].amt))}</div>
          <button class="cta" data-a="finish">${DONE()}</button>`) :
        bar(L('Quản lý tiền', 'Manage funds'), L('Quy đổi thành công', 'Converted successfully')) + body(
          `<div class="balance"><span>${L('Số dư VND', 'VND balance')}</span><div class="amount">${cur(CONVERTED, '₫')}</div><span class="up">${L('Quy đổi từ ', 'Converted from ')}${fx(INC[0].amt)}</span></div>
           <div class="p-h">${L('Bạn muốn làm gì tiếp?', 'What would you like to do?')}</div>` +
          WD.map((w, i) => `<button class="row" data-a="sel" data-v="wd:${i}"><div class="av" style="background:#eaf0ff;font-size:26px">${w.i}</div><div class="grow"><b>${tx(w.t)}</b><span>${tx(w.s)}</span></div><i class="chev">›</i></button>`).join('')) }
    ]
  }
};

/* ---------- navigation ---------- */
let timers = [];
const later = (fn, ms) => timers.push(setTimeout(fn, ms));
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

function show(view) {
  clearTimers();
  S.view = view;
  if (view === 'idle') { S.zone = LOCK; S.lang = DEF_LANG; scene('idle', 960, 540); }
  if (view === 'home') scene('home', 960, 540);
  if (view === 'done') scene(S.zone, 1500, 520);
  if (view === 'flow') { scene(S.zone, 1245, 540); enterStep(); return; }
  draw();
}
function openFlow(z) {
  S.zone = z; S.step = 0; S.ctx = Object.assign({}, FLOWS[z].init);
  show('flow');
}
function enterStep() {
  clearTimers();
  const sc = FLOWS[S.zone].screens[S.step];
  if (sc.enter) sc.enter(S.ctx);
  S.fresh = true; draw(); S.fresh = false;
}
function nextStep() {
  if (S.step >= FLOWS[S.zone].screens.length - 1) return show('done');
  S.step++; enterStep();
}
function setKV(v) {
  const i = v.indexOf(':'), k = v.slice(0, i), val = v.slice(i + 1);
  S.ctx[k] = isNaN(val) ? val : +val;
}
function act(a, v) {
  switch (a) {
    case 'lang': S.lang = v; draw(); break;
    case 'start': LOCK ? openFlow(LOCK) : show('home'); break;
    case 'pick': openFlow(v); break;
    case 'choose': setKV(v); nextStep(); break;
    case 'sel': setKV(v); draw(); break;
    case 'next': nextStep(); break;
    case 'back': if (S.step > 0) { S.step--; enterStep(); } break;
    case 'pay': S.ctx.paying = true; draw(); later(nextStep, 1800); break;
    case 'finish': show('done'); break;
    case 'home': show(LOCK ? 'idle' : 'home'); break;
    case 'again': LOCK ? openFlow(LOCK) : show('home'); break;
    case 'restart': show('idle'); break;
  }
}
app.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && !el.disabled) act(el.dataset.a, el.dataset.v);
});

/* ---------- views ---------- */
const brand = () => `<div class="brand"><span class="vw">VISA</span><span class="vd">Direct</span></div>`;
const langSwitch = () => `<div class="lang">${GLOBE}${[['vi', 'VI'], ['en', 'EN']].map(([k, t]) => `<button class="${S.lang === k ? 'on' : ''}" data-a="lang" data-v="${k}">${t}</button>`).join('')}</div>`;
function draw() {
  const f = FLOWS[S.zone];
  document.documentElement.lang = S.lang;
  stage.style.setProperty('--z', f ? f.color : '#2f9bff');
  let html = '';
  if (S.view === 'idle') {
    html = `<div class="idle" data-a="start">
      <div class="mm">${L('CHUYỂN TIỀN CÙNG', 'MOVE MONEY WITH')}</div><div class="vw">VISA</div>
      <div class="src"><b style="--c:#2f9bff">SEND</b><i></i><b style="--c:#f7b600">RECEIVE</b><i></i><b style="--c:#22d3ae">COLLECT</b></div>
      <div class="touch">${LOCK ? `${L('Chạm để bắt đầu', 'Touch to start')} · <b>${f.name}</b>` : L('Chạm vào màn hình để bắt đầu', 'Touch anywhere to start')}</div></div>`;
  } else if (S.view === 'home') {
    html = brand() + `<div class="home"><h1>${L('Chọn hành trình của bạn', 'Choose your journey')}</h1><div class="k">${L('Chạm vào một thẻ để trải nghiệm chuyển tiền cùng Visa', 'Tap a card to try a live Visa money-movement experience')}</div>
      <div class="cards">${ZONES.map(z => { const g = FLOWS[z]; return `<button class="zc" style="--z:${g.color}" data-a="pick" data-v="${z}">
        <div class="ic">${ICON[z]}</div><h2>${g.name}</h2><q>${tx(g.intent)}</q><div class="pr">${tx(g.powered)}<br><b style="color:#fff">${g.short}</b></div>
        <div class="go">${L('Bắt đầu', 'Start')}<span>→</span></div></button>`; }).join('')}</div></div>`;
  } else if (S.view === 'flow') {
    const sc = f.screens[S.step];
    html = brand() + `<div class="flow">
      <div class="left"><div class="zone-pill"><span class="ic">${ICON[S.zone]}</span>${f.name}</div>
        <h1 class="hero">${tx(f.hero)}</h1><div class="prod">${tx(f.powered)} · <b>${f.short}</b></div>
        <div class="steps">${f.steps.map((s, i) => `<div class="step ${i < S.step ? 'ok' : i === S.step ? 'on' : ''}"><span class="n">${i < S.step ? '✓' : i + 1}</span>${tx(s)}</div>`).join('')}</div></div>
      <div class="route"><span>${L('Hành trình', 'Live journey')}</span><b>${f.route(S.ctx)}</b></div>
      <div class="phone"><div class="screen ${S.fresh ? 'fresh' : ''}"><div class="notch"></div>
        <div class="status"><span>9:41</span><span>5G ▮▮▮</span></div>${sc.r(S.ctx)}</div></div>
      <div class="nav">${LOCK ? '' : `<button class="ghost" data-a="home">‹ ${L('Tất cả hành trình', 'All journeys')}</button>`}<button class="ghost" data-a="restart">↺ ${L('Bắt đầu lại', 'Start over')}</button></div></div>`;
  } else if (S.view === 'done') {
    html = brand() + `<div class="done"><div class="done-l">
      <div class="zone-pill"><span class="ic">${ICON[S.zone]}</span>${f.name}</div>
      <h1 class="hero">${tx(f.verb)}</h1><p class="lead">${tx(f.summary)}</p>
      <div class="pw"><span>${tx(f.powered)}</span><b>${f.product} (${f.short})</b><p>${tx(f.explain)}</p></div>
      <div class="btns"><button class="btn primary" data-a="again">${LOCK ? L('Thử lại', 'Try it again') : L('Thử hành trình khác', 'Try another journey')}</button><button class="btn" data-a="restart">${L('Kết thúc', 'Finish')}</button></div></div>
      <div class="qr-card"><div id="qr"></div><h3>${L('Quét để tiếp tục', 'Scan to continue')}</h3><ul><li>${L('Tìm hiểu thêm về ', 'Learn more about ')}${f.short}</li><li>${L('Đặt lịch demo', 'Request a demo')}</li><li>${L('Kết nối với đội ngũ Visa', 'Connect with the Visa team')}</li></ul></div></div>`;
  }
  app.innerHTML = html + langSwitch();
  if (S.view === 'done') {
    const el = $('#qr');
    if (window.QRCode) new QRCode(el, { text: QR_URL, width: 300, height: 300, colorDark: '#0b1240', colorLight: '#ffffff' });
    else el.innerHTML = `<div style="font-size:18px;color:#6b76a0">${QR_URL}</div>`;
  }
}

/* ---------- idle timeout ---------- */
let lastTouch = Date.now();
['pointerdown', 'keydown'].forEach(ev => addEventListener(ev, () => { lastTouch = Date.now(); }, true));
setInterval(() => {
  const quiet = Date.now() - lastTouch;
  if (S.view !== 'idle' && quiet > IDLE_MS) show('idle');
  // Periodic reload frees memory on long shows; only on the attract screen so no visitor is interrupted.
  else if (RELOAD_MS && S.view === 'idle' && quiet > 30e3 && Date.now() - LOADED > RELOAD_MS) location.reload();
}, 1000);

// Keep the display awake (Screen Wake Lock needs https or localhost; harmless elsewhere).
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (e) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
addEventListener('pointerdown', keepAwake);
keepAwake();
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.key === 'f' || e.key === 'F') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {});
  if (e.key === 'Escape') show('idle');
  if (['1', '2', '3'].includes(e.key)) openFlow(ZONES[+e.key - 1]);
});

/* ---------- background money-movement animation ---------- */
const g = $('#bg').getContext('2d');
const W = 1920, H = 1080;
const DOTS = [];
for (let y = 24; y < H; y += 26) for (let x = 24; x < W; x += 26) {
  const n = Math.sin(x * .0042 + 1.3) * Math.cos(y * .0061 - .4) + .55 * Math.sin(x * .0113 + y * .0079) + .3 * Math.cos(x * .021 - y * .017);
  if (n > .42) DOTS.push([x, y, Math.random()]);
}
let mode = 'idle', C = { x: 960, y: 540 }, routes = [];
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; };
const dot = () => { const d = DOTS[Math.random() * DOTS.length | 0]; return { x: d[0], y: d[1] }; };
function far(min) { let p; for (let i = 0; i < 60; i++) { p = dot(); if (Math.hypot(p.x - C.x, p.y - C.y) > min) break; } return p; }
function route(a, b, color, label) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  return { a, b, c: { x: mx - dy * .25, y: my + dx * .25 - Math.hypot(dx, dy) * .08 }, color, label, seed: Math.random(),
    parts: [Math.random(), Math.random()], sp: .0022 + Math.random() * .002 };
}
function scene(m, x, y) {
  mode = m; C = { x, y }; routes = [];
  const pal = ['#2f9bff', '#f7b600', '#22d3ae', '#7aa8ff'];
  if (m === 'idle' || m === 'home') {
    for (let i = 0; routes.length < (m === 'idle' ? 12 : 7) && i < 100; i++) {
      const a = dot(), b = dot();
      if (Math.hypot(a.x - b.x, a.y - b.y) > 350) routes.push(route(a, b, pal[routes.length % 4]));
    }
  } else if (m === 'send') for (let i = 0; i < 7; i++) routes.push(route(C, far(430), FLOWS.send.color));
  else if (m === 'receive') for (let i = 0; i < 7; i++) routes.push(route(far(430), C, FLOWS.receive.color));
  else if (m === 'collect') ['$', '€', '£', '¥', 'A$', 'S$', '₩', 'HK$', 'C$', 'CHF'].forEach(l => routes.push(route(far(400), C, FLOWS.collect.color, l)));
}
const bez = (r, t) => { const u = 1 - t; return { x: u * u * r.a.x + 2 * u * t * r.c.x + t * t * r.b.x, y: u * u * r.a.y + 2 * u * t * r.c.y + t * t * r.b.y }; };
let lastFrame = 0;
const TRAIL = LOW_FX ? 6 : 12;
function frame(t) {
  requestAnimationFrame(frame);
  if (LOW_FX && t - lastFrame < 32) return; // ~30fps on weak players
  lastFrame = t;
  g.clearRect(0, 0, W, H);
  for (const d of DOTS) { g.fillStyle = `rgba(120,160,255,${.09 + .07 * Math.sin(t * .001 + d[2] * 6.28)})`; g.fillRect(d[0] - 1.5, d[1] - 1.5, 3, 3); }
  const zoneMode = FLOWS[mode];
  if (zoneMode) for (let i = 0; i < 3; i++) {
    const ph = (t * .00035 + i / 3) % 1, out = mode === 'send';
    const rad = out ? 300 + ph * 300 : 600 - ph * 300;
    g.strokeStyle = rgba(zoneMode.color, (out ? 1 - ph : ph) * .3); g.lineWidth = 2;
    g.beginPath(); g.arc(C.x, C.y, rad, 0, 7); g.stroke();
  }
  for (const r of routes) {
    g.strokeStyle = rgba(r.color, .2); g.lineWidth = 2;
    g.beginPath(); g.moveTo(r.a.x, r.a.y); g.quadraticCurveTo(r.c.x, r.c.y, r.b.x, r.b.y); g.stroke();
    const ends = mode === 'send' ? [r.b] : zoneMode ? [r.a] : [r.a, r.b];
    for (const e of ends) {
      const ph = (t * .0008 + r.seed) % 1;
      g.fillStyle = rgba(r.color, .9); g.beginPath(); g.arc(e.x, e.y, 5, 0, 7); g.fill();
      g.strokeStyle = rgba(r.color, 1 - ph); g.beginPath(); g.arc(e.x, e.y, 6 + ph * 22, 0, 7); g.stroke();
    }
    if (r.label) { g.font = '700 26px Inter,sans-serif'; g.textAlign = 'center'; g.fillStyle = rgba(r.color, .95); g.fillText(r.label, r.a.x, r.a.y - 24); }
    for (let i = 0; i < r.parts.length; i++) {
      r.parts[i] = (r.parts[i] + r.sp * (LOW_FX ? 2 : 1)) % 1;
      for (let k = 0; k < TRAIL; k++) {
        const tt = r.parts[i] - k * (.132 / TRAIL); if (tt < 0) break;
        const p = bez(r, tt);
        g.fillStyle = rgba(r.color, (1 - k / TRAIL) * .95);
        if (!LOW_FX) { g.shadowBlur = k ? 0 : 18; g.shadowColor = r.color; }
        g.beginPath(); g.arc(p.x, p.y, 5.5 - k * (4.5 / TRAIL), 0, 7); g.fill();
      }
      g.shadowBlur = 0;
    }
  }
}
requestAnimationFrame(frame);

/* ---------- start ---------- */
const go = P.get('goto');
if (go === 'home') show('home');
else if (go && go.startsWith('done:') && FLOWS[go.slice(5)]) { S.zone = go.slice(5); S.ctx = Object.assign({}, FLOWS[S.zone].init); show('done'); }
else if (go && FLOWS[go.split(':')[0]]) { openFlow(go.split(':')[0]); S.step = Math.min(+go.split(':')[1] || 0, 5); enterStep(); }
else show('idle');
})();
