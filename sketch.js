// =====================================================================
//  天氣動畫連連看（p5.js 版）
//  玩法：把下方的天氣名稱拖曳到對應的動態圖片上，按「交卷」看成績。
//        也可以先點一下名稱、再點圖片來放置（平板、手機較好操作）。
//  只需要這個 sketch.js，搭配原本的 index.html / p5.min.js 即可執行。
// =====================================================================


// ---------------------------------------------------------------------
// 1. 題目設定（老師可以修改這裡）
// ---------------------------------------------------------------------
//  name : 拖曳標籤上的中文名稱（也是正確答案）
//  en   : 小字英文（不需要可以改成 ""）
//  gif  : 網路上的 GIF 網址。留空 "" 就使用程式畫的內建動畫。
//         例如 gif: "https://media.giphy.com/media/xxxxxxxx/giphy.gif"
//         注意：圖片網站必須允許跨網域讀取（Giphy 可以），
//         而且要用 Live Server 或架在網站/NAS 上開啟，直接雙擊 index.html 會讀不到。
//         讀取失敗時會自動改用內建動畫。
//  anim : 內建動畫的函式名稱（在本檔最下方）
const QUIZ_TITLE = "天氣動畫連連看";

const ITEMS = [
  { name: "晴天",     en: "Sunny",        gif: "", anim: drawSunny   },
  { name: "多雲",     en: "Cloudy",       gif: "", anim: drawCloudy  },
  { name: "下雨",     en: "Rainy",        gif: "", anim: drawRainy   },
  { name: "下雪",     en: "Snowy",        gif: "", anim: drawSnowy   },
  { name: "打雷閃電", en: "Thunderstorm", gif: "", anim: drawThunder },
  { name: "颳大風",   en: "Windy",        gif: "", anim: drawWindy   },
];


// ---------------------------------------------------------------------
// 2. 顏色與字型
// ---------------------------------------------------------------------
const C = {
  bg:     "#ECEFF3",
  panel:  "#FFFFFF",
  ink:    "#17212D",
  muted:  "#5A6777",
  line:   "#C9D1DB",
  accent: "#D9480F",
  ok:     "#2B8A57",
  bad:    "#C92A2A",
  screen: "#1B2430",
};
// p5 只接受單一字型名稱；中文字會由系統自動補上（Windows 微軟正黑體、Mac 蘋方）
const FONT = "sans-serif";

// 內建動畫的原始座標大小（畫好之後再縮放到每張卡片）
const ART_W = 220;
const ART_H = 150;


// ---------------------------------------------------------------------
// 3. 遊戲狀態
// ---------------------------------------------------------------------
let order = [];        // 卡片顯示順序（存的是 ITEMS 的索引）
let bankOrder = [];    // 下方標籤的排列順序
let place = {};        // place[卡片的題號] = 放上去的標籤題號
let locked = false;    // 交卷後鎖定
let startMs = 0;
let endMs = 0;
let selected = null;   // 點選模式：目前選中的標籤
let drag = null;       // 拖曳中的資料
let confirmUntil = 0;  // 還沒放完就交卷時，要求再按一次
let showResult = false;
let lastTouchMs = -9999;

// 版面（每次改變視窗大小時重新計算）
let L = {};
let cells = [];        // 每張卡片的位置 {item, x, y, w, h, slot:{...}}
let chips = [];        // 下方標籤的位置 {label, x, y, w, h}
let buttons = [];      // 按鈕 {id, text, x, y, w, h, primary}

// 內建動畫用的隨機粒子
let rainDrops = [], snowFlakes = [], windLeaves = [];


// ---------------------------------------------------------------------
// 4. p5.js 主要函式
// ---------------------------------------------------------------------
function preload() {
  for (const it of ITEMS) {
    it.img = null;
    if (it.gif) {
      it.img = loadImage(
        it.gif,
        () => {},
        () => {
          it.img = null;
          console.warn("GIF 讀取失敗，改用內建動畫：", it.gif);
        }
      );
    }
  }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont(FONT);
  makeParticles();
  startGame();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeLayout();
}

function draw() {
  background(C.bg);
  const t = millis() / 1000;

  drawHeader();
  for (const cell of cells) drawCell(cell, t);
  drawTray();
  if (drag && drag.moved) drawChip(drag.label, mouseX - drag.offX, mouseY - drag.offY, chipWidth(drag.label), L.chipH, "drag");
  if (showResult) drawResultCard();

  updateCursor();
}


