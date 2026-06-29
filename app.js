/* =====================================================
   排班表系統 — app.js
   ===================================================== */

// ─── 資料模型 ────────────────────────────────────────
const SHIFTS = {
  morning:   { label: '早班',   time: '08:00–16:00', cls: 'morning'   },
  afternoon: { label: '中班',   time: '12:00–20:00', cls: 'afternoon' },
  evening:   { label: '晚班',   time: '16:00–00:00', cls: 'evening'   },
  night:     { label: '大夜班', time: '00:00–08:00', cls: 'night'     },
  off:       { label: '休假',   time: '',             cls: 'off'       },
};

const AVATAR_COLORS = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b',
  '#ef4444','#ec4899','#06b6d4','#84cc16',
];

let members     = [];   // [{ id, name, color }]
let schedule    = {};   // { 'YYYY-MM-DD': { memberId: shiftKey } }
let offDays     = {};   // { memberId: Set<'YYYY-MM-DD'> }
let viewDate    = new Date();
let activeMemberId = null;  // who is selected for off-day clicking

// ─── 初始化 ──────────────────────────────────────────
function init() {
  // 預設人員
  ['王小明','李美花','張大偉','陳惠珍'].forEach(n => _addMember(n));
  viewDate = new Date();
  renderAll();
}

// ─── 人員管理 ─────────────────────────────────────────
function _addMember(name) {
  const id    = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  const color = AVATAR_COLORS[members.length % AVATAR_COLORS.length];
  members.push({ id, name, color });
  offDays[id] = new Set();
}

function addMember() {
  const input = document.getElementById('newName');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }
  if (members.find(m => m.name === name)) { alert('已有同名人員'); return; }
  _addMember(name);
  input.value = '';
  renderAll();
}

function deleteMember(id) {
  if (!confirm('確定刪除此人員？相關班次也會一起清除。')) return;
  members = members.filter(m => m.id !== id);
  delete offDays[id];
  // 清除該人員在 schedule 中的資料
  Object.keys(schedule).forEach(date => {
    delete schedule[date][id];
    if (Object.keys(schedule[date]).length === 0) delete schedule[date];
  });
  if (activeMemberId === id) activeMemberId = null;
  renderAll();
}

function selectMember(id) {
  activeMemberId = activeMemberId === id ? null : id;
  renderSidebar();
  renderCalendar();
}

// ─── 休假管理 ─────────────────────────────────────────
function toggleOffDay(dateStr) {
  if (!activeMemberId) return;
  const set = offDays[activeMemberId];
  if (set.has(dateStr)) {
    set.delete(dateStr);
    // 若 schedule 裡有 off，也一起移除
    if (schedule[dateStr]) delete schedule[dateStr][activeMemberId];
  } else {
    set.add(dateStr);
    // 在 schedule 記錄 off
    if (!schedule[dateStr]) schedule[dateStr] = {};
    schedule[dateStr][activeMemberId] = 'off';
  }
  renderCalendar();
  renderOverview();
}

// ─── 自動排班 ─────────────────────────────────────────
function generateSchedule() {
  if (members.length === 0) { alert('請先新增人員'); return; }

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days  = new Date(year, month + 1, 0).getDate();
  const demand = getDemand();

  // 清除本月（非休假）的排班
  for (let d = 1; d <= days; d++) {
    const dateStr = toDateStr(year, month, d);
    if (!schedule[dateStr]) schedule[dateStr] = {};
    // 先清除非 off 的排班
    Object.keys(schedule[dateStr]).forEach(mid => {
      if (schedule[dateStr][mid] !== 'off') delete schedule[dateStr][mid];
    });
  }

  // 各班次累計工作天數（平衡分配用）
  const workCount = {};
  members.forEach(m => { workCount[m.id] = 0; });

  for (let d = 1; d <= days; d++) {
    const dateStr = toDateStr(year, month, d);
    if (!schedule[dateStr]) schedule[dateStr] = {};

    // 當天可用人員（未休假）
    const available = members.filter(m => !offDays[m.id].has(dateStr) && schedule[dateStr][m.id] !== 'off');

    // 依工作天數少到多排序，讓分配平衡
    available.sort((a, b) => workCount[a.id] - workCount[b.id]);

    let idx = 0;
    const shiftOrder = ['morning','afternoon','evening','night'];
    for (const shift of shiftOrder) {
      const need = demand[shift];
      for (let i = 0; i < need; i++) {
        if (idx >= available.length) break;
        const member = available[idx++];
        schedule[dateStr][member.id] = shift;
        workCount[member.id]++;
      }
    }
  }

  renderAll();
  alert('✅ 班表已自動產生！你可以點選日期格子手動調整。');
}

function getDemand() {
  return {
    morning:   parseInt(document.getElementById('d-morning').value)   || 0,
    afternoon: parseInt(document.getElementById('d-afternoon').value) || 0,
    evening:   parseInt(document.getElementById('d-evening').value)   || 0,
    night:     parseInt(document.getElementById('d-night').value)     || 0,
  };
}

