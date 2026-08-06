// 画面制御。ルール判定を第一手段とし、未ヒットかつAI有効時のみAIへ回す。

// ⚠️ import先にも `?v=` を付ける。index.html の main.js にだけ付けても、
// ここで読み込むサブモジュールはブラウザにキャッシュされたままになるため。
// 更新時は index.html と下記の全 import のバージョンを揃えて上げること。
import {
  GENRES,
  LEVEL_FILTERS,
  countByLevel,
  findGenre,
  totalPuzzleCount,
} from "./puzzles.js?v=20260806p"
import { AI_PROVIDERS, callAI } from "./ai.js?v=20260806p"
import {
  buildAiPrompt,
  checkSolution,
  judgeByRules,
  parseAiVerdict,
  verdictClass,
  verdictLabel,
} from "./engine.js?v=20260806p"

const STORAGE_KEYS = {
  progress: "lateral-thinking:progress",
  settings: "lateral-thinking:settings",
  apiKeys: "lateral-thinking:apikeys",
}
const MAX_HINTS = 3
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches

const el = {
  log: document.getElementById("log"),
  caseList: document.getElementById("caseList"),
  pickerLabel: document.getElementById("pickerLabel"),
  termTitle: document.getElementById("termTitle"),
  qCount: document.getElementById("qCount"),
  hintMeter: document.getElementById("hintMeter"),
  aiToggleBtn: document.getElementById("aiToggleBtn"),
  aiState: document.getElementById("aiState"),
  askForm: document.getElementById("askForm"),
  askInput: document.getElementById("askInput"),
  sendBtn: document.getElementById("sendBtn"),
  promptMark: document.getElementById("promptMark"),
  aiSettings: document.getElementById("aiSettings"),
  providerSelect: document.getElementById("providerSelect"),
  apiKeyRow: document.getElementById("apiKeyRow"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  apiKeyLink: document.getElementById("apiKeyLink"),
  resetProgressBtn: document.getElementById("resetProgressBtn"),
  genreTabs: document.getElementById("genreTabs"),
  levelFilter: document.getElementById("levelFilter"),
  caseEmpty: document.getElementById("caseEmpty"),
}

const state = {
  genre: GENRES[0].id, // 一覧に表示しているジャンル
  level: null, // 一覧の絞り込みレベル（null = ALL）
  playingGenre: GENRES[0], // 解答中の問題が属するジャンル（一覧の切替とは独立）
  puzzle: null,
  questions: 0,
  hintsUsed: 0,
  mode: "question",
  finished: false,
  busy: false,
}

let progress = readJson(STORAGE_KEYS.progress, {})
let settings = readJson(STORAGE_KEYS.settings, { provider: "off" })
let apiKeys = readJson(STORAGE_KEYS.apiKeys, {})

/* ---------------- ストレージ ---------------- */

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch (error) {
    console.warn("保存データを読み込めませんでした:", error)
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn("保存に失敗しました:", error)
  }
}

/* ---------------- 出力 ---------------- */

function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]
  )
}

function scrollToBottom() {
  el.log.scrollTop = el.log.scrollHeight
}

function print(html, className = "") {
  const line = document.createElement("div")
  line.className = `line ${className}`.trim()
  line.innerHTML = html
  el.log.appendChild(line)
  scrollToBottom()
  return line
}

function printGap() {
  print("", "gap")
}

/** 1文字ずつ打ち出す。モーション低減設定では即時表示にする。 */
function typeLine(text, className = "", speed = 22) {
  const line = print("", className)
  if (REDUCED_MOTION) {
    line.textContent = text
    scrollToBottom()
    return Promise.resolve(line)
  }

  const caret = document.createElement("span")
  caret.className = "caret"
  line.appendChild(caret)

  return new Promise((resolve) => {
    let index = 0
    const timer = setInterval(() => {
      index += 1
      caret.remove()
      line.textContent = text.slice(0, index)
      if (index < text.length) {
        line.appendChild(caret)
      } else {
        clearInterval(timer)
        resolve(line)
      }
      scrollToBottom()
    }, speed)
  })
}

/* ---------------- 状態表示 ---------------- */

function updateMeters() {
  el.qCount.textContent = String(state.questions).padStart(2, "0")
  const remaining = MAX_HINTS - state.hintsUsed
  el.hintMeter.innerHTML = `hint <b>${"●".repeat(remaining)}${"○".repeat(state.hintsUsed)}</b>`
}

/** AIが実際に呼べる状態か。キー必須なのに未入力なら "nokey"。 */
function aiStatus() {
  const config = AI_PROVIDERS[settings.provider]
  if (!config || settings.provider === "off") return "off"
  if (config.needsKey && !apiKeys[settings.provider]) return "nokey"
  return "on"
}