// ---------------------------------------------------------------------
// 5. 開始 / 重新開始
// ---------------------------------------------------------------------
function startGame() {
  const idx = ITEMS.map((_, i) => i);
  order = shuffle(idx);
  bankOrder = shuffle(idx);
  place = {};
  locked = false;
  selected = null;
  drag = null;
  showResult = false;
  confirmUntil = 0;
  startMs = millis();
  endMs = 0;
  computeLayout();
}


// ---------------------------------------------------------------------
// 6. 版面計算（RWD：寬螢幕 3 欄、窄螢幕 2 欄，自動縮放卡片大小）
// ---------------------------------------------------------------------
function computeLayout() {
  const n = ITEMS.length;
  L.pad = constrain(width * 0.03, 12, 28);
  L.gap = constrain(width * 0.018, 8, 18);
  L.fs = constrain(width / 70, 12, 16);           // 基本字級
  L.chipH = L.fs * 2.5;
  L.slotH = L.chipH + 8;
  L.ansH = L.fs * 1.5;
  L.headerH = L.fs * 5.6;
  L.cols = width < 640 ? 2 : 3;
  L.rows = ceil(n / L.cols);

  // 下方托盤：先排標籤，算出需要幾行
  const trayInnerW = width - L.pad * 2;
  const chipRows = layoutChipRows(bankOrder, trayInnerW, 0, 0).rows;
  L.btnH = L.fs * 2.6;
  L.trayH = L.pad * 0.8 + chipRows * (L.chipH + 8) + L.btnH + L.pad * 0.9;
  L.trayY = height - L.trayH;

  // 卡片大小：先用寬度算，太高就縮小
  const availH = L.trayY - L.headerH - L.pad * 0.6;
  let tileW = (width - L.pad * 2 - L.gap * (L.cols - 1)) / L.cols;
  let tileH = tileW * ART_H / ART_W;
  const extra = 6 + L.slotH + L.ansH;
  const needH = L.rows * (tileH + extra) + (L.rows - 1) * L.gap;
  if (needH > availH) {
    tileH = (availH - (L.rows - 1) * L.gap) / L.rows - extra;
    tileH = max(tileH, 50);
    tileW = tileH * ART_W / ART_H;
  }
  const gridW = L.cols * tileW + (L.cols - 1) * L.gap;
  const x0 = (width - gridW) / 2;
  const y0 = L.headerH;

  cells = order.map((item, k) => {
    const c = k % L.cols, r = floor(k / L.cols);
    const x = x0 + c * (tileW + L.gap);
    const y = y0 + r * (tileH + extra + L.gap);
    return {
      item, no: k + 1, x, y, w: tileW, h: tileH,
      slot: { x, y: y + tileH + 6, w: tileW, h: L.slotH },
    };
  });
}

// 把標籤排成多行，回傳每個標籤的位置與行數
function layoutChipRows(list, maxW, ox, oy) {
  textSize(L.fs);
  let x = 0, y = 0, rows = list.length ? 1 : 1;
  const out = [];
  for (const label of list) {
    const w = min(chipWidth(label), maxW);
    if (x > 0 && x + w > maxW) { x = 0; y += L.chipH + 8; rows++; }
    out.push({ label, x: ox + x, y: oy + y, w, h: L.chipH });
    x += w + 8;
  }
  return { rows, chips: out };
}

function chipWidth(label) {
  const it = ITEMS[label];
  textSize(L.fs);
  let w = textWidth(it.name) + L.fs * 1.8;
  if (it.en && width >= 480) {
    textSize(L.fs * 0.75);
    w += textWidth(it.en) + L.fs * 0.5;
  }
  return w;
}

