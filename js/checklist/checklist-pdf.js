(function () {
  const ALL_TABS = [
    {
      key: "preparation",
      title: "Подготовка к смене",
      rootSelector: ".preparation-tab",
      buttonText: "Подготовка к смене",
    },
    {
      key: "goals",
      title: "Цели и приоритеты",
      rootSelector: ".goals-tab",
      buttonText: "Цели и приоритеты",
    },
    {
      key: "during-shift",
      title: "В течение смены",
      rootSelector: ".during-shift-tab, .during-tab, .during-shift",
      buttonText: "В течение смены",
    },
    {
      key: "hourly",
      title: "Почасовая",
      rootSelector: ".hourly-tab",
      buttonText: "Почасовая",
    },
    {
      key: "after-shift",
      title: "Итоги дня / После смены",
      rootSelector: ".after-shift-tab, .after-tab, .after-shift",
      buttonText: "Итоги дня",
    },
  ];

  const PDF_PAGES = [
    {
      key: "preparation",
      title: "Подготовка к смене",
      rootSelector: ".preparation-tab",
      buttonText: "Подготовка к смене",
    },
    {
      key: "goals",
      title: "Цели и приоритеты",
      rootSelector: ".goals-tab",
      buttonText: "Цели и приоритеты",
    },
    {
      key: "during-shift",
      title: "В течение смены",
      rootSelector: ".during-shift-tab",
      buttonText: "В течение смены",
    },
    {
      key: "hourly",
      title: "Почасовая",
      rootSelector: ".hourly-tab",
      buttonText: "Почасовая",
    },
    {
      key: "after-shift",
      title: "Итоги дня / После смены",
      rootSelector: ".after-shift-tab",
      buttonText: "Итоги дня",
    },
  ];

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);

    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    return Boolean(
      element.offsetWidth ||
      element.offsetHeight ||
      element.getClientRects().length
    );
  }

  function findVisibleElement(selector) {
    const elements = Array.from(document.querySelectorAll(selector));
    return elements.find(isVisible) || elements[0] || null;
  }

  async function waitForElement(selector, timeout = 9000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeout) {
      const element = findVisibleElement(selector);

      if (element) return element;

      await sleep(150);
    }

    return null;
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getActiveTabKey() {
    return (
      document.querySelector(".checklist-tab.active")?.dataset.checklistTab ||
      document.querySelector("[data-checklist-tab].active")?.dataset.checklistTab ||
      "preparation"
    );
  }

  function getAllTabButtons() {
    return Array.from(
      document.querySelectorAll(
        [
          "[data-checklist-tab]",
          "[data-tab]",
          "[data-tab-key]",
          ".checklist-tab",
          ".checklist-tab-btn",
          ".tab-btn",
          "button",
        ].join(", ")
      )
    ).filter((button) => normalizeText(button.textContent));
  }

  function findTabButton(page) {
    const buttons = getAllTabButtons();

    const exactDataButton = buttons.find((button) => {
      return (
        button.dataset.checklistTab === page.key ||
        button.dataset.tab === page.key ||
        button.dataset.tabKey === page.key ||
        button.dataset.target === page.key
      );
    });

    if (exactDataButton) return exactDataButton;

    const pageButtonText = normalizeText(page.buttonText);

    return buttons.find((button) => {
      return normalizeText(button.textContent).includes(pageButtonText);
    });
  }

  async function openTab(page) {
    const button = findTabButton(page);

    if (!button) {
      console.warn(`PDF export: вкладка не найдена: ${page.key}`);
      return null;
    }

    button.click();

    await sleep(700);

    return waitForElement(page.rootSelector);
  }

  async function openTabByKey(key) {
    const page = ALL_TABS.find((item) => item.key === key);
    if (!page) return null;

    return openTab(page);
  }

  function getInputBySelectors(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element && "value" in element && element.value) {
        return element.value;
      }
    }

    return "";
  }

  function formatDateText(value) {
    const raw = String(value || "").trim();

    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (isoMatch) {
      return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
    }

    return raw;
  }

  function getChecklistDateRaw() {
    return (
      getInputBySelectors([
        "#checklistDateInput",
        "#checklistDate",
        "[data-checklist-date]",
        ".checklist-date-input",
        'input[type="date"]',
      ]) ||
      window.currentChecklistDate ||
      window.checklistDate ||
      ""
    );
  }

  function getChecklistDateText() {
    return formatDateText(getChecklistDateRaw());
  }

  function getManagers() {
    return {
      morning:
        getInputBySelectors([
          "#checklistMorningManager",
          "#morningManager",
          "#morning_manager",
          "[name='morning_manager']",
          "[name='morningManager']",
          "[data-manager='morning']",
          "[data-field='morning_manager']",
        ]),

      evening:
        getInputBySelectors([
          "#checklistEveningManager",
          "#eveningManager",
          "#evening_manager",
          "[name='evening_manager']",
          "[name='eveningManager']",
          "[data-manager='evening']",
          "[data-field='evening_manager']",
        ]),

      night:
        getInputBySelectors([
          "#checklistNightManager",
          "#nightManager",
          "#night_manager",
          "[name='night_manager']",
          "[name='nightManager']",
          "[data-manager='night']",
          "[data-field='night_manager']",
        ]),
    };
  }

  function getImageSrc(selectors) {
    for (const selector of selectors) {
      const image = document.querySelector(selector);

      if (image?.src) {
        return image.src;
      }
    }

    return "";
  }

  function freezeFormControls(root) {
    root.querySelectorAll("input").forEach((input) => {
      const div = document.createElement("div");

      if (input.type === "checkbox") {
        div.className = "pdf-control-value pdf-checkbox-value";
        div.textContent = input.checked ? "✓" : "";
      } else {
        div.className = "pdf-control-value";
        div.textContent = input.value || "";
      }

      input.replaceWith(div);
    });

    root.querySelectorAll("textarea").forEach((textarea) => {
      const div = document.createElement("div");
      div.className = "pdf-control-value";
      div.textContent = textarea.value || "";
      textarea.replaceWith(div);
    });

    root.querySelectorAll("select").forEach((select) => {
      const div = document.createElement("div");
      div.className = "pdf-control-value";

      const selectedOption = select.options[select.selectedIndex];
      div.textContent = selectedOption?.textContent || select.value || "";

      select.replaceWith(div);
    });

    root.querySelectorAll("button").forEach((button) => {
      button.remove();
    });
  }

  function cleanForPdf(root) {
    root.querySelectorAll(
      [
        ".preparation-actions",
        ".during-shift-actions",
        ".after-shift-actions",
        "#goalsDailyPlanStatus",
        "#goalsPreviousDayStatus",
        "#hourlyPlanSyncStatus",
        ".goals-plan-sync",
        ".goals-previous-sync",
        ".hourly-plan-sync",
        ".hourly-loading",
        ".checklist-loading",
        ".goals-priority-picker",
        ".loading",
      ].join(", ")
    ).forEach((element) => element.remove());

    root.querySelectorAll("*").forEach((element) => {
      element.style.overflow = "visible";
      element.style.maxHeight = "none";
    });

    freezeFormControls(root);

    return root;
  }

  function buildTopHeaderHtml() {
    const date = getChecklistDateText();
    const managers = getManagers();

    const leftLogoSrc = getImageSrc([".checklist-logo-left img"]);
    const rightLogoSrc = getImageSrc([".checklist-header-right img"]);

    return `
      <div class="pdf-sheet-header">
        <div class="pdf-logo-left">
          ${leftLogoSrc ? `<img src="${escapeHtml(leftLogoSrc)}" alt="I'M" />` : ""}
        </div>

        <div class="pdf-header-center">
          <h2>ЖЕЛАЕМ УДАЧНОЙ СМЕНЫ !</h2>

          <div class="pdf-managers-row">
            <div class="pdf-manager-item">
              Менеджер утро:
              <span class="pdf-line-value">${escapeHtml(managers.morning)}</span>
            </div>

            <div class="pdf-manager-item">
              вечер:
              <span class="pdf-line-value">${escapeHtml(managers.evening)}</span>
            </div>

            <div class="pdf-manager-item">
              ночь:
              <span class="pdf-line-value">${escapeHtml(managers.night)}</span>
            </div>
          </div>
        </div>

        <div class="pdf-header-right">
          <div class="pdf-date-line">
            <span>Дата</span>
            <span class="pdf-line-value">${escapeHtml(date)}</span>
          </div>

          <div class="pdf-logo-right">
            ${rightLogoSrc ? `<img src="${escapeHtml(rightLogoSrc)}" alt="I'M" />` : ""}
          </div>
        </div>
      </div>
    `;
  }

  function getStylesheetLinksHtml() {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map((link) => {
        if (!link.href) return "";
        return `<link rel="stylesheet" href="${escapeHtml(link.href)}">`;
      })
      .join("\n");
  }

  function buildLoadingHtml() {
    return `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <title>Подготовка PDF</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 32px;
          }
        </style>
      </head>
      <body>
        <h2>Готовим PDF...</h2>
        <p>Не закрывайте это окно.</p>
      </body>
      </html>
    `;
  }

  function buildPrintHtml(pagesHtml) {
    const date = getChecklistDateText();

    return `
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <title>Чек-лист смены ${escapeHtml(date)}</title>
        ${getStylesheetLinksHtml()}
      </head>

      <body class="pdf-print-body">
        ${pagesHtml.join("\n")}

        <script>
          window.onload = function () {
            setTimeout(function () {
              window.focus();
              window.print();
            }, 900);
          };
        <\/script>
      </body>
      </html>
    `;
  }

  async function prepareTabBeforeClone(page) {
      await sleep(500);

      if (page.key === "preparation") {
        return;
      }

      if (page.key === "goals") {
      const date = getChecklistDateRaw();

      if (
        window.ChecklistGoals &&
        typeof window.ChecklistGoals.reloadDailyPlan === "function"
      ) {
        await window.ChecklistGoals.reloadDailyPlan({
          date,
          checklistDate: date,
        });
      }

      if (
        window.ChecklistGoalsPreviousDaySync &&
        typeof window.ChecklistGoalsPreviousDaySync.syncPreviousDayGoals === "function"
      ) {
        await window.ChecklistGoalsPreviousDaySync.syncPreviousDayGoals({
          date,
          checklistDate: date,
        });
      }

      if (
        window.ChecklistGoalsHourlySync &&
        typeof window.ChecklistGoalsHourlySync.syncGoalsWithHourly === "function"
      ) {
        await window.ChecklistGoalsHourlySync.syncGoalsWithHourly({
          date,
          checklistDate: date,
        });
      }

      if (
        window.ChecklistGoalsHourlySync &&
        typeof window.ChecklistGoalsHourlySync.recalculateAllGoalPercents === "function"
      ) {
        window.ChecklistGoalsHourlySync.recalculateAllGoalPercents();
      }

      await sleep(900);
      return;
      }

      if (page.key === "during-shift") {
        await sleep(500);
        return;
      }

     if (page.key === "hourly") {
      if (
        window.ChecklistHourlyNightRules &&
        typeof window.ChecklistHourlyNightRules.applyNightRules === "function"
      ) {
        window.ChecklistHourlyNightRules.applyNightRules();
      }

      if (
        window.ChecklistHourlyCalculations &&
        typeof window.ChecklistHourlyCalculations.recalculateAll === "function"
      ) {
        window.ChecklistHourlyCalculations.recalculateAll();
      }

      if (
        window.ChecklistGoalsHourlySync &&
        typeof window.ChecklistGoalsHourlySync.updateHourlySummaryCacheFromDom === "function"
      ) {
        window.ChecklistGoalsHourlySync.updateHourlySummaryCacheFromDom({
          date: getChecklistDateRaw(),
          checklistDate: getChecklistDateRaw(),
        });
      }

      await sleep(900);
      return;
       }
      if (page.key === "after-shift") {
        await sleep(500);
        return;
      } 
  }

  async function collectPageHtml(page, options = {}) {
    const includeHeader = Boolean(options.includeHeader);
    const headerHtml = includeHeader ? buildTopHeaderHtml() : "";

    const root = await openTab(page);

    if (!root) {
      return `
        <section class="pdf-page pdf-page--${escapeHtml(page.key)}">
          ${headerHtml}

          <div class="pdf-content">
            <div style="border:1px solid #000;padding:16px;">
              Не удалось загрузить раздел: ${escapeHtml(page.title)}
            </div>
          </div>
        </section>
      `;
    }

    await prepareTabBeforeClone(page);

   const clonedRoot = root.cloneNode(true);
   cleanForPdf(clonedRoot);

    return `
      <section class="pdf-page pdf-page--${escapeHtml(page.key)}">
        ${headerHtml}

        <div class="pdf-content">
          ${clonedRoot.outerHTML}
        </div>
      </section>
    `;
  }

  function setButtonLoading(button, isLoading) {
    if (!button) return;

    button.disabled = isLoading;
    button.textContent = isLoading ? "Готовим PDF..." : "Скачать PDF";
  }

  async function exportChecklistToPdf() {
    const button = document.getElementById("checklistPdfBtn");
    const oldActiveTab = getActiveTabKey();

    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      alert("Браузер заблокировал окно печати. Разреши pop-up для сайта.");
      return;
    }

    try {
      setButtonLoading(button, true);

      printWindow.document.open();
      printWindow.document.write(buildLoadingHtml());
      printWindow.document.close();

      const pagesHtml = [];

      for (let index = 0; index < PDF_PAGES.length; index += 1) {
        const page = PDF_PAGES[index];

        const html = await collectPageHtml(page, {
          includeHeader: index === 0,
        });

        pagesHtml.push(html);
      }

      if (oldActiveTab) {
        await openTabByKey(oldActiveTab);
      }

      printWindow.document.open();
      printWindow.document.write(buildPrintHtml(pagesHtml));
      printWindow.document.close();
    } catch (error) {
      console.error("Checklist PDF export error:", error);

      printWindow.document.open();
      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <title>Ошибка PDF</title>
        </head>
        <body style="font-family: Arial, sans-serif; padding: 32px;">
          <h2>Не удалось подготовить PDF</h2>
          <p>Проверь Console.</p>
        </body>
        </html>
      `);
      printWindow.document.close();
    } finally {
      setButtonLoading(button, false);
    }
  }

  function createPdfButton() {
    const button = document.createElement("button");
    button.id = "checklistPdfBtn";
    button.type = "button";
    button.className = "checklist-pdf-btn";
    button.textContent = "Скачать PDF";

    return button;
  }

  function placePdfButton(button) {
    const headerRight = document.querySelector(".checklist-header-right");

    if (headerRight) {
      const logo = headerRight.querySelector("img");

      if (logo) {
        headerRight.insertBefore(button, logo);
      } else {
        headerRight.appendChild(button);
      }

      return;
    }

    const dateInput =
      document.querySelector("#checklistDateInput") ||
      document.querySelector("#checklistDate") ||
      document.querySelector('input[type="date"]');

    if (dateInput?.parentElement) {
      dateInput.parentElement.appendChild(button);
      return;
    }

    const header =
      document.querySelector(".checklist-sheet-header") ||
      document.querySelector(".checklist-header") ||
      document.querySelector(".checklist-top") ||
      document.querySelector(".checklist-grid") ||
      document.body;

    header.appendChild(button);
  }

  function ensurePdfButton() {
    let button = document.getElementById("checklistPdfBtn");

    if (!button) {
      button = createPdfButton();
      placePdfButton(button);
    }
  }

  function bindClickByDelegation() {
    if (window.__checklistPdfClickBound) return;
    window.__checklistPdfClickBound = true;

    document.addEventListener("click", (event) => {
      const button = event.target.closest("#checklistPdfBtn");

      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      exportChecklistToPdf();
    });
  }

  function start() {
    bindClickByDelegation();

    let attempts = 0;

    const timer = setInterval(() => {
      attempts += 1;
      ensurePdfButton();

      if (document.getElementById("checklistPdfBtn") || attempts >= 60) {
        clearInterval(timer);
      }
    }, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.ChecklistPdfExport = {
    exportChecklistToPdf,
    ensurePdfButton,
  };

  console.log("checklist-pdf.js loaded: split css/js");
})();