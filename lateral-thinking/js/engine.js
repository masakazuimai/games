// 判定エンジン。ルール表による静的判定を担当し、AIには一切依存しない。
// 未ヒット時は null を返し、呼び出し側（main.js）がAIフォールバックを試みる。

/**
 * 表記ゆれを吸収する。全角/半角・大文字小文字・カタカナ/ひらがなを統一し、
 * 空白と記号を落として比較用の文字列にする。
 * 例: 「大文字・小文字 は 関係アル？」→「大文字小文字は関係ある」
 */
export function normalize(text) {
  if (typeof text !== "string") return ""
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s　]/g, "")
    .replace(/[、。，．,.!?！？「」『』【】（）()［］\[\]・:;：；'"`]/g, "")
}

/** ルール1件が質問にマッチするか判定する。not は1語でも含めば不成立。 */
function ruleMatches(rule, normalizedQuestion) {
  if (rule.not?.some((word) => normalizedQuestion.includes(normalize(word)))) return false
  return Boolean(rule.any?.some((word) => normalizedQuestion.includes(normalize(word))))
}

/**
 * ルール表で質問を判定する。上から順に見て最初にマッチしたものを返す。
 * @returns {{verdict: string, note?: string, source: "rules"} | null}
 */
export function judgeByRules(question, puzzle) {
  const normalized = normalize(question)
  if (!normalized) return null

  for (const rule of puzzle.rules ?? []) {
    if (ruleMatches(rule, normalized)) {
      return { verdict: rule.a, note: rule.note, source: "rules" }
    }
  }
  return null
}

/**
 * 宣言された解答が正解かを判定する。
 * solutionKeys の全グループから1語以上ヒットした場合のみ正解とする。
 * @returns {{correct: boolean, matched: number, total: number}}
 */
export function checkSolution(answer, puzzle) {
  const normalized = normalize(answer)
  const groups = puzzle.solutionKeys ?? []
  const matched = groups.filter((group) =>
    group.some((word) => normalized.includes(normalize(word)))
  ).length

  return { correct: groups.length > 0 && matched === groups.length, matched, total: groups.length }
}

/** 判定ラベル。ジャンルの verdictStyle（"en" / "ja"）で出し分ける。 */
const VERDICT_LABELS = {
  en: {
    YES: "YES",
    NO: "NO",
    IRRELEVANT: "IRRELEVANT",
    UNCERTAIN: "UNDEFINED",
    UNKNOWN: "NO MATCH",
  },
  ja: {
    YES: "はい",
    NO: "いいえ",
    IRRELEVANT: "関係ありません",
    UNCERTAIN: "どちらとも言えません",
    UNKNOWN: "判定できません",
  },
}

export function verdictLabel(verdict, style) {
  const table = VERDICT_LABELS[style] ?? VERDICT_LABELS.en
  return table[verdict] ?? table.UNKNOWN
}

/** 判定に対応するCSSクラス名（色分け用）。 */
export function verdictClass(verdict) {
  switch (verdict) {
    case "YES":
      return "is-yes"
    case "NO":
      return "is-no"
    case "IRRELEVANT":
      return "is-irrelevant"
    case "UNCERTAIN":
      return "is-uncertain"
    default:
      return "is-unknown"
  }
}

/** AIの自由文回答から判定だけを取り出す。判別できなければ null。 */
export function parseAiVerdict(text) {
  const upper = (text ?? "").toUpperCase()
  if (upper.includes("IRRELEVANT")) return "IRRELEVANT"
  if (upper.includes("UNCERTAIN")) return "UNCERTAIN"
  if (/\bYES\b/.test(upper)) return "YES"
  if (/\bNO\b/.test(upper)) return "NO"
  return null
}

/** AIへ渡すプロンプト。真相とルール表を根拠として与え、自由推論を禁じる。 */
export function buildAiPrompt(question, puzzle) {
  const knownRules = (puzzle.rules ?? [])
    .slice(0, 40)
    .map((rule) => `- 「${rule.any.join(" / ")}」に関する質問 → ${rule.a}`)
    .join("\n")

  return [
    "あなたは水平思考クイズの出題者です。以下の真相に照らして、プレイヤーの質問に判定だけを返してください。",
    "",
    "【問題文】",
    puzzle.puzzle,
    "",
    "【真相（プレイヤーには非公開）】",
    puzzle.truth,
    "",
    "【既存の判定基準（一貫性を保つため必ず従うこと）】",
    knownRules,
    "",
    "【プレイヤーの質問】",
    question,
    "",
    "【出力ルール】",
    "- YES / NO / IRRELEVANT / UNCERTAIN のいずれか1語だけを出力する",
    "- 真相から論理的に導けるならYESまたはNO",
    "- 真相と無関係な事柄への質問はIRRELEVANT",
    "- 真相に情報がなく断定できない場合のみUNCERTAIN",
    "- 説明・理由・補足は一切書かない。真相を漏らさない",
  ].join("\n")
}