// ─── 月份導覽 ─────────────────────────────────────────
function changeMonth(dir) {
  viewDate.setDate(1);
  viewDate.setMonth(viewDate.getMonth() + dir);
  renderAll();
}
function goToday() {
  viewDate = new Date();
  renderAll();
}

// ─── 日曆點擊（手動設定班別 or 休假）─────────────────
function onCellClick(dateStr) {
  // 若有選取人員：直接切換休假
  if (activeMemberId) {
    toggleOffDay(dateStr);
    return;
  }
  // 否則打開班次調整 modal
  openModal(dateStr);
}

// ─── Modal ───────────────────────────────────────────
let modalDateStr = null;
let modalMemberId = null;

function openModal(dateStr, memberId) {
  modalDateStr   = dateStr;
  modalMemberId  = memberId || null;

  const [y, m, d] = dateStr.split('-').map(Number);
  const dateLabel = `${y}年${m}月${d}日`;
  document.getElementById('modalTitle').textContent = dateLabel;

  const body = document.getElementById('modalBody');

  if (memberId) {
    // 單一人員調整
    const member = members.find(m => m.id === memberId);
    const current = (schedule[dateStr] || {})[memberId] || '';
    body.innerHTML = `
      <p style="margin-bottom:10px;color:#6b7280;font-size:13px">調整 <strong>${member.name}</strong> 的班別：</p>
      <div class="shift-selector">
        ${Object.entries(SHIFTS).map(([key, s]) => `
          <button class="shift-sel-btn ${s.cls} ${current===key?'selected':''}"
                  onclick="setShift('${dateStr}','${memberId}','${key}')">
            ${s.label}${s.time ? `<br><span style="font-weight:400;font-size:10px">${s.time}</span>` : ''}
          </button>
        `).join('')}
        <button class="shift-sel-btn clear" onclick="setShift('${dateStr}','${memberId}','')">
          清除
        </button>
      </div>
    `;
  } else {
    // 顯示當天所有班次，可點選個別調整
    if (members.length === 0) { return; }
    const dayData = schedule[dateStr] || {};
    body.innerHTML = `
      <p style="margin-bottom:10px;color:#6b7280;font-size:13px">點選人員名稱調整班別：</p>
      ${members.map(m => {
        const shiftKey = dayData[m.id] || '';
        const shiftInfo = SHIFTS[shiftKey];
        return `
          <div class="modal-body-row">
            <span style="display:flex;align-items:center;gap:8px">
              <span class="avatar" style="background:${m.color}22;color:${m.color};width:24px;height:24px;font-size:11px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700">${m.name[0]}</span>
              ${m.name}
            </span>
            <button class="pill ${shiftInfo ? shiftInfo.cls : 'empty'}"
                    style="cursor:pointer;padding:3px 10px;border:none"
                    onclick="openModal('${dateStr}','${m.id}')">
              ${shiftInfo ? shiftInfo.label : '未排班'}
            </button>
          </div>
        `;
      }).join('')}
    `;
  }

  document.getElementById('modalOverlay').classList.remove('hidden');
}

function setShift(dateStr, memberId, shiftKey) {
  if (!schedule[dateStr]) schedule[dateStr] = {};
  if (shiftKey === '') {
    delete schedule[dateStr][memberId];
    // 也移除休假標記
    offDays[memberId]?.delete(dateStr);
  } else {
    schedule[dateStr][memberId] = shiftKey;
    if (shiftKey === 'off') {
      offDays[memberId]?.add(dateStr);
    } else {
      offDays[memberId]?.delete(dateStr);
    }
  }
  if (Object.keys(schedule[dateStr]).length === 0) delete schedule[dateStr];
  renderCalendar();
  renderOverview();
  // 回到當天列表
  openModal(dateStr);
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.add('hidden');
}

