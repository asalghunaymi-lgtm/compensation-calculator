/* =========================================================
   حاسبة احتساب التعويضات البيئية
   المعادلة: ت = ( خم + خغ ) + كت + دب − خصم
   وفق دليل احتساب التعويضات البيئية (المادة 35/1 و 43 من نظام البيئة)
   ========================================================= */

const STORAGE_KEY = "envCompCases_v1";

const METHODOLOGIES = ["HEA", "REA", "ESA"];

function uid() {
  return "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function newViolation() {
  return {
    id: uid(),
    description: "",
    direct: { value: 0, evidenced: false, notes: "" },
    indirect: { value: 0, evidenced: false, notes: "" },
    rehab: { diagnosis: 0, execution: 0, monitoring: 0, evidenced: false, notes: "" },
    degradation: { value: 0, methodology: "HEA", evidenced: false, notes: "" },
    deduction: { value: 0, accepted: false, notes: "" }
  };
}

function newCaseInfo() {
  return {
    caseNumber: "",
    violatorName: "",
    violationDate: "",
    location: "",
    violationType: "إلقاء مياه صرف صحي غير معالجة",
    referredTo: "النيابة العامة",
    reportNumber: "",
    preparedBy: ""
  };
}

let state = {
  id: null,
  caseInfo: newCaseInfo(),
  violations: [newViolation()]
};

/* ---------------- utils ---------------- */

function fmt(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("ar-SA", { maximumFractionDigits: 2 }) + " ريال";
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
}
function setPath(obj, path, val) {
  const keys = path.split(".");
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = val;
}

/* ---------------- calculation ---------------- */

function computeViolation(v) {
  const warnings = [];
  const rehabSum = (Number(v.rehab.diagnosis) || 0) + (Number(v.rehab.execution) || 0) + (Number(v.rehab.monitoring) || 0);

  const parts = [
    { key: "direct", label: "الأضرار المباشرة (خم)", raw: Number(v.direct.value) || 0, evidenced: v.direct.evidenced },
    { key: "indirect", label: "الأضرار غير المباشرة (خغ)", raw: Number(v.indirect.value) || 0, evidenced: v.indirect.evidenced },
    { key: "rehab", label: "تكلفة إعادة التأهيل (كت)", raw: rehabSum, evidenced: v.rehab.evidenced },
    { key: "degradation", label: "قيمة التدهور البيئي (دب)", raw: Number(v.degradation.value) || 0, evidenced: v.degradation.evidenced }
  ];

  let effectiveSum = 0;
  parts.forEach(p => {
    if (p.raw > 0 && !p.evidenced) {
      warnings.push(`لم تُحتسب "${p.label}" ضمن الإجمالي لعدم توثيقها بشواهد المرحلة (٥).`);
    } else {
      effectiveSum += p.raw;
    }
  });

  const deductionRaw = Number(v.deduction.value) || 0;
  let effectiveDeduction = 0;
  if (deductionRaw > 0) {
    if (!v.deduction.accepted) {
      warnings.push("لم يُخصم مبلغ إعادة التأهيل الذي نفّذه المخالف لعدم إثباته وقبوله فنيًا.");
    } else {
      effectiveDeduction = deductionRaw;
      if (effectiveDeduction > effectiveSum) {
        warnings.push("قيمة (خصم) تتجاوز إجمالي الأضرار المحتسبة لهذه المخالفة؛ تم تحديد الإجمالي بحده الأدنى صفر.");
      }
    }
  }

  let total = effectiveSum - effectiveDeduction;
  if (total < 0) total = 0;

  return {
    direct: Number(v.direct.value) || 0,
    indirect: Number(v.indirect.value) || 0,
    rehabSum,
    degradation: Number(v.degradation.value) || 0,
    deduction: deductionRaw,
    effectiveDeduction,
    total,
    warnings
  };
}

function computeAll() {
  const results = state.violations.map(v => ({ id: v.id, ...computeViolation(v) }));
  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  const allWarnings = [];
  results.forEach((r, i) => {
    r.warnings.forEach(w => allWarnings.push(`مخالفة #${i + 1}: ${w}`));
  });
  return { results, grandTotal, allWarnings };
}

