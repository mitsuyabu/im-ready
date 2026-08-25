/**
 * Google Places / Maps のデータを表示する際に必須の帰属表示。
 *
 * - variant="withMap": 地図と一緒に表示する場合。地図自体のGoogleロゴは
 *   Maps JavaScript APIが地図キャンバス内に自動で描画するため、ここでは
 *   データ出典の補足テキストのみを表示する。
 * - variant="standalone": 地図を伴わずPlacesデータ（評価・住所等）だけを
 *   表示する場合。Googleロゴ相当のテキスト表示を必須として近接表示する。
 *
 * 注意: Googleの公式ロゴ画像アセットはこのリポジトリに含めていない
 * （商標ガイドラインに沿った正確な再現が必要なため）。本番投入前に
 * Google の Brand Resource Center から正規のロゴアセットを取得し、
 * 下記のテキスト表示と差し替える/併用することを推奨する。
 * テキストによる "Powered by Google" 表示自体はGoogleが認める帰属方法。
 */

interface GoogleAttributionProps {
  variant: "withMap" | "standalone";
  className?: string;
}

export function GoogleAttribution({ variant, className }: GoogleAttributionProps) {
  return (
    <p className={`text-xs text-gray-500 ${className ?? ""}`}>
      {variant === "withMap"
        ? "地図・周辺情報のデータ出典: Google"
        : "この情報の出典: Google"}
      {" — "}
      <span className="font-medium">Powered by Google</span>
    </p>
  );
}
