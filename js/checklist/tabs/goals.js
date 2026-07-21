(function () {
  let goalsTemplate = null;
  let activeContext = {};
  let planLoadToken = 0;

  const AUTO_TARGET_KEYS = {
    sales: "salesPlan",
    gc: "gcPlan",
    avg_check: "avgCheckPlan",
  };

  const PERCENT_PLAN_KEYS = new Set([
    "dt_percent",
    "kiosks_percent",
    "dlv_percent",
    "c_percent",
  ]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isEmpty(value) {
    return value === null || value === undefined || value === "";
  }

  function toNumber(value) {
    if (value === null || value === undefined || value === "") return 0;

    const normalized = String(value)
      .replace("%", "")
      .replace(/\s+/g, "")
      .replace(",", ".");

    const num = Number(normalized);
    return Number.isFinite(num) ? num : 0;
  }

  function formatNumber(value) {
    const num = Number(value);

    if (!Number.isFinite(num)) return "";

    if (Number.isInteger(num)) {
      return String(num);
    }

    return String(Math.round(num * 100) / 100);
  }

  function formatPercent(value) {
    if (isEmpty(value)) return "";

    const num = toNumber(value);

    if (!Number.isFinite(num)) return "";

    return `${formatNumber(num)}%`;
  }

  async function loadGoalsTemplate() {
    if (goalsTemplate) return goalsTemplate;

    const response = await fetch("../data/checklist/goals.json");

    if (!response.ok) {
      throw new Error("Не удалось загрузить goals.json");
    }

    goalsTemplate = await response.json();
    return goalsTemplate;
  }

  function getPriorityOptions(template = goalsTemplate) {
  const options = template?.priorityOptions;

  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((option) => {
      if (typeof option === "string") {
        return {
          title: option.split("\n")[0] || option,
          text: option,
        };
      }

      return {
        title: option?.title || option?.text || "",
        text: option?.text || option?.title || "",
      };
    })
    .filter((option) => option.text);
}

function getPriorityTextarea(priorityNumber) {
  return document.getElementById(
    `goalPriority${priorityNumber}`
  );
}

function getPrioritySelect(priorityNumber) {
  return document.getElementById(
    `goalPrioritySelect${priorityNumber}`
  );
}

function setPriorityTextareaValue(
  priorityNumber,
  value,
  options = {}
) {
  const textarea = getPriorityTextarea(priorityNumber);

  if (!textarea) {
    return;
  }

  textarea.value = value || "";

  if (typeof resizeGoalsTextarea === "function") {
    resizeGoalsTextarea(textarea);
  }

  if (options.dispatchInput) {
    textarea.dispatchEvent(
      new Event("input", {
        bubbles: true,
      })
    );
  }
}

function renderPriorityOptions(template, savedData = {}) {
  const options = getPriorityOptions(template);

  [1, 2, 3].forEach((priorityNumber) => {
    const select = getPrioritySelect(priorityNumber);

    if (!select) {
      return;
    }

    select.innerHTML = `
      <option value="">
        Выберите готовую цель
      </option>

      ${options
        .map((option, index) => {
          return `
            <option value="${index}">
              ${escapeHtml(option.title)}
            </option>
          `;
        })
        .join("")}
    `;

    const savedValue =
      savedData?.priorities?.[
        `priority${priorityNumber}`
      ] || "";

    const matchedIndex = options.findIndex((option) => {
      return option.text.trim() === savedValue.trim();
    });

    select.value =
      matchedIndex >= 0
        ? String(matchedIndex)
        : "";
  });
}

function bindPriorityEvents(template) {
  const priorities = document.querySelector(
    ".goals-priorities"
  );

  if (
    !priorities ||
    priorities.dataset.priorityEventsBound === "true"
  ) {
    return;
  }

  priorities.dataset.priorityEventsBound = "true";

  const options = getPriorityOptions(template);

  priorities.addEventListener("change", (event) => {
    const select = event.target.closest(
      "[data-priority-select]"
    );

    if (!select) {
      return;
    }

    if (select.value === "") {
      return;
    }

    const priorityNumber = Number(
      select.dataset.prioritySelect
    );

    const selectedIndex = Number(select.value);
    const selectedOption = options[selectedIndex];

    if (
      !Number.isInteger(selectedIndex) ||
      !selectedOption
    ) {
      return;
    }

    setPriorityTextareaValue(
      priorityNumber,
      selectedOption.text,
      {
        dispatchInput: true,
      }
    );
  });

  priorities.addEventListener("click", (event) => {
    const clearButton = event.target.closest(
      "[data-priority-clear]"
    );

    if (!clearButton) {
      return;
    }

    const priorityNumber = Number(
      clearButton.dataset.priorityClear
    );

    const select = getPrioritySelect(priorityNumber);

    if (select) {
      select.value = "";
    }

    setPriorityTextareaValue(priorityNumber, "", {
      dispatchInput: true,
    });
  });

  priorities.addEventListener("input", (event) => {
    const textarea = event.target.closest(
      ".goals-priority-input"
    );

    if (!textarea) {
      return;
    }

    const priorityNumber = Number(
      String(textarea.id || "").replace(
        "goalPriority",
        ""
      )
    );

    const select = getPrioritySelect(priorityNumber);

    if (!select || select.value === "") {
      return;
    }

    const selectedIndex = Number(select.value);
    const selectedOption = options[selectedIndex];

    if (
      !selectedOption ||
      textarea.value !== selectedOption.text
    ) {
      select.value = "";
    }
  });
}

  function normalizeMetricText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[.\-_]/g, "");
  }

  function isWasteMetric(metricName) {
    const text = String(metricName || "").toLowerCase();

    return (
      text.includes("waste") ||
      text.includes("wastestate") ||
      text.includes("проблемных продукта") ||
      text.includes("проблемных продуктов")
    );
  }

  function getMetricPlanKey(metricName) {
    const normalized = normalizeMetricText(metricName);

    if (normalized === "sales") return "sales";
    if (normalized === "gc") return "gc";

    if (
      normalized === "avcheck" ||
      normalized === "avgcheck" ||
      normalized.includes("averagecheck") ||
      normalized.includes("среднийчек")
    ) {
      return "avg_check";
    }

    if (normalized === "%dt" || normalized === "dt") {
      return "dt_percent";
    }

    if (
      normalized === "%киосков" ||
      normalized === "киосков" ||
      normalized === "%kioskov" ||
      normalized === "kioskov" ||
      normalized === "%kiosks" ||
      normalized === "kiosks"
    ) {
      return "kiosks_percent";
    }

    if (normalized === "%dlv" || normalized === "dlv") {
      return "dlv_percent";
    }

    if (normalized === "%c" || normalized === "c") {
      return "c_percent";
    }

    if (normalized.includes("waste") || normalized.includes("wastestate")) {
      return "waste_state";
    }

    return "";
  }

  function getSavedValue(savedData, key, field) {
    const value = savedData?.metrics?.[key]?.[field];

    if (isEmpty(value)) return "";

    return value;
  }

  function getInputHtml({
    field,
    value = "",
    isAutoTarget = false,
    isPercentMetric = false,
  }) {
    const autoAttrs = isAutoTarget
      ? 'data-auto-target-field="true" readonly title="Автоматически из Planning"'
      : "";

    const percentAttrs = isPercentMetric
      ? 'data-percent-input="true" inputmode="decimal" title="Введите процент, например 12 или 12%"'
      : "";

    const finalValue =
      isPercentMetric && !isEmpty(value)
        ? formatPercent(value)
        : value;

    return `
      <input
        type="text"
        data-field="${escapeHtml(field)}"
        value="${escapeHtml(finalValue)}"
        ${autoAttrs}
        ${percentAttrs}
      />
    `;
  }

  function getTextareaHtml({ field, value = "" }) {
    return `
      <textarea
        data-field="${escapeHtml(field)}"
        class="goals-textarea-field"
        rows="4"
      >${escapeHtml(value)}</textarea>
    `;
  }

  function renderGoalsTable(template, savedData = {}) {
    const body = document.getElementById("goalsBody");
    if (!body) return;

    const metrics = template.metrics || [];

    body.innerHTML = metrics
      .map((metric, index) => {
        const key = `metric_${index}`;
        const planKey = getMetricPlanKey(metric);
        const rowData = savedData.metrics?.[key] || {};

        const isWaste = isWasteMetric(metric);
        const isTall =
          metric.includes("Количество") ||
          metric.includes("Waste") ||
          isWaste;

        const isAutoTarget = Boolean(AUTO_TARGET_KEYS[planKey]);
        const isPercentMetric = PERCENT_PLAN_KEYS.has(planKey);

        return `
          <tr
            class="${isTall ? "goals-tall-row" : ""} ${isWaste ? "goals-waste-row" : ""}"
            data-goal-metric-key="${escapeHtml(key)}"
            data-goal-plan-key="${escapeHtml(planKey)}"
            data-goal-percent-row="${isPercentMetric ? "true" : "false"}"
            data-goal-text-row="${isWaste ? "true" : "false"}"
          >
            <td class="goals-metric-name">${escapeHtml(metric)}</td>

            <td>
              ${
                isWaste
                  ? getTextareaHtml({
                      field: "previous",
                      value: rowData.previous || "",
                    })
                  : getInputHtml({
                      field: "previous",
                      value: rowData.previous || "",
                      isPercentMetric,
                    })
              }
            </td>

            <td>
              ${
                isWaste
                  ? getTextareaHtml({
                      field: "target",
                      value: getSavedValue(savedData, key, "target"),
                    })
                  : getInputHtml({
                      field: "target",
                      value: isAutoTarget
                        ? ""
                        : getSavedValue(savedData, key, "target"),
                      isAutoTarget,
                      isPercentMetric,
                    })
              }
            </td>

            <td>
              ${
                isWaste
                  ? getTextareaHtml({
                      field: "current",
                      value: rowData.current || "",
                    })
                  : getInputHtml({
                      field: "current",
                      value: rowData.current || "",
                      isPercentMetric,
                    })
              }
            </td>

            <td>
              ${
                isWaste
                  ? getTextareaHtml({
                      field: "percent",
                      value: rowData.percent || "",
                    })
                  : getInputHtml({
                      field: "percent",
                      value: rowData.percent || "",
                      isPercentMetric: true,
                    })
              }
            </td>

            <td>
              <textarea data-field="reason">${escapeHtml(rowData.reason || "")}</textarea>
            </td>
          </tr>
        `;
      })
      .join("");

     document.getElementById("goalPriority1").value =
        savedData.priorities?.priority1 || "";

     document.getElementById("goalPriority2").value =
        savedData.priorities?.priority2 || "";

     document.getElementById("goalPriority3").value =
        savedData.priorities?.priority3 || "";

     renderPriorityOptions(template, savedData);
     bindPriorityEvents(template);
     bindGoalsEvents();
     initGoalsTextareaAutoResize();
     updateGoalsPercentCache();

    const progressText = document.getElementById("checklistProgressText");
    if (progressText) progressText.textContent = "Цели";

    ensureGoalsPlanStatus();
  }

  function bindGoalsEvents() {
    const body = document.getElementById("goalsBody");
    if (!body || body.dataset.goalsPercentEventsBound === "true") return;

    body.dataset.goalsPercentEventsBound = "true";

    body.addEventListener(
      "blur",
      (event) => {
        const input = event.target;

        if (!input.matches("[data-percent-input='true']")) return;

        input.value = formatPercent(input.value);
        updateGoalsPercentCache();
      },
      true
    );

    body.addEventListener("input", (event) => {
      const input = event.target;

      if (!input.matches("[data-percent-input='true']")) return;

      input.value = input.value
        .replace(/[^\d.,%]/g, "")
        .replace(/%{2,}/g, "%");

      updateGoalsPercentCache();
    });
  }

  function ensureGoalsPlanStatus() {
    const table = document.getElementById("goalsTable");
    if (!table) return;

    const status = document.getElementById("goalsDailyPlanStatus");
    if (status) return;

    table.insertAdjacentHTML(
      "beforebegin",
      `
        <div class="goals-plan-sync" id="goalsDailyPlanStatus" data-status="loading">
          План из Planning: загрузка...
        </div>
      `
    );
  }

  function setPlanStatus(text, type = "default") {
    ensureGoalsPlanStatus();

    const status = document.getElementById("goalsDailyPlanStatus");
    if (!status) return;

    status.textContent = text;
    status.dataset.status = type;
  }

  function getSupabaseClient(context = {}) {
    const candidates = [
      context.supabase,
      context.supabaseClient,
      context.client,
      window.supabaseClient,
      window.SupabaseClient,
      window.APP_SUPABASE_CLIENT,
      window.db,
      window.supabase,
    ];

    return (
      candidates.find((client) => client && typeof client.from === "function") ||
      null
    );
  }

  function getRestaurantId(context = {}) {
    return (
      context.restaurantId ||
      context.restaurant_id ||
      context.session?.restaurant_id ||
      context.profile?.restaurant_id ||
      window.currentRestaurantId ||
      window.restaurantId ||
      window.APP_RESTAURANT_ID ||
      localStorage.getItem("restaurant_id") ||
      localStorage.getItem("restaurantId") ||
      ""
    );
  }

  function getChecklistDate(context = {}) {
    const fromContext =
      context.date ||
      context.currentDate ||
      context.checklistDate ||
      context.checklist_date ||
      context.session?.checklist_date ||
      window.currentChecklistDate ||
      window.checklistDate;

    if (fromContext) return fromContext;

    const selectors = [
      "#checklistDateInput",
      "#checklistDate",
      "[data-checklist-date]",
      ".checklist-date-input",
      'input[type="date"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element?.value) {
        return element.value;
      }
    }

    return "";
  }

  function clearAutoTargetCells() {
    document.querySelectorAll("[data-goal-plan-key]").forEach((row) => {
      const planKey = row.dataset.goalPlanKey;
      if (!AUTO_TARGET_KEYS[planKey]) return;

      const input = row.querySelector("[data-field='target']");
      if (!input) return;

      input.value = "";
      delete input.dataset.autoTargetLoaded;
    });
  }

  function setTargetValue(planKey, value) {
    const row = document.querySelector(`[data-goal-plan-key="${planKey}"]`);
    if (!row) return false;

    const input = row.querySelector("[data-field='target']");
    if (!input) return false;

    input.value = formatNumber(value);
    input.dataset.autoTargetLoaded = "true";

    return true;
  }

  function applyDailyPlanToGoals(plan) {
    let appliedCount = 0;

    if (setTargetValue("sales", plan.salesPlan)) {
      appliedCount += 1;
    }

    if (setTargetValue("gc", plan.gcPlan)) {
      appliedCount += 1;
    }

    if (setTargetValue("avg_check", plan.avgCheckPlan)) {
      appliedCount += 1;
    }

    return appliedCount;
  }

  async function loadAndApplyDailyPlan(context = {}) {
    const currentToken = ++planLoadToken;

    clearAutoTargetCells();

    if (!window.GoalsDailyPlansApi) {
      setPlanStatus(
        "План из Planning: goals-daily-plans-api.js не подключен",
        "error"
      );
      return;
    }

    const supabase = getSupabaseClient(context);
    const restaurantId = getRestaurantId(context);
    const date = getChecklistDate(context);

    if (!supabase) {
      setPlanStatus("План из Planning: Supabase client не найден", "error");
      return;
    }

    if (!restaurantId) {
      setPlanStatus("План из Planning: restaurant_id не найден", "error");
      return;
    }

    if (!date) {
      setPlanStatus("План из Planning: дата не выбрана", "error");
      return;
    }

    try {
      setPlanStatus("План из Planning: загружается...", "loading");

      const plan = await window.GoalsDailyPlansApi.getDailyPlanByDate({
        supabase,
        restaurantId,
        date,
      });

      if (currentToken !== planLoadToken) return;

      const hasPlan =
        Number(plan.salesPlan) ||
        Number(plan.gcPlan) ||
        Number(plan.avgCheckPlan);

      if (!hasPlan) {
        setPlanStatus(`План из Planning: на ${date} данных нет`, "empty");
        return;
      }

      const appliedCount = applyDailyPlanToGoals(plan);

      setPlanStatus(
        `План из Planning: загружено ${appliedCount} цели`,
        "success"
      );
    } catch (error) {
      if (currentToken !== planLoadToken) return;

      console.error("Ошибка применения daily_plans:", error);
      setPlanStatus("План из Planning: ошибка загрузки", "error");
    }
  }

  window.initChecklistGoalsTab = async function initChecklistGoalsTab(
    context = {}
  ) {
    const body = document.getElementById("goalsBody");

    activeContext = {
      ...activeContext,
      ...context,
    };

    if (body) {
      body.innerHTML = `
        <tr>
          <td colspan="6">Загрузка...</td>
        </tr>
      `;
    }

    try {
      const template = await loadGoalsTemplate();

      renderGoalsTable(template, context.data || {});
      await loadAndApplyDailyPlan(activeContext);
    } catch (error) {
      console.error(error);

      if (body) {
        body.innerHTML = `
          <tr>
            <td colspan="6">Ошибка загрузки данных вкладки.</td>
          </tr>
        `;
      }
    }
  };

  window.saveChecklistGoalsTab = function saveChecklistGoalsTab() {
    const result = {
      metrics: {},
      priorities: {
        priority1: document.getElementById("goalPriority1")?.value || "",
        priority2: document.getElementById("goalPriority2")?.value || "",
        priority3: document.getElementById("goalPriority3")?.value || "",
      },
    };

    document.querySelectorAll("[data-goal-metric-key]").forEach((row) => {
      const key = row.dataset.goalMetricKey;
      const isPercentRow = row.dataset.goalPercentRow === "true";
      const isTextRow = row.dataset.goalTextRow === "true";

      function readField(field) {
        const input = row.querySelector(`[data-field='${field}']`);
        if (!input) return "";

        if (isTextRow) {
          return input.value || "";
        }

        if (isPercentRow && ["previous", "target", "current"].includes(field)) {
          return formatPercent(input.value);
        }

        if (field === "percent") {
          return formatPercent(input.value);
        }

        return input.value || "";
      }

      result.metrics[key] = {
        previous: readField("previous"),
        target: readField("target"),
        current: readField("current"),
        percent: readField("percent"),
        reason: row.querySelector("[data-field='reason']")?.value || "",
      };
    });

    return result;
  };

  function getEmptyPercentTargets() {
    return {
      dtPercent: 0,
      kiosksPercent: 0,
      dlvPercent: 0,
      cPercent: 0,
    };
  }

  function readPercentTargetsFromDom() {
    const result = getEmptyPercentTargets();
    let foundRows = false;

    document.querySelectorAll("[data-goal-plan-key]").forEach((row) => {
      const planKey = row.dataset.goalPlanKey;

      if (
        planKey !== "dt_percent" &&
        planKey !== "kiosks_percent" &&
        planKey !== "dlv_percent" &&
        planKey !== "c_percent"
      ) {
        return;
      }

      foundRows = true;

      const target = row.querySelector("[data-field='target']")?.value || "";
      const value = toNumber(target);

      if (planKey === "dt_percent") result.dtPercent = value;
      if (planKey === "kiosks_percent") result.kiosksPercent = value;
      if (planKey === "dlv_percent") result.dlvPercent = value;
      if (planKey === "c_percent") result.cPercent = value;
    });

    return {
      foundRows,
      values: result,
    };
  }

  function updateGoalsPercentCache() {
    const domResult = readPercentTargetsFromDom();

    if (!domResult.foundRows) {
      return window.ChecklistGoalsPercentCache || getEmptyPercentTargets();
    }

    window.ChecklistGoalsPercentCache = domResult.values;

    window.dispatchEvent(
      new CustomEvent("checklist:goals-percent-changed", {
        detail: domResult.values,
      })
    );

    return domResult.values;
  }

  window.ChecklistGoals = {
    reloadDailyPlan(context = {}) {
      activeContext = {
        ...activeContext,
        ...context,
      };

      return loadAndApplyDailyPlan(activeContext);
    },

    getPercentTargets() {
      const domResult = readPercentTargetsFromDom();

      if (domResult.foundRows) {
        window.ChecklistGoalsPercentCache = domResult.values;
        return domResult.values;
      }

      return window.ChecklistGoalsPercentCache || getEmptyPercentTargets();
    },

    updatePercentCache() {
      return updateGoalsPercentCache();
    },
  };

  if (!window.__checklistGoalsDateListenerBound) {
    window.__checklistGoalsDateListenerBound = true;

    window.addEventListener("checklist:date-changed", (event) => {
      const nextDate =
        event.detail?.date ||
        event.detail?.checklistDate ||
        event.detail?.checklist_date ||
        "";

      if (!nextDate) return;

      activeContext = {
        ...activeContext,
        date: nextDate,
        checklistDate: nextDate,
      };

      loadAndApplyDailyPlan(activeContext);
    });
  }
})();


/* =========================
   GOALS TEXTAREA AUTO HEIGHT
========================= */

function resizeGoalsTextarea(textarea) {
  if (!textarea) return;

  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function initGoalsTextareaAutoResize() {
  const textareas = document.querySelectorAll(
    ".goals-tab textarea, .goals-excel-table textarea, .goals-priority-input, textarea[data-goals-field], textarea[data-goal-field]"
  );

  textareas.forEach((textarea) => {
    resizeGoalsTextarea(textarea);
  });
}

document.addEventListener("input", (event) => {
  const textarea = event.target;

  if (
    textarea.matches &&
    textarea.matches(
      ".goals-tab textarea, .goals-excel-table textarea, .goals-priority-input, textarea[data-goals-field], textarea[data-goal-field]"
    )
  ) {
    resizeGoalsTextarea(textarea);
  }
});

setTimeout(initGoalsTextareaAutoResize, 0);
setTimeout(initGoalsTextareaAutoResize, 300);
setTimeout(initGoalsTextareaAutoResize, 800);

window.addEventListener("checklist:date-changed", () => {
  setTimeout(initGoalsTextareaAutoResize, 300);
});