/* ---------------- rendering ---------------- */

function componentRow({ label, sub, valueField, evidencedField, notesField, v, extra = "" }) {
  const val = getPath(v, valueField);
  const evidenced = getPath(v, evidencedField);
  const notes = getPath(v, notesField);
  return `
  <div class="component-row">
    <div class="component-label">${label}${sub ? `<small>${sub}</small>` : ""}</div>
    <div>
      ${extra || `<input type="number" min="0" step="1" class="field-input" data-vid="${v.id}" data-field="${valueField}" value="${val}" placeholder="0">`}
    </div>
    <div>
      <input type="text" class="field-input" data-vid="${v.id}" data-field="${notesField}" value="${notes || ""}" placeholder="ملاحظات / مصدر الشاهد">
    </div>
    <label class="evidence-check ${evidenced ? "" : "unchecked"}">
      <input type="checkbox" data-vid="${v.id}" data-field="${evidencedField}" data-bool="1" ${evidenced ? "checked" : ""}>
      موثّق بشواهد
    </label>
  </div>`;
}

function renderViolationCard(v, index) {
  const r = computeViolation(v);
  const methodOptions = METHODOLOGIES.map(m => `<option value="${m}" ${v.degradation.methodology === m ? "selected" : ""}>${m}</option>`).join("");

  return `
  <div class="violation-card" data-vid="${v.id}">
    <div class="violation-card-header">
      <h3>مخالفة #${index + 1}</h3>
      <button class="btn btn-danger no-print" data-action="remove-violation" data-vid="${v.id}" ${state.violations.length === 1 ? "disabled" : ""}>حذف</button>
    </div>
    <label class="field" style="margin-bottom:12px;">
      <span>وصف المخالفة</span>
      <textarea class="field-input" data-vid="${v.id}" data-field="description" placeholder="وصف موجز لواقعة إلقاء مياه الصرف / السوائل غير المعالجة">${v.description || ""}</textarea>
    </label>

    ${componentRow({ label: "الأضرار المباشرة (خم)", sub: "من تقارير الضبط ومحاضر المعاينة", valueField: "direct.value", evidencedField: "direct.evidenced", notesField: "direct.notes", v })}
    ${componentRow({ label: "الأضرار غير المباشرة (خغ)", sub: "منهجيات علمية معتمدة", valueField: "indirect.value", evidencedField: "indirect.evidenced", notesField: "indirect.notes", v })}

    <div class="component-row">
      <div class="component-label">تكلفة إعادة التأهيل (كت)<small>تشخيص + تنفيذ + متابعة</small></div>
      <div class="rehab-sub">
        <div class="field"><span>تشخيص</span><input type="number" min="0" class="field-input" data-vid="${v.id}" data-field="rehab.diagnosis" value="${v.rehab.diagnosis}"></div>
        <div class="field"><span>تنفيذ</span><input type="number" min="0" class="field-input" data-vid="${v.id}" data-field="rehab.execution" value="${v.rehab.execution}"></div>
        <div class="field"><span>متابعة</span><input type="number" min="0" class="field-input" data-vid="${v.id}" data-field="rehab.monitoring" value="${v.rehab.monitoring}"></div>
      </div>
      <div>
        <input type="text" class="field-input" data-vid="${v.id}" data-field="rehab.notes" value="${v.rehab.notes || ""}" placeholder="ملاحظات / مصدر الشاهد">
      </div>
      <label class="evidence-check ${v.rehab.evidenced ? "" : "unchecked"}">
        <input type="checkbox" data-vid="${v.id}" data-field="rehab.evidenced" data-bool="1" ${v.rehab.evidenced ? "checked" : ""}>
        موثّق بشواهد
      </label>
    </div>

    <div class="component-row">
      <div class="component-label">قيمة التدهور البيئي (دب)<small>منهجية الاحتساب</small></div>
      <div style="display:flex;gap:8px;">
        <input type="number" min="0" class="field-input" style="flex:1;" data-vid="${v.id}" data-field="degradation.value" value="${v.degradation.value}">
        <select class="field-input" data-vid="${v.id}" data-field="degradation.methodology">${methodOptions}</select>
      </div>
      <div>
        <input type="text" class="field-input" data-vid="${v.id}" data-field="degradation.notes" value="${v.degradation.notes || ""}" placeholder="ملاحظات / مصدر الشاهد">
      </div>
      <label class="evidence-check ${v.degradation.evidenced ? "" : "unchecked"}">
        <input type="checkbox" data-vid="${v.id}" data-field="degradation.evidenced" data-bool="1" ${v.degradation.evidenced ? "checked" : ""}>
        موثّق بشواهد
      </label>
    </div>

    <div class="component-row">
      <div class="component-label">ما نفّذه المخالف فعليًا (خصم)<small>إعادة تأهيل مقبولة فنيًا</small></div>
      <div>
        <input type="number" min="0" class="field-input" data-vid="${v.id}" data-field="deduction.value" value="${v.deduction.value}">
      </div>
      <div>
        <input type="text" class="field-input" data-vid="${v.id}" data-field="deduction.notes" value="${v.deduction.notes || ""}" placeholder="ملاحظات / مصدر الشاهد">
      </div>
      <label class="evidence-check ${v.deduction.accepted ? "" : "unchecked"}">
        <input type="checkbox" data-vid="${v.id}" data-field="deduction.accepted" data-bool="1" ${v.deduction.accepted ? "checked" : ""}>
        مقبول فنيًا
      </label>
    </div>

    <div class="subtotal-line">
      <span>إجمالي هذه المخالفة (ت)</span>
      <span class="value" data-subtotal="${v.id}">${fmt(r.total)}</span>
    </div>
  </div>`;
}

