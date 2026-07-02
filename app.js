/* =====================================================
   排班表系統 — app.js  v6  (build: 2026-07-01)
   6班制：早1/早2/中/晚1/晚2/大夜
   ===================================================== */
const APP_VERSION = 'v7-2026-07-02';

// ─── 班別設定 ──────────────────────────────────────────
const SHIFT_ORDER = ['morning','morning2','afternoon','evening','evening2','night'];
const SHIFTS = {
  morning:   { label: '早班1',  cls: 'morning'   },
  morning2:  { label: '早班2',  cls: 'morning2'  },
  afternoon: { label: '中班',   cls: 'afternoon' },
  evening:   { label: '晚班1',  cls: 'evening'   },
  evening2:  { label: '晚班2',  cls: 'evening2'  },
  night:     { label: '大夜班', cls: 'night'     },
  off:       { label: '休假',   cls: 'off'       },
};

let shiftTimes = {
  morning:   { start: '07:00', end: '15:00' },
  morning2:  { start: '08:00', end: '16:00' },
  afternoon: { start: '10:00', end: '18:00' },
  evening:   { start: '15:00', end: '22:00' },
  evening2:  { start: '16:00', end: '00:00' },
  night:     { start: '22:00', end: '07:00' },
};

const AVATAR_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16'];

let members        = [];
let schedule       = {};
let offDays        = {};
let viewDate       = new Date();
let activeMemberId = null;