function updateAiBadge() {
  const status = aiStatus()
  el.aiState.textContent = { on: "ON", nokey: "KEY?", off: "OFF" }[status]
  el.aiToggleBtn.classList.toggle("is-on", status === "on")
  el.aiToggleBtn.classList.toggle("is-warn", status === "nokey")
}

function setBusy(busy) {
  state.busy = busy
  el.sendBtn.disabled = busy
  el.askInput.disabled = busy
}

/** focus:false は、ユーザーが操作していない場面で画面が勝手に飛ぶのを防ぐため。 */
function setMode(mode, { focus = true } = {}) {
  state.mode = mode
  const isAnswer = mode === "answer"
  el.promptMark.textContent = isAnswer ? "A>" : "Q>"
  el.askForm.classList.toggle("is-answer", isAnswer)
  el.askInput.placeholder = isAnswer
    ? "真相を自分の言葉で書いてください（/cancel で質問に戻る）"
    : "はい／いいえで答えられる質問を入力（/help でコマンド一覧）"
  if (focus) el.askInput.focus()
}

/* ---------------- 問題リスト ---------------- */

/** ジャンルタブを GENRES から生成する。ジャンル追加時にHTMLを触らずに済む。 */
function renderGenreTabs() {
  el.genreTabs.innerHTML = ""
  GENRES.forEach((genre) => {
    const tab = document.createElement("button")
    tab.type = "button"
    tab.className = "tab"
    tab.setAttribute("role", "tab")
    tab.dataset.genre = genre.id
    tab.innerHTML = `${escapeHtml(genre.code)}<span>${escapeHtml(genre.label)}</span>`
    tab.addEventListener("click", () => switchGenre(genre.id))
    el.genreTabs.appendChild(tab)
  })
  syncGenreTabs()
}

function syncGenreTabs() {
  el.genreTabs.querySelectorAll(".tab").forEach((tab) => {
    const isActive = tab.dataset.genre === state.genre
    tab.classList.toggle("is-active", isActive)
    tab.setAttribute("aria-selected", String(isActive))
  })
}

/** 難易度の絞り込みボタン。件数はジャンルごとに数え直す。 */
function renderLevelFilter() {
  const genre = findGenre(state.genre)
  el.levelFilter.innerHTML = ""

  LEVEL_FILTERS.forEach((filter) => {
    const count = countByLevel(genre, filter.level)
    const button = document.createElement("button")
    button.type = "button"
    button.className = "level-chip"
    button.classList.toggle("is-active", state.level === filter.level)
    button.setAttribute("aria-pressed", String(state.level === filter.level))
    button.innerHTML = `${filter.label}<i>${count}</i>`
    button.addEventListener("click", () => {
      state.level = filter.level
      renderLevelFilter()
      renderCaseList()
    })
    el.levelFilter.appendChild(button)
  })
}

function visiblePuzzles(genre) {
  return state.level === null
    ? genre.puzzles
    : genre.puzzles.filter((puzzle) => puzzle.level === state.level)
}

function renderCaseList() {
  const genre = findGenre(state.genre)
  // ジャンル名は狭い画面で隠す（アクティブなタブに出ているため）
  el.pickerLabel.innerHTML = `CASE FILES<span class="picker-genre"> / ${escapeHtml(genre.code)}</span>`
  el.caseList.innerHTML = ""

  const list = visiblePuzzles(genre)
  el.caseEmpty.hidden = list.length > 0

  list.forEach((puzzle) => {
    // 通し番号は絞り込みで変わらないよう、ジャンル内の元の並び順から引く
    const number = genre.puzzles.indexOf(puzzle) + 1
    const record = progress[puzzle.id]
    const button = document.createElement("button")
    button.type = "button"
    button.className = "case"
    if (state.puzzle?.id === puzzle.id) button.classList.add("is-current")
    button.innerHTML = [
      `<span class="case-no">${String(number).padStart(2, "0")}</span>`,
      `<span class="case-title">${escapeHtml(puzzle.title)}</span>`,
      `<span class="case-level">${"★".repeat(puzzle.level)}</span>`,
      record?.cleared ? '<span class="case-flag">✓</span>' : "",
    ].join("")
    button.addEventListener("click", () => selectPuzzle(puzzle, genre))
    el.caseList.appendChild(button)
  })
}

