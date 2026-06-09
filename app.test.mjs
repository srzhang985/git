import test from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  createInitialNotes,
  createNote,
  filterNotes,
  loadNotes,
  normalizeNotes,
  removeNote,
  saveNotes,
  sortNotes,
  updateNote,
} from "./app.js";

const fixedClock = () => new Date("2026-06-10T08:00:00.000Z");
const laterClock = () => new Date("2026-06-10T09:30:00.000Z");

function fakeStorage(initialValue = null) {
  const data = new Map();
  if (initialValue !== null) {
    data.set(STORAGE_KEY, initialValue);
  }
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    dump: () => data,
  };
}

test("createNote fills required fields and trims empty titles", () => {
  const note = createNote({ id: "n1", title: "  ", body: "正文" }, fixedClock);

  assert.equal(note.id, "n1");
  assert.equal(note.title, "未命名笔记");
  assert.equal(note.body, "正文");
  assert.equal(note.createdAt, "2026-06-10T08:00:00.000Z");
  assert.equal(note.updatedAt, "2026-06-10T08:00:00.000Z");
});

test("normalizeNotes drops invalid rows and sorts by latest update", () => {
  const notes = normalizeNotes(
    [
      null,
      { id: "old", title: "旧笔记", updatedAt: "2026-06-10T07:00:00.000Z" },
      { id: "new", title: "新笔记", updatedAt: "2026-06-10T10:00:00.000Z" },
    ],
    fixedClock,
  );

  assert.deepEqual(
    notes.map((note) => note.id),
    ["new", "old"],
  );
});

test("filterNotes searches title and body without changing source order", () => {
  const notes = sortNotes([
    createNote({ id: "a", title: "实验记录", body: "颗粒流动", updatedAt: "2026-06-10T08:00:00.000Z" }),
    createNote({ id: "b", title: "阅读摘要", body: "rotating drum", updatedAt: "2026-06-10T09:00:00.000Z" }),
  ]);

  assert.deepEqual(
    filterNotes(notes, "DRUM").map((note) => note.id),
    ["b"],
  );
  assert.deepEqual(
    notes.map((note) => note.id),
    ["b", "a"],
  );
});

test("updateNote changes only the selected note and refreshes updatedAt", () => {
  const notes = [
    createNote({ id: "a", title: "A", updatedAt: "2026-06-10T08:00:00.000Z" }),
    createNote({ id: "b", title: "B", updatedAt: "2026-06-10T08:10:00.000Z" }),
  ];

  const updated = updateNote(notes, "a", { title: "A+", body: "补充" }, laterClock);
  const changed = updated.find((note) => note.id === "a");
  const untouched = updated.find((note) => note.id === "b");

  assert.equal(changed.title, "A+");
  assert.equal(changed.body, "补充");
  assert.equal(changed.updatedAt, "2026-06-10T09:30:00.000Z");
  assert.equal(untouched.title, "B");
});

test("removeNote selects the neighboring note when active note is deleted", () => {
  const notes = [
    createNote({ id: "a", title: "A" }, fixedClock),
    createNote({ id: "b", title: "B" }, fixedClock),
    createNote({ id: "c", title: "C" }, fixedClock),
  ];

  const result = removeNote(notes, "b", "b");

  assert.deepEqual(
    result.notes.map((note) => note.id),
    ["a", "c"],
  );
  assert.equal(result.nextActiveId, "c");
});

test("loadNotes falls back to a welcome note when storage is empty or broken", () => {
  const emptyNotes = loadNotes(fakeStorage(), fixedClock);
  const brokenNotes = loadNotes(fakeStorage("not-json"), fixedClock);

  assert.deepEqual(emptyNotes, createInitialNotes(fixedClock));
  assert.deepEqual(brokenNotes, createInitialNotes(fixedClock));
});

test("saveNotes writes normalized JSON to storage", () => {
  const storage = fakeStorage();
  const saved = saveNotes(storage, [
    createNote({ id: "x", title: "保存测试", updatedAt: "2026-06-10T08:00:00.000Z" }),
  ]);

  assert.deepEqual(JSON.parse(storage.dump().get(STORAGE_KEY)), saved);
});
