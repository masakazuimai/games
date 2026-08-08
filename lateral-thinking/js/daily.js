// 今日の1問（デイリー出題）。
//
// 設計の要は「全ユーザーが同じ日に同じ問題を解く」こと。サーバーを持たないので、
// JSTの日付だけから出題を決める決定論的なアルゴリズムにしてある。
// これにより結果のシェアが「同じ問題を解いた者同士の比較」として成立する。
//
// 出題プールは全ジャンルの合計（68問）。周回ごとに並びをシャッフルし直すので、
// 一巡するまで同じ問題は出ず、二巡目以降も順番が変わる。

import { GENRES } from "./puzzles.js?v=20260809a"

/** デイリー開始日（JST）。この日が #001 になる。以後ずらしてはいけない。 */
const EPOCH = "2026-08-09"
const STORAGE_KEY = "lateral-thinking:daily"
/** 保存する履歴の上限日数。localStorageの肥大化を防ぐ。 */
const HISTORY_LIMIT = 60

/* ---------------- 日付（JST固定） ---------------- */

/**
 * JST基準の YYYY-MM-DD を返す。
 * 端末のタイムゾーン設定に依存させないため、UTCに+9時間して日付部分だけを取る。
 */
export function jstDateKey(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** YYYY-MM-DD を日数（UTCミリ秒）に変換する。日付同士の差を取るためだけに使う。 */
function toDayNumber(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000)
}

/** dateKey の前日を返す。連続日数の判定に使う。 */
function previousDateKey(dateKey) {
  return new Date((toDayNumber(dateKey) - 1) * 86400000).toISOString().slice(0, 10)
}

/* ---------------- 出題の決定 ---------------- */

/** ジャンル情報を持ったまま全問をフラットにする。並び順は GENRES の定義順で固定。 */
function allEntries() {
  return GENRES.flatMap((genre) => genre.puzzles.map((puzzle) => ({ puzzle, genre })))
}

/** 32bitシード付き擬似乱数（mulberry32）。環境をまたいで同じ順列を得るために自前で持つ。 */
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

/** シード固定のFisher-Yates。元配列は変更しない。 */
function shuffled(items, seed) {
  const random = seededRandom(seed)
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * 指定日（既定は今日）の出題を返す。
 * @returns {{puzzle: object, genre: object, dateKey: string, serial: number}}
 */
export function dailyCase(dateKey = jstDateKey()) {
  const entries = allEntries()
  // EPOCHより前に端末時計が設定されていても破綻しないよう0で下げ止める
  const dayIndex = Math.max(0, toDayNumber(dateKey) - toDayNumber(EPOCH))
  const cycle = Math.floor(dayIndex / entries.length)
  const position = dayIndex % entries.length
  // 周回番号をシードにするので、一巡ごとに並びが変わる
  const entry = shuffled(entries, cycle + 1)[position]

  return { ...entry, dateKey, serial: dayIndex + 1 }
}

/* ---------------- 記録・連続日数 ---------------- */

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

/** 履歴を新しい順に HISTORY_LIMIT 件だけ残す。 */
function trimHistory(history) {
  const keys = Object.keys(history).sort().slice(-HISTORY_LIMIT)
  return Object.fromEntries(keys.map((key) => [key, history[key]]))
}

/**
 * 今日ぶんのクリアを記録し、連続日数を更新する。
 * 同じ日に2回呼ばれても連続日数は増えない（冪等）。
 * @returns {{streak: number, best: number, isNew: boolean}}
 */
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

/** 指定日の結果。未挑戦なら null。 */
export function dailyResultFor(dateKey) {
  return readDailyRecord().history[dateKey] ?? null
}

/**
 * 表示に使う連続日数。前回クリアが今日でも昨日でもなければ途切れている＝0。
 * 保存値をその場で書き換えないのは、当日クリアで正しく1から数え直すため。
 */
export function currentStreak(dateKey = jstDateKey()) {
  const record = readDailyRecord()
  if (!record.lastClearedDate) return 0
  const alive =
    record.lastClearedDate === dateKey || record.lastClearedDate === previousDateKey(dateKey)
  return alive ? record.streak : 0
}
