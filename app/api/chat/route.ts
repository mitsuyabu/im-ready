import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODEL } from "@/lib/anthropic";
import {
  buildConflictsText,
  buildDecisionContextText,
  buildInferredContextText,
  buildKnownFactsText,
  buildSystemPrompt,
} from "@/lib/prompt";
import { isValidMessages } from "@/lib/chat";
import type { Karte } from "@/lib/karte";
import { detectCityReferenceIntent, resolveCityKeysForChat } from "@/lib/cityReferenceIntent";
import {
  buildCityReferenceContext,
  buildCityReferenceNeedsCityContext,
  buildCityReferenceNoDataContext,
} from "@/lib/cityReferenceContext";
import { loadCityReferenceEntries } from "@/lib/cityReferenceServer";
import {
  buildDevCitySnapshotContext,
  isDevCitySnapshotEnabled,
  loadDevCitySnapshots,
} from "@/lib/devCitySnapshot";
import { detectVisaIntent, resolveVisaKeysForChat } from "@/lib/visaReferenceIntent";
import {
  buildVisaNeedsVisaContext,
  buildVisaNoDataContext,
  buildVisaReferenceContext,
} from "@/lib/visaReferenceContext";
import { loadVisaReferenceEntries } from "@/lib/visaReferenceServer";
import { createClient } from "@/lib/supabase/server";
import { loadPlanBlueprint } from "@/lib/planBlueprint";

