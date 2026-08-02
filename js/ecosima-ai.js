(function () {
  const BUCKET = "ecosima-files";
  const TABLE = "ecosima_files";
  const MAX_SOURCE_SIZE = 15 * 1024 * 1024;
  const MAX_IMAGES = 4;

  let templateFile = null;
  let referenceFiles = [];
  let previousInteractionId = null;
  let generatedDataUrl = "";
  let generatedMimeType = "image/jpeg";
  let isGenerating = false;

  function getDb() {
    const db = window.db;

    if (!db?.auth || !db?.storage || !db?.from) {
      throw new Error("Клиент Supabase не найден. Проверьте window.db.");
    }

    return db;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getExt(fileName) {
    const parts = String(fileName || "").split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  }

  function slugifyFileName(name) {
    const ext = getExt(name);
    const randomPart =
      window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);

    return ext
      ? `file-${Date.now()}-${randomPart}.${ext}`
      : `file-${Date.now()}-${randomPart}`;
  }

  function setStatus(message, type) {
    const status = document.getElementById("ecosimaAiStatus");

    if (!status) return;

    status.textContent = message || "";
    status.className = "ecosima-status";

    if (type) {
      status.classList.add(type);
    }
  }

  function setMode(mode) {
    const isAi = mode === "ai";

    const panel = document.getElementById("ecosimaAiPanel");
    const filesBtn = document.getElementById("ecosimaFilesModeBtn");
    const aiBtn = document.getElementById("ecosimaAiModeBtn");
    const refreshBtn = document.getElementById("ecosimaRefreshBtn");

    document
      .querySelectorAll(
        ".ecosima-upload-card, .ecosima-toolbar, .ecosima-files-list"
      )
      .forEach((element) => {
        element.hidden = isAi;
      });

    if (panel) {
      panel.hidden = !isAi;
    }

    if (refreshBtn) {
      refreshBtn.hidden = isAi;
    }

    filesBtn?.classList.toggle("active", !isAi);
    aiBtn?.classList.toggle("active", isAi);

    filesBtn?.setAttribute("aria-selected", String(!isAi));
    aiBtn?.setAttribute("aria-selected", String(isAi));
  }

  function addMessage(role, text, extraClass = "") {
    const messages = document.getElementById("ecosimaAiMessages");

    if (!messages) return null;

    const wrapper = document.createElement("div");

    wrapper.className =
      `ecosima-ai-message ${role} ${extraClass}`.trim();

    if (role !== "user") {
      const avatar = document.createElement("div");

      avatar.className = "ecosima-ai-avatar";
      avatar.textContent = "AI";

      wrapper.appendChild(avatar);
    }

    const bubble = document.createElement("div");

    bubble.className = "ecosima-ai-bubble";
    bubble.textContent = text;

    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);

    messages.scrollTop = messages.scrollHeight;

    return wrapper;
  }

  function renderAttachments() {
    const container = document.getElementById("ecosimaAiAttachments");

    if (!container) return;

    const chips = [];

    if (templateFile) {
      chips.push(`
        <div class="ecosima-ai-file-chip">
          <strong>Шаблон</strong>
          <span>${escapeHtml(templateFile.name)}</span>

          <button
            type="button"
            data-ai-remove-template
            aria-label="Удалить шаблон"
          >
            ✕
          </button>
        </div>
      `);
    }

    referenceFiles.forEach((file, index) => {
      chips.push(`
        <div class="ecosima-ai-file-chip">
          <strong>Фото ${index + 1}</strong>
          <span>${escapeHtml(file.name)}</span>

          <button
            type="button"
            data-ai-remove-reference="${index}"
            aria-label="Удалить фото"
          >
            ✕
          </button>
        </div>
      `);
    });

    container.innerHTML = chips.join("");
  }

  function validateImage(file) {
    if (!file) return false;

    if (!String(file.type || "").startsWith("image/")) {
      setStatus(
        `Файл «${file.name}» не является изображением.`,
        "error"
      );

      return false;
    }

    if (file.size > MAX_SOURCE_SIZE) {
      setStatus(
        `Файл «${file.name}» больше 15 MB.`,
        "error"
      );

      return false;
    }

    return true;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(url);

        reject(
          new Error(
            `Не удалось прочитать изображение «${file.name}».`
          )
        );
      };

      image.src = url;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        resolve(String(reader.result || ""));
      };

      reader.onerror = () => {
        reject(new Error("Не удалось прочитать файл."));
      };

      reader.readAsDataURL(blob);
    });
  }

  async function compressImage(file) {
    const image = await loadImage(file);

    const maxSide = 1280;

    const scale = Math.min(
      1,
      maxSide /
        Math.max(
          image.naturalWidth,
          image.naturalHeight
        )
    );

    const width = Math.max(
      1,
      Math.round(image.naturalWidth * scale)
    );

    const height = Math.max(
      1,
      Math.round(image.naturalHeight * scale)
    );

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      alpha: false
    });

    if (!context) {
      throw new Error(
        "Браузер не поддерживает обработку изображения."
      );
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(
        resolve,
        "image/jpeg",
        0.72
      );
    });

    if (!blob) {
      throw new Error(
        `Не удалось подготовить изображение «${file.name}».`
      );
    }

    const dataUrl = await blobToDataUrl(blob);

    return {
      type: "image",
      mime_type: "image/jpeg",
      data: dataUrl.split(",")[1]
    };
  }

  function dataUrlToFile(dataUrl, fileName) {
    const [meta, base64] = String(dataUrl).split(",");

    const mime =
      meta.match(/data:(.*?);base64/)?.[1] ||
      "image/jpeg";

    const binary = atob(base64 || "");
    const bytes = new Uint8Array(binary.length);

    for (
      let index = 0;
      index < binary.length;
      index += 1
    ) {
      bytes[index] =
        binary.charCodeAt(index);
    }

    return new File(
      [bytes],
      fileName,
      {
        type: mime
      }
    );
  }

  function buildPrompt(
    userPrompt,
    hasTemplate,
    referenceCount
  ) {
    const parts = [
      "Ты профессиональный дизайнер материалов Экосима для ресторана.",
      "Создай готовое плоское изображение, а не фотографию экрана и не мокап.",
      "Все надписи должны быть на русском языке, без орфографических ошибок.",
      "Не добавляй вымышленные логотипы, подписи, цифры и факты.",
      "Текст делай коротким, крупным и хорошо читаемым."
    ];

    if (hasTemplate) {
      parts.push(
        "Первое прикреплённое изображение — строгий шаблон. Сохрани его композицию, цвета, логотип, отступы, расположение фотографий и текстовых блоков. Меняй только содержимое, указанное пользователем."
      );
    }

    if (referenceCount > 0) {
      parts.push(
        `После шаблона прикреплено ${referenceCount} исходных фото. Используй их как реальные материалы «до/после» и не подменяй другими объектами.`
      );
    }

    parts.push(
      "Запрос пользователя:",
      userPrompt.trim()
    );

    return parts.join("\n\n");
  }

  async function getAccessToken() {
    const db = getDb();

    const { data, error } =
      await db.auth.getSession();

    if (error) {
      throw error;
    }

    const token =
      data?.session?.access_token;

    if (!token) {
      throw new Error(
        "Сессия пользователя не найдена. Войдите в систему заново."
      );
    }

    return token;
  }

  async function getCurrentUser() {
    const db = getDb();

    const { data, error } =
      await db.auth.getUser();

    if (error) {
      throw error;
    }

    if (!data?.user) {
      throw new Error(
        "Пользователь не авторизован."
      );
    }

    return data.user;
  }

  async function getRestaurantId() {
    const localId =
      localStorage.getItem("restaurant_id") ||
      localStorage.getItem("restaurantId") ||
      localStorage.getItem(
        "currentRestaurantId"
      );

    if (localId) {
      return String(localId);
    }

    const db = getDb();
    const user = await getCurrentUser();

    const { data, error } = await db
      .from("profiles")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.restaurant_id) {
      throw new Error(
        "Не удалось определить ID ресторана."
      );
    }

    localStorage.setItem(
      "restaurant_id",
      data.restaurant_id
    );

    return String(data.restaurant_id);
  }

  function setBusy(value) {
    isGenerating = value;

    const sendBtn =
      document.getElementById(
        "ecosimaAiSendBtn"
      );

    const newChatBtn =
      document.getElementById(
        "ecosimaAiNewChatBtn"
      );

    if (sendBtn) {
      sendBtn.disabled = value;

      sendBtn.textContent = value
        ? "Создание..."
        : previousInteractionId
          ? "✨ Изменить"
          : "✨ Создать";
    }

    if (newChatBtn) {
      newChatBtn.disabled = value;
    }
  }

  function showGeneratedImage(
    dataUrl,
    mimeType
  ) {
    generatedDataUrl = dataUrl;

    generatedMimeType =
      mimeType || "image/jpeg";

    const image =
      document.getElementById(
        "ecosimaAiGeneratedImage"
      );

    const empty =
      document.getElementById(
        "ecosimaAiPreviewEmpty"
      );

    const downloadBtn =
      document.getElementById(
        "ecosimaAiDownloadBtn"
      );

    const saveBtn =
      document.getElementById(
        "ecosimaAiSaveBtn"
      );

    if (image) {
      image.src = dataUrl;
      image.hidden = false;
    }

    if (empty) {
      empty.hidden = true;
    }

    if (downloadBtn) {
      downloadBtn.disabled = false;
    }

    if (saveBtn) {
      saveBtn.disabled = false;
    }
  }

  async function generateImage() {
    if (isGenerating) return;

    const promptInput =
      document.getElementById(
        "ecosimaAiPrompt"
      );

    const modelInput =
      document.getElementById(
        "ecosimaAiModel"
      );

    const aspectInput =
      document.getElementById(
        "ecosimaAiAspectRatio"
      );

    const sizeInput =
      document.getElementById(
        "ecosimaAiImageSize"
      );

    const userPrompt =
      promptInput?.value?.trim() || "";

    if (!userPrompt) {
      setStatus(
        "Напишите, какую картинку нужно создать.",
        "error"
      );

      promptInput?.focus();
      return;
    }

    if (
      !previousInteractionId &&
      !templateFile &&
      !referenceFiles.length
    ) {
      setStatus(
        "Для первой генерации добавьте шаблон или хотя бы одну фотографию.",
        "error"
      );

      return;
    }

    addMessage("user", userPrompt);

    const loadingMessage = addMessage(
      "assistant",
      "Создаю изображение…",
      "loading"
    );

    setBusy(true);

    setStatus(
      "Подготавливаем изображения и отправляем запрос в Gemini…",
      ""
    );

    try {
      const images = [];

      if (!previousInteractionId) {
        const sourceFiles = [
          ...(templateFile
            ? [templateFile]
            : []),
          ...referenceFiles
        ].slice(0, MAX_IMAGES);

        for (const file of sourceFiles) {
          images.push(
            await compressImage(file)
          );
        }
      }

      const accessToken =
        await getAccessToken();

      const selectedModel =
        modelInput?.value ||
        "gemini-3.1-flash-lite-image";

      const selectedSize =
        selectedModel ===
        "gemini-3.1-flash-lite-image"
          ? "1K"
          : sizeInput?.value || "1K";

      const response = await fetch(
        "/api/ecosima-ai",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${accessToken}`
          },

          body: JSON.stringify({
            prompt: buildPrompt(
              userPrompt,
              Boolean(templateFile),
              referenceFiles.length
            ),

            images,

            previousInteractionId,

            model: selectedModel,

            aspectRatio:
              aspectInput?.value ||
              "16:9",

            imageSize: selectedSize
          })
        }
      );

      const result =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.error ||
          `Ошибка AI-сервера: ${response.status}`
        );
      }

      if (!result.image?.data) {
        throw new Error(
          "Gemini не вернул изображение."
        );
      }

      previousInteractionId =
        result.interactionId ||
        previousInteractionId;

      const mimeType =
        result.image.mimeType ||
        "image/jpeg";

      const dataUrl =
        `data:${mimeType};base64,${result.image.data}`;

      showGeneratedImage(
        dataUrl,
        mimeType
      );

      const bubble =
        loadingMessage?.querySelector(
          ".ecosima-ai-bubble"
        );

      if (bubble) {
        bubble.textContent =
          previousInteractionId
            ? "Готово. Можно написать следующее изменение в этом же диалоге."
            : "Изображение готово.";
      }

      if (promptInput) {
        promptInput.value = "";
      }

      setStatus(
        "Изображение готово.",
        "ok"
      );
    } catch (error) {
      console.error(error);

      const bubble =
        loadingMessage?.querySelector(
          ".ecosima-ai-bubble"
        );

      if (bubble) {
        bubble.textContent =
          `Ошибка: ${error.message}`;
      }

      setStatus(
        error.message ||
        "Ошибка при создании изображения.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  }

  function resetChat() {
    templateFile = null;
    referenceFiles = [];
    previousInteractionId = null;
    generatedDataUrl = "";
    generatedMimeType = "image/jpeg";

    const templateInput =
      document.getElementById(
        "ecosimaAiTemplateInput"
      );

    const referenceInput =
      document.getElementById(
        "ecosimaAiReferenceInput"
      );

    const promptInput =
      document.getElementById(
        "ecosimaAiPrompt"
      );

    const titleInput =
      document.getElementById(
        "ecosimaAiSaveTitle"
      );

    const messages =
      document.getElementById(
        "ecosimaAiMessages"
      );

    const image =
      document.getElementById(
        "ecosimaAiGeneratedImage"
      );

    const empty =
      document.getElementById(
        "ecosimaAiPreviewEmpty"
      );

    const downloadBtn =
      document.getElementById(
        "ecosimaAiDownloadBtn"
      );

    const saveBtn =
      document.getElementById(
        "ecosimaAiSaveBtn"
      );

    if (templateInput) {
      templateInput.value = "";
    }

    if (referenceInput) {
      referenceInput.value = "";
    }

    if (promptInput) {
      promptInput.value = "";
    }

    if (titleInput) {
      titleInput.value = "";
    }

    if (messages) {
      messages.innerHTML = `
        <div class="ecosima-ai-message assistant">
          <div class="ecosima-ai-avatar">
            AI
          </div>

          <div class="ecosima-ai-bubble">
            Новый диалог начат. Добавьте шаблон и фотографии, затем напишите задачу.
          </div>
        </div>
      `;
    }

    if (image) {
      image.src = "";
      image.hidden = true;
    }

    if (empty) {
      empty.hidden = false;
    }

    if (downloadBtn) {
      downloadBtn.disabled = true;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
    }

    renderAttachments();
    setBusy(false);
    setStatus("", "");
  }

  function downloadImage() {
    if (!generatedDataUrl) return;

    const title =
      document
        .getElementById(
          "ecosimaAiSaveTitle"
        )
        ?.value?.trim();

    const extension =
      generatedMimeType.includes("jpeg")
        ? "jpg"
        : "png";

    const safeTitle = (
      title ||
      `ecosima-ai-${Date.now()}`
    )
      .replace(
        /[\\/:*?"<>|]+/g,
        "-"
      )
      .trim();

    const link =
      document.createElement("a");

    link.href = generatedDataUrl;
    link.download =
      `${safeTitle}.${extension}`;

    document.body.appendChild(link);

    link.click();
    link.remove();
  }

  async function saveImage() {
    if (!generatedDataUrl) return;

    const db = getDb();

    const saveBtn =
      document.getElementById(
        "ecosimaAiSaveBtn"
      );

    const titleInput =
      document.getElementById(
        "ecosimaAiSaveTitle"
      );

    const categoryInput =
      document.getElementById(
        "ecosimaAiSaveCategory"
      );

    const title =
      titleInput?.value?.trim();

    if (!title) {
      setStatus(
        "Введите название перед сохранением.",
        "error"
      );

      titleInput?.focus();
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent =
      "Сохранение...";

    setStatus(
      "Сохраняем изображение в Экосима…",
      ""
    );

    let filePath = null;

    try {
      const user =
        await getCurrentUser();

      const restaurantId =
        await getRestaurantId();

      const extension =
        generatedMimeType.includes("jpeg")
          ? "jpg"
          : "png";

      const fileName =
        `${title}.${extension}`;

      const generatedFile =
        dataUrlToFile(
          generatedDataUrl,
          fileName
        );

      const safeName =
        slugifyFileName(fileName);

      filePath =
        `${restaurantId}/${safeName}`;

      const { error: uploadError } =
        await db.storage
          .from(BUCKET)
          .upload(
            filePath,
            generatedFile,
            {
              cacheControl: "3600",
              upsert: false,
              contentType:
                generatedFile.type
            }
          );

      if (uploadError) {
        throw uploadError;
      }

      const { error: insertError } =
        await db
          .from(TABLE)
          .insert({
            restaurant_id:
              restaurantId,

            title,

            description:
              "Создано с помощью AI-дизайнера Экосима",

            category:
              categoryInput?.value ||
              "Другое",

            file_name: fileName,
            file_path: filePath,

            mime_type:
              generatedFile.type,

            file_size:
              generatedFile.size,

            file_ext:
              extension,

            uploaded_by:
              user.id
          });

      if (insertError) {
        throw insertError;
      }

      setStatus(
        "Изображение сохранено в Экосима.",
        "ok"
      );

      document
        .getElementById(
          "ecosimaRefreshBtn"
        )
        ?.click();
    } catch (error) {
      console.error(error);

      if (filePath) {
        try {
          await db.storage
            .from(BUCKET)
            .remove([filePath]);
        } catch (removeError) {
          console.warn(removeError);
        }
      }

      setStatus(
        error.message ||
        "Не удалось сохранить изображение.",
        "error"
      );
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent =
        "Сохранить в Экосима";
    }
  }

  function initAi() {
    const page =
      document.querySelector(
        ".ecosima-page"
      );

    if (
      !page ||
      page.dataset.aiInitialized ===
        "true"
    ) {
      return;
    }

    page.dataset.aiInitialized =
      "true";

    const filesModeBtn =
      document.getElementById(
        "ecosimaFilesModeBtn"
      );

    const aiModeBtn =
      document.getElementById(
        "ecosimaAiModeBtn"
      );

    const templateInput =
      document.getElementById(
        "ecosimaAiTemplateInput"
      );

    const referenceInput =
      document.getElementById(
        "ecosimaAiReferenceInput"
      );

    const attachments =
      document.getElementById(
        "ecosimaAiAttachments"
      );

    const sendBtn =
      document.getElementById(
        "ecosimaAiSendBtn"
      );

    const promptInput =
      document.getElementById(
        "ecosimaAiPrompt"
      );

    const newChatBtn =
      document.getElementById(
        "ecosimaAiNewChatBtn"
      );

    const downloadBtn =
      document.getElementById(
        "ecosimaAiDownloadBtn"
      );

    const saveBtn =
      document.getElementById(
        "ecosimaAiSaveBtn"
      );

    const modelInput =
      document.getElementById(
        "ecosimaAiModel"
      );

    const sizeInput =
      document.getElementById(
        "ecosimaAiImageSize"
      );

    filesModeBtn?.addEventListener(
      "click",
      () => {
        setMode("files");
      }
    );

    aiModeBtn?.addEventListener(
      "click",
      () => {
        setMode("ai");
      }
    );

    templateInput?.addEventListener(
      "change",
      () => {
        const file =
          templateInput.files?.[0] ||
          null;

        templateFile =
          validateImage(file)
            ? file
            : null;

        renderAttachments();

        if (templateFile) {
          setStatus(
            "Шаблон добавлен.",
            "ok"
          );
        }
      }
    );

    referenceInput?.addEventListener(
      "change",
      () => {
        const selected = Array.from(
          referenceInput.files || []
        ).filter(validateImage);

        const allowedCount =
          templateFile ? 3 : 4;

        referenceFiles = [
          ...referenceFiles,
          ...selected
        ].slice(0, allowedCount);

        referenceInput.value = "";

        renderAttachments();

        if (selected.length) {
          setStatus(
            "Фотографии добавлены.",
            "ok"
          );
        }
      }
    );

    attachments?.addEventListener(
      "click",
      (event) => {
        const removeTemplateBtn =
          event.target.closest(
            "[data-ai-remove-template]"
          );

        const removeReferenceBtn =
          event.target.closest(
            "[data-ai-remove-reference]"
          );

        if (removeTemplateBtn) {
          templateFile = null;

          if (templateInput) {
            templateInput.value = "";
          }

          renderAttachments();
        }

        if (removeReferenceBtn) {
          const index = Number(
            removeReferenceBtn.dataset
              .aiRemoveReference
          );

          referenceFiles.splice(
            index,
            1
          );

          renderAttachments();
        }
      }
    );

    sendBtn?.addEventListener(
      "click",
      generateImage
    );

    newChatBtn?.addEventListener(
      "click",
      resetChat
    );

    downloadBtn?.addEventListener(
      "click",
      downloadImage
    );

    saveBtn?.addEventListener(
      "click",
      saveImage
    );

    promptInput?.addEventListener(
      "keydown",
      (event) => {
        if (
          (event.ctrlKey ||
            event.metaKey) &&
          event.key === "Enter"
        ) {
          event.preventDefault();
          generateImage();
        }
      }
    );

    modelInput?.addEventListener(
      "change",
      () => {
        const isLite =
          modelInput.value ===
          "gemini-3.1-flash-lite-image";

        if (sizeInput) {
          sizeInput.value = isLite
            ? "1K"
            : sizeInput.value;

          sizeInput.disabled =
            isLite;
        }
      }
    );

    modelInput?.dispatchEvent(
      new Event("change")
    );

    renderAttachments();
    setMode("files");
  }

  const originalInitEcosimaPage =
    window.initEcosimaPage;

  window.initEcosimaPage =
    async function initEcosimaPageWithAi(
      ...args
    ) {
      if (
        typeof originalInitEcosimaPage ===
        "function"
      ) {
        await originalInitEcosimaPage.apply(
          this,
          args
        );
      }

      initAi();
    };
})();