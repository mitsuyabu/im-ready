import { Karte } from "@/lib/karte";

/**
 * "inline"（既定・/widget向け）: 既存の見た目そのまま。
 * "corner"（Plan Chat向け）: 通常UIから目立たない、右寄せの小さなトリガーにするだけの見た目違い。
 * どちらもdevelopment環境限定（呼び出し側のisDevガードは変更していない）で、中身（JSON.stringify）は同一。
 */
export default function KarteDebugPanel({
  karte,
  variant = "inline",
}: {
  karte: Karte;
  variant?: "inline" | "corner";
}) {
  if (variant === "corner") {
    return (
      <details className="mx-4 mb-2 ml-auto w-fit max-w-[min(20rem,100%)] rounded-md border border-amber-300 bg-amber-50/90 text-[10px] dark:border-amber-800 dark:bg-amber-950/90">
        <summary className="cursor-pointer select-none px-2 py-1 font-medium text-amber-800 dark:text-amber-300">
          dev: karte
        </summary>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all border-t border-amber-200 px-2 py-1 text-amber-900 dark:border-amber-800 dark:text-amber-200">
          {JSON.stringify(karte, null, 2)}
        </pre>
      </details>
    );
  }

  return (
    <details className="mx-4 mb-2 rounded-lg border border-amber-300 bg-amber-50 text-xs dark:border-amber-800 dark:bg-amber-950">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-amber-800 dark:text-amber-300">
        開発用: カルテを表示
      </summary>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all border-t border-amber-200 px-3 py-2 text-amber-900 dark:border-amber-800 dark:text-amber-200">
        {JSON.stringify(karte, null, 2)}
      </pre>
    </details>
  );
}