// 依據目前狀態，計算托盤裡標籤和按鈕的位置
function refreshTray() {
  const used = new Set(Object.values(place));
  const free = bankOrder.filter(i => !used.has(i) && !(drag && drag.moved && drag.label === i && drag.from === "bank"));
  const res = layoutChipRows(free, width - L.pad * 2, L.pad, L.trayY + L.pad * 0.8);
  chips = res.chips;

  textSize(L.fs);
  const by = height - L.pad * 0.9 - L.btnH;
  const defs = [
    { id: "submit", text: locked ? "已交卷" : "交卷看成績", primary: true },
    { id: "restart", text: "重新開始" },
  ];
  let bx = L.pad;
  buttons = defs.map(d => {
    const w = textWidth(d.text) + L.fs * 2.4;
    const b = { ...d, x: bx, y: by, w, h: L.btnH };
    bx += w + 10;
    return b;
  });
  L.hintX = bx + 6;
  L.hintY = by + L.btnH / 2;
}


// ---------------------------------------------------------------------
// 7. 繪製畫面
// ---------------------------------------------------------------------
function drawHeader() {
  const p = L.pad;
  noStroke();
  fill(C.accent);
  textAlign(LEFT, TOP);
  textStyle(BOLD);
  textSize(L.fs * 0.75);
  text("MATCHING QUIZ · GIF", p, p * 0.8);

  fill(C.ink);
  textSize(L.fs * 1.7);
  text(QUIZ_TITLE, p, p * 0.8 + L.fs * 1.1);

  textStyle(NORMAL);
  fill(C.muted);
  textSize(L.fs * 0.85);
  const tip = width < 640 ? "拖曳名稱到對應的動畫下方" : "看看每張動畫是什麼天氣，把下方的名稱拖曳到圖片下方的格子裡";
  text(tip, p, p * 0.8 + L.fs * 3.2);

  // 右上角：配對數 + 時間 / 成績
  const placedN = Object.keys(place).length;
  const secs = floor(((locked ? endMs : millis()) - startMs) / 1000);
  const timeStr = nf(floor(secs / 60), 2) + ":" + nf(secs % 60, 2);
  const boxes = locked
    ? [["成績", scoreNow() + " 分"], ["時間", timeStr]]
    : [["已配對", placedN + "/" + ITEMS.length], ["時間", timeStr]];

  textSize(L.fs * 1.25);
  textStyle(BOLD);
  const bw = max(textWidth("00:00"), textWidth(boxes[0][1])) + L.fs * 1.6;
  const bh = L.fs * 3.2;
  let x = width - p - bw * 2 - 8;
  if (width < 420) x = width - p - bw * 2 - 8; // 小螢幕仍然靠右
  for (const [lab, val] of boxes) {
    fill(C.panel);
    stroke(C.line);
    strokeWeight(1);
    rect(x, p * 0.8, bw, bh, 8);
    noStroke();
    fill(C.muted);
    textStyle(NORMAL);
    textSize(L.fs * 0.7);
    textAlign(LEFT, TOP);
    text(lab, x + L.fs * 0.7, p * 0.8 + L.fs * 0.45);
    fill(lab === "成績" ? C.accent : C.ink);
    textStyle(BOLD);
    textSize(L.fs * 1.25);
    text(val, x + L.fs * 0.7, p * 0.8 + L.fs * 1.35);
    x += bw + 8;
  }
  textStyle(NORMAL);
}

