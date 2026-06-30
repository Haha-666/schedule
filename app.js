/* =====================================================
   排班表系統 — app.js  v3
   ===================================================== */

// ─── 班別基本設定（時間可由使用者調整）────────────────
const SHIFT_ORDER = ['morning','afternoon','evening','night']; // 排序：早>中>晚>大夜
const SHIFTS = {
  morning:   { label: '早班',   cls: 'morning'   },
  afternoon: { label: '中班',   cls: 'afternoon' },
  evening:   { label: '晚班',   cls: 'evening'   },
  night:     { label: '大夜班', cls: 'night'     },
  off:       { label: '休假',   cls: 'off'       },
};

// 使用者可調整的班別時間（預設值）
let shiftTimes = {
  morning:   { start: '07:00', end: '15:00' },
  afternoon: { start: '15:00', end: '22:00' },
  evening:   { start: '15:00', end: '22:00' },
  night:     { start: '22:00', end: '07:00' },
};

const AVATAR_COLORS = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b',
  '#ef4444','#ec4899','#06b6d4','#84cc16',
];

let storeName       = '';
let members          = [];  // [{ id, name, color, fixedShifts:[] }]  fixedShifts=[] 代表任何班別皆可排
let schedule          = {}; // { 'YYYY-MM-DD': { memberId: shiftKey } }
let offDays           = {}; // { memberId: Set<'YYYY-MM-DD'> }
let viewDate           = new Date();
let activeMemberId    = null;

// ─── 工具：時間字串轉小時數（含跨夜）────────────────
function shiftHours(key) {
  if (key === 'off' || !shiftTimes[key]) return 0;
  const { start, end } = shiftTimes[key];
  const [sh, sm] = start.split(':').map(Number);
  let   [eh, em] = end.split(':').map(Number);
  let startMin = sh*60+sm, endMin = eh*60+em;
  if (endMin <= startMin) endMin += 24*60; // 跨夜
  return Math.round(((endMin - startMin) / 60) * 10) / 10;
}

function shiftShortLabel(key) {
  if (key === 'off') return '休假';
  const t = shiftTimes[key];
  if (!t) return SHIFTS[key]?.label || key;
  // "7-15" style — strip leading zero & minutes if :00
  const fmt = (s) => {
    let [h, m] = s.split(':');
    h = String(parseInt(h, 10));
    return m === '00' ? h : `${h}:${m}`;
  };
  return `${fmt(t.start)}-${fmt(t.end)}`;
}

// ─── 初始化 ──────────────────────────────────────────
function init() {
  _addMember('王小明', ['morning']);
  _addMember('李美花', ['morning','evening']);
  _addMember('張大偉', ['night']);
  _addMember('陳惠珍', ['afternoon']);
  viewDate = new Date();
  renderAll();
}

// ─── 店名 ────────────────────────────────────────────
function renderStoreName() {
  storeName = document.getElementById('storeName').value.trim();
  document.getElementById('storeNameDisplay').textContent = storeName ? `🏪 ${storeName}` : '';
}

// ─── 班別時間設定變更 ─────────────────────────────────
function onShiftTimeChange() {
  SHIFT_ORDER.forEach(key => {
    shiftTimes[key] = {
      start: document.getElementById(`t-${key}-start`).value,
      end:   document.getElementById(`t-${key}-end`).value,
    };
  });
  renderAll();
}

// ─── 人員管理 ─────────────────────────────────────────
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
  const checks = document.querySelectorAll('.new-member-shift:checked');
  const fixedShifts = Array.from(checks).map(c => c.value);
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
    if (Object.keys(schedule[date]).length === 0) delete schedule[date];
  });
  if (activeMemberId === id) activeMemberId = null;
  renderAll();
}

function editMemberShifts(id) {
  const m = members.find(m => m.id === id);
  if (!m) return;
  const opts = SHIFT_ORDER.map(k => `
    <label>
      <input type="checkbox" value="${k}" ${m.fixedShifts.includes(k) ? 'checked' : ''}>
      ${SHIFTS[k].label}（${shiftShortLabel(k)}）
    </label>`).join('');
  document.getElementById('editMemberName').textContent = m.name;
  document.getElementById('editShiftChecks').innerHTML = opts;
  document.getElementById('editMemberId').value = id;
  document.getElementById('editMemberModal').classList.remove('hidden');
}