// ─── 渲染：側邊欄 ─────────────────────────────────────
function renderSidebar() {
  const list = document.getElementById('memberList');
  list.innerHTML = '';
  members.forEach(m => {
    const li = document.createElement('li');
    li.className = 'member-item' + (activeMemberId === m.id ? ' active' : '');
    li.innerHTML = `
      <div class="avatar" style="background:${m.color}22;color:${m.color}">${m.name[0]}</div>
      <span class="member-name">${m.name}</span>
      <button class="del-btn" onclick="event.stopPropagation();deleteMember('${m.id}')" title="刪除">✕</button>
    `;
    li.addEventListener('click', () => selectMember(m.id));
    list.appendChild(li);
  });

  const badge = document.getElementById('selectedMemberBadge');
  if (activeMemberId) {
    const m = members.find(m => m.id === activeMemberId);
    badge.textContent = `✏️ 選取中：${m ? m.name : ''} — 點日曆格子設定休假日`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ─── 渲染：日曆 ──────────────────────────────────────
function renderCalendar() {
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  document.getElementById('monthLabel').textContent = `${year} 年 ${month + 1} 月`;

  const cal      = document.getElementById('calendar');
  const today    = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  const demand   = getDemand();

  cal.innerHTML = '';

  // 週標題
  ['日','一','二','三','四','五','六'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-day-header';
    h.textContent = d;
    cal.appendChild(h);
  });

  const firstDay  = new Date(year, month, 1).getDay();  // 0=Sun
  const totalDays = new Date(year, month + 1, 0).getDate();
  // 前置空格
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

    // 日期數字
    const num = document.createElement('div');
    num.className = 'day-num' + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '');
    num.textContent = d;
    cell.appendChild(num);

    // 班次 pills
    const dayData = schedule[dateStr] || {};
    const pills   = document.createElement('div');
    pills.className = 'shift-pills';

    // 依班別順序排列
    const shiftOrder = ['morning','afternoon','evening','night','off'];
    const byShift = {};
    shiftOrder.forEach(s => { byShift[s] = []; });

    Object.entries(dayData).forEach(([mid, shiftKey]) => {
      const member = members.find(m => m.id === mid);
      if (!member) return;
      if (!byShift[shiftKey]) byShift[shiftKey] = [];
      byShift[shiftKey].push(member.name);
    });

    shiftOrder.forEach(shiftKey => {
      const names = byShift[shiftKey];
      if (!names || names.length === 0) return;
      const p = document.createElement('div');
      p.className = `pill ${SHIFTS[shiftKey].cls}`;
      p.textContent = `${SHIFTS[shiftKey].label}：${names.join('、')}`;
      pills.appendChild(p);
    });
    cell.appendChild(pills);

    // 需求滿足指示燈
    if (Object.keys(demand).some(k => demand[k] > 0)) {
      const dots = document.createElement('div');
      dots.className = 'demand-row';
      ['morning','afternoon','evening','night'].forEach(key => {
        const need  = demand[key];
        if (need === 0) return;
        const have  = (byShift[key] || []).length;
        const dot   = document.createElement('div');
        dot.className = 'demand-dot ' + (have >= need ? 'ok' : have > 0 ? 'warn' : 'bad');
        dot.title = `${SHIFTS[key].label}：需 ${need} 人，已排 ${have} 人`;
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
    }

    cal.appendChild(cell);
  }

  // 補尾部空格
  const lastDow = new Date(year, month, totalDays).getDay();
  for (let i = lastDow + 1; i < 7; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell other-month';
    cal.appendChild(cell);
  }
}

// ─── 渲染：班表總覽 ───────────────────────────────────
function renderOverview() {
  const wrap = document.getElementById('overviewTable');
  if (members.length === 0) { wrap.innerHTML = '<p style="padding:16px;color:#9ca3af">請先新增人員。</p>'; return; }

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days  = new Date(year, month + 1, 0).getDate();

  let html = '<table class="overview-table"><thead><tr><th>姓名</th>';
  for (let d = 1; d <= days; d++) {
    const dow = new Date(year, month, d).getDay();
    const color = dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : '';
    html += `<th style="${color?'color:'+color:''}">${d}</th>`;
  }
  html += '<th>班次數</th><th>工時(h)</th></tr></thead><tbody>';

  members.forEach(m => {
    html += `<tr><td style="text-align:left;font-weight:600;white-space:nowrap">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${m.color};margin-right:5px;vertical-align:middle"></span>
      ${m.name}</td>`;
    let shiftCount = 0;
    let hours = 0;
    for (let d = 1; d <= days; d++) {
      const dateStr = toDateStr(year, month, d);
      const shiftKey = (schedule[dateStr] || {})[m.id] || '';
      const s = SHIFTS[shiftKey];
      if (s) {
        html += `<td class="${s.cls}">${s.label}</td>`;
        if (shiftKey !== 'off') {
          shiftCount++;
          hours += shiftKey === 'night' || shiftKey === 'morning' || shiftKey === 'afternoon' || shiftKey === 'evening' ? 8 : 0;
        }
      } else {
        html += `<td class="empty">–</td>`;
      }
    }
    html += `<td style="font-weight:700">${shiftCount}</td><td>${hours}</td></tr>`;
  });

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

// ─── 匯出 CSV ─────────────────────────────────────────
function exportCSV() {
  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const days  = new Date(year, month + 1, 0).getDate();

  const header = ['姓名', ...Array.from({length: days}, (_, i) => `${month+1}/${i+1}`), '班次數', '工時(h)'].join(',');
  const rows   = members.map(m => {
    let count = 0, hours = 0;
    const cols = Array.from({length: days}, (_, i) => {
      const dateStr  = toDateStr(year, month, i + 1);
      const shiftKey = (schedule[dateStr] || {})[m.id] || '';
      const s = SHIFTS[shiftKey];
      if (s && shiftKey !== 'off') { count++; hours += 8; }
      return s ? s.label : '';
    });
    return [m.name, ...cols, count, hours].join(',');
  });

  const csv  = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `排班表_${year}_${String(month+1).padStart(2,'0')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── 工具函數 ─────────────────────────────────────────
function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function renderAll() {
  renderSidebar();
  renderCalendar();
  renderOverview();
}

// ─── 啟動 ─────────────────────────────────────────────
init();