function drawCell(cell, t) {
  const { x, y, w, h, slot } = cell;
  const it = ITEMS[cell.item];

  // --- 動畫畫面（裁切成圓角） ---
  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 10); else ctx.rect(x, y, w, h);
  ctx.clip();
  noStroke();
  fill(C.screen);
  rect(x, y, w, h);
  if (it.img && it.img.width > 1) {
    drawImageCover(it.img, x, y, w, h);
  } else {
    push();
    translate(x, y);
    scale(w / ART_W, h / ART_H);
    it.anim(t + cell.no * 0.37);
    pop();
  }
  ctx.restore();

  // 題號
  noStroke();
  fill(0, 120);
  rect(x + 8, y + 8, L.fs * 2.4, L.fs * 1.5, 4);
  fill(255);
  textAlign(CENTER, CENTER);
  textStyle(BOLD);
  textSize(L.fs * 0.8);
  text("#" + cell.no, x + 8 + L.fs * 1.2, y + 8 + L.fs * 0.75);
  textStyle(NORMAL);

  // --- 放置格 ---
  const placed = place[cell.item];
  const hovering = (drag && drag.moved && hitCell(cell, mouseX, mouseY)) || (selected !== null && !locked);
  let border = C.line, bgc = null, dashed = true;
  if (placed !== undefined) { border = C.ink; dashed = false; }
  if (hovering && !locked) { border = C.accent; bgc = color(217, 72, 15, 22); }
  if (locked) {
    const ok = placed === cell.item;
    border = ok ? C.ok : C.bad;
    bgc = ok ? color(43, 138, 87, 30) : color(201, 42, 42, 26);
    dashed = false;
  }
  if (bgc) { fill(bgc); noStroke(); rect(slot.x, slot.y, slot.w, slot.h, 8); }
  noFill();
  stroke(border);
  strokeWeight(2);
  if (dashed) drawingContext.setLineDash([6, 5]);
  rect(slot.x + 1, slot.y + 1, slot.w - 2, slot.h - 2, 8);
  drawingContext.setLineDash([]);

  const beingDragged = drag && drag.moved && drag.from === cell.item;
  if (placed !== undefined && !beingDragged) {
    drawChip(placed, slot.x + 4, slot.y + 4, slot.w - 8, L.chipH, "slot");
  } else {
    noStroke();
    fill(C.muted);
    textAlign(CENTER, CENTER);
    textSize(L.fs * 0.8);
    text(locked ? "（沒有作答）" : selected !== null ? "點這裡放置" : "拖曳名稱到這裡", slot.x + slot.w / 2, slot.y + slot.h / 2);
  }

  // --- 交卷後顯示對錯 ---
  if (locked) {
    const ok = placed === cell.item;
    noStroke();
    fill(ok ? C.ok : C.bad);
    textStyle(BOLD);
    textAlign(LEFT, TOP);
    textSize(L.fs * 0.8);
    const msg = ok ? "✓ 正確" : "✗ 正解：" + it.name;
    text(msg, slot.x, slot.y + slot.h + 3);
    textStyle(NORMAL);
  }
}

function drawTray() {
  refreshTray();
  noStroke();
  fill(C.panel);
  rect(0, L.trayY, width, L.trayH);
  stroke(C.line);
  strokeWeight(1);
  line(0, L.trayY, width, L.trayY);

  // 拖回托盤時的提示框
  if (drag && drag.moved && mouseY > L.trayY && drag.from !== "bank") {
    noFill();
    stroke(C.accent);
    drawingContext.setLineDash([6, 5]);
    rect(4, L.trayY + 4, width - 8, L.trayH - 8, 8);
    drawingContext.setLineDash([]);
  }

  if (chips.length === 0) {
    noStroke();
    fill(C.muted);
    textAlign(LEFT, CENTER);
    textSize(L.fs * 0.9);
    text(locked ? "按「重新開始」會重新洗牌再玩一次" : "名稱都放好了，可以交卷囉！", L.pad, L.trayY + L.pad * 0.8 + L.chipH / 2);
  }
  for (const c of chips) drawChip(c.label, c.x, c.y, c.w, c.h, selected === c.label ? "selected" : "bank");

  for (const b of buttons) drawButton(b);

  // 按鈕旁的小提示
  noStroke();
  fill(millis() < confirmUntil ? C.bad : C.muted);
  textAlign(LEFT, CENTER);
  textSize(L.fs * 0.8);
  let hint = "";
  if (millis() < confirmUntil) hint = width < 560 ? "還沒放完，再按一次交卷" : "還有題目沒放，再按一次「交卷」直接計分";
  else if (!locked && width >= 560) hint = "放錯可以拖回這裡";
  text(hint, L.hintX, L.hintY);
}

function drawChip(label, x, y, w, h, mode) {
  const it = ITEMS[label];
  push();
  if (mode === "drag") {
    drawingContext.shadowColor = "rgba(0,0,0,0.25)";
    drawingContext.shadowBlur = 16;
    drawingContext.shadowOffsetY = 6;
    translate(x + w / 2, y + h / 2);
    rotate(-0.05);
    translate(-(x + w / 2), -(y + h / 2));
  }
  const sel = mode === "selected";
  fill(sel ? C.accent : C.panel);
  stroke(sel ? C.accent : C.ink);
  strokeWeight(1.5);
  rect(x, y, w, h, h / 2);
  drawingContext.shadowColor = "transparent";

  noStroke();
  textStyle(BOLD);
  textSize(L.fs);
  const showEn = it.en && width >= 480;
  const nameW = textWidth(it.name);
  textSize(L.fs * 0.75);
  const enW = showEn ? textWidth(it.en) + L.fs * 0.5 : 0;
  let tx = x + (w - nameW - enW) / 2;
  fill(sel ? 255 : C.ink);
  textSize(L.fs);
  textAlign(LEFT, CENTER);
  text(it.name, tx, y + h / 2);
  if (showEn) {
    textStyle(NORMAL);
    textSize(L.fs * 0.75);
    fill(sel ? 255 : C.muted);
    text(it.en, tx + nameW + L.fs * 0.5, y + h / 2 + 1);
  }
  textStyle(NORMAL);
  pop();
}