/** ジャンルを切り替えたら解答中の問題は破棄し、ターミナルを初期状態へ戻す。 */
function resetTerminal(genre) {
  state.puzzle = null
  state.questions = 0
  state.hintsUsed = 0
  state.finished = false
  setMode("question", { focus: false })
  updateMeters()

  el.termTitle.textContent = "/games/lateral-thinking"
  el.log.innerHTML = ""
  print(`&gt; switched to ${escapeHtml(genre.code)}. ${genre.puzzles.length} cases loaded.`, "sys")
  print("上の CASE FILES から問題を選んでください。", "sys")
  printGap()
}

function switchGenre(genreId) {
  if (genreId === state.genre) return
  state.genre = genreId
  syncGenreTabs()
  renderLevelFilter()
  resetTerminal(findGenre(genreId))
  renderCaseList()
}

/* ---------------- ゲーム進行 ---------------- */

async function selectPuzzle(puzzle, genre) {
  state.puzzle = puzzle
  state.playingGenre = genre
  state.questions = 0
  state.hintsUsed = 0
  state.finished = false
  setMode("question")
  updateMeters()
  renderCaseList()

  el.log.innerHTML = ""
  el.termTitle.textContent = `${genre.id}/${puzzle.id}`

  await typeLine(`> loading case: ${puzzle.id}`, "sys", 14)
  print(
    `<span class="case-label">CASE — ${escapeHtml(puzzle.title)}</span>${escapeHtml(puzzle.puzzle)}`,
    "puzzle-block"
  )
  print("質問を入力してください。「はい／いいえ」で答えられる形にするのがコツです。", "sys")
  printGap()
  window.gtag?.("event", "puzzle_start", { puzzle_id: puzzle.id, genre: genre.id })
}

function requirePuzzle() {
  if (state.puzzle) return true
  print("先に上のCASE FILESから問題を選んでください。", "error")
  return false
}

async function handleQuestion(question) {
  state.questions += 1
  updateMeters()

  print(`<span class="mark">Q&gt;</span>${escapeHtml(question)}`, "q")

  const ruleResult = judgeByRules(question, state.puzzle)
  if (ruleResult) {
    await showVerdict(ruleResult.verdict, ruleResult.note, "")
    return
  }

  const status = aiStatus()
  if (status !== "on") {
    await showVerdict(
      "UNKNOWN",
      status === "nokey"
        ? "別の言い方で聞いてみてください（AI判定の設定でAPIキーを入れると有効になります）"
        : "別の言い方で聞いてみてください（AI判定をONにすると自由な質問にも答えられます）",
      ""
    )
    return
  }

  const pending = print('<span class="verdict is-unknown">…</span>', "")
  try {
    const text = await callAI({
      provider: settings.provider,
      prompt: buildAiPrompt(question, state.puzzle),
      apiKey: apiKeys[settings.provider],
    })
    pending.remove()
    const verdict = parseAiVerdict(text)
    if (verdict) {
      await showVerdict(verdict, "", "ai")
    } else {
      await showVerdict("UNKNOWN", "別の言い方で聞いてみてください", "ai")
    }
  } catch (error) {
    pending.remove()
    print(`AI判定に失敗しました: ${escapeHtml(error.message)}`, "error")
    await showVerdict("UNKNOWN", "別の言い方で聞いてみてください", "")
  }
}

