(function () {
  function openPdfInNewTab(pdfPath) {
    window.open(pdfPath, "_blank", "noopener");
  }

  function restorePrintButton(button, originalText) {
    if (!button) return;

    button.disabled = false;
    button.textContent = originalText;
  }

  function printPdf(pdfPath, button) {
    if (!pdfPath) return;

    const originalText = button?.textContent || "Печать";

    if (button) {
      button.disabled = true;
      button.textContent = "Подготовка...";
    }

    const iframe = document.createElement("iframe");

    iframe.setAttribute("aria-hidden", "true");

    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    let completed = false;

    function removeIframe() {
      setTimeout(() => {
        iframe.remove();
      }, 2000);
    }

    function fallbackOpen() {
      openPdfInNewTab(pdfPath);
    }

    const loadTimeout = setTimeout(() => {
      if (completed) return;

      completed = true;

      console.warn(
        "PDF не успел загрузиться для автоматической печати."
      );

      fallbackOpen();
      removeIframe();
      restorePrintButton(button, originalText);
    }, 7000);

    iframe.addEventListener("load", () => {
      if (completed) return;

      completed = true;
      clearTimeout(loadTimeout);

      setTimeout(() => {
        try {
          const pdfWindow = iframe.contentWindow;

          if (!pdfWindow) {
            throw new Error("Не удалось получить окно PDF.");
          }

          pdfWindow.focus();
          pdfWindow.print();
        } catch (error) {
          console.error(
            "Не удалось автоматически открыть печать PDF:",
            error
          );

          fallbackOpen();
        } finally {
          removeIframe();
          restorePrintButton(button, originalText);
        }
      }, 900);
    });

    iframe.src = pdfPath;

    document.body.appendChild(iframe);
  }

  function bindPrintButtons(root) {
    const buttons = root.querySelectorAll(
      "[data-area-checklist-print]"
    );

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const pdfPath =
          button.dataset.areaChecklistPrint || "";

        printPdf(pdfPath, button);
      });
    });
  }

  function initAreaChecklistsPage() {
    const root = document.querySelector(
      ".area-checklists-page"
    );

    if (!root) return;

    bindPrintButtons(root);
  }

  window.initAreaChecklistsPage =
    initAreaChecklistsPage;
})();