function drawButton(b) {
  const disabled = b.id === "submit" && locked;
  const hover = !disabled && inRect(mouseX, mouseY, b);
  push();
  if (disabled) drawingContext.globalAlpha = 0.4;
  if (b.primary) { fill(hover ? "#B93C0B" : C.accent); stroke(C.accent); }
  else { fill(hover ? "#E3E7EC" : C.panel); stroke(C.ink); }
  strokeWeight(1.5);
  rect(b.x, b.y, b.w, b.h, 8);
  noStroke();
  fill(b.primary ? 255 : C.ink);
  textStyle(BOLD);
  textSize(L.fs);
  textAlign(CENTER, CENTER);
  text(b.text, b.x + b.w / 2, b.y + b.h / 2);
  pop();
}

function drawResultCard() {
  const n = ITEMS.length;
  const right = countRight();
  const score = scoreNow();
  const secs = round((endMs - startMs) / 1000);

  fill(15, 20, 28, 140);
  noStroke();
  rect(0, 0, width, height);

  const w = min(420, width - L.pad * 2);
  const h = L.fs * 17;
  const x = (width - w) / 2, y = (height - h) / 2;
  fill(C.panel);
  rect(x, y, w, h, 14);

  const cx = x + w / 2;
  textAlign(CENTER, TOP);
  fill(C.muted);
  textSize(L.fs * 0.9);
  text("你的成績", cx, y + L.fs * 1.4);

  fill(C.accent);
  textStyle(BOLD);
  textSize(L.fs * 4.2);
  text(score, cx - L.fs * 0.8, y + L.fs * 2.8);
  textSize(L.fs * 1.2);
  fill(C.muted);
  textAlign(LEFT, TOP);
  text("分", cx + textWidthAt(String(score), L.fs * 4.2) / 2 - L.fs * 0.5, y + L.fs * 5.6);

  textAlign(CENTER, TOP);
  fill(C.ink);
  textSize(L.fs * 1.15);
  const head = score === 100 ? "全部配對正確！" : score >= 60 ? "及格了，看看錯在哪幾題" : "再試一次，仔細看動畫的變化";
  text(head, cx, y + L.fs * 8.1);
  textStyle(NORMAL);
  fill(C.muted);
  textSize(L.fs * 0.9);
  const tStr = (secs >= 60 ? floor(secs / 60) + " 分 " : "") + (secs % 60) + " 秒";
  text("答對 " + right + " / " + n + " 題，用時 " + tStr, cx, y + L.fs * 9.9);

  // 進度條（動畫長出來）
  const bx = x + L.fs * 1.5, bw = w - L.fs * 3, byy = y + L.fs * 11.8;
  fill(C.line);
  rect(bx, byy, bw, 10, 5);
  const grow = constrain((millis() - endMs) / 700, 0, 1);
  fill(C.ok);
  rect(bx, byy, bw * (score / 100) * easeOut(grow), 10, 5);

  // 按鈕
  textSize(L.fs);
  const bh = L.btnH;
  const b1 = { id: "review", text: "查看每題對錯", w: (bw - 10) / 2, h: bh, x: bx, y: y + h - bh - L.fs * 1.3, primary: true };
  const b2 = { id: "again", text: "再玩一次", w: (bw - 10) / 2, h: bh, x: bx + (bw - 10) / 2 + 10, y: b1.y };
  L.resultBtns = [b1, b2];
  drawButton(b1);
  drawButton(b2);
}