function saveEditMember() {
  const id = document.getElementById('editMemberId').value;
  const m  = members.find(m => m.id === id);
  if (!m) return;
  const checks = document.querySelectorAll('#editShiftChecks input:checked');
  m.fixedShifts = Array.from(checks).map(c => c.value);

  // 若已排班但不符合新的固定班別，移除該班次
  Object.keys(schedule).forEach(date => {
    const sk = schedule[date][id];
    if (sk && sk !== 'off' && m.fixedShifts.length > 0 && !m.fixedShifts.includes(sk)) {
      delete schedule[date][id];
    }
  });

  document.getElementById('editMemberModal').classList.add('hidden');
  renderAll();
}

function selectMember(id) {
  activeMemberId = activeMemberId === id ? null : id;
  renderSidebar();
  renderCalendar();
}

// 是否允許某人上某班別
function canWorkShift(member, shiftKey) {
  if (shiftKey === 'off') return true;
  if (!member.fixedShifts || member.fixedShifts.length === 0) return true;
  return member.fixedShifts.includes(shiftKey);
}

// ─── 休假管理 ─────────────────────────────────────────
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

// ─── 自動排班（含固定班別限制 + 連續上班最多5天）──────
function generateSchedule() {
  if (members.length === 0) { alert('請先新增人員'); return; }

  const year   = viewDate.getFullYear();
  const month  = viewDate.getMonth();
  const days   = new Date(year, month + 1, 0).getDate();
  const demand = getDemand();

  // 清除本月非休假排班
  for (let d = 1; d <= days; d++) {
    const dateStr = toDateStr(year, month, d);
    if (!schedule[dateStr]) schedule[dateStr] = {};
    Object.keys(schedule[dateStr]).forEach(mid => {
      if (schedule[dateStr][mid] !== 'off') delete schedule[dateStr][mid];
    });
  }

  const workCount   = {};   // 累計工作天數（平衡用）
  const consecutive = {};   // 連續上班天數
  members.forEach(m => { workCount[m.id] = 0; consecutive[m.id] = 0; });

  for (let d = 1; d <= days; d++) {
    const dateStr = toDateStr(year, month, d);
    if (!schedule[dateStr]) schedule[dateStr] = {};

    for (const shift of SHIFT_ORDER) {
      const need = demand[shift];
      if (need === 0) continue;

      const avail = members.filter(m =>
        !offDays[m.id].has(dateStr) &&
        schedule[dateStr][m.id] !== 'off' &&
        !schedule[dateStr][m.id] &&               // 當天尚未被排班
        canWorkShift(m, shift) &&                  // 符合固定班別限制
        consecutive[m.id] < 5                       // 未達連續5天上限
      );

      // 工作天數少者優先（平衡），相同則連續天數少者優先
      avail.sort((a, b) => (workCount[a.id]-workCount[b.id]) || (consecutive[a.id]-consecutive[b.id]));

      let assigned = 0;
      for (const member of avail) {
        if (assigned >= need) break;
        schedule[dateStr][member.id] = shift;
        workCount[member.id]++;
        assigned++;
      }
    }

    // 更新每人連續上班天數 / 自動排休
    members.forEach(m => {
      const sk = schedule[dateStr][m.id];
      if (sk && sk !== 'off') {
        consecutive[m.id]++;
      } else {
        if (!sk) {
          // 沒被排到班 → 視為休假（若已連續5天則強制休假提示無影響，因為本來就沒排班）
          schedule[dateStr][m.id] = 'off';
        }
        consecutive[m.id] = 0;
      }
    });
  }

  renderAll();

  const warnings = checkDemand();
  if (warnings.length > 0) {
    alert('✅ 班表已產生，但以下日期人力不足：\n\n' + warnings.slice(0,15).join('\n') + (warnings.length>15 ? `\n...等共 ${warnings.length} 筆` : ''));
  } else {
    alert('✅ 班表已自動產生，所有班次均已滿足需求人數！\n（已套用「固定班別」與「連續上班最多5天」規則）');
  }
}

function getDemand() {
  return {
    morning:   parseInt(document.getElementById('d-morning').value)   || 0,
    afternoon: parseInt(document.getElementById('d-afternoon').value) || 0,
    evening:   parseInt(document.getElementById('d-evening').value)   || 0,
    night:     parseInt(document.getElementById('d-night').value)     || 0,
  };
}

function checkDemand() {
  const year   = viewDate.getFullYear();
  const month  = viewDate.getMonth();
  const days   = new Date(year, month + 1, 0).getDate();
  const demand = getDemand();
  const warnings = [];

  for (let d = 1; d <= days; d++) {
    const dateStr = toDateStr(year, month, d);
    const dayData = schedule[dateStr] || {};
    const msgs = [];
    for (const shift of SHIFT_ORDER) {
      const need = demand[shift];
      if (need === 0) continue;
      const have = Object.values(dayData).filter(s => s === shift).length;
      if (have < need) msgs.push(`${SHIFTS[shift].label}少${need - have}人`);
    }
    if (msgs.length > 0) warnings.push(`${month+1}/${d}：${msgs.join('、')}`);
  }
  return warnings;
}

