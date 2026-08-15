(function () {
  const data = window.AIAU_DATA;
  const currentUser = data.trip.currentUser || { id: "ai", name: "あい", initials: "あ" };
  const messages = data.messages.map((message) => ({ ...message }));
  const dialog = document.getElementById("note-dialog");
  const form = document.getElementById("note-form");
  const titleInput = document.getElementById("note-title-input");
  const memoInput = document.getElementById("note-memo-input");
  const attrsInput = document.getElementById("note-attrs-input");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const suggestions = document.getElementById("mention-suggestions");
  const replyPreview = document.getElementById("reply-preview");
  let editingCard = null;
  let replyTarget = null;
  let suggestionItems = [];
  let suggestionIndex = 0;

  function findNote(id) {
    return data.notes.find((note) => note.id === id);
  }

  function findMember(id) {
    return (data.trip.members || []).find((member) => member.id === id);
  }

  function findMessage(id) {
    return messages.find((message) => message.id === id);
  }

  function createNoteCard(note) {
    const card = document.createElement("article");
    card.className = `note-card${note.status === "held" ? " held" : ""}${note.origin === "user" ? " user-note" : ""}`;
    card.id = note.id;
    card.dataset.noteId = note.id;

    const pin = document.createElement("span");
    pin.className = "pin";
    pin.textContent = "●";
    card.appendChild(pin);

    const origin = document.createElement("span");
    origin.className = `tag ${note.status === "held" ? "held" : note.origin === "ai" ? "ai" : "manual"}`;
    origin.textContent = note.status === "held" ? "保留中" : note.origin === "ai" ? "AI 抽出" : "手動作成";
    card.appendChild(origin);

    const title = document.createElement("h3");
    title.className = "note-title";
    title.textContent = note.title;
    card.appendChild(title);
    const memo = document.createElement("p");
    memo.className = "note-memo";
    memo.textContent = note.memo;
    card.appendChild(memo);

    const attrList = document.createElement("div");
    attrList.className = "note-attrs";
    note.attrs.forEach((attr) => {
      const item = document.createElement("span");
      item.textContent = attr;
      attrList.appendChild(item);
    });
    card.appendChild(attrList);

    const footer = document.createElement("div");
    footer.className = "note-footer";
    if (note.source) {
      const source = document.createElement("a");
      source.className = "source-link";
      source.href = `#${note.source}`;
      source.textContent = `根拠：${note.sourceLabel.replace(/「.*$/, "")} ↗`;
      footer.appendChild(source);
    } else {
      const source = document.createElement("span");
      source.className = "source-link";
      source.textContent = "作成者：あなた";
      footer.appendChild(source);
    }
    const actions = document.createElement("span");
    actions.className = "note-actions";
    actions.innerHTML = '<button data-action="edit">編集</button><button data-action="delete">削除</button>';
    footer.appendChild(actions);
    card.appendChild(footer);
    return card;
  }

  function bindCard(card) {
    makeDraggable(card);
    card.querySelector('[data-action="edit"]').addEventListener("click", () => openEditor(card));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => removeCard(card));
  }

  function renderNotes() {
    const list = document.getElementById("note-list");
    data.notes.forEach((note) => {
      const card = createNoteCard(note);
      list.appendChild(card);
      bindCard(card);
    });
  }

  function makeDraggable(card) {
    const list = document.getElementById("note-list");
    let placeholder = null;

    function finishDrag() {
      if (card.dataset.dragging !== "true") return;
      document.removeEventListener("pointermove", moveDrag);
      document.removeEventListener("pointerup", finishDrag);
      document.removeEventListener("pointercancel", finishDrag);
      if (placeholder) {
        placeholder.replaceWith(card);
        placeholder = null;
      }
      card.style.display = "";
      card.classList.remove("dragging");
      list.querySelectorAll(".drop-target").forEach((item) => item.classList.remove("drop-target"));
      card.dataset.dragging = "false";
    }

    card.addEventListener("pointerdown", function (event) {
      if (event.target.closest("button, a")) return;
      event.preventDefault();
      placeholder = document.createElement("div");
      placeholder.className = "note-drop-placeholder";
      placeholder.style.height = `${card.offsetHeight}px`;
      list.insertBefore(placeholder, card);
      card.style.display = "none";
      card.dataset.dragging = "true";
      card.classList.add("dragging");
      document.addEventListener("pointermove", moveDrag);
      document.addEventListener("pointerup", finishDrag);
      document.addEventListener("pointercancel", finishDrag);
    });

    function moveDrag(event) {
      if (card.dataset.dragging !== "true") return;
      const candidates = [...list.querySelectorAll(".note-card")];
      const target = candidates.find((item) => {
        const rect = item.getBoundingClientRect();
        const inRow = event.clientY >= rect.top && event.clientY <= rect.bottom;
        return event.clientY < rect.top + rect.height / 2 ||
          (inRow && event.clientX < rect.left + rect.width / 2);
      });
      list.querySelectorAll(".drop-target").forEach((item) => item.classList.remove("drop-target"));
      if (target) {
        target.classList.add("drop-target");
        list.insertBefore(placeholder, target);
      } else {
        list.appendChild(placeholder);
      }
    }
  }

  function openEditor(card) {
    editingCard = card;
    const note = card ? findNote(card.dataset.noteId) : null;
    document.getElementById("dialog-title").textContent = note ? "付箋を編集" : "付箋を追加";
    titleInput.value = note ? note.title : "";
    memoInput.value = note ? note.memo : "";
    attrsInput.value = note ? note.attrs.join("、") : "";
    dialog.showModal();
    titleInput.focus();
  }

  function removeCard(card) {
    if (window.confirm("この付箋を削除しますか？")) card.remove();
  }

  function mentionLabel(mention) {
    if (mention.type === "note") {
      const note = findNote(mention.id);
      return note ? `#${note.title}` : "";
    }
    const member = mention.id === currentUser.id ? currentUser : findMember(mention.id);
    return member ? `@${member.name}` : "";
  }

  function createMentionChip(mention, label) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chat-mention ${mention.type === "note" ? "note-mention" : "user-mention"}`;
    chip.textContent = label;
    if (mention.type === "note") {
      chip.dataset.noteId = mention.id;
      chip.addEventListener("click", () => jumpToNote(mention.id));
    } else if (mention.id === currentUser.id) {
      chip.classList.add("self-mention");
    }
    return chip;
  }

  function normalizeMentionToken(token) {
    return token.replace(/[、。！？,.!?;；:：…]+$/u, "");
  }

  function resolveMention(token, mentions) {
    const normalizedToken = normalizeMentionToken(token);
    return (mentions || [])
      .map((mention) => ({ mention, label: mentionLabel(mention) }))
      .filter(({ label }) => label && label.startsWith(normalizedToken))
      .sort((left, right) => right.label.length - left.label.length)[0] || null;
  }

  function renderBubble(message) {
    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    if (message.revoked) {
      bubble.classList.add("revoked");
      bubble.textContent = "送信を取り消しました";
      return bubble;
    }
    const pattern = /([#@][^\s#@、。！？,.!?;；:：…]+)/gu;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(message.text)) !== null) {
      if (match.index > cursor) bubble.appendChild(document.createTextNode(message.text.slice(cursor, match.index)));
      const resolved = resolveMention(match[1], message.mentions);
      const normalizedToken = normalizeMentionToken(match[1]);
      if (resolved) {
        bubble.appendChild(createMentionChip(resolved.mention, normalizedToken));
        if (normalizedToken.length < match[1].length) {
          bubble.appendChild(document.createTextNode(match[1].slice(normalizedToken.length)));
        }
      } else {
        bubble.appendChild(document.createTextNode(match[1]));
      }
      cursor = match.index + match[1].length;
    }
    if (cursor < message.text.length) bubble.appendChild(document.createTextNode(message.text.slice(cursor)));
    return bubble;
  }

  function renderQuotedMessage(message) {
    if (!message.replyTo) return null;
    const original = findMessage(message.replyTo);
    if (!original) return null;
    const quote = document.createElement("button");
    quote.type = "button";
    quote.className = "message-quote";
    quote.innerHTML = `<strong>↩ ${original.author}への返信</strong><span></span>`;
    quote.querySelector("span").textContent = original.revoked
      ? "送信を取り消しました"
      : original.text.slice(0, 58);
    quote.addEventListener("click", () => jumpToMessage(original.id));
    return quote;
  }

  function renderMessage(message) {
    const item = document.createElement("div");
    item.className = `message${message.mine ? " mine" : ""}${message.revoked ? " revoked-message" : ""}`;
    item.id = message.id;
    if ((message.mentions || []).some((mention) => mention.type === "user" && mention.id === currentUser.id)) {
      item.classList.add("self-mentioned");
    }

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = message.initials;
    const content = document.createElement("div");
    content.className = "message-content";
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const author = document.createElement("strong");
    author.textContent = message.author;
    const time = document.createElement("span");
    time.textContent = message.time;
    meta.append(author, time);
    if (item.classList.contains("self-mentioned")) {
      const label = document.createElement("span");
      label.className = "mention-label";
      label.textContent = "あなた宛";
      meta.appendChild(label);
    }
    const actions = document.createElement("span");
    actions.className = "message-actions";
    const reply = document.createElement("button");
    reply.type = "button";
    reply.textContent = "返信";
    reply.addEventListener("click", () => setReplyTarget(message));
    actions.appendChild(reply);
    if (message.mine && !message.revoked) {
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.textContent = "送信取り消し";
      revoke.addEventListener("click", () => revokeMessage(message.id));
      actions.appendChild(revoke);
    }
    meta.appendChild(actions);
    content.appendChild(meta);
    const quote = renderQuotedMessage(message);
    if (quote) content.appendChild(quote);
    content.appendChild(renderBubble(message));
    item.append(avatar, content);
    return item;
  }

  function renderMessages() {
    chatMessages.innerHTML = "";
    const day = document.createElement("div");
    day.className = "chat-day";
    day.textContent = "10月18日（土）";
    chatMessages.appendChild(day);
    messages.forEach((message) => chatMessages.appendChild(renderMessage(message)));
  }

  function jumpToMessage(id) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("jump-highlight");
    window.setTimeout(() => target.classList.remove("jump-highlight"), 1500);
  }

  function jumpToNote(id) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("mention-highlight");
    window.setTimeout(() => target.classList.remove("mention-highlight"), 1600);
  }

  function setReplyTarget(message) {
    replyTarget = message;
    replyPreview.hidden = false;
    replyPreview.innerHTML = "";
    const label = document.createElement("span");
    label.innerHTML = `<strong>${message.author}への返信</strong><span></span>`;
    label.querySelector("span").textContent = message.revoked ? "送信を取り消しました" : message.text.slice(0, 58);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "×";
    cancel.setAttribute("aria-label", "返信を取り消す");
    cancel.addEventListener("click", clearReplyTarget);
    replyPreview.append(label, cancel);
    chatInput.focus();
  }

  function clearReplyTarget() {
    replyTarget = null;
    replyPreview.hidden = true;
    replyPreview.innerHTML = "";
  }

  function revokeMessage(id) {
    if (!window.confirm("この発言の送信を取り消しますか？")) return;
    const message = findMessage(id);
    if (!message || !message.mine) return;
    message.revoked = true;
    renderMessages();
  }

  function getTrigger() {
    const match = chatInput.value.slice(0, chatInput.selectionStart).match(/([#@])([^\s#@]*)$/);
    if (!match) return null;
    return { symbol: match[1], query: match[2].toLowerCase(), start: match.index };
  }

  function getSuggestionItems(trigger) {
    if (trigger.symbol === "#") {
      return data.notes
        .filter((note) => note.title.toLowerCase().includes(trigger.query))
        .map((note) => ({ type: "note", id: note.id, label: `#${note.title}`, sublabel: note.memo }));
    }
    return (data.trip.members || [])
      .filter((member) => member.name.toLowerCase().includes(trigger.query))
      .map((member) => ({ type: "user", id: member.id, label: `@${member.name}`, sublabel: "旅行の参加者" }));
  }

  function renderSuggestions() {
    const trigger = getTrigger();
    if (!trigger) {
      suggestions.hidden = true;
      suggestionItems = [];
      return;
    }
    suggestionItems = getSuggestionItems(trigger);
    suggestionIndex = Math.min(suggestionIndex, Math.max(suggestionItems.length - 1, 0));
    suggestions.innerHTML = "";
    if (!suggestionItems.length) {
      suggestions.hidden = true;
      return;
    }
    suggestionItems.forEach((item, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = `mention-option${index === suggestionIndex ? " active" : ""}`;
      option.innerHTML = `<strong></strong><span></span>`;
      option.querySelector("strong").textContent = item.label;
      option.querySelector("span").textContent = item.sublabel;
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        insertMention(item);
      });
      suggestions.appendChild(option);
    });
    suggestions.hidden = false;
  }

  function insertMention(item) {
    const trigger = getTrigger();
    if (!trigger) return;
    const token = item.label;
    const before = chatInput.value.slice(0, trigger.start);
    const after = chatInput.value.slice(chatInput.selectionStart);
    chatInput.value = `${before}${token} ${after}`;
    const cursor = before.length + token.length + 1;
    chatInput.setSelectionRange(cursor, cursor);
    suggestions.hidden = true;
    chatInput.focus();
  }

  function submitMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    const mentions = [];
    const mentionDefinitions = [
      ...data.notes.map((note) => ({ type: "note", id: note.id })),
      ...(data.trip.members || []).map((member) => ({ type: "user", id: member.id }))
    ];
    const seenMentions = new Set();
    for (const match of text.matchAll(/([#@][^\s#@、。！？,.!?;；:：…]+)/gu)) {
      const resolved = resolveMention(match[1], mentionDefinitions);
      if (!resolved) continue;
      const key = `${resolved.mention.type}:${resolved.mention.id}`;
      if (!seenMentions.has(key)) {
        mentions.push(resolved.mention);
        seenMentions.add(key);
      }
    }
    messages.push({
      id: `message-${Date.now()}`,
      author: currentUser.name,
      initials: currentUser.initials,
      text,
      time: "いま",
      mine: true,
      mentions,
      replyTo: replyTarget ? replyTarget.id : null
    });
    renderMessages();
    chatInput.value = "";
    clearReplyTarget();
    suggestions.hidden = true;
    chatMessages.lastElementChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  renderNotes();
  renderMessages();
  document.getElementById("add-note-button").addEventListener("click", () => openEditor(null));
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (editingCard) {
      editingCard.querySelector(".note-title").textContent = titleInput.value;
      editingCard.querySelector(".note-memo").textContent = memoInput.value || "メモはありません。";
      const attrs = editingCard.querySelector(".note-attrs");
      attrs.innerHTML = "";
      attrsInput.value.split("、").map((value) => value.trim()).filter(Boolean).forEach((value) => {
        const span = document.createElement("span");
        span.textContent = value;
        attrs.appendChild(span);
      });
      editingCard.classList.add("user-note");
      editingCard.querySelector(".tag").textContent = "手動編集";
      editingCard.querySelector(".tag").className = "tag manual";
    } else {
      const card = createNoteCard({
        id: `note-${Date.now()}`,
        title: titleInput.value,
        memo: memoInput.value || "メモはありません。",
        attrs: attrsInput.value.split("、").map((value) => value.trim()).filter(Boolean),
        origin: "user",
        source: null,
        sourceLabel: null
      });
      document.getElementById("note-list").appendChild(card);
      bindCard(card);
    }
    dialog.close();
  });
  document.getElementById("chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessage();
  });
  chatInput.addEventListener("input", () => {
    suggestionIndex = 0;
    renderSuggestions();
  });
  chatInput.addEventListener("keydown", (event) => {
    if (suggestions.hidden || !suggestionItems.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      suggestionIndex = (suggestionIndex + 1) % suggestionItems.length;
      renderSuggestions();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      suggestionIndex = (suggestionIndex - 1 + suggestionItems.length) % suggestionItems.length;
      renderSuggestions();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      insertMention(suggestionItems[suggestionIndex]);
    } else if (event.key === "Escape") {
      suggestions.hidden = true;
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".chat-composer")) suggestions.hidden = true;
  });
})();
