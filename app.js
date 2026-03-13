// State
let currentFilter = "all";
let currentView = "calendar";
let allEvents = [];

const STORAGE_KEY = "mcal_events";
const API_KEY_STORAGE = "mcal_openai_key";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// ── Persistence ──────────────────────────────────────────

function loadEvents() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      // corrupted – fall back to defaults
    }
  }
  return [...EVENTS];
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allEvents));
}

function nextEventId() {
  return allEvents.length === 0
    ? 1
    : Math.max(...allEvents.map((e) => e.id)) + 1;
}

// ── Initialize ───────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  allEvents = loadEvents();
  buildFilterButtons();
  renderCalendarView();
  setupViewToggle();
  setupModal();

  document.getElementById("add-event-btn").addEventListener("click", () => {
    showEventForm(null);
  });

  document.getElementById("settings-btn").addEventListener("click", () => {
    showSettingsModal();
  });

  document.getElementById("suggest-btn").addEventListener("click", () => {
    handleSuggest();
  });
});

// ── Filter buttons ───────────────────────────────────────

function buildFilterButtons() {
  const bar = document.querySelector(".filter-bar");
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const btn = document.createElement("button");
    btn.className = "filter-btn";
    btn.dataset.filter = key;
    btn.textContent = cat.label;
    bar.appendChild(btn);
  }

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    reRender();
  });
}

// ── Helpers ──────────────────────────────────────────────

function getFilteredEvents() {
  if (currentFilter === "all") return allEvents;
  return allEvents.filter((e) => e.category === currentFilter);
}

function reRender() {
  if (currentView === "calendar") renderCalendarView();
  else renderTimelineView();
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatDateRange(start, end) {
  if (start === end) return formatDate(start);
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${e.getDate()} ${s.toLocaleDateString("en-GB", { month: "short" })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function getDayCount(start, end) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function getCatColor(category) {
  return CATEGORIES[category]?.color || "#666";
}

function getCatLabel(category) {
  return CATEGORIES[category]?.label || category;
}

function getCatIcon(category) {
  return CATEGORIES[category]?.icon || "";
}

const NOW = new Date();
const CURRENT_MONTH = NOW.getMonth();
const CURRENT_YEAR = NOW.getFullYear();

// ── Calendar Grid View ───────────────────────────────────

function renderCalendarView() {
  const container = document.getElementById("calendar-view");
  const events = getFilteredEvents();
  container.innerHTML = "";

  for (let month = 0; month < 12; month++) {
    const monthEvents = events.filter((e) => {
      const start = new Date(e.startDate + "T00:00:00");
      const end = new Date(e.endDate + "T00:00:00");
      return (
        start.getMonth() === month ||
        end.getMonth() === month ||
        (start.getMonth() < month && end.getMonth() > month)
      );
    });

    const card = document.createElement("div");
    card.className =
      "month-card" +
      (month === CURRENT_MONTH && CURRENT_YEAR === 2026 ? " current" : "");

    const header = document.createElement("div");
    header.className = "month-header";
    header.innerHTML = `
      <span class="month-name">${MONTH_NAMES[month]}</span>
      <span class="month-count">${monthEvents.length} event${monthEvents.length !== 1 ? "s" : ""}</span>
    `;
    card.appendChild(header);

    if (monthEvents.length === 0) {
      const empty = document.createElement("div");
      empty.className = "month-empty";
      empty.textContent = "No events this month";
      card.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "month-events";

      monthEvents.sort((a, b) => a.startDate.localeCompare(b.startDate));

      for (const event of monthEvents) {
        const item = document.createElement("div");
        item.className = "event-item";
        item.onclick = () => showEventModal(event);

        const color = getCatColor(event.category);
        item.innerHTML = `
          <div class="event-dot" style="background: ${color}"></div>
          <div class="event-info">
            <div class="event-title">${event.title}</div>
            <div class="event-date">${formatDateRange(event.startDate, event.endDate)}</div>
          </div>
        `;
        list.appendChild(item);
      }
      card.appendChild(list);
    }

    container.appendChild(card);
  }
}

// ── Timeline View ────────────────────────────────────────

function renderTimelineView() {
  const container = document.getElementById("timeline-view");
  const events = getFilteredEvents();
  container.innerHTML = "";

  const sorted = [...events].sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );

  const grouped = {};
  for (const event of sorted) {
    const month = new Date(event.startDate + "T00:00:00").getMonth();
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(event);
  }

  for (let month = 0; month < 12; month++) {
    if (!grouped[month] || grouped[month].length === 0) continue;

    const group = document.createElement("div");
    group.className = "timeline-month-group";

    const label = document.createElement("div");
    label.className = "timeline-month-label";
    label.textContent = MONTH_NAMES[month];
    group.appendChild(label);

    const eventsEl = document.createElement("div");
    eventsEl.className = "timeline-events";

    for (const event of grouped[month]) {
      const startD = new Date(event.startDate + "T00:00:00");
      const color = getCatColor(event.category);
      const days = getDayCount(event.startDate, event.endDate);
      const isMultiDay = days > 1;

      const el = document.createElement("div");
      el.className = "timeline-event";
      el.onclick = () => showEventModal(event);

      el.innerHTML = `
        <div class="timeline-date-col">
          <div class="timeline-date-day">${startD.getDate()}</div>
          ${isMultiDay ? `<div class="timeline-date-range">${days} days</div>` : ""}
        </div>
        <div class="timeline-divider" style="background: ${color}"></div>
        <div class="timeline-content">
          <div class="timeline-title">${event.title}</div>
          <div class="timeline-meta">
            <span class="timeline-category" style="color: ${color}">${getCatLabel(event.category)}</span>
            ${event.contentIdeas ? `<span class="timeline-ideas">${event.contentIdeas}</span>` : ""}
          </div>
        </div>
      `;
      eventsEl.appendChild(el);
    }

    group.appendChild(eventsEl);
    container.appendChild(group);
  }
}

// ── View Toggle ──────────────────────────────────────────

function setupViewToggle() {
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".view-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentView = btn.dataset.view;

      const calView = document.getElementById("calendar-view");
      const timeView = document.getElementById("timeline-view");

      if (currentView === "calendar") {
        calView.style.display = "";
        timeView.style.display = "none";
        renderCalendarView();
      } else {
        calView.style.display = "none";
        timeView.style.display = "";
        renderTimelineView();
      }
    });
  });
}

