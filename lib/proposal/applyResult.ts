/**
 * 第3層(selectProposals)の出力を、
 * (a) カルテに保存できる構造化データ(ProposalRecord)、
 * (b) フロントで表示に使う構造化データ(DisplayProposal)
 * に変換する。どちらも schoolSlug 単位の分類(match/reference)・理由・見送り理由(caveat)・
 * placeId を保持し、リッチ版（学校カード等）で流用できる形を保つ。表示のために間引かない。
 */

import type { Karte, ProposalCategory, ProposalRecord } from "@/lib/karte";
import type { School } from "@/lib/data/schools";
import type { ProposalResult } from "./selectProposals";

export interface DisplayProposal {
  schoolSlug: string;
  name: string;
  city: string;
  category: ProposalCategory;
  reason: string;
  caveat: string;
  placeId?: string;
  /** 地図表示用（school.lat/lng をそのまま渡す。無い場合はピンを立てない） */
  lat?: number;
  lng?: number;
}

function schoolBySlug(schools: School[]): Map<string, School> {
  return new Map(schools.map((s) => [s.schoolSlug, s]));
}

/** フロントに返す表示用の構造化データ一覧を組み立てる */
export function toDisplayProposals(result: ProposalResult, schools: School[]): DisplayProposal[] {
  const bySlug = schoolBySlug(schools);
  const display: DisplayProposal[] = [];
  for (const p of result.proposals) {
    const school = bySlug.get(p.schoolSlug);
    if (!school) continue; // 候補外のschoolSlugを万一モデルが返した場合は無視する
    display.push({
      schoolSlug: p.schoolSlug,
      name: school.name,
      city: school.city,
      category: p.category,
      reason: p.reason,
      caveat: p.caveat,
      placeId: school.placeId,
      lat: school.lat,
      lng: school.lng,
    });
  }
  return display;
}

/** karte.proposals ブロックに、第3層の結果を構造化データのまま保存した新しい Karte を返す */
export function applyProposalResult(karte: Karte, result: ProposalResult, schools: School[]): Karte {
  const bySlug = schoolBySlug(schools);
  const presented: ProposalRecord[] = result.proposals
    .filter((p) => bySlug.has(p.schoolSlug))
    .map((p) => ({
      type: "school",
      id: p.schoolSlug,
      category: p.category,
      reason: p.reason,
      caveat: p.caveat,
      placeId: bySlug.get(p.schoolSlug)?.placeId,
    }));

  return {
    ...karte,
    proposals: {
      ...karte.proposals,
      presented,
      introNote: result.introNote,
    },
    // 提案（通常/暫定いずれも）を出し終えたら、即時提案要求フラグは必ず消費済みにする
    handoff: { ...karte.handoff, immediateProposalRequested: false },
    meta: { ...karte.meta, updatedAt: new Date().toISOString() },
  };
}
