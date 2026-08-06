// ジャンルのレジストリ。問題の追加・ジャンルの新設はここだけを見ればよい。
//
// ▼ ジャンルを増やす手順（例: デザイナー編）
//   1. js/data-designer.js を作り、他のデータファイルと同じ形で配列を export する
//   2. このファイルで import し、下の GENRES に1行足す
//   3. 以上。タブ・問題一覧・件数表示・進捗保存はすべて自動で追従する
//
//   verdictStyle は判定ラベルの出し分け。"en" なら YES / NO / IRRELEVANT、
//   "ja" なら はい／いいえ／関係ありません。ジャンルの雰囲気に合わせて選ぶ。

import { GENERAL_PUZZLES } from "./data-general.js?v=20260806p"
import { ENGINEER_PUZZLES } from "./data-engineer.js?v=20260806p"
import { DESIGNER_PUZZLES } from "./data-designer.js?v=20260806p"
import { VIDEO_PUZZLES } from "./data-video.js?v=20260806p"

// 並び順がそのままタブの並び順になる。通常編を先頭に置き、以降は職種別。
export const GENRES = [
  {
    id: "normal",
    code: "NORMAL",
    label: "通常編",
    verdictStyle: "ja",
    puzzles: GENERAL_PUZZLES,
  },
  {
    id: "engineer",
    code: "ENGINEER",
    label: "エンジニア編",
    verdictStyle: "en",
    puzzles: ENGINEER_PUZZLES,
  },
  {
    id: "designer",
    code: "DESIGNER",
    label: "デザイナー編",
    verdictStyle: "en",
    puzzles: DESIGNER_PUZZLES,
  },
  {
    id: "video",
    code: "VIDEO EDITOR",
    label: "動画編集者編",
    verdictStyle: "en",
    puzzles: VIDEO_PUZZLES,
  },
]

/** レベル絞り込みの選択肢。level は data 側の 1〜4 と対応する。★★★★は各ジャンル1問ずつの最難問。 */
export const LEVEL_FILTERS = [
  { id: "all", label: "ALL", level: null },
  { id: "lv1", label: "★", level: 1 },
  { id: "lv2", label: "★★", level: 2 },
  { id: "lv3", label: "★★★", level: 3 },
  { id: "lv4", label: "★★★★", level: 4 },
]

export function findGenre(genreId) {
  return GENRES.find((genre) => genre.id === genreId) ?? GENRES[0]
}

/** 全ジャンルの合計問題数。ページ内の件数表記はここから流し込む。 */
export function totalPuzzleCount() {
  return GENRES.reduce((sum, genre) => sum + genre.puzzles.length, 0)
}

/** 指定レベルの問題数。null なら全件。 */
export function countByLevel(genre, level) {
  if (level === null) return genre.puzzles.length
  return genre.puzzles.filter((puzzle) => puzzle.level === level).length
}