function renderViolations() {
  const container = document.getElementById("violationsList");
  container.innerHTML = state.violations.map((v, i) => renderViolationCard(v, i)).join("");
}

function updateTotalsOnly() {
  const { results, grandTotal, allWarnings } = computeAll();
  results.forEach(r => {
    const el = document.querySelector(`[data-subtotal="${r.id}"]`);
    if (el) el.textContent = fmt(r.total);
  });
  document.getElementById("grandTotal").textContent = fmt(grandTotal);

  const warnBox = document.getElementById("warningsBox");
  if (allWarnings.length) {
    warnBox.innerHTML = allWarnings.map(w => `<div class="warn-item">⚠ ${w}</div>`).join("");
  } else {
    warnBox.innerHTML = "";
  }
}

function refreshEvidenceStyles() {
  document.querySelectorAll(".evidence-check").forEach(label => {
    const cb = label.querySelector("input[type=checkbox]");
    if (!cb) return;
    label.classList.toggle("unchecked", !cb.checked);
  });
}

/* ---------------- event binding ---------------- */

function bindCaseInfoInputs() {
  const map = {
    caseNumber: "caseNumber",
    violatorName: "violatorName",
    violationDate: "violationDate",
    location: "location",
    violationType: "violationType",
    referredTo: "referredTo",
    reportNumber: "reportNumber",
    preparedBy: "preparedBy"
  };
  Object.entries(map).forEach(([id, field]) => {
    const el = document.getElementById(id);
    el.value = state.caseInfo[field] || (id === "referredTo" ? "النيابة العامة" : "");
    el.addEventListener("input", () => {
      state.caseInfo[field] = el.value;
    });
  });
}

function bindViolationsDelegation() {
  const container = document.getElementById("violationsList");

  container.addEventListener("input", e => {
    const target = e.target;
    const vid = target.getAttribute("data-vid");
    const field = target.getAttribute("data-field");
    if (!vid || !field) return;
    const v = state.violations.find(x => x.id === vid);
    if (!v) return;

    if (target.type === "checkbox") {
      setPath(v, field, target.checked);
    } else if (target.type === "number") {
      setPath(v, field, target.value === "" ? 0 : Number(target.value));
    } else {
      setPath(v, field, target.value);
    }
    updateTotalsOnly();
    refreshEvidenceStyles();
  });

  container.addEventListener("click", e => {
    const btn = e.target.closest("[data-action='remove-violation']");
    if (!btn) return;
    const vid = btn.getAttribute("data-vid");
    if (state.violations.length === 1) return;
    if (!confirm("هل تريد حذف هذه المخالفة؟")) return;
    state.violations = state.violations.filter(v => v.id !== vid);
    renderViolations();
    updateTotalsOnly();
  });
}

