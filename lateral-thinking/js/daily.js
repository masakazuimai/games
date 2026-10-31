
import { GENRES } from "./puzzles.js?v=20261027c"

const EPOCH = "2026-08-09"
const STORAGE_KEY = "lateral-thinking:daily"
const HISTORY_LIMIT = 60


export function jstDateKey(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function toDayNumber(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

function previousDateKey(dateKey) {
  return new Date((toDayNumber(dateKey) - 1) * 86400000).toISOString().slice(0, 10)
}


function allEntries() {
  return GENRES.flatMap((genre) => genre.puzzles.map((puzzle) => ({ puzzle, genre })))
}

function seededRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled(items, seed) {
  const random = seededRandom(seed)
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function dailyCase(dateKey = jstDateKey()) {
  const entries = allEntries()
  const dayIndex = Math.max(0, toDayNumber(dateKey) - toDayNumber(EPOCH))
  const cycle = Math.floor(dayIndex / entries.length)
  const position = dayIndex % entries.length
  const entry = shuffled(entries, cycle + 1)[position]

  return { ...entry, dateKey, serial: dayIndex + 1 }
}


function emptyRecord() {
  return { lastClearedDate: null, streak: 0, best: 0, history: {} }
}

export function readDailyRecord() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...emptyRecord(), ...JSON.parse(raw) } : emptyRecord()
  } catch (error) {
    console.warn("デイリーの記録を読み込めませんでした:", error)
    return emptyRecord()
  }
}

function writeDailyRecord(record) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch (error) {
    console.warn("デイリーの記録を保存できませんでした:", error)
  }
}

function trimHistory(history) {
  const keys = Object.keys(history).sort().slice(-HISTORY_LIMIT)
  return Object.fromEntries(keys.map((key) => [key, history[key]]))
}

export function recordDailyClear({ dateKey, puzzleId, questions, hints }) {
  const record = readDailyRecord()
  if (record.history[dateKey]?.cleared) {
    return { streak: record.streak, best: record.best, isNew: false }
  }

  const streak = record.lastClearedDate === previousDateKey(dateKey) ? record.streak + 1 : 1
  const updated = {
    lastClearedDate: dateKey,
    streak,
    best: Math.max(streak, record.best),
    history: trimHistory({
      ...record.history,
      [dateKey]: { puzzleId, cleared: true, questions, hints },
    }),
  }
  writeDailyRecord(updated)
  return { streak: updated.streak, best: updated.best, isNew: true }
}

export function dailyResultFor(dateKey) {
  return readDailyRecord().history[dateKey] ?? null
}

export function currentStreak(dateKey = jstDateKey()) {
  const record = readDailyRecord()
  if (!record.lastClearedDate) return 0
  const alive =
    record.lastClearedDate === dateKey || record.lastClearedDate === previousDateKey(dateKey)
  return alive ? record.streak : 0
}
