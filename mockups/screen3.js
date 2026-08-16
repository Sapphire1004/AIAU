(function () {
  const views = ["day", "week", "month", "agenda"];
  const events = window.TABIAMI_DATA.calendarEvents;
  const detail = document.getElementById("event-detail");

  function showEvent(id) {
    const event = events.find((item) => item.id === id);
    if (!event || event.type === "undecided") {
      if (event && event.type === "undecided") window.location.href = "screen2.html";
      return;
    }
    document.querySelectorAll(".calendar-event.selected").forEach((item) => item.classList.remove("selected"));
    document.querySelectorAll(`[data-event="${id}"]`).forEach((item) => item.classList.add("selected"));
    detail.className = "event-detail";
    detail.innerHTML = `<span class="detail-label">${event.label}</span><h3>${event.title}</h3><dl class="detail-list"><div><dt>日時</dt><dd>${event.date} ${event.time}</dd></div><div><dt>場所</dt><dd>${event.location || "場所の指定なし"}</dd></div><div><dt>メモ</dt><dd>${event.detail || "メモはありません。"}</dd></div>${event.cost ? `<div><dt>費用</dt><dd>${event.cost}</dd></div>` : ""}</dl><div class="detail-links">${event.noteId ? `<a href="screen1.html#${event.noteId}">元の付箋を見る ↗</a>` : ""}${event.planId ? `<a href="screen2.html">プランを開く ↗</a>` : ""}</div>`;
  }

  function bindEvent(item, id) {
    item.dataset.event = id;
    item.addEventListener("click", (event) => {
      if (item.tagName === "A") return;
      event.preventDefault();
      showEvent(id);
    });
  }

  function appendEventText(container, event, compact) {
    if (!compact) {
      const type = document.createElement("span");
      type.className = "event-type";
      type.textContent = event.label;
      container.appendChild(type);
    }
    const title = document.createElement(compact ? "div" : "strong");
    title.textContent = event.title;
    if (compact) title.className = "agenda-title";
    container.appendChild(title);
    if (!compact) {
      const meta = document.createElement("small");
      meta.textContent = `${event.time}${event.location ? `　${event.location}` : ""}`;
      container.appendChild(meta);
    }
  }

  function renderDay() {
    const allDay = document.querySelector("[data-all-day-events]");
    events.filter((event) => event.allDay).forEach((event) => {
      const item = document.createElement("div");
      item.className = "all-day-event";
      item.textContent = `▣ ${event.title}`;
      bindEvent(item, event.id);
      allDay.appendChild(item);
    });
    const track = document.querySelector("[data-day-events]");
    events.filter((event) => !event.allDay && event.date === "10/18").forEach((event) => {
      const item = document.createElement(event.type === "undecided" ? "a" : "div");
      item.className = `calendar-event ${event.color}`;
      item.style.top = `${event.top}px`;
      item.style.height = `${event.height}px`;
      item.style.left = event.left;
      item.style.right = event.right;
      item.style.maxWidth = "calc(100% - 36px)";
      if (event.type === "undecided") item.href = "screen2.html";
      appendEventText(item, event, false);
      if (event.type === "undecided") {
        const note = document.createElement("small");
        note.textContent = "画面2で投票中 ↗";
        item.appendChild(note);
      }
      bindEvent(item, event.id);
      track.appendChild(item);
    });
  }

  function renderWeek() {
    const head = document.querySelector("[data-week-head]");
    ["月 13", "火 14", "水 15", "木 16", "金 17", "土 18", "日 19"].forEach((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      head.appendChild(item);
    });
    const cells = document.querySelector("[data-week-events]");
    for (let index = 0; index < 7; index += 1) {
      const cell = document.createElement("div");
      cell.className = "month-cell";
      if (index === 5) {
        const day = document.createElement("span");
        day.className = "month-day today";
        day.textContent = "18";
        cell.appendChild(day);
        const dayEvents = events.filter((event) => event.date === "10/18" && !event.allDay);
        dayEvents.slice(0, 2).forEach((event) => appendMonthEvent(cell, event));
        if (dayEvents.length > 2) {
          appendMonthEvent(cell, {
            id: "week-overflow",
            title: `+${dayEvents.length - 2}件`,
            color: "more-events"
          });
        }
      }
      if (index === 6) {
        const day = document.createElement("span");
        day.className = "month-day";
        day.textContent = "19";
        cell.appendChild(day);
        appendMonthEvent(cell, events.find((event) => event.id === "event-train"));
      }
      cells.appendChild(cell);
    }
  }

  function appendMonthEvent(cell, event) {
    if (!event) return;
    const item = document.createElement("div");
    item.className = `month-event ${event.color}`;
    item.textContent = event.title;
    bindEvent(item, event.id);
    cell.appendChild(item);
  }

  function renderMonth() {
    const head = document.querySelector("[data-month-head]");
    ["月", "火", "水", "木", "金", "土", "日"].forEach((label) => {
      const item = document.createElement("span");
      item.textContent = label;
      head.appendChild(item);
    });
    const cells = document.querySelector("[data-month-events]");
    for (let day = 13; day <= 26; day += 1) {
      const cell = document.createElement("div");
      cell.className = "month-cell";
      const number = document.createElement("span");
      number.className = `month-day${day === 18 ? " today" : ""}`;
      number.textContent = day;
      cell.appendChild(number);
      if (day === 18) {
        appendMonthEvent(cell, events.find((event) => event.id === "event-museum"));
        appendMonthEvent(cell, events.find((event) => event.id === "event-market"));
      }
      if (day === 19) appendMonthEvent(cell, events.find((event) => event.id === "event-train"));
      cells.appendChild(cell);
    }
  }

  function renderAgenda() {
    const agenda = document.querySelector("[data-agenda-items]");
    const grouped = ["10/18", "10/19"];
    grouped.forEach((date, dateIndex) => {
      const heading = document.createElement("p");
      heading.className = "agenda-date";
      heading.textContent = date === "10/18" ? "10月18日（土）" : "10月19日（日）";
      if (dateIndex > 0) heading.style.marginTop = "22px";
      agenda.appendChild(heading);
      events.filter((event) => event.date === date && !event.allDay).forEach((event) => {
        const item = document.createElement(event.type === "undecided" ? "a" : "div");
        item.className = "agenda-item";
        if (event.type === "undecided") item.href = "screen2.html";
        const time = document.createElement("span");
        time.className = "agenda-time";
        time.textContent = event.time;
        item.appendChild(time);
        const body = document.createElement("div");
        const title = document.createElement("div");
        title.className = "agenda-title";
        title.textContent = event.title;
        body.appendChild(title);
        const location = document.createElement("div");
        location.className = "agenda-location";
        location.textContent = event.location || (event.type === "undecided" ? "画面2で投票中" : "");
        body.appendChild(location);
        item.appendChild(body);
        const badge = document.createElement("span");
        badge.className = `agenda-badge ${event.type === "undecided" ? "undecided" : event.type === "external" ? "external" : "plan"}`;
        badge.textContent = event.label;
        item.appendChild(badge);
        bindEvent(item, event.id);
        agenda.appendChild(item);
      });
    });
  }

  function selectView(selected) {
    document.querySelectorAll(".view-tab").forEach((item) => item.classList.toggle("active", item.dataset.view === selected));
    views.forEach((view) => { document.getElementById(`view-${view}`).hidden = view !== selected; });
  }

  renderDay();
  renderWeek();
  renderMonth();
  renderAgenda();
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => selectView(tab.dataset.view));
  });
  selectView(window.matchMedia("(max-width: 640px)").matches ? "agenda" : "day");
})();