document.getElementById("addViolationBtn").addEventListener("click", () => {
  state.violations.push(newViolation());
  renderViolations();
  updateTotalsOnly();
});

document.getElementById("newCaseBtn").addEventListener("click", () => {
  if (!confirm("بدء قضية جديدة؟ سيتم فقد أي بيانات غير محفوظة.")) return;
  state = { id: null, caseInfo: newCaseInfo(), violations: [newViolation()] };
  bindCaseInfoInputs();
  renderViolations();
  updateTotalsOnly();
  document.getElementById("savedCasesPanel").classList.add("hidden");
});

/* ---------------- save / load (localStorage) ---------------- */

function loadSavedCases() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}
function persistCases(cases) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
}

function saveCurrentCase() {
  const cases = loadSavedCases();
  const { grandTotal } = computeAll();
  const record = {
    id: state.id || uid(),
    savedAt: new Date().toISOString(),
    caseInfo: state.caseInfo,
    violations: state.violations,
    grandTotal
  };
  const idx = cases.findIndex(c => c.id === record.id);
  if (idx >= 0) cases[idx] = record;
  else cases.push(record);
  persistCases(cases);
  state.id = record.id;
  alert("تم حفظ القضية بنجاح.");
  renderSavedCasesList();
}

function renderSavedCasesList() {
  const cases = loadSavedCases();
  const list = document.getElementById("savedCasesList");
  if (!cases.length) {
    list.innerHTML = `<p style="color:var(--muted);">لا توجد قضايا محفوظة بعد.</p>`;
    return;
  }
  list.innerHTML = cases
    .slice()
    .reverse()
    .map(c => {
      const date = new Date(c.savedAt).toLocaleString("ar-SA");
      return `
      <div class="saved-item">
        <div class="saved-item-info">
          <strong>${c.caseInfo.caseNumber || "بدون رقم"} — ${c.caseInfo.violatorName || "بدون اسم مخالف"}</strong>
          <span>${date} · الإجمالي: ${fmt(c.grandTotal)}</span>
        </div>
        <div class="saved-item-actions">
          <button class="btn btn-outline" data-load="${c.id}">فتح</button>
          <button class="btn btn-danger" data-delete="${c.id}">حذف</button>
        </div>
      </div>`;
    })
    .join("");
}

document.getElementById("saveCaseBtn").addEventListener("click", saveCurrentCase);

document.getElementById("savedCasesBtn").addEventListener("click", () => {
  renderSavedCasesList();
  document.getElementById("savedCasesPanel").classList.remove("hidden");
});
document.getElementById("closeSavedPanel").addEventListener("click", () => {
  document.getElementById("savedCasesPanel").classList.add("hidden");
});

document.getElementById("savedCasesList").addEventListener("click", e => {
  const loadId = e.target.getAttribute("data-load");
  const delId = e.target.getAttribute("data-delete");
  if (loadId) {
    const cases = loadSavedCases();
    const rec = cases.find(c => c.id === loadId);
    if (!rec) return;
    state = { id: rec.id, caseInfo: rec.caseInfo, violations: rec.violations };
    bindCaseInfoInputs();
    renderViolations();
    updateTotalsOnly();
    document.getElementById("savedCasesPanel").classList.add("hidden");
  }
  if (delId) {
    if (!confirm("حذف هذه القضية المحفوظة نهائيًا؟")) return;
    let cases = loadSavedCases();
    cases = cases.filter(c => c.id !== delId);
    persistCases(cases);
    renderSavedCasesList();
  }
});

/* ---------------- export / import JSON ---------------- */

