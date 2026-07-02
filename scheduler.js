/* =====================================================
   排班表系統 — scheduler.js  v6.3

   排班規則：
   1. 每人月休 6~8 天（目標 7 天），含手動休假日
   2. 手動休假已 ≥ MAX_REST → 系統不加休假，其餘天全排班
   3. 以連續上班 5 天為基準，彈性 4~6 天
   4. 人力需求優先；相同條件下，快到輪休點的人先填班
   ===================================================== */

function runScheduler({ members, schedule, offDays, demandFn, canWorkShiftFn, shiftOrder, year, month, days, dateStrFn }) {

  const TARGET_REST = 7;
  const MAX_REST    = 8;
  const MAX_CONSEC  = 6;  // 超過此連續天數強制插一天休假

  // ── 1. 清空非手動休假排班 ──
  for (let d = 1; d <= days; d++) {
    const ds = dateStrFn(year, month, d);
    if (!schedule[ds]) schedule[ds] = {};
    Object.keys(schedule[ds]).forEach(mid => {
      if (schedule[ds][mid] !== 'off') delete schedule[ds][mid];
    });
  }

  // ── 2. 計算手動休假天數，決定系統需補充幾天 ──
  const manualOff    = {};  // 手動休假天數
  const sysRestNeed  = {};  // 系統還需補幾天休假

  members.forEach(m => {
    let cnt = 0;
    for (let d = 1; d <= days; d++) {
      if (offDays[m.id] && offDays[m.id].has(dateStrFn(year, month, d))) cnt++;
    }
    manualOff[m.id]   = cnt;
    const extra = Math.max(0, TARGET_REST - cnt);
    sysRestNeed[m.id]  = (cnt >= MAX_REST) ? 0 : extra;
  });

  // ── 3. 預先規劃系統休假日期 ──────────────────────────
  // 先決定每人哪幾天要系統休假（均勻分散），再排班
  // 策略：在非手動休假的日子中，盡量平均間隔安插
  const plannedOff = {};  // Set<dateStr>
  members.forEach(m => {
    plannedOff[m.id] = new Set();
    const budget = sysRestNeed[m.id];
    if (budget <= 0) return;

    // 找出本月非手動休假的日子
    const workDays = [];
    for (let d = 1; d <= days; d++) {
      const ds = dateStrFn(year, month, d);
      if (!offDays[m.id] || !offDays[m.id].has(ds)) workDays.push(ds);
    }

    // 以連續上班 5 天為基準，在第 5 天後安插休假
    // 先模擬一遍，找出最自然的休假點
    let consec = 0;
    let placed  = 0;
    for (const ds of workDays) {
      if (placed >= budget) break;
      consec++;
      if (consec >= 5) {
        // 在下一個可以插入的地方放一天休
        // 找 ds 之後的下一個 workDay
        const idx = workDays.indexOf(ds);
        const nextDs = workDays[idx + 1];
        if (nextDs && !plannedOff[m.id].has(nextDs)) {
          plannedOff[m.id].add(nextDs);
          placed++;
          consec = 0;
        }
      }
    }

    // 若仍未達配額，從後往前補（月底補休）
    if (placed < budget) {
      for (let i = workDays.length - 1; i >= 0 && placed < budget; i--) {
        const ds = workDays[i];
        if (!plannedOff[m.id].has(ds)) {
          plannedOff[m.id].add(ds);
          placed++;
        }
      }
    }
  });

  // ── 4. 逐日排班 ──────────────────────────────────────
  const consecutive = {};
  const workCount   = {};
  members.forEach(m => { consecutive[m.id] = 0; workCount[m.id] = 0; });

  for (let d = 1; d <= days; d++) {
    const ds     = dateStrFn(year, month, d);
    if (!schedule[ds]) schedule[ds] = {};
    const demand = demandFn(ds);

    // 今天要休假的人（手動 or 預先規劃）
    const isOff = (mid) =>
      schedule[ds][mid] === 'off' ||
      (offDays[mid] && offDays[mid].has(ds)) ||
      plannedOff[mid].has(ds);

    // 連續超過上限也強制休
    const mustRest = (mid) => consecutive[mid] >= MAX_CONSEC && !isOff(mid);
    // mustRest 優先讓系統在今天給他安排休假

    // 排班
    for (const shift of shiftOrder) {
      const need = demand[shift];
      if (need === 0) continue;

      const candidates = members.filter(m =>
        !isOff(m.id)          &&
        !mustRest(m.id)       &&
        !schedule[ds][m.id]   &&
        canWorkShiftFn(m, shift)
      );

      candidates.sort((a, b) =>
        (consecutive[b.id] - consecutive[a.id]) ||
        (workCount[a.id]   - workCount[b.id])
      );

      let assigned = 0;
      for (const mem of candidates) {
        if (assigned >= need) break;
        schedule[ds][mem.id] = shift;
        workCount[mem.id]++;
        assigned++;
      }
    }

    // ── 5. 補標記休假 & 更新連續天數 ──
    members.forEach(m => {
      const sk = schedule[ds][m.id];
      if (sk && sk !== 'off') {
        consecutive[m.id]++;
      } else {
        if (!sk) schedule[ds][m.id] = 'off';
        consecutive[m.id] = 0;
      }
    });
  }

  return schedule;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runScheduler };
}