async function showVerdict(verdict, note, source) {
  const label = verdictLabel(verdict, state.playingGenre.verdictStyle)
  const line = print("", "")
  const badge = document.createElement("span")
  badge.className = `verdict ${verdictClass(verdict)}`
  line.appendChild(badge)

  if (REDUCED_MOTION) {
    badge.textContent = label
  } else {
    await new Promise((resolve) => setTimeout(resolve, 180))
    for (let i = 1; i <= label.length; i += 1) {
      badge.textContent = label.slice(0, i)
      scrollToBottom()
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
  }

  if (source === "ai") {
    const src = document.createElement("span")
    src.className = "src"
    src.textContent = "via AI"
    badge.appendChild(src)
  }
  if (note) print(escapeHtml(note), "note")
  printGap()
}

async function handleAnswer(answer) {
  print(`<span class="mark">A&gt;</span>${escapeHtml(answer)}`, "q")
  const { correct, matched, total } = checkSolution(answer, state.puzzle)

  if (correct) {
    await finishPuzzle(true)
    return
  }

  setMode("question")
  if (matched > 0) {
    print(`惜しい。核心の ${matched}/${total} までは合っています。もう少し具体的に。`, "hint")
  } else {
    print("違います。質問を続けてください。", "note")
  }
  printGap()
}

async function finishPuzzle(cleared) {
  state.finished = true
  setMode("question")

  const record = progress[state.puzzle.id]
  progress = {
    ...progress,
    [state.puzzle.id]: {
      cleared: cleared || record?.cleared || false,
      questions: state.questions,
      hints: state.hintsUsed,
    },
  }
  writeJson(STORAGE_KEYS.progress, progress)
  renderCaseList()

  if (cleared) {
    await typeLine("*** SOLVED ***", "solved", 40)
  }

  print(
    `<span class="truth-label">TRUTH</span>${escapeHtml(state.puzzle.truth)}`,
    "truth-block"
  )
  print(
    cleared
      ? `<b>正解</b> — 質問 ${state.questions}回 / ヒント ${state.hintsUsed}回`
      : `真相を開示しました — 質問 ${state.questions}回 / ヒント ${state.hintsUsed}回`,
    "result"
  )
  if (cleared) renderShareRow()
  print("上のCASE FILESから次の問題を選べます。", "sys")
  printGap()

  window.gtag?.("event", cleared ? "puzzle_clear" : "puzzle_giveup", {
    puzzle_id: state.puzzle.id,
    genre: state.playingGenre.id,
    questions: state.questions,
    hints: state.hintsUsed,
  })
}

/* ---------------- クリア時のシェア ---------------- */

/** 共有先はcanonicalを使う（localhostのURLを配らないため）。 */
function shareUrl() {
  return document.querySelector('link[rel="canonical"]')?.href ?? location.href
}

/** 真相は絶対に含めない。問題名とスコアだけを載せる。 */
function shareText() {
  const stars = "★".repeat(state.puzzle.level)
  return [
    `水平思考クイズ「${state.puzzle.title}」${stars} を解きました`,
    `質問${state.questions}回 / ヒント${state.hintsUsed}回`,
    "#ウミガメのスープ #水平思考クイズ #脳トレ",
  ].join("\n")
}

function renderShareRow() {
  const row = print("", "share-row")
  const label = document.createElement("span")
  label.className = "share-label"
  label.textContent = "SHARE"
  row.appendChild(label)

  const text = shareText()
  const url = shareUrl()

  const links = [
    {
      name: "X",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    },
    {
      name: "LINE",
      href: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
    {
      name: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
  ]

  links.forEach((link) => {
    const anchor = document.createElement("a")
    anchor.className = "share-btn"
    anchor.href = link.href
    anchor.target = "_blank"
    anchor.rel = "noopener"
    anchor.textContent = link.name
    anchor.addEventListener("click", () => {
      window.gtag?.("event", "share", { method: link.name, puzzle_id: state.puzzle.id })
    })
    row.appendChild(anchor)
  })

  const copyBtn = document.createElement("button")
  copyBtn.type = "button"
  copyBtn.className = "share-btn"
  copyBtn.textContent = "結果をコピー"
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      copyBtn.textContent = "コピーしました"
      setTimeout(() => {
        copyBtn.textContent = "結果をコピー"
      }, 2000)
      window.gtag?.("event", "share", { method: "copy", puzzle_id: state.puzzle.id })
    } catch (error) {
      console.error("コピーに失敗しました:", error)
      copyBtn.textContent = "コピーできませんでした"
    }
  })
  row.appendChild(copyBtn)
}

function showHint() {
  if (state.hintsUsed >= MAX_HINTS) {
    print("ヒントは使い切りました。「降参する」で真相を開示できます。", "note")
    return
  }
  const hint = state.puzzle.hints[state.hintsUsed]
  state.hintsUsed += 1
  updateMeters()
  print(`HINT ${state.hintsUsed}/${MAX_HINTS} — ${escapeHtml(hint)}`, "hint")
  printGap()
}

/* ---------------- コマンド ---------------- */

const COMMAND_HELP = [
  "/hint    … ヒントを1段階開く（全3段階）",
  "/answer  … 解答を宣言する",
  "/giveup  … 降参して真相を読む",
  "/list    … 問題一覧に戻る",
  "/cancel  … 解答モードを抜ける",
]

async function runCommand(input) {
  const command = input.trim().toLowerCase()

  if (command === "/help") {
    COMMAND_HELP.forEach((row) => print(escapeHtml(row), "sys"))
    printGap()
    return
  }
  if (command === "/list") {
    document.querySelector(".picker").scrollIntoView({ behavior: "smooth", block: "center" })
    print("上のCASE FILESから問題を選んでください。", "sys")
    return
  }
  if (command === "/cancel") {
    setMode("question")
    print("質問モードに戻りました。", "sys")
    return
  }
  if (!requirePuzzle()) return

  if (command === "/hint") {
    if (state.finished) {
      print("この問題はすでに終了しています。", "note")
      return
    }
    showHint()
    return
  }
  if (command === "/answer") {
    if (state.finished) {
      print("この問題はすでに終了しています。", "note")
      return
    }
    setMode("answer")
    print("解答モードです。真相を自分の言葉で書いてください。", "sys")
    return
  }
  if (command === "/giveup") {
    if (state.finished) {
      print("この問題はすでに終了しています。", "note")
      return
    }
    await finishPuzzle(false)
    return
  }

  print(`未知のコマンドです: ${escapeHtml(command)}（/help で一覧）`, "error")
}

