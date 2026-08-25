"use client";

import { useEffect, useState } from "react";

export default function EmbedCloseButton() {
  const [isEmbedded, setIsEmbedded] = useState(false);

  useEffect(() => {
    setIsEmbedded(window.self !== window.top);
  }, []);

  if (!isEmbedded) return null;

  function handleClose() {
    // 埋め込み先は任意のドメインになり得るため targetOrigin は "*" とする。
    // 送信内容は開閉シグナルのみで機微な情報は含まない。
    window.parent.postMessage({ source: "ryugaku-widget", type: "close" }, "*");
  }

  return (
    <button
      type="button"
      onClick={handleClose}
      aria-label="ウィジェットを閉じる"
      className="rounded-md px-2 py-1 text-lg leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
    >
      ×
    </button>
  );
}
