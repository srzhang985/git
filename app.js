export const STORAGE_KEY = "codex.notes.v1";

const UNTITLED = "未命名笔记";

function getIsoTime(clock = () => new Date()) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanTitle(title, fallback = UNTITLED) {
  const text = typeof title === "string" ? title.trim() : "";
  return text || fallback;
}

function cleanBody(body) {
  return typeof body === "string" ? body : "";
}

function formatPreview(body) {
  const preview = cleanBody(body).replace(/\s+/g, " ").trim();
  return preview || "空白笔记";
}

function formatTime(isoTime) {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function createNote(overrides = {}, clock = () => new Date()) {
  const now = getIsoTime(clock);
  return {
    id: typeof overrides.id === "string" && overrides.id ? overrides.id : createId(),
    title: cleanTitle(overrides.title),
    body: cleanBody(overrides.body),
    createdAt: typeof overrides.createdAt === "string" ? overrides.createdAt : now,
    updatedAt: typeof overrides.updatedAt === "string" ? overrides.updatedAt : now,
  };
}

export function createInitialNotes(clock = () => new Date()) {
  return [
    createNote(
      {
        id: "welcome-note",
        title: "第一条笔记",
        body:
          "这里可以记录实验想法、阅读摘要、待办事项，内容会自动保存在浏览器本地。",
      },
      clock,
    ),
  ];
}

export function sortNotes(notes) {
  return [...notes].sort((first, second) => {
    const timeDiff = Date.parse(second.updatedAt) - Date.parse(first.updatedAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }
    return first.title.localeCompare(second.title, "zh-CN");
  });
}

export function normalizeNotes(value, clock = () => new Date()) {
  if (!Array.isArray(value)) {
    return [];
  }

  const notes = value
    .filter((note) => note && typeof note === "object")
    .map((note) =>
      createNote(
        {
          id: note.id,
          title: note.title,
          body: note.body,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        },
        clock,
      ),
    );

  return sortNotes(notes);
}

export function filterNotes(notes, query) {
  const needle = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (!needle) {
    return sortNotes(notes);
  }

  return sortNotes(
    notes.filter((note) => {
      const haystack = `${note.title}\n${note.body}`.toLowerCase();
      return haystack.includes(needle);
    }),
  );
}

export function updateNote(notes, id, patch = {}, clock = () => new Date()) {
  return sortNotes(
    notes.map((note) => {
      if (note.id !== id) {
        return note;
      }

      return {
        ...note,
        title: Object.hasOwn(patch, "title") ? cleanTitle(patch.title) : note.title,
        body: Object.hasOwn(patch, "body") ? cleanBody(patch.body) : note.body,
        updatedAt: getIsoTime(clock),
      };
    }),
  );
}

export function removeNote(notes, id, activeId) {
  const index = notes.findIndex((note) => note.id === id);
  const remaining = notes.filter((note) => note.id !== id);

  if (activeId !== id) {
    return { notes: remaining, nextActiveId: activeId ?? remaining[0]?.id ?? null };
  }

  return {
    notes: remaining,
    nextActiveId: remaining[Math.min(index, remaining.length - 1)]?.id ?? null,
  };
}

export function loadNotes(storage, clock = () => new Date()) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const notes = normalizeNotes(parsed, clock);
    return notes.length ? notes : createInitialNotes(clock);
  } catch {
    return createInitialNotes(clock);
  }
}