// ---------------------------------------------------------------------
// 8. 滑鼠 / 觸控操作
// ---------------------------------------------------------------------
function mousePressed() { if (millis() - lastTouchMs < 700) return false; pointerDown(); return false; }
function mouseDragged() { if (millis() - lastTouchMs < 700) return false; pointerMove(); return false; }
function mouseReleased() { if (millis() - lastTouchMs < 700) return false; pointerUp(); return false; }
function touchStarted() { lastTouchMs = millis(); pointerDown(); return false; }
function touchMoved()   { lastTouchMs = millis(); pointerMove(); return false; }
function touchEnded()   { lastTouchMs = millis(); pointerUp(); return false; }

function pointerDown() {
  const mx = mouseX, my = mouseY;

  // 成績卡片上的按鈕
  if (showResult) {
    for (const b of L.resultBtns || []) {
      if (inRect(mx, my, b)) {
        if (b.id === "review") showResult = false;
        if (b.id === "again") startGame();
      }
    }
    return;
  }

  // 下方按鈕
  for (const b of buttons) {
    if (inRect(mx, my, b)) { onButton(b.id); return; }
  }
  if (locked) return;

  // 按到托盤裡的標籤
  for (const c of chips) {
    if (inRect(mx, my, c)) {
      drag = { label: c.label, from: "bank", sx: mx, sy: my, offX: mx - c.x, offY: my - c.y, moved: false };
      return;
    }
  }
  // 按到已放在格子裡的標籤
  for (const cell of cells) {
    const p = place[cell.item];
    if (p !== undefined && inRect(mx, my, cell.slot)) {
      drag = { label: p, from: cell.item, sx: mx, sy: my, offX: chipWidth(p) / 2, offY: L.chipH / 2, moved: false };
      return;
    }
  }
  // 點選模式：已選好標籤，再點卡片
  if (selected !== null) {
    for (const cell of cells) {
      if (hitCell(cell, mx, my)) { putLabel(selected, cell.item, "bank"); selected = null; return; }
    }
    if (my > L.trayY) selected = null;
  }
}

function pointerMove() {
  if (!drag) return;
  if (!drag.moved && dist(mouseX, mouseY, drag.sx, drag.sy) > 6) {
    drag.moved = true;
    selected = null;
  }
}

function pointerUp() {
  if (!drag) return;
  const d = drag;
  drag = null;

  // 沒有移動 = 點一下 → 切換選取
  if (!d.moved) {
    if (d.from === "bank") selected = selected === d.label ? null : d.label;
    else { delete place[d.from]; selected = d.label; } // 點格子裡的標籤 = 拿起來
    return;
  }

  // 放到哪張卡片？
  for (const cell of cells) {
    if (hitCell(cell, mouseX, mouseY)) { putLabel(d.label, cell.item, d.from); return; }
  }
  // 放到其他地方 → 回到托盤
  if (d.from !== "bank") delete place[d.from];
}

// 把標籤放進某一格；若那格已經有標籤，就互換位置
function putLabel(label, target, from) {
  const occupant = place[target];
  for (const k in place) if (place[k] === label) delete place[k];
  place[target] = label;
  if (occupant !== undefined && occupant !== label && from !== "bank") place[from] = occupant;
}

function onButton(id) {
  if (id === "restart") { startGame(); return; }
  if (id === "submit" && !locked) {
    const placedN = Object.keys(place).length;
    if (placedN < ITEMS.length && millis() > confirmUntil) {
      confirmUntil = millis() + 4000;
      return;
    }
    locked = true;
    selected = null;
    confirmUntil = 0;
    endMs = millis();
    showResult = true;
  }
}

function updateCursor() {
  if (drag && drag.moved) { cursor("grabbing"); return; }
  const mx = mouseX, my = mouseY;
  const overBtn = buttons.some(b => inRect(mx, my, b) && !(b.id === "submit" && locked)) ||
    (showResult && (L.resultBtns || []).some(b => inRect(mx, my, b)));
  if (overBtn) { cursor(HAND); return; }
  if (!locked && !showResult) {
    if (chips.some(c => inRect(mx, my, c)) || cells.some(c => place[c.item] !== undefined && inRect(mx, my, c.slot))) { cursor("grab"); return; }
    if (selected !== null && cells.some(c => hitCell(c, mx, my))) { cursor(HAND); return; }
  }
  cursor(ARROW);
}


