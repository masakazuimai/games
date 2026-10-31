
import { GENERAL_PUZZLES } from "./data-general.js?v=20261027c"
import { ENGINEER_PUZZLES } from "./data-engineer.js?v=20261027c"
import { DESIGNER_PUZZLES } from "./data-designer.js?v=20261027c"
import { VIDEO_PUZZLES } from "./data-video.js?v=20261027c"

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

export function totalPuzzleCount() {
  return GENRES.reduce((sum, genre) => sum + genre.puzzles.length, 0)
}

export function countByLevel(genre, level) {
  if (level === null) return genre.puzzles.length
  return genre.puzzles.filter((puzzle) => puzzle.level === level).length
}