export function saveNotes(storage, notes) {
  const normalized = normalizeNotes(notes);
  storage?.setItem?.(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function initNotesApp(doc = document, storage = globalThis.localStorage) {
  const elements = {
    newButton: doc.querySelector("#new-note"),
    deleteButton: doc.querySelector("#delete-note"),
    searchInput: doc.querySelector("#search"),
    noteList: doc.querySelector("#note-list"),
    noteCount: doc.querySelector("#note-count"),
    savedStatus: doc.querySelector("#saved-status"),
    editorContent: doc.querySelector("#editor-content"),
    emptyEditor: doc.querySelector("#empty-editor"),
    titleInput: doc.querySelector("#editor-title"),
    bodyInput: doc.querySelector("#editor-body"),
    updatedAt: doc.querySelector("#updated-at"),
  };

  let state = {
    notes: loadNotes(storage),
    activeId: null,
    query: "",
  };

  state.activeId = state.notes[0]?.id ?? null;

  function activeNote() {
    return state.notes.find((note) => note.id === state.activeId) ?? null;
  }

  function setSavedStatus(text) {
    elements.savedStatus.textContent = text;
  }

  function persist() {
    setSavedStatus("保存中");
    state.notes = saveNotes(storage, state.notes);
    globalThis.setTimeout(() => setSavedStatus("已保存"), 120);
  }

  function renderList() {
    const visibleNotes = filterNotes(state.notes, state.query);
    elements.noteList.replaceChildren();
    elements.noteCount.textContent =
      visibleNotes.length === state.notes.length
        ? `${state.notes.length} 条笔记`
        : `${visibleNotes.length} / ${state.notes.length} 条笔记`;

    if (!visibleNotes.length) {
      const empty = doc.createElement("li");
      empty.className = "empty-list";
      empty.textContent = state.query ? "没有匹配的笔记" : "还没有笔记";
      elements.noteList.append(empty);
      return;
    }

    visibleNotes.forEach((note) => {
      const item = doc.createElement("li");
      const button = doc.createElement("button");
      const title = doc.createElement("span");
      const preview = doc.createElement("span");
      const date = doc.createElement("span");

      button.type = "button";
      button.className = `note-item${note.id === state.activeId ? " is-active" : ""}`;
      button.dataset.noteId = note.id;

      title.className = "note-title";
      title.textContent = note.title;

      preview.className = "note-preview";
      preview.textContent = formatPreview(note.body);

      date.className = "note-date";
      date.textContent = `更新于 ${formatTime(note.updatedAt)}`;

      button.append(title, preview, date);
      item.append(button);
      elements.noteList.append(item);
    });
  }

  function renderEditor() {
    const note = activeNote();
    const hasNote = Boolean(note);
    elements.emptyEditor.hidden = hasNote;
    elements.editorContent.hidden = !hasNote;
    elements.deleteButton.disabled = !hasNote;

    if (!note) {
      return;
    }

    if (doc.activeElement !== elements.titleInput) {
      elements.titleInput.value = note.title;
    }
    if (doc.activeElement !== elements.bodyInput) {
      elements.bodyInput.value = note.body;
    }

    elements.updatedAt.textContent = `最后更新：${formatTime(note.updatedAt)}`;
  }

  function render() {
    renderList();
    renderEditor();
  }

  elements.newButton.addEventListener("click", () => {
    const note = createNote({ title: "新笔记", body: "" });
    state.notes = sortNotes([note, ...state.notes]);
    state.activeId = note.id;
    state.query = "";
    elements.searchInput.value = "";
    persist();
    render();
    elements.titleInput.focus();
    elements.titleInput.select();
  });

  elements.deleteButton.addEventListener("click", () => {
    const note = activeNote();
    if (!note) {
      return;
    }

    const confirmed = window.confirm(`确定删除《${note.title}》吗？`);
    if (!confirmed) {
      return;
    }

    const result = removeNote(state.notes, note.id, state.activeId);
    state.notes = result.notes;
    state.activeId = result.nextActiveId;
    persist();
    render();
  });

  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderList();
  });

  elements.noteList.addEventListener("click", (event) => {
    const button = event.target.closest(".note-item");
    if (!button) {
      return;
    }

    state.activeId = button.dataset.noteId;
    render();
  });

  elements.titleInput.addEventListener("input", (event) => {
    state.notes = updateNote(state.notes, state.activeId, { title: event.target.value });
    persist();
    renderList();
    renderEditor();
  });

  elements.titleInput.addEventListener("blur", renderEditor);

  elements.bodyInput.addEventListener("input", (event) => {
    state.notes = updateNote(state.notes, state.activeId, { body: event.target.value });
    persist();
    renderList();
    renderEditor();
  });

  doc.addEventListener("keydown", (event) => {
    const isNewShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n";
    if (!isNewShortcut) {
      return;
    }
    event.preventDefault();
    elements.newButton.click();
  });

  render();
  return {
    getState: () => ({ ...state, notes: [...state.notes] }),
    selectNote: (id) => {
      state.activeId = id;
      render();
    },
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => initNotesApp(document, window.localStorage));
}