// ---------------------------------------------------------------------
// 9. 小工具
// ---------------------------------------------------------------------
function inRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
function hitCell(cell, px, py) {   // 圖片 + 放置格都算可以放的範圍
  return px >= cell.x - 4 && px <= cell.x + cell.w + 4 && py >= cell.y - 4 && py <= cell.slot.y + cell.slot.h + 4;
}
function countRight() { return ITEMS.filter((_, i) => place[i] === i).length; }
function scoreNow() { return round(countRight() / ITEMS.length * 100); }
function easeOut(k) { return 1 - pow(1 - k, 3); }
function textWidthAt(s, size) { push(); textStyle(BOLD); textSize(size); const w = textWidth(s); pop(); return w; }

function drawImageCover(img, x, y, w, h) {   // 圖片填滿卡片（保持比例、超出裁掉）
  const s = max(w / img.width, h / img.height);
  const iw = img.width * s, ih = img.height * s;
  image(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function skyGradient(top, bottom, hgt) {
  const c1 = color(top), c2 = color(bottom);
  noStroke();
  const steps = 30;
  for (let i = 0; i < steps; i++) {
    fill(lerpColor(c1, c2, i / (steps - 1)));
    rect(0, (hgt * i) / steps, ART_W, hgt / steps + 1);
  }
}

function cloudShape(cx, cy, r, col) {
  noStroke();
  fill(col);
  const parts = [[-1.1, 0.25, 0.7], [-0.4, -0.25, 0.9], [0.45, -0.1, 0.8], [1.1, 0.3, 0.6], [0, 0.35, 0.75]];
  for (const [dx, dy, rr] of parts) circle(cx + dx * r, cy + dy * r, rr * r * 2);
}

function makeParticles() {
  randomSeed(4);
  rainDrops = Array.from({ length: 40 }, () => ({ x: random(ART_W), p: random(1) }));
  snowFlakes = Array.from({ length: 36 }, () => ({ x: random(ART_W), p: random(1), r: random(1.5, 3.5), ph: random(TWO_PI) }));
  windLeaves = Array.from({ length: 9 }, () => ({ p: random(1), y: random(20, 100), ph: random(TWO_PI) }));
  randomSeed(Date.now() % 100000);   // 恢復隨機，讓每次洗牌都不同
}


// ---------------------------------------------------------------------
// 10. 內建天氣動畫（座標以 220 × 150 為準，t 是秒數）
// ---------------------------------------------------------------------
function drawSunny(t) {
  skyGradient("#4696E6", "#AAD7FA", ART_H);
  const cx = 110, cy = 68;
  const spin = t * 0.6;
  const pulse = 1 + 0.07 * sin(t * TWO_PI * 0.8);
  stroke("#FFC828");
  strokeWeight(4);
  strokeCap(ROUND);
  for (let i = 0; i < 12; i++) {
    const a = spin + i * PI / 6;
    const r1 = 31, r2 = (i % 2 ? 46 : 40) * pulse;
    line(cx + r1 * cos(a), cy + r1 * sin(a), cx + r2 * cos(a), cy + r2 * sin(a));
  }
  noStroke();
  fill("#FFD63C");
  circle(cx, cy, 50);
  fill("#6EB45A");
  rect(0, ART_H - 15, ART_W, 15);
}

function drawCloudy(t) {
  skyGradient("#78A5D2", "#BED7EB", ART_H);
  noStroke();
  fill("#FFD246");
  circle(150, 40, 40);
  const W = ART_W + 100;
  const layers = [[0, 35, 19, 10, "#EBF0F6"], [110, 65, 23, 14, "#FAFCFF"], [60, 100, 17, 22, "#E1E8F0"]];
  for (const [base, y, r, sp, col] of layers) {
    const x = ((base + t * sp) % W) - 50;
    cloudShape(x, y, r, col);
    cloudShape(x - W, y, r, col);
  }
  fill("#78AA64");
  rect(0, ART_H - 14, ART_W, 14);
}

function drawRainy(t) {
  skyGradient("#5A697D", "#96A5B4", ART_H);
  noStroke();
  fill("#5F6E69");
  rect(0, ART_H - 18, ART_W, 18);
  stroke("#C8E1FF");
  strokeWeight(1);
  for (const d of rainDrops) {
    const y = 30 + ((d.p + t * 1.6) % 1) * (ART_H - 48);
    line(d.x, y, d.x - 2, y + 7);
  }
  noFill();
  [55, 125, 180].forEach((x0, i) => {
    const k = (t * 1.2 + i / 3) % 1;
    stroke(220 - 120 * k);
    ellipse(x0, ART_H - 9, 6 + 30 * k, 2 + 8 * k);
  });
  cloudShape(65, 22, 24, "#6E7682");
  cloudShape(160, 20, 27, "#78808C");
}

function drawSnowy(t) {
  skyGradient("#283C69", "#6E87AF", ART_H);
  noStroke();
  fill(255);
  for (const f of snowFlakes) {
    const y = ((f.p + t * 0.25) % 1) * (ART_H - 15);
    const x = f.x + 5 * sin(t * TWO_PI * 0.5 + f.ph);
    circle(x, y, f.r * 2);
  }
  fill("#F0F5FC");
  ellipse(50, ART_H + 3, 180, 55);
  fill("#E4ECF8");
  ellipse(175, ART_H + 6, 170, 55);
  // 雪人
  stroke("#C8D2E1");
  strokeWeight(0.6);
  fill(255);
  circle(165, ART_H - 31, 26);
  circle(165, ART_H - 51, 18);
  noStroke();
  fill("#F08228");
  triangle(165, ART_H - 52, 175, ART_H - 50.5, 165, ART_H - 49);
  fill(40);
  circle(162, ART_H - 54, 2);
  circle(168, ART_H - 54, 2);
}

function drawThunder(t) {
  const phase = (t % 3) / 3;   // 每 3 秒閃一輪
  const big = phase < 0.03 || (phase > 0.5 && phase < 0.53);
  const bolt = big || (phase > 0.06 && phase < 0.09) || (phase > 0.56 && phase < 0.58);
  if (big) skyGradient("#EBEBFA", "#C8CDE6", ART_H);
  else skyGradient("#232337", "#46465F", ART_H);
  noStroke();
  fill("#2D323C");
  rect(0, ART_H - 15, ART_W, 15);
  if (bolt) {
    const x = phase < 0.4 ? 100 : 130;
    fill("#FFEB50");
    beginShape();
    vertex(x, 35); vertex(x - 14, 75); vertex(x - 2, 75); vertex(x - 15, 120);
    vertex(x + 19, 64); vertex(x + 5, 64); vertex(x + 17, 35);
    endShape(CLOSE);
  }
  cloudShape(75, 27, 28, "#505064");
  cloudShape(160, 25, 30, "#5A5A70");
}

function drawWindy(t) {
  skyGradient("#96C8EB", "#CDE6F5", ART_H);
  noStroke();
  fill("#6EA555");
  rect(0, ART_H - 20, ART_W, 20);
  // 搖晃的樹
  const sway = sin(t * TWO_PI * 0.9) * 6 + 7;
  const bx = 55, by = ART_H - 20;
  fill("#6E4B2D");
  quad(bx - 4.5, by, bx + 4.5, by, bx + 2 + sway * 0.5, by - 45, bx - 2 + sway * 0.5, by - 45);
  fill("#3C8C46");
  for (const [dx, dy, r] of [[0, -55, 23], [-15, -42, 17], [15, -42, 18], [5, -70, 15]]) {
    circle(bx + dx + sway * (dy < -50 ? 1.2 : 1), by + dy, r * 2);
  }
  // 風線
  noFill();
  stroke(255);
  strokeWeight(2);
  strokeCap(ROUND);
  [[35, 45], [60, 60], [85, 40], [107, 55]].forEach(([y, len], k) => {
    const x = ((t * 0.9 + k * 0.27) % 1) * (ART_W + 80) - 60;
    arc(x + len / 2, y, len, 12, PI * 1.1, PI * 1.9);
  });
  // 飛舞的葉子
  noStroke();
  fill("#DC9628");
  for (const lf of windLeaves) {
    const x = ((lf.p + t * 0.35) % 1) * (ART_W + 20) - 10;
    const y = lf.y + 8 * sin(t * TWO_PI * 1.2 + lf.ph);
    push();
    translate(x, y);
    rotate(t * 5 + lf.ph);
    ellipse(0, 0, 8, 3.5);
    pop();
  }
}