function isValidKarte(value: unknown): value is Karte {
  if (!value || typeof value !== "object") return false;
  const meta = (value as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return false;
  const karteId = (meta as { karteId?: unknown }).karteId;
  return typeof karteId === "string" && karteId.length > 0;
}

/**
 * 本人が明言した（certainty: "stated"）場合のみ都市を返す。
 * inferred（AIの仮説段階）では学校情報を注入しない。
 * Chat とワークシートで希望都市が食い違っている（handoff.conflicts にある）間も、どちらの都市か
 * 確定していないため注入しない（確認前に片方の都市の学校情報を前提に話させない）。
 */
function extractStatedPreferredCity(karte: Karte): string | null {
  const preferredCity = karte.schoolPrefs.preferredCity;
  if (preferredCity.certainty !== "stated" || !preferredCity.value) return null;
  const inConflict = (karte.handoff?.conflicts ?? []).some(
    (c) => c.block === "schoolPrefs" && c.key === "preferredCity",
  );
  if (inConflict) return null;
  return preferredCity.value;
}

/** Karte の preferredCity が conflict 中か（stated でも都市を確定として扱わない）。 */
function isPreferredCityInConflict(karte: Karte): boolean {
  return (karte.handoff?.conflicts ?? []).some(
    (c) => c.block === "schoolPrefs" && c.key === "preferredCity",
  );
}

/** 最新のユーザー発言（都市データを出すかどうかの判定はこれだけを見る）。 */
function latestUserText(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

/**
 * 都市の治安・生活費を聞かれたときだけ、都市リファレンスのコンテキストを組み立てる。
 *
 * - 判定は deterministic（lib/cityReferenceIntent.ts）。関係ない会話では DB へ触れない。
 * - 都市の優先順位は 発言 > My Plan の確定都市 > Karte stated（conflict でないとき）。
 *   inferred は使わず、確定できなければ「本人に確認する」コンテキストを返す。
 * - 確認済みの情報が無い場合は「情報が無い」コンテキストを返し、捏造させない。
 * - 例外は握り、Chat 本体は必ず継続する（この機能の不調で会話を止めない）。
 */
async function buildCityReferenceContextForTurn(
  messages: { role: string; content: string }[],
  karte: Karte | null,
  planId: string | null,
): Promise<string | null> {
  try {
    const intent = detectCityReferenceIntent(latestUserText(messages));
    if (!intent) return null;

    const supabase = await createClient();

    // My Plan の確定都市は、都市が発言に出ていないときだけ必要になる。
    let myPlanCity: string | null = null;
    if (intent.citiesInMessage.length === 0 && planId) {
      const blueprint = await loadPlanBlueprint(supabase, planId);
      if (blueprint.available) myPlanCity = blueprint.data.destinations.primary?.label ?? null;
    }

    const resolution = resolveCityKeysForChat({
      citiesInMessage: intent.citiesInMessage,
      myPlanCity,
      karteStatedCity: karte ? extractStatedPreferredCity(karte) : null,
      karteCityInConflict: karte ? isPreferredCityInConflict(karte) : false,
    });

    if (resolution.kind === "needsCity") {
      return buildCityReferenceNeedsCityContext(resolution.reason);
    }

    const entries = await loadCityReferenceEntries(supabase, resolution.cityKeys, intent.categories);
    const publicContext = entries.length > 0 ? buildCityReferenceContext(entries, resolution.cityKeys) : null;

    // ここから下は開発・検証時のみ。production では isDevCitySnapshotEnabled() が常に false。
    //
    // fallback は **都市 × category 単位**で行う。公的情報がある category はそちらを使い、
    // 公的情報が無い category だけを開発用の参考指数で補う
    // （例: シドニーは housing / transport が公的にあるので、食費の質問のときだけ食料品の指数を補う）。
    // 公的情報が既にある category を開発用データで上書きすることはない。
    let devContext: string | null = null;
    if (isDevCitySnapshotEnabled()) {
      const requests = resolution.cityKeys
        .map((cityKey) => ({
          cityKey,
          categories: intent.categories.filter(
            (category) => !entries.some((e) => e.cityKey === cityKey && e.category === category),
          ),
        }))
        .filter((request) => request.categories.length > 0);

      if (requests.length > 0) {
        const cityKeysNeedingDev = new Set(requests.map((r) => r.cityKey));
        const snapshots = loadDevCitySnapshots().filter((s) => cityKeysNeedingDev.has(s.cityKey));
        devContext = buildDevCitySnapshotContext(snapshots, requests);
      }
    }

    if (publicContext && devContext) {
      // 公的情報（実額・公的統計）と開発用の参考指数が混ざらないよう、見出しで型を分けて渡す。
      return `${publicContext}\n\n---\n\n${devContext}\n\n上の「都市の参考情報」は公的・一次情報にもとづく正式なデータで、下の「参考指数」は開発・検証用の暫定データです。実額の目安は前者を優先し、後者は都市間の相対的な水準の説明にだけ使ってください。両者の数値を足したり、指数から金額を出したりしないでください。`;
    }
    if (publicContext) return publicContext;
    if (devContext) return devContext;

    return buildCityReferenceNoDataContext(resolution.cityKeys);
  } catch (err) {
    console.error("city reference context error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Karte の該当 field が stated（かつ conflict でない）ときだけ値を返す。 */
function statedBoolean(karte: Karte, block: "work", key: "workingHolidayInterest"): boolean | null {
  const field = karte[block]?.[key];
  if (!field || field.certainty !== "stated" || typeof field.value !== "boolean") return null;
  const inConflict = (karte.handoff?.conflicts ?? []).some((c) => c.block === block && c.key === key);
  return inConflict ? null : field.value;
}

/**
 * ビザ・手続きを聞かれたときだけ、確認済みのビザ情報を組み立てる。
 *
 * - 判定は deterministic（lib/visaReferenceIntent.ts）。関係ない会話では DB へ触れない。
 * - ビザ種別は 発言で明示 > Karte stated の順。inferred では確定せず、決まらなければ確認に回す
 *   （My Plan にはビザの項目が無いため、現時点では渡していない）。
 * - 確認済みデータが無ければ「数値を推測しない」コンテキストを返す。知識ベース側の
 *   安全化済み VISA_SECTION が大枠の fallback として残る。
 * - 例外は握り、Chat 本体は必ず継続する。
 */
async function buildVisaContextForTurn(
  messages: { role: string; content: string }[],
  karte: Karte | null,
): Promise<string | null> {
  try {
    const intent = detectVisaIntent(latestUserText(messages));
    if (!intent) return null;

    const resolution = resolveVisaKeysForChat({
      visaKeysInMessage: intent.visaKeysInMessage,
      myPlanVisaKey: null,
      karteStated: karte
        ? {
            workingHolidayInterest: statedBoolean(karte, "work", "workingHolidayInterest"),
            // 就学の意思は、本人が明言したコース種類がある場合に stated として扱う。
            studyIntent:
              karte.schoolPrefs.courseType.certainty === "stated" && !!karte.schoolPrefs.courseType.value
                ? true
                : null,
          }
        : undefined,
    });

    if (resolution.kind === "needsVisa") {
      return buildVisaNeedsVisaContext(resolution.reason);
    }

    const supabase = await createClient();
    const entries = await loadVisaReferenceEntries(supabase, resolution.visaKeys, intent.categories);

    if (entries.length === 0) {
      return buildVisaNoDataContext(resolution.visaKeys, intent.categories);
    }

    return buildVisaReferenceContext(entries, {
      mentionsTax: intent.mentionsTax,
      mentionsFarmJobSearch: intent.mentionsFarmJobSearch,
    });
  } catch (err) {
    console.error("visa reference context error:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "リクエストの形式が不正です" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { messages, karte, includeKnownFacts, planId } = (body ?? {}) as {
    messages?: unknown;
    karte?: unknown;
    includeKnownFacts?: unknown;
    /** Plan Chat のときだけ送られる。My Plan の確定都市を都市解決の入力に使うためだけに使う。 */
    planId?: unknown;
  };
  if (!isValidMessages(messages)) {
    return new Response(JSON.stringify({ error: "messages が不正です" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // karte は補助情報（都市確定時の学校知識注入用）。無い・不正でもチャット自体は継続する。
  const validKarte = isValidKarte(karte) ? karte : null;
  const preferredCity = validKarte ? extractStatedPreferredCity(validKarte) : null;

  // 既知情報・矛盾の注入はPlan Chat（includeKnownFacts:true）でのみ行う。/widgetは常にnullのまま
  // （空カルテのうちは実質差が出ないが、意図を明示するため常にフラグで判定する）。
  const usePlanKarteContext = includeKnownFacts === true && validKarte !== null;
  const knownFactsText = usePlanKarteContext ? buildKnownFactsText(validKarte) : null;
  const conflictsText = usePlanKarteContext ? buildConflictsText(validKarte) : null;
  const decisionContextText = usePlanKarteContext ? buildDecisionContextText(validKarte) : null;
  const inferredContextText = usePlanKarteContext ? buildInferredContextText(validKarte) : null;

  // 都市の治安・生活費を聞かれたターンだけ、確認済みの都市情報を足す（毎ターンは入れない）。
  const cityReferenceContextText = await buildCityReferenceContextForTurn(
    messages,
    validKarte,
    typeof planId === "string" && planId.length > 0 ? planId : null,
  );

  // ビザ・手続きを聞かれたターンだけ、確認済みのビザ情報を足す（毎ターンは入れない）。
  const visaReferenceContextText = await buildVisaContextForTurn(messages, validKarte);

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(preferredCity, knownFactsText, conflictsText, decisionContextText, {
      // 「一度伝えたことは聞き直さない」等の共有理解ルールは Plan Chat にだけ入れる（/widget は従来どおり）
      planContext: includeKnownFacts === true,
      inferredContextText,
      cityReferenceContextText,
      visaReferenceContextText,
    }),
    messages,
  });
  const iterator = stream[Symbol.asyncIterator]();

  // 最初のイベントを先に取得し、認証・残高不足などの即時エラーは
  // ストリーミングを開始する前に通常のJSONエラーとして返す。
  let first: IteratorResult<Anthropic.Messages.RawMessageStreamEvent>;
  try {
    first = await iterator.next();
  } catch (err) {
    const isApiError = err instanceof Anthropic.APIError;
    console.error("chat request error:", isApiError ? err.message : err);
    return new Response(
      JSON.stringify({
        error: isApiError
          ? "AIサービスへの接続でエラーが発生しました。しばらくしてから再度お試しください。"
          : "予期しないエラーが発生しました。",
      }),
      {
        status: isApiError && err.status ? err.status : 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const encoder = new TextEncoder();

  function extractText(event: Anthropic.Messages.RawMessageStreamEvent): string | null {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      return event.delta.text;
    }
    return null;
  }

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) {
          const text = extractText(first.value);
          if (text) controller.enqueue(encoder.encode(text));
        }
        while (true) {
          const { done, value } = await iterator.next();
          if (done) break;
          const text = extractText(value);
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (err) {
        console.error("chat stream error:", err instanceof Error ? err.message : err);
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
