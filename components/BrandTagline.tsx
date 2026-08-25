/**
 * 「I'm ready!」のサービスコピー（メインコピー＋サブコピー）。文言は固定で、
 * Home（/mypage）・Login（/login）・入口ページ（/）の3箇所で共通利用する。
 * ブランド名（"I'm ready!"というテキスト）自体はここには含めない
 * （呼び出し側のBrandLogo、またはSidebarが担う。テキストでの二重表示を避けるため）。
 */
export default function BrandTagline({ align = "center" }: { align?: "center" | "left" }) {
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      <p className="text-xl font-semibold leading-snug text-worksheet-primary sm:text-2xl">
        あなたの「行きたい」を、かたちにする。
      </p>
      <p className="mt-2 text-sm text-worksheet-secondary">留学・ワーホリの準備ワークスペース</p>
    </div>
  );
}