// ─── 月份導覽 ─────────────────────────────────────────
function changeMonth(dir) {
  viewDate.setDate(1);
  viewDate.setMonth(viewDate.getMonth() + dir);
  renderAll();
}
function goToday() { viewDate = new Date(); renderAll(); }

// ─── 日曆點擊 ─────────────────────────────────────────
function onCellClick(dateStr) {
  if (activeMemberId) { toggleOffDay(dateStr); return; }
  openModal(dateStr);
}

// ─── Modal：班次調整（尊重固定班別限制）───────────────
function openModal(dateStr, memberId) {
  const [y, m, d] = dateStr.split('-').map(Number);
  document.getElementById('modalTitle').textContent = `${y}年${m}月${d}日`;
  const body = document.getElementById('modalBody');

  if (memberId) {
    const member  = members.find(x => x.id === memberId);
    const current = (schedule[dateStr] || {})[memberId] || '';
    const allowedNote = member.fixedShifts.length
      ? `（固定班別：${member.fixedShifts.map(k=>SHIFTS[k].label).join('、')}）`
      : '（任何班別皆可排）';

    body.innerHTML = `
      <p style="margin-bottom:10px;color:#6b7280;font-size:13px">調整 <strong>${member.name}</strong> 的班別 ${allowedNote}：</p>
      <div class="shift-selector">
        ${[...SHIFT_ORDER, 'off'].map((key) => {
          const s = SHIFTS[key];
          const disabled = !canWorkShift(member, key) ? 'disabled' : '';
          const label = key === 'off' ? '休假' : `${s.label}<br><span style="font-weight:400;font-size:10px">${shiftShortLabel(key)}</span>`;
          return `<button class="shift-sel-btn ${s.cls} ${current===key?'selected':''} ${disabled}"
                  onclick="${disabled ? '' : `setShift('${dateStr}','${memberId}','${key}')`}">
            ${label}
          </button>`;
        }).join('')}
        <button class="shift-sel-btn clear" onclick="setShift('${dateStr}','${memberId}','')">清除</button>
      </div>`;
  } else {
    if (members.length === 0) return;
    const dayData = schedule[dateStr] || {};
    const sorted = sortMembersByShift(members, dayData);

    body.innerHTML = `
      <p style="margin-bottom:10px;color:#6b7280;font-size:13px">點選姓名調整班別：</p>
      ${sorted.map(mm => {
        const shiftKey  = dayData[mm.id] || '';
        const shiftInfo = SHIFTS[shiftKey];
        const label = shiftInfo ? (shiftKey === 'off' ? '休假' : shiftShortLabel(shiftKey)) : '未排班';
        return `<div class="modal-body-row">
          <span style="display:flex;align-items:center;gap:8px">
            <span class="avatar" style="background:${mm.color}22;color:${mm.color};width:24px;height:24px;font-size:11px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700">${mm.name[0]}</span>
            ${mm.name}
          </span>
          <button class="pill ${shiftInfo ? shiftInfo.cls : 'empty'}"
                  style="cursor:pointer;padding:3px 10px;border:none"
                  onclick="openModal('${dateStr}','${mm.id}')">
            ${label}
          </button>
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
  if (Object.keys(schedule[dateStr]).length === 0) delete schedule[dateStr];
  renderCalendar();
  renderOverview();
  openModal(dateStr);
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.add('hidden');
}

// ─── 排序：早 > 中 > 晚 > 大夜 > 休假 > 未排 ───────────
function sortMembersByShift(memberList, dayData) {
  const order = [...SHIFT_ORDER, 'off'];
  return [...memberList].sort((a, b) => {
    const ai = order.indexOf(dayData[a.id] || '__none');
    const bi = order.indexOf(dayData[b.id] || '__none');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

// 依「固定班別」排序整體人員順序：早>中>晚>大夜>無固定班別
function sortMembersByFixedShift(memberList) {
  const order = [...SHIFT_ORDER];
  return [...memberList].sort((a, b) => {
    const ai = a.fixedShifts.length ? Math.min(...a.fixedShifts.map(k => order.indexOf(k))) : 99;
    const bi = b.fixedShifts.length ? Math.min(...b.fixedShifts.map(k => order.indexOf(k))) : 99;
    return ai - bi;
  });
}

// ─── 渲染：圖例（依目前班別時間動態生成）───────────────
function renderLegend() {
  const legend = document.getElementById('legend');
  legend.innerHTML = SHIFT_ORDER.map(k =>
    `<span class="chip ${SHIFTS[k].cls}">${SHIFTS[k].label} ${shiftTimes[k].start}–${shiftTimes[k].end}</span>`
  ).join('') + `<span class="chip off">休假</span>`;
}

// ─── 渲染：側邊欄 ─────────────────────────────────────
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
    badge.textContent = `✏️ 選取中：${m ? m.name : ''} — 點日曆設定休假日`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ─── 渲染：日曆 ──────────────────────────────────────
function renderCalendar() {
  const year   = viewDate.getFullYear();
  const month  = viewDate.getMonth();
  document.getElementById('monthLabel').textContent = `${year} 年 ${month + 1} 月`;

  const cal      = document.getElementById('calendar');
  const today    = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  const demand   = getDemand();

  cal.innerHTML = '';
  ['日','一','二','三','四','五','六'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-day-header';
    h.textContent = d;
    cal.appendChild(h);
  });

  const firstDay  = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell other-month';
    cal.appendChild(cell);
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = toDateStr(year, month, d);
    const dow     = new Date(year, month, d).getDay();
    const cell    = document.createElement('div');
    cell.className = 'cal-cell' + (dateStr === todayStr ? ' today' : '');
    cell.addEventListener('click', () => onCellClick(dateStr));

    const num = document.createElement('div');
    num.className = 'day-num' + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '');
    num.textContent = d;
    cell.appendChild(num);

    const dayData = schedule[dateStr] || {};
    const byShift = {};
    [...SHIFT_ORDER, 'off'].forEach(s => { byShift[s] = []; });
    Object.entries(dayData).forEach(([mid, sk]) => {
      const member = members.find(m => m.id === mid);
      if (!member || !byShift[sk]) return;
      byShift[sk].push(member.name);
    });

    const pills = document.createElement('div');
    pills.className = 'shift-pills';
    [...SHIFT_ORDER, 'off'].forEach(sk => {
      const names = byShift[sk];
      if (!names || names.length === 0) return;
      const p = document.createElement('div');
      p.className = `pill ${SHIFTS[sk].cls}`;
      p.textContent = `${shiftShortLabel(sk)}：${names.join('、')}`;
      pills.appendChild(p);
    });
    cell.appendChild(pills);

    const hasDemand = Object.values(demand).some(v => v > 0);
    if (hasDemand) {
      const dots = document.createElement('div');
      dots.className = 'demand-row';
      SHIFT_ORDER.forEach(key => {
        const need = demand[key];
        if (need === 0) return;
        const have = (byShift[key] || []).length;
        const dot  = document.createElement('div');
        dot.className = 'demand-dot ' + (have >= need ? 'ok' : have > 0 ? 'warn' : 'bad');
        dot.title = `${SHIFTS[key].label}：需 ${need} 人，已排 ${have} 人`;
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
    }

    cal.appendChild(cell);
  }

  const lastDow = new Date(year, month, totalDays).getDay();
  for (let i = lastDow + 1; i < 7; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell other-month';
    cal.appendChild(cell);
  }
}

// ─── 渲染：班表總覽（人名橫排表頭、日期由上到下直排）───
function renderOverview() {
  const wrap = document.getElementById('overviewTable');
  const shortageBox = document.getElementById('shortageBox');

  if (members.length === 0) {
    wrap.innerHTML = '<p style="padding:16px;color:#9ca3af">請先新增人員。</p>';
    shortageBox.innerHTML = '';
    return;
  }

  const year   = viewDate.getFullYear();
  const month  = viewDate.getMonth();
  const days   = new Date(year, month + 1, 0).getDate();
  const demand = getDemand();

  const sortedMembers = sortMembersByFixedShift(members);
  const memberHours = {};
  sortedMembers.forEach(m => { memberHours[m.id] = 0; });

  // ── 表頭：第一欄「日期」，後續每欄一位人員
  let html = '<table class="overview-table"><thead><tr><th class="th-corner">日期</th>';
  sortedMembers.forEach(m => {
    html += `<th>
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.color};margin-right:4px;vertical-align:middle"></span>
      ${m.name}
    </th>`;
  });
  html += '</tr></thead><tbody>';

  const dayShortage = {}; // dateStr -> [msgs]

  for (let d = 1; d <= days; d++) {
    const dateStr = toDateStr(year, month, d);
    const dow     = new Date(year, month, d).getDay();
    const dayData = schedule[dateStr] || {};
    const isWeekend = dow === 0 || dow === 6;

    // 檢查不足
    const msgs = [];
    SHIFT_ORDER.forEach(sk => {
      const need = demand[sk];
      if (need === 0) return;
      const have = Object.values(dayData).filter(s => s === sk).length;
      if (have < need) msgs.push(`${SHIFTS[sk].label}少${need - have}人`);
    });
    if (msgs.length > 0) dayShortage[dateStr] = msgs;

    const dateLabel = `${month+1}/${d}（${['日','一','二','三','四','五','六'][dow]}）`;
    html += `<tr${isWeekend ? ' class="weekend-row"' : ''}><td class="date-cell">${dateLabel}</td>`;

    sortedMembers.forEach(m => {
      const sk = dayData[m.id] || '';
      const s  = SHIFTS[sk];
      if (s) {
        if (sk !== 'off') memberHours[m.id] += shiftHours(sk);
        const label = sk === 'off' ? '休假' : shiftShortLabel(sk);
        html += `<td class="${s.cls} editable-cell" onclick="openModal('${dateStr}','${m.id}')" title="點擊調整班別">${label}</td>`;
      } else {
        html += `<td class="empty editable-cell" onclick="openModal('${dateStr}','${m.id}')" title="點擊設定班別">–</td>`;
      }
    });
    html += '</tr>';
  }

  // 總工時列
  html += '<tr class="total-row"><td class="date-cell">總工時 (h)</td>';
  sortedMembers.forEach(m => {
    html += `<td>${memberHours[m.id]}</td>`;
  });
  html += '</tr></tbody></table>';
  wrap.innerHTML = html;

  // ── 表格最下方人力不足標記
  const shortageDates = Object.keys(dayShortage).sort();
  if (shortageDates.length === 0) {
    shortageBox.className = 'shortage-box empty';
    shortageBox.innerHTML = '✅ 本月所有班次人力皆已達需求人數。';
  } else {
    shortageBox.className = 'shortage-box';
    const lines = shortageDates.map(ds => {
      const d = parseInt(ds.split('-')[2], 10);
      return `<div class="shortage-line">${month+1}/${d}：${dayShortage[ds].join('、')}</div>`;
    }).join('');
    shortageBox.innerHTML = `<div class="shortage-title">⚠️ 人力不足提示</div>${lines}`;
  }
}

// ─── 匯出 CSV（人名為欄、日期為列，與總覽一致）─────────
function exportCSV() {
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days  = new Date(year, month + 1, 0).getDate();
  const demand = getDemand();

  const sortedMembers = sortMembersByFixedShift(members);

  const header = ['日期', ...sortedMembers.map(m => m.name)].join(',');
  const rows = [];
  const memberHours = {};
  sortedMembers.forEach(m => { memberHours[m.id] = 0; });

  const shortageLines = [];

  for (let d = 1; d <= days; d++) {
    const dateStr = toDateStr(year, month, d);
    const dayData = schedule[dateStr] || {};
    const dow = ['日','一','二','三','四','五','六'][new Date(year, month, d).getDay()];
    const cols = sortedMembers.map(m => {
      const sk = dayData[m.id] || '';
      if (sk && sk !== 'off') memberHours[m.id] += shiftHours(sk);
      return sk ? (sk === 'off' ? '休假' : shiftShortLabel(sk)) : '';
    });
    rows.push([`${month+1}/${d}(${dow})`, ...cols].join(','));

    const msgs = [];
    SHIFT_ORDER.forEach(sk => {
      const need = demand[sk];
      if (need === 0) return;
      const have = Object.values(dayData).filter(s => s === sk).length;
      if (have < need) msgs.push(`${SHIFTS[sk].label}少${need - have}人`);
    });
    if (msgs.length > 0) shortageLines.push(`${month+1}/${d}：${msgs.join('、')}`);
  }

  const hoursRow = ['總工時(h)', ...sortedMembers.map(m => memberHours[m.id])].join(',');

  let csv = [header, ...rows, hoursRow].join('\n');
  if (shortageLines.length > 0) {
    csv += '\n\n人力不足提示\n' + shortageLines.join('\n');
  }

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${storeName ? storeName + '_' : ''}排班表_${year}_${String(month+1).padStart(2,'0')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── 工具 ─────────────────────────────────────────────
function toDateStr(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function renderAll() {
  renderLegend();
  renderSidebar();
  renderCalendar();
  renderOverview();
}

// ─── 啟動 ─────────────────────────────────────────────
init();