// ── Modal ────────────────────────────────────────────────

function closeModal() {
  document.getElementById("modal-overlay").style.display = "none";
}

function setupModal() {
  const overlay = document.getElementById("modal-overlay");
  document.getElementById("modal-close").addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

// ── Event Detail Modal (with Edit button) ────────────────

function showEventModal(event) {
  const overlay = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  const color = getCatColor(event.category);
  const days = getDayCount(event.startDate, event.endDate);

  content.innerHTML = `
    <div class="modal-category-badge" style="color: ${color}">
      <span class="modal-cat-square" style="background: ${color}"></span>
      ${getCatLabel(event.category)}
    </div>
    <h2 class="modal-title">${event.title}</h2>
    <div class="modal-date">${formatDateRange(event.startDate, event.endDate)}</div>
    ${
      days > 1
        ? `<div class="modal-section">
        <div class="modal-duration">${days} days</div>
      </div>`
        : ""
    }
    ${
      event.contentIdeas
        ? `<div class="modal-section">
        <div class="modal-section-title">Content Ideas</div>
        <div class="modal-ideas" style="border-color: ${color}">${event.contentIdeas}</div>
      </div>`
        : `<div class="modal-section">
        <div class="modal-section-title">Content Ideas</div>
        <div class="modal-ideas" style="border-color: ${color}; color: var(--text-dim); font-style: italic;">No content ideas yet</div>
      </div>`
    }
    <div class="modal-actions">
      <button class="form-btn form-btn-edit" id="modal-edit-btn">Edit Event</button>
    </div>
  `;

  document.getElementById("modal-edit-btn").addEventListener("click", () => {
    showEventForm(event);
  });

  overlay.style.display = "flex";
}

// ── Add / Edit Event Form ────────────────────────────────

function showEventForm(existingEvent) {
  const overlay = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  const isEdit = existingEvent !== null;

  const categoryOptions = Object.entries(CATEGORIES)
    .map(([key, cat]) => {
      const selected =
        isEdit && existingEvent.category === key ? "selected" : "";
      return `<option value="${key}" ${selected}>${cat.label}</option>`;
    })
    .join("");

  content.innerHTML = `
    <h2 class="modal-title">${isEdit ? "Edit Event" : "Add Event"}</h2>
    <form id="event-form" class="event-form">
      <label class="form-label">
        Title
        <input type="text" id="form-title" class="form-input"
               value="${isEdit ? existingEvent.title.replace(/"/g, "&quot;") : ""}"
               placeholder="e.g. Album Release, Festival..."
               required />
      </label>

      <div class="form-row">
        <label class="form-label">
          Start Date
          <input type="date" id="form-start" class="form-input"
                 value="${isEdit ? existingEvent.startDate : ""}" required />
        </label>
        <label class="form-label">
          End Date
          <input type="date" id="form-end" class="form-input"
                 value="${isEdit ? existingEvent.endDate : ""}" required />
        </label>
      </div>

      <label class="form-label">
        Category
        <select id="form-category" class="form-input" required>
          <option value="">Select category...</option>
          ${categoryOptions}
        </select>
      </label>

      <label class="form-label">
        Content Ideas
        <textarea id="form-ideas" class="form-input form-textarea" rows="3"
                  placeholder="Phonk edits, fan memes, runway clips...">${isEdit ? (existingEvent.contentIdeas || "") : ""}</textarea>
      </label>

      <div class="form-actions">
        ${isEdit ? '<button type="button" class="form-btn form-btn-delete" id="form-delete">Delete</button>' : ""}
        <button type="submit" class="form-btn form-btn-save">${isEdit ? "Save Changes" : "Add Event"}</button>
      </div>
    </form>
  `;

  // Auto-sync end date when start date changes (for new events)
  if (!isEdit) {
    document.getElementById("form-start").addEventListener("change", (e) => {
      const endInput = document.getElementById("form-end");
      if (!endInput.value) {
        endInput.value = e.target.value;
      }
    });
  }

  document.getElementById("event-form").addEventListener("submit", (e) => {
    e.preventDefault();
    handleFormSubmit(isEdit ? existingEvent.id : null);
  });

  if (isEdit) {
    document.getElementById("form-delete").addEventListener("click", () => {
      handleDelete(existingEvent.id);
    });
  }

  overlay.style.display = "flex";
}

// ── Form Submit (Add / Edit) ─────────────────────────────

function handleFormSubmit(editId) {
  const title = document.getElementById("form-title").value.trim();
  const startDate = document.getElementById("form-start").value;
  const endDate = document.getElementById("form-end").value;
  const category = document.getElementById("form-category").value;
  const contentIdeas = document.getElementById("form-ideas").value.trim();

  if (!title || !startDate || !endDate || !category) return;

  if (endDate < startDate) {
    alert("End date cannot be before start date.");
    return;
  }

  const month = new Date(startDate + "T00:00:00").getMonth();

  if (editId !== null) {
    const idx = allEvents.findIndex((e) => e.id === editId);
    if (idx !== -1) {
      allEvents[idx] = {
        ...allEvents[idx],
        title,
        startDate,
        endDate,
        category,
        contentIdeas,
        month,
      };
    }
  } else {
    allEvents.push({
      id: nextEventId(),
      title,
      startDate,
      endDate,
      category,
      contentIdeas,
      month,
    });
  }

  saveEvents();
  closeModal();
  reRender();
}

// ── Delete Event ─────────────────────────────────────────

function handleDelete(eventId) {
  if (!confirm("Delete this event?")) return;
  allEvents = allEvents.filter((e) => e.id !== eventId);
  saveEvents();
  closeModal();
  reRender();
}

// ── API Key Management ──────────────────────────────────

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

function saveApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key.trim());
}

