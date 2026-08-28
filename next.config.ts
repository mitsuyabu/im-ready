import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 同一Wi-Fi内のスマホ実機（http://192.168.10.6:3000）からdev serverを開いた際、
  // Next.js 16はHMR等のdev専用リソースへのcross-origin requestをデフォルトで
  // ブロックする（.next/dev/logs/next-development.logに実際の警告あり）。
  // これによりTurbopackのdev client起動が失敗し、React hydration自体が完了しない
  // （画面・buttonは見えるがonClickが一切発火しない）症状を引き起こしていたため許可する。
  // 本番ビルド（next build/next start）ではこの設定は無視され、影響しない。
  allowedDevOrigins: ["192.168.10.6"],
  async headers() {
    return [
      {
        // /widget は他ドメインの埋め込み（iframe）先として利用される想定のため、
        // フレーム化を明示的に許可する。
        // 開発中はどのドメインからでも埋め込みテストできるよう "*" にしている。
        // 本番では frame-ancestors に許可するホスト名を列挙して絞ること。
        source: "/widget",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *;",
          },
        ],
      },
      {
        // /share/documents/[token] は親向け説明資料（留学動機・予算・不安・出発/行動予定など
        // 個人的な内容）をログイン不要で表示する公開ページ。page側の
        // export const dynamic = "force-dynamic" に加え、HTTP responseとしても
        // キャッシュを明示的に禁止する（共有ブラウザ・プロキシ・CDNに残さない）。
        source: "/share/documents/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
