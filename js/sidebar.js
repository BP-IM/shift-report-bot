const db = window.db;

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");
const menuBtn = document.getElementById("mobileMenuBtn");
const logoutBtn = document.getElementById("logoutBtn");

const restaurantNameEl = document.getElementById("restaurantName");
const restaurantIdEl = document.getElementById("restaurantId");

const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");
const pageContent = document.getElementById("pageContent");

const sidebarLinks = document.querySelectorAll(".sidebar-link");

const views = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Общая информация по ресторану и план на выбранный день",
    component: "../components/dashboard-view.html",
    init: () => {
      if (typeof initDashboardView === "function") {
        initDashboardView();
      }
    }
  },

  export: {
    title: "Экспорт прошлой недели",
    subtitle: "Загрузка Excel файла с фактом прошлой недели",
    component: "../components/export-view.html",
    init: () => {
      if (typeof initExportPage === "function") {
        initExportPage();
      }
    }
  },

  planning: {
    title: "Планирование",
    subtitle: "Расчет недельного, дневного и почасового плана",
    component: "../components/planning-view.html",
    init: () => {
      if (typeof initPlanningForm === "function") {
        initPlanningForm();
      }
    }
  },

  checklist: {
    title: "Чек-лист смены",
    subtitle: "Контроль задач менеджера смены по выбранной дате",
    component: "../components/checklist/checklist-view.html",
    init: () => {
      if (typeof initChecklistPage === "function") {
        initChecklistPage();
      }
    }
  },

  "area-checklists": {
    title: "Чек-листы участков",
    subtitle: "Готовые чек-листы менеджеров обслуживания и производства",
    component: "../components/area-checklists-view.html",
    init: () => {
      if (
        typeof window.initAreaChecklistsPage === "function"
      ) {
        window.initAreaChecklistsPage();
      }
    }
  },

  ecosima: {
    title: "Экосима",
    subtitle: "Хранение фото, PDF и файлов по ресторану",
    component: "../components/ecosima-view.html",
    init: () => {
      if (typeof initEcosimaPage === "function") {
        initEcosimaPage();
      }
    }
  },

  settings: {
    title: "Настройки",
    subtitle: "Коэффициенты по дням недели и по часам",
    component: "../components/settings-view.html",
    init: () => {
      if (typeof initSettingsForm === "function") {
        initSettingsForm();
      }
    }
  }
};

function redirectToLogin() {
  window.location.href = "../index.html";
}

function closeMobileSidebar() {
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("show");
}

function initMobileSidebar() {
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      sidebar.classList.add("open");
      overlay.classList.add("show");
    });
  }

  if (overlay) {
    overlay.addEventListener("click", closeMobileSidebar);
  }
}

function initLogout() {
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", async () => {
    await db.auth.signOut();
    redirectToLogin();
  });
}

async function loadRestaurantInfo() {
  const { data: sessionData, error: sessionError } = await db.auth.getSession();

  if (sessionError) {
    console.error(sessionError);
    redirectToLogin();
    return false;
  }

  if (!sessionData.session) {
    redirectToLogin();
    return false;
  }

  const user = sessionData.session.user;

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error(profileError);
    redirectToLogin();
    return false;
  }

  const { data: restaurant, error: restaurantError } = await db
    .from("restaurants")
    .select("name")
    .eq("restaurant_id", profile.restaurant_id)
    .maybeSingle();

  if (restaurantError) {
    console.error(restaurantError);
  }

  const restaurantName = restaurant?.name || "Ресторан";
  const restaurantId = profile.restaurant_id;

  if (restaurantNameEl) restaurantNameEl.textContent = restaurantName;
  if (restaurantIdEl) restaurantIdEl.textContent = restaurantId;

  localStorage.setItem("restaurant_id", restaurantId);
  localStorage.setItem("restaurant_name", restaurantName);

  return true;
}

function getViewFromHash() {
  const hash = window.location.hash.replace("#", "");

  if (views[hash]) {
    return hash;
  }

  return "dashboard";
}

function setActiveLink(viewName) {
  sidebarLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.view === viewName);
  });
}

async function loadView(componentPath) {
  const response = await fetch(componentPath);

  if (!response.ok) {
    throw new Error("Не удалось загрузить компонент страницы.");
  }

  return await response.text();
}

function showPageLoading() {
  pageContent.innerHTML = `
    <div class="card">
      <p>Загрузка...</p>
    </div>
  `;
}

function showPageError(error) {
  console.error(error);

  pageContent.innerHTML = `
    <div class="card">
      <h2>Ошибка загрузки</h2>
      <p>Не удалось открыть раздел. Проверьте путь к component HTML.</p>
    </div>
  `;
}

async function renderView(viewName) {
  const view = views[viewName] || views.dashboard;

  setActiveLink(viewName);

  pageTitle.textContent = view.title;
  pageSubtitle.textContent = view.subtitle;

  showPageLoading();

  try {
    const html = await loadView(view.component);
    pageContent.innerHTML = html;

    if (typeof view.init === "function") {
      view.init();
    }
  } catch (error) {
    showPageError(error);
  }
}

function initDashboardPage() {
  const restaurantName = localStorage.getItem("restaurant_name") || "Ресторан";
  const restaurantId = localStorage.getItem("restaurant_id") || "-";

  const today = new Date();
  const todayFormatted = today.toLocaleDateString("ru-RU");

  const dashboardRestaurantName = document.getElementById("dashboardRestaurantName");
  const dashboardRestaurantId = document.getElementById("dashboardRestaurantId");
  const dashboardTodayDate = document.getElementById("dashboardTodayDate");

  if (dashboardRestaurantName) dashboardRestaurantName.textContent = restaurantName;
  if (dashboardRestaurantId) dashboardRestaurantId.textContent = restaurantId;
  if (dashboardTodayDate) dashboardTodayDate.textContent = todayFormatted;
}

function initSettingsPage() {
  const restaurantName = localStorage.getItem("restaurant_name") || "Ресторан";
  const restaurantId = localStorage.getItem("restaurant_id") || "-";

  const settingsRestaurantName = document.getElementById("settingsRestaurantName");
  const settingsRestaurantId = document.getElementById("settingsRestaurantId");

  if (settingsRestaurantName) settingsRestaurantName.textContent = restaurantName;
  if (settingsRestaurantId) settingsRestaurantId.textContent = restaurantId;
}

function initPageRouter() {
  const initialView = getViewFromHash();
  renderView(initialView);

  sidebarLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();

      const viewName = link.dataset.view;

      if (!views[viewName]) return;

      if (getViewFromHash() === viewName) {
        renderView(viewName);
      } else {
        window.location.hash = viewName;
      }

      closeMobileSidebar();
    });
  });

  window.addEventListener("hashchange", () => {
    const viewName = getViewFromHash();
    renderView(viewName);
  });
}

async function initApp() {
  initMobileSidebar();
  initLogout();

  const isReady = await loadRestaurantInfo();

  if (!isReady) return;

  initPageRouter();
}

initApp();