/* ---------------- 入力 ---------------- */

el.askForm.addEventListener("submit", async (event) => {
  event.preventDefault()
  if (state.busy) return

  const value = el.askInput.value.trim()
  if (!value) return
  el.askInput.value = ""
  setBusy(true)

  try {
    if (value.startsWith("/")) {
      await runCommand(value)
    } else if (!requirePuzzle()) {
      // 問題未選択
    } else if (state.finished) {
      print("この問題はすでに終了しています。上のCASE FILESから次を選んでください。", "note")
    } else if (state.mode === "answer") {
      await handleAnswer(value)
    } else {
      await handleQuestion(value)
    }
  } catch (error) {
    console.error("処理に失敗しました:", error)
    print(`エラーが発生しました: ${escapeHtml(error.message)}`, "error")
  } finally {
    setBusy(false)
    el.askInput.focus()
  }
})

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", async () => {
    if (state.busy) return
    setBusy(true)
    try {
      await runCommand(button.dataset.command)
    } finally {
      setBusy(false)
      el.askInput.focus()
    }
  })
})

el.resetProgressBtn.addEventListener("click", () => {
  if (!window.confirm("クリア状況をすべて消去します。よろしいですか？")) return
  progress = {}
  writeJson(STORAGE_KEYS.progress, progress)
  renderCaseList()
  print("進捗をリセットしました。", "sys")
})

/* ---------------- AI設定 ---------------- */

function renderProviderOptions() {
  el.providerSelect.innerHTML = ""
  Object.entries(AI_PROVIDERS).forEach(([id, config]) => {
    const option = document.createElement("option")
    option.value = id
    option.textContent = config.label
    el.providerSelect.appendChild(option)
  })
  el.providerSelect.value = settings.provider
  syncKeyRow()
}

function syncKeyRow() {
  const config = AI_PROVIDERS[settings.provider]
  const needsKey = Boolean(config?.needsKey)
  el.apiKeyRow.hidden = !needsKey
  if (needsKey) {
    el.apiKeyInput.value = apiKeys[settings.provider] ?? ""
    el.apiKeyLink.href = config.keyUrl ?? "#"
  }
  updateAiBadge()
}

el.providerSelect.addEventListener("change", () => {
  settings = { ...settings, provider: el.providerSelect.value }
  writeJson(STORAGE_KEYS.settings, settings)
  syncKeyRow()
  if (settings.provider !== "off") {
    window.gtag?.("event", "ai_enabled", { provider: settings.provider })
  }
})

el.apiKeyInput.addEventListener("change", () => {
  apiKeys = { ...apiKeys, [settings.provider]: el.apiKeyInput.value.trim() }
  writeJson(STORAGE_KEYS.apiKeys, apiKeys)
  updateAiBadge()
})

el.aiToggleBtn.addEventListener("click", () => {
  el.aiSettings.open = true
  el.aiSettings.scrollIntoView({ behavior: "smooth", block: "center" })
  el.providerSelect.focus()
})

/* ---------------- 起動 ---------------- */

/** 本文中の件数表記をデータの実数で置き換える（問題追加時の書き換え漏れを防ぐ）。 */
function fillPuzzleCounts(total) {
  document.querySelectorAll("[data-puzzle-count]").forEach((node) => {
    node.textContent = String(total)
  })
}

async function boot() {
  const total = totalPuzzleCount()
  fillPuzzleCounts(total)
  renderProviderOptions()
  updateMeters()
  updateAiBadge()
  renderGenreTabs()
  renderLevelFilter()
  renderCaseList()

  await typeLine("> connecting to host ...", "sys", 18)
  await typeLine(`> handshake complete. ${total} cases available.`, "sys", 12)
  print(
    "水平思考クイズへようこそ。上の CASE FILES から問題を選んでください。",
    "sys"
  )
  print("判定は「はい／いいえ／関係ありません」の3種類です。/help でコマンド一覧。", "sys")
  printGap()
  // 起動時は入力欄にフォーカスしない（ページ先頭からターミナルまで勝手にスクロールするため）
}

boot()