// ── Settings Modal ──────────────────────────────────────

function showSettingsModal() {
  const overlay = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  const currentKey = getApiKey();
  const masked = currentKey
    ? currentKey.slice(0, 10) + "..." + currentKey.slice(-4)
    : "";

  content.innerHTML = `
    <h2 class="modal-title">Settings</h2>
    <form id="settings-form" class="event-form">
      <label class="form-label">
        OpenAI API Key
        <input type="password" id="settings-api-key" class="form-input"
               value="${currentKey}"
               placeholder="sk-..." />
      </label>
      ${masked ? `<div class="settings-key-hint">Current key: ${masked}</div>` : ""}
      <p class="settings-note">Your API key is stored locally in your browser and never sent anywhere except the OpenAI API.</p>
      <div class="form-actions">
        <button type="submit" class="form-btn form-btn-save">Save Settings</button>
      </div>
    </form>
  `;

  document.getElementById("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const key = document.getElementById("settings-api-key").value.trim();
    saveApiKey(key);
    closeModal();
  });

  overlay.style.display = "flex";
}

// ── AI Suggestions ──────────────────────────────────────

async function handleSuggest() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showSettingsModal();
    return;
  }

  showLoadingModal();

  try {
    const suggestions = await fetchSuggestions(apiKey);
    if (suggestions.length === 0) {
      showSuggestionsModal([]);
    } else {
      showSuggestionsModal(suggestions);
    }
  } catch (err) {
    showErrorModal(err.message);
  }
}