document.getElementById("exportJsonBtn").addEventListener("click", () => {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `تعويض-${state.caseInfo.caseNumber || "قضية"}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("importJsonInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.caseInfo || !data.violations) throw new Error("invalid");
      state = data;
      bindCaseInfoInputs();
      renderViolations();
      updateTotalsOnly();
      alert("تم استيراد القضية بنجاح.");
    } catch {
      alert("ملف غير صالح.");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

/* ---------------- report generation ---------------- */

function buildReport() {
  const { results, grandTotal, allWarnings } = computeAll();
  const c = state.caseInfo;

  let html = `
  <div class="report-section">
    <h3>بيانات الواقعة</h3>
    <table class="report-table">
      <tr><th>رقم القضية / الملف</th><td>${c.caseNumber || "—"}</td><th>اسم / صفة المخالف</th><td>${c.violatorName || "—"}</td></tr>
      <tr><th>تاريخ وقوع المخالفة</th><td>${c.violationDate || "—"}</td><th>الموقع الجغرافي</th><td>${c.location || "—"}</td></tr>
      <tr><th>نوع المخالفة</th><td>${c.violationType || "—"}</td><th>رقم البلاغ / الضبط</th><td>${c.reportNumber || "—"}</td></tr>
      <tr><th>الجهة المحيلة</th><td>${c.referredTo || "—"}</td><th>مُعِد التقرير</th><td>${c.preparedBy || "—"}</td></tr>
    </table>
  </div>`;

  results.forEach((r, i) => {
    const v = state.violations[i];
    html += `
    <div class="report-section">
      <h3>مخالفة #${i + 1}${v.description ? " — " + v.description : ""}</h3>
      <table class="report-table">
        <tr><th>الأضرار المباشرة (خم)</th><td>${fmt(r.direct)}</td><th>موثّقة بشواهد</th><td>${v.direct.evidenced ? "نعم" : "لا"}</td></tr>
        <tr><th>الأضرار غير المباشرة (خغ)</th><td>${fmt(r.indirect)}</td><th>موثّقة بشواهد</th><td>${v.indirect.evidenced ? "نعم" : "لا"}</td></tr>
        <tr><th>تكلفة إعادة التأهيل (كت)</th><td>${fmt(r.rehabSum)}</td><th>موثّقة بشواهد</th><td>${v.rehab.evidenced ? "نعم" : "لا"}</td></tr>
        <tr><th>قيمة التدهور البيئي (دب)</th><td>${fmt(r.degradation)} — ${v.degradation.methodology}</td><th>موثّقة بشواهد</th><td>${v.degradation.evidenced ? "نعم" : "لا"}</td></tr>
        <tr><th>ما نفّذه المخالف فعليًا (خصم)</th><td>${fmt(r.deduction)}</td><th>مقبول فنيًا</th><td>${v.deduction.accepted ? "نعم" : "لا"}</td></tr>
      </table>
      <p style="text-align:left;font-weight:bold;margin-top:8px;">إجمالي هذه المخالفة: ${fmt(r.total)}</p>
    </div>`;
  });

  if (allWarnings.length) {
    html += `
    <div class="report-section">
      <h3>ملاحظات الاحتساب</h3>
      <ul>${allWarnings.map(w => `<li>${w}</li>`).join("")}</ul>
    </div>`;
  }

  html += `
  <div class="report-total">
    إجمالي التعويض المستحق (ت) = ( خم + خغ ) + كت + دب − خصم = ${fmt(grandTotal)}
  </div>

  <div class="report-section" style="margin-top:20px;">
    <h3>الضمانات الإجرائية</h3>
    <ul>
      <li>يُشعر المخالف كتابيًا بقيمة التعويض وأسسه.</li>
      <li>للمخالف حق التظلم وفق النظام واللوائح ذات العلاقة.</li>
      <li>تُعاد المراجعة عند تقديم مستندات أو شواهد جديدة قبل الاعتماد النهائي.</li>
      <li>لا تُعتمد القيمة أعلاه نهائيًا إلا بعد مراجعة لجنة احتساب التعويضات ورفعها إلى النيابة العامة استنادًا للمادة (٤٣).</li>
    </ul>
  </div>

  <div class="signature-line">
    <div>توقيع مُعِد التقرير<br>${c.preparedBy || ""}</div>
    <div>اعتماد لجنة احتساب التعويضات</div>
  </div>`;

  document.getElementById("reportBody").innerHTML = html;
}

document.getElementById("printReportBtn").addEventListener("click", () => {
  buildReport();
  setTimeout(() => window.print(), 50);
});

/* ---------------- init ---------------- */

function init() {
  bindCaseInfoInputs();
  bindViolationsDelegation();
  renderViolations();
  updateTotalsOnly();
}
init();
