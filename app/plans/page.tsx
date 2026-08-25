import { redirect } from "next/navigation";

/**
 * Plan一覧の主役は /mypage へ一本化した。旧URL（ブックマーク・内部リンク）を壊さないよう、
 * このルート自体は削除せず、/mypage へのredirectだけ残す。
 * /plans/[planId] 以下（Plan Home・Chat・Worksheet）には一切影響しない。
 */
export default function PlansPage() {
  redirect("/mypage");
}
