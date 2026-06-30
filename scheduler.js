/* =====================================================
   排班表系統 — scheduler.js
   獨立的自動排班演算法模組

   排班原則（依優先順序）：
   1. 人力優先充足：只要還沒連續上班滿5天，且當天未休假，
      就盡量排班，不會因為「平均工時」而讓他提早休息。
   2. 連續上班最多5天：滿5天則該人「強制休假」一天，
      隔天重新計算連續天數。
   3. 在符合以上兩條件的人之中，才依「累積工時較少者優先」
      做次要的平衡，避免長期下來工時差距過大。
   4. 尊重「固定班別」設定與手動設定的休假日，
      休假日永遠不會被排班。

   範例：
     王小明 手動休假設在每週二、四
     → 系統會排他：一、三、五、六、日（最多連續5天，
        若週五六日剛好連續超過5天會在第5天後安插休假）

   使用方式：
     在 app.js 的 generateSchedule() 內呼叫
     runScheduler({ members, schedule, offDays, demandFn,
                    canWorkShiftFn, shiftOrder, year, month, days })
     回傳更新後的 schedule 物件（同一份物件，會被直接修改）
   ===================================================== */

function runScheduler({ members, schedule, offDays, demandFn, canWorkShiftFn, shiftOrder, year, month, days, dateStrFn }) {

  // ── 1. 清空本月「非休假」的排班，保留手動標記的休假 ──
  for (let d = 1; d <= days; d++) {
    const dateStr = dateStrFn(year, month, d);
    if (!schedule[dateStr]) schedule[dateStr] = {};
    Object.keys(schedule[dateStr]).forEach(mid => {
      if (schedule[dateStr][mid] !== 'off') delete schedule[dateStr][mid];
    });
  }

  const workCount   = {};  // 累計工作天數（次要平衡用）
  const consecutive = {};  // 連續上班天數
  members.forEach(m => { workCount[m.id] = 0; consecutive[m.id] = 0; });

  // ── 2. 逐日往前推進 ──
  for (let d = 1; d <= days; d++) {
    const dateStr = dateStrFn(year, month, d);
    if (!schedule[dateStr]) schedule[dateStr] = {};
    const demand = demandFn(dateStr);

    // 當天「已手動標記休假」或「已被排班」的人先排除在候選名單外
    const isManualOff = (mid) => schedule[dateStr][mid] === 'off' || (offDays[mid] && offDays[mid].has(dateStr));

    // 是否「必須」今天休假：連續上班已達5天
    const mustRest = (mid) => consecutive[mid] >= 5;

    for (const shift of shiftOrder) {
      const need = demand[shift];
      if (need === 0) continue;

      const candidates = members.filter(m =>
        !isManualOff(m.id) &&
        !schedule[dateStr][m.id] &&           // 當天尚未被排其他班
        !mustRest(m.id) &&                    // 未達連續5天上限（未滿5天才可排）
        canWorkShiftFn(m, shift)              // 符合固定班別限制
      );

      // 排序：
      //   (a) 連續上班天數多者優先 —— 讓「快要滿5天但還沒滿」的人優先填補，
      //       使人力盡量充足，不會被過早的「平均工時」邏輯排擠掉。
      //   (b) 連續天數相同時，再用「累積工時少者優先」做次要平衡。
      candidates.sort((a, b) =>
        (consecutive[b.id] - consecutive[a.id]) ||
        (workCount[a.id] - workCount[b.id])
      );

      let assigned = 0;
      for (const member of candidates) {
        if (assigned >= need) break;
        schedule[dateStr][member.id] = shift;
        workCount[member.id]++;
        assigned++;
      }
    }

    // ── 3. 更新每人連續上班天數，並把「沒被排到班」的人標記為休假 ──
    members.forEach(m => {
      const sk = schedule[dateStr][m.id];
      if (sk && sk !== 'off') {
        consecutive[m.id]++;
      } else {
        if (!sk) schedule[dateStr][m.id] = 'off';   // 沒排到班 → 視為休假
        consecutive[m.id] = 0;                      // 重置連續天數
      }
    });
  }

  return schedule;
}

// 計算每日人力缺口，回傳警告字串陣列，格式如：「6/3：早班少1人、大夜班少1人」
function checkScheduleShortage({ schedule, demandFn, shiftOrder, shiftLabels, year, month, days, dateStrFn }) {
  const warnings = [];
  for (let d = 1; d <= days; d++) {
    const dateStr = dateStrFn(year, month, d);
    const dayData = schedule[dateStr] || {};
    const demand  = demandFn(dateStr);
    const msgs = [];
    for (const shift of shiftOrder) {
      const need = demand[shift];
      if (need === 0) continue;
      const have = Object.values(dayData).filter(s => s === shift).length;
      if (have < need) msgs.push(`${shiftLabels[shift]}少${need - have}人`);
    }
    if (msgs.length > 0) warnings.push(`${month + 1}/${d}：${msgs.join('、')}`);
  }
  return warnings;
}

// 若在 Node.js 環境（測試用）也能 require
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runScheduler, checkScheduleShortage };
}