async function fetchSuggestions(apiKey) {
  const today = new Date();
  const currentDate = today.toISOString().split("T")[0];

  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey,
      events: allEvents.map((e) => ({
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        category: e.category,
      })),
      categories: CATEGORIES,
      currentDate,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "Failed to fetch suggestions");
  }

  return data.suggestions || [];
}

function showLoadingModal() {
  const overlay = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");

  content.innerHTML = `
    <div class="suggestions-loading">
      <div class="spinner"></div>
      <p class="loading-text">Finding relevant events for your calendar...</p>
    </div>
  `;

  overlay.style.display = "flex";
}

function showErrorModal(message) {
  const content = document.getElementById("modal-content");

  content.innerHTML = `
    <h2 class="modal-title">Something went wrong</h2>
    <div class="suggestions-error">
      <p>${message}</p>
      <div class="form-actions" style="margin-top: 16px;">
        <button class="form-btn form-btn-edit" id="error-settings-btn">Check Settings</button>
        <button class="form-btn form-btn-save" id="error-retry-btn">Try Again</button>
      </div>
    </div>
  `;

  document.getElementById("error-settings-btn").addEventListener("click", () => {
    showSettingsModal();
  });
  document.getElementById("error-retry-btn").addEventListener("click", () => {
    handleSuggest();
  });
}

function showSuggestionsModal(suggestions) {
  const content = document.getElementById("modal-content");

  if (suggestions.length === 0) {
    content.innerHTML = `
      <h2 class="modal-title">Suggested Events</h2>
      <div class="suggestions-empty">
        <p>No new suggestions right now. Try again later!</p>
      </div>
    `;
    return;
  }

  let cardsHTML = suggestions
    .map((s, i) => {
      const color = getCatColor(s.category);
      const label = getCatLabel(s.category);
      const icon = getCatIcon(s.category);
      const dateStr = formatDateRange(s.startDate, s.endDate);

      return `
      <div class="suggestion-card" id="suggestion-${i}">
        <div class="suggestion-header">
          <span class="event-badge" style="color: ${color}">${label}</span>
          <span class="suggestion-dates">${dateStr}</span>
        </div>
        <div class="suggestion-title">${s.title}</div>
        ${s.contentIdeas ? `<div class="suggestion-ideas">${s.contentIdeas}</div>` : ""}
        <div class="suggestion-actions">
          <button class="suggestion-btn suggestion-btn-decline" data-index="${i}">Decline</button>
          <button class="suggestion-btn suggestion-btn-accept" data-index="${i}">Accept</button>
        </div>
      </div>
    `;
    })
    .join("");

  content.innerHTML = `
    <h2 class="modal-title">Suggested Events</h2>
    <p class="suggestions-subtitle">AI-generated suggestions based on your calendar. Accept the ones you like!</p>
    <div class="suggestions-list" id="suggestions-list">
      ${cardsHTML}
    </div>
    <div class="suggestions-footer">
      <button class="form-btn form-btn-edit" id="suggest-refresh-btn">Get More</button>
    </div>
  `;

  // Store suggestions for reference
  const activeSuggestions = [...suggestions];

  // Wire up accept/decline buttons
  content.querySelectorAll(".suggestion-btn-accept").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index);
      const s = activeSuggestions[idx];
      if (!s) return;

      // Add to calendar
      const month = new Date(s.startDate + "T00:00:00").getMonth();
      allEvents.push({
        id: nextEventId(),
        title: s.title,
        startDate: s.startDate,
        endDate: s.endDate,
        category: s.category,
        contentIdeas: s.contentIdeas || "",
        month,
      });
      saveEvents();
      reRender();

      // Animate out the card
      const card = document.getElementById(`suggestion-${idx}`);
      if (card) {
        card.classList.add("suggestion-accepted");
        setTimeout(() => card.remove(), 400);
      }

      // Mark as used
      activeSuggestions[idx] = null;
      checkAllHandled();
    });
  });

  content.querySelectorAll(".suggestion-btn-decline").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index);

      const card = document.getElementById(`suggestion-${idx}`);
      if (card) {
        card.classList.add("suggestion-declined");
        setTimeout(() => card.remove(), 400);
      }

      activeSuggestions[idx] = null;
      checkAllHandled();
    });
  });

  document.getElementById("suggest-refresh-btn").addEventListener("click", () => {
    handleSuggest();
  });

  function checkAllHandled() {
    if (activeSuggestions.every((s) => s === null)) {
      const list = document.getElementById("suggestions-list");
      if (list) {
        list.innerHTML = `<div class="suggestions-empty"><p>All done! Click "Get More" for fresh suggestions.</p></div>`;
      }
    }
  }
}