// ─── 工具 ──────────────────────────────────────────────
function toDateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function isWeekendDate(dateStr) {
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  return dow === 0 || dow === 6;
}
function shiftHours(key) {
  if (key === 'off' || !shiftTimes[key]) return 0;
  const { start, end } = shiftTimes[key];
  const [sh, sm] = start.split(':').map(Number);
  let   [eh, em] = end.split(':').map(Number);
  let s = sh*60+sm, e = eh*60+em;
  if (e <= s) e += 24*60;
  return Math.round((e - s) / 6) / 10;
}
function shiftShortLabel(key) {
  if (key === 'off') return '休假';
  const t = shiftTimes[key];
  if (!t) return SHIFTS[key]?.label || key;
  const fmt = s => { const [h,m] = s.split(':'); return m==='00' ? h.padStart(2,'0') : `${h.padStart(2,'0')}:${m}`; };
  return `${fmt(t.start)}-${fmt(t.end)}`;
}
function canWorkShift(member, shiftKey) {
  if (shiftKey === 'off') return true;
  if (!member.fixedShifts || member.fixedShifts.length === 0) return true;
  return member.fixedShifts.includes(shiftKey);
}
function sortMembersByFixedShift(list) {
  return [...list].sort((a, b) => {
    const ai = a.fixedShifts.length ? Math.min(...a.fixedShifts.map(k => SHIFT_ORDER.indexOf(k))) : 99;
    const bi = b.fixedShifts.length ? Math.min(...b.fixedShifts.map(k => SHIFT_ORDER.indexOf(k))) : 99;
    return ai - bi;
  });
}
function sortMembersByShift(list, dayData) {
  const order = [...SHIFT_ORDER, 'off'];
  return [...list].sort((a, b) => {
    const ai = order.indexOf(dayData[a.id] || '__none');
    const bi = order.indexOf(dayData[b.id] || '__none');
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

// ─── 需求人數 ────────────────────────────────────────
function getDemand(isWeekend) {
  const sfx = isWeekend ? 'we' : 'wd';
  const val = id => { const el = document.getElementById(id); return el ? (parseInt(el.value) || 0) : 0; };
  return {
    morning:   val(`d-morning-${sfx}`),
    morning2:  val(`d-morning2-${sfx}`),
    afternoon: val(`d-afternoon-${sfx}`),
    evening:   val(`d-evening-${sfx}`),
    evening2:  val(`d-evening2-${sfx}`),
    night:     val(`d-night-${sfx}`),
  };
}

// ─── 初始化 ─────────────────────────────────────────
function init() {
  _addMember('王小明', ['morning']);
  _addMember('李美花', ['morning','evening']);
  _addMember('張大偉', ['night']);
  _addMember('陳惠珍', ['evening']);
  viewDate = new Date();
  renderAll();
}

// ─── 班別時間變更 ────────────────────────────────────
function onShiftTimeChange() {
  SHIFT_ORDER.forEach(key => {
    const s = document.getElementById(`t-${key}-start`);
    const e = document.getElementById(`t-${key}-end`);
    if (s && e) shiftTimes[key] = { start: s.value, end: e.value };
  });
  renderAll();
}

// ─── 人員管理 ────────────────────────────────────────
function _addMember(name, fixedShifts) {
  const id    = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const color = AVATAR_COLORS[members.length % AVATAR_COLORS.length];
  members.push({ id, name, color, fixedShifts: fixedShifts || [] });
  offDays[id] = new Set();
}
function addMember() {
  const input = document.getElementById('newName');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }
  if (members.find(m => m.name === name)) { alert('已有同名人員'); return; }
  const checked = Array.from(document.querySelectorAll('.new-member-shift:checked'));
  if (checked.length > 2) { alert('固定班別最多只能選 2 個'); return; }
  const fixedShifts = checked.map(c => c.value);
  _addMember(name, fixedShifts);
  input.value = '';
  document.querySelectorAll('.new-member-shift').forEach(c => { c.checked = false; });
  renderAll();
}
function deleteMember(id) {
  if (!confirm('確定刪除此人員？相關班次也會一起清除。')) return;
  members = members.filter(m => m.id !== id);
  delete offDays[id];
  Object.keys(schedule).forEach(date => {
    delete schedule[date][id];
    if (!Object.keys(schedule[date]).length) delete schedule[date];
  });
  if (activeMemberId === id) activeMemberId = null;
  renderAll();
}
function editMemberShifts(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;
  document.getElementById('editMemberName').textContent = m.name;
  document.getElementById('editMemberId').value = id;
  document.getElementById('editShiftChecks').innerHTML = SHIFT_ORDER.map(k =>
    `<label><input type="checkbox" value="${k}" ${m.fixedShifts.includes(k)?'checked':''}
      onchange="limitEditShiftChecks(this)"> ${SHIFTS[k].label}（${shiftShortLabel(k)}）</label>`
  ).join('');
  // 初始化 disabled 狀態
  const allCbs = Array.from(document.querySelectorAll('#editShiftChecks input[type=checkbox]'));
  if (m.fixedShifts.length >= 2) {
    allCbs.forEach(c => { if (!c.checked) c.disabled = true; });
  }
  const hint = document.getElementById('editShiftChecks').parentElement.querySelector('.edit-max-hint');
  document.getElementById('editMemberModal').classList.remove('hidden');
}
function saveEditMember() {
  const id      = document.getElementById('editMemberId').value;
  const m       = members.find(m => m.id === id);
  if (!m) return;
  const selected = Array.from(document.querySelectorAll('#editShiftChecks input:checked')).map(c => c.value);
  if (selected.length > 2) { alert('固定班別最多只能選 2 個'); return; }
  m.fixedShifts = selected;
  Object.keys(schedule).forEach(date => {
    const sk = schedule[date][id];
    if (sk && sk !== 'off' && m.fixedShifts.length && !m.fixedShifts.includes(sk)) delete schedule[date][id];
  });
  document.getElementById('editMemberModal').classList.add('hidden');
  renderAll();
}
// 限制固定班別最多勾 2 個，超過時自動 disable 其餘未勾選項目
function limitShiftChecks(changed, groupClass) {
  const all     = Array.from(document.querySelectorAll('.' + groupClass));
  const checked = all.filter(c => c.checked);
  all.forEach(c => {
    if (!c.checked) c.disabled = checked.length >= 2;
  });
}
// 同名版給 edit modal（不同 class 名稱）
function limitEditShiftChecks(changed) {
  const all     = Array.from(document.querySelectorAll('#editShiftChecks input[type=checkbox]'));
  const checked = all.filter(c => c.checked);
  all.forEach(c => {
    if (!c.checked) c.disabled = checked.length >= 2;
  });
}
function selectMember(id) {
  activeMemberId = activeMemberId === id ? null : id;
  renderSidebar();
  renderCalendar();
}

// ─── 休假管理 ────────────────────────────────────────
function toggleOffDay(dateStr) {
  if (!activeMemberId) return;
  const set = offDays[activeMemberId];
  if (set.has(dateStr)) {
    set.delete(dateStr);
    if (schedule[dateStr]) delete schedule[dateStr][activeMemberId];
  } else {
    set.add(dateStr);
    if (!schedule[dateStr]) schedule[dateStr] = {};
    schedule[dateStr][activeMemberId] = 'off';
  }
  renderCalendar();
  renderOverview();
}

// ─── 自動排班 ────────────────────────────────────────
function generateSchedule() {
  if (!members.length) { alert('請先新增人員'); return; }
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days  = new Date(year, month+1, 0).getDate();

  runScheduler({
    members, schedule, offDays,
    demandFn:       dateStr => getDemand(isWeekendDate(dateStr)),
    canWorkShiftFn: canWorkShift,
    shiftOrder:     SHIFT_ORDER,
    year, month, days,
    dateStrFn:      toDateStr,
  });

  renderAll();

  const w = checkDemand();
  if (w.length) {
    alert('✅ 班表已產生，但以下日期人力不足：\n\n' +
      w.slice(0,15).join('\n') + (w.length>15 ? `\n...等共 ${w.length} 筆` : ''));
  } else {
    alert('✅ 班表已自動產生，所有班次均已滿足需求人數！');
  }
}

function checkDemand() {
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days  = new Date(year, month+1, 0).getDate();
  const warnings = [];
  for (let d = 1; d <= days; d++) {
    const dateStr = toDateStr(year, month, d);
    const dayData = schedule[dateStr] || {};
    const demand  = getDemand(isWeekendDate(dateStr));
    const msgs = [];
    for (const shift of SHIFT_ORDER) {
      const need = demand[shift];
      if (!need) continue;
      const have = Object.values(dayData).filter(s => s === shift).length;
      if (have < need) msgs.push(`${SHIFTS[shift].label}少${need-have}人`);
    }
    if (msgs.length) warnings.push(`${month+1}/${d}：${msgs.join('、')}`);
  }
  return warnings;
}

// ─── 月份導覽 ────────────────────────────────────────
function changeMonth(dir) {
  viewDate.setDate(1);
  viewDate.setMonth(viewDate.getMonth() + dir);
  renderAll();
}
function goToday() { viewDate = new Date(); renderAll(); }

// ─── Modal ───────────────────────────────────────────
function onCellClick(dateStr) {
  if (activeMemberId) { toggleOffDay(dateStr); return; }
  openModal(dateStr);
}
function openModal(dateStr, memberId) {
  const [y, m, d] = dateStr.split('-').map(Number);
  document.getElementById('modalTitle').textContent = `${y}年${m}月${d}日`;
  const body = document.getElementById('modalBody');

  if (memberId) {
    const member  = members.find(x => x.id === memberId);
    const current = (schedule[dateStr] || {})[memberId] || '';
    const note    = member.fixedShifts.length
      ? `（固定：${member.fixedShifts.map(k=>SHIFTS[k].label).join('、')}）`
      : '（任何班別皆可排）';
    body.innerHTML = `
      <p style="margin-bottom:10px;color:#6b7280;font-size:13px">
        調整 <strong>${member.name}</strong> 的班別 ${note}：
      </p>
      <div class="shift-selector">
        ${[...SHIFT_ORDER, 'off'].map(key => {
          const s   = SHIFTS[key];
          const dis = !canWorkShift(member, key) ? 'disabled' : '';
          const lbl = key==='off' ? '休假' : `${s.label}<br><span style="font-weight:400;font-size:10px">${shiftShortLabel(key)}</span>`;
          const clickFn = dis ? '' : `setShift('${dateStr}','${memberId}','${key}')`;
          return `<button class="shift-sel-btn ${s.cls} ${current===key?'selected':''} ${dis}"
            onclick="${clickFn}">${lbl}</button>`;
        }).join('')}
        <button class="shift-sel-btn clear" onclick="setShift('${dateStr}','${memberId}','')">清除</button>
      </div>`;
  } else {
    if (!members.length) return;
    const dayData = schedule[dateStr] || {};
    const sorted  = sortMembersByShift(members, dayData);
    body.innerHTML = `
      <p style="margin-bottom:10px;color:#6b7280;font-size:13px">點選姓名調整班別：</p>
      ${sorted.map(mm => {
        const sk  = dayData[mm.id] || '';
        const si  = SHIFTS[sk];
        const lbl = si ? (sk==='off' ? '休假' : shiftShortLabel(sk)) : '未排班';
        return `<div class="modal-body-row">
          <span style="display:flex;align-items:center;gap:8px">
            <span class="avatar" style="background:${mm.color}22;color:${mm.color};width:24px;height:24px;font-size:11px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700">${mm.name[0]}</span>
            ${mm.name}
          </span>
          <button class="pill ${si?si.cls:'empty'}" style="cursor:pointer;padding:3px 10px;border:none"
            onclick="openModal('${dateStr}','${mm.id}')">${lbl}</button>
        </div>`;
      }).join('')}`;
  }
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function setShift(dateStr, memberId, shiftKey) {
  const member = members.find(m => m.id === memberId);
  if (shiftKey && shiftKey !== 'off' && member && !canWorkShift(member, shiftKey)) {
    alert(`${member.name} 的固定班別不包含「${SHIFTS[shiftKey].label}」，無法指派。`);
    return;
  }
  if (!schedule[dateStr]) schedule[dateStr] = {};
  if (shiftKey === '') {
    delete schedule[dateStr][memberId];
    offDays[memberId]?.delete(dateStr);
  } else {
    schedule[dateStr][memberId] = shiftKey;
    if (shiftKey === 'off') offDays[memberId]?.add(dateStr);
    else                    offDays[memberId]?.delete(dateStr);
  }
  if (!Object.keys(schedule[dateStr]).length) delete schedule[dateStr];
  renderCalendar();
  renderOverview();
  openModal(dateStr);
}
function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.add('hidden');
}

// ─── 列印（取代 CSV 匯出）───────────────────────────
function printSchedule() {
  window.print();
}

// ─── 渲染：圖例 ─────────────────────────────────────
function renderLegend() {
  document.getElementById('legend').innerHTML =
    SHIFT_ORDER.map(k =>
      `<span class="chip ${SHIFTS[k].cls}">${SHIFTS[k].label} ${shiftTimes[k].start}–${shiftTimes[k].end}</span>`
    ).join('') + `<span class="chip off">休假</span>`;
}

// ─── 渲染：側邊欄 ────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('memberList');
  list.innerHTML = '';
  members.forEach(m => {
    const fixedLabels = m.fixedShifts.length
      ? m.fixedShifts.map(k => SHIFTS[k]?.label || k).join('、')
      : '任何班別';
    const li = document.createElement('li');
    li.className = 'member-item' + (activeMemberId === m.id ? ' active' : '');
    li.innerHTML = `
      <div class="avatar" style="background:${m.color}22;color:${m.color}">${m.name[0]}</div>
      <div style="flex:1;min-width:0">
        <div class="member-name">${m.name}</div>
        <div class="member-pref">${fixedLabels}</div>
      </div>
      <button class="edit-btn" onclick="event.stopPropagation();editMemberShifts('${m.id}')" title="設定固定班別">✏️</button>
      <button class="del-btn"  onclick="event.stopPropagation();deleteMember('${m.id}')"     title="刪除">✕</button>`;
    li.addEventListener('click', () => selectMember(m.id));
    list.appendChild(li);
  });

  const badge = document.getElementById('selectedMemberBadge');
  if (activeMemberId) {
    const m = members.find(m => m.id === activeMemberId);
    badge.textContent = `✏️ 選取中：${m?m.name:''} — 點日曆設定休假日`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ─── 渲染：日曆 ──────────────────────────────────────
function renderCalendar() {
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  document.getElementById('monthLabel').textContent = `${year} 年 ${month+1} 月`;

  const cal      = document.getElementById('calendar');
  const today    = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  // innerHTML 重置整個 grid —— 用字串拼接一次寫入，不分批 appendChild，避免 layout 抖動
  let html = '';

  // 週標頭
  ['日','一','二','三','四','五','六'].forEach((d, i) => {
    html += `<div class="cal-day-header">${d}</div>`;
  });

  const firstDay  = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month+1, 0).getDate();

  // 前置空格
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell other-month"></div>`;

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = toDateStr(year, month, d);
    const dow     = new Date(year, month, d).getDay();
    const demand  = getDemand(dow === 0 || dow === 6);
    const dayData = schedule[dateStr] || {};
    const isToday = dateStr === todayStr;
    const numCls  = dow===0 ? ' sun' : dow===6 ? ' sat' : '';

    // 收集各班人員
    const byShift = {};
    [...SHIFT_ORDER, 'off'].forEach(s => { byShift[s] = []; });
    Object.entries(dayData).forEach(([mid, sk]) => {
      const mem = members.find(m => m.id === mid);
      if (mem && byShift[sk]) byShift[sk].push(mem.name);
    });

    // 需求指示燈
    let dotsHtml = '';
    if (Object.values(demand).some(v => v > 0)) {
      const dotItems = SHIFT_ORDER.map(key => {
        const need = demand[key];
        if (!need) return '';
        const have = (byShift[key]||[]).length;
        const cls  = have >= need ? 'ok' : have > 0 ? 'warn' : 'bad';
        return `<div class="demand-dot ${cls}" title="${SHIFTS[key].label}：需${need}人，已排${have}人"></div>`;
      }).join('');
      dotsHtml = `<div class="demand-row">${dotItems}</div>`;
    }

    const pillsHtml = [...SHIFT_ORDER, 'off'].map(sk => {
      const names = byShift[sk];
      if (!names || !names.length) return '';
      return `<div class="pill ${SHIFTS[sk].cls}">${shiftShortLabel(sk)}：${names.join('、')}</div>`;
    }).join('');

    html += `<div class="cal-cell${isToday?' today':''}" data-date="${dateStr}">
      <div class="day-num${numCls}">${d}</div>
      <div class="shift-pills">${pillsHtml}</div>
      ${dotsHtml}
    </div>`;
  }

  // 尾部空格
  const lastDow = new Date(year, month, totalDays).getDay();
  for (let i = lastDow+1; i < 7; i++) html += `<div class="cal-cell other-month"></div>`;

  cal.innerHTML = html;

  // 事件委派（一個 listener 搞定整個 calendar）
  cal.onclick = (e) => {
    const cell = e.target.closest('[data-date]');
    if (cell) onCellClick(cell.dataset.date);
  };
}

// ─── 渲染：總覽 ──────────────────────────────────────
function renderOverview() {
  const wrap       = document.getElementById('overviewTable');
  const shortageBox = document.getElementById('shortageBox');

  if (!members.length) {
    wrap.innerHTML = '<p style="padding:16px;color:#9ca3af">請先新增人員。</p>';
    shortageBox.innerHTML = '';
    return;
  }

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days  = new Date(year, month+1, 0).getDate();
  const sorted = sortMembersByFixedShift(members);
  const memberHours = {};
  sorted.forEach(m => { memberHours[m.id] = 0; });

  // 先跑一遍算出哪些日期人力不足
  const shortageSet = new Set();
  const shortageMap = {};
  for (let d = 1; d <= days; d++) {
    const dateStr = toDateStr(year, month, d);
    const dayData = schedule[dateStr] || {};
    const demand  = getDemand(isWeekendDate(dateStr));
    const msgs = [];
    SHIFT_ORDER.forEach(sk => {
      const need = demand[sk];
      if (!need) return;
      const have = Object.values(dayData).filter(s => s === sk).length;
      if (have < need) msgs.push(`${SHIFTS[sk].label}少${need-have}人`);
    });
    if (msgs.length) { shortageSet.add(dateStr); shortageMap[dateStr] = msgs; }
  }

  // 表格
  let html = '<table class="overview-table"><thead><tr><th class="th-corner">日期</th>';
  sorted.forEach(m => {
    html += `<th><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${m.color};margin-right:3px;vertical-align:middle"></span>${m.name}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (let d = 1; d <= days; d++) {
    const dateStr  = toDateStr(year, month, d);
    const dow      = new Date(year, month, d).getDay();
    const dayData  = schedule[dateStr] || {};
    const isWE     = dow===0 || dow===6;
    const isShort  = shortageSet.has(dateStr);
    const dowLabel = ['日','一','二','三','四','五','六'][dow];
    const rowCls   = isWE ? 'weekend-row' : '';

    html += `<tr${rowCls ? ` class="${rowCls}"` : ''}>`;
    html += `<td class="date-cell${isShort ? ' shortage-date' : ''}">${month+1}/${d}（${dowLabel}）</td>`;

    sorted.forEach(m => {
      const sk = dayData[m.id] || '';
      const s  = SHIFTS[sk];
      if (s) {
        if (sk !== 'off') memberHours[m.id] += shiftHours(sk);
        const lbl = sk === 'off' ? '休假' : shiftShortLabel(sk);
        html += `<td class="${s.cls} editable-cell" onclick="openModal('${dateStr}','${m.id}')" title="點擊調整">${lbl}</td>`;
      } else {
        html += `<td class="empty editable-cell" onclick="openModal('${dateStr}','${m.id}')" title="點擊設定">–</td>`;
      }
    });
    html += '</tr>';
  }

  // 總工時列
  html += '<tr class="total-row"><td class="date-cell">總工時 (h)</td>';
  sorted.forEach(m => { html += `<td>${memberHours[m.id]}</td>`; });
  html += '</tr></tbody></table>';
  wrap.innerHTML = html;

  // 人力不足提示區
  const shortageDates = Object.keys(shortageMap).sort();
  if (!shortageDates.length) {
    shortageBox.className = 'shortage-box empty';
    shortageBox.innerHTML = '✅ 本月所有班次人力皆已達需求人數。';
  } else {
    shortageBox.className = 'shortage-box';
    shortageBox.innerHTML = `<div class="shortage-title">⚠️ 人力不足提示</div>` +
      shortageDates.map(ds => {
        const d = parseInt(ds.split('-')[2], 10);
        return `<div class="shortage-line">${month+1}/${d}：${shortageMap[ds].join('、')}</div>`;
      }).join('');
  }
}

// ─── 全域渲染 ────────────────────────────────────────
function renderAll() {
  try {
    renderLegend();
    renderSidebar();
    renderCalendar();
    renderOverview();
    renderVersionBadge();
  } catch (err) {
    showFatalError(err);
  }
}
function renderVersionBadge() {
  let b = document.getElementById('versionBadge');
  if (!b) {
    b = document.createElement('div');
    b.id = 'versionBadge';
    b.style.cssText = 'position:fixed;bottom:5px;right:7px;font-size:9px;color:#9ca3af;font-family:monospace;z-index:50;background:rgba(255,255,255,.8);padding:1px 5px;border-radius:4px';
    document.body.appendChild(b);
  }
  b.textContent = APP_VERSION;
}
function showFatalError(err) {
  console.error(err);
  let box = document.getElementById('fatalErrorBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'fatalErrorBox';
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fee2e2;color:#991b1b;padding:14px 20px;font-size:12px;font-family:monospace;z-index:9999;white-space:pre-wrap;border-bottom:2px solid #ef4444;max-height:40vh;overflow:auto';
    document.body.prepend(box);
  }
  box.textContent = '⚠️ 程式發生錯誤，請截圖回報：\n' + (err?.stack || String(err));
}

// ─── 啟動 ────────────────────────────────────────────
try { init(); } catch (err) { showFatalError(err); }
