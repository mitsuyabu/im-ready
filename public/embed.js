(function () {
  "use strict";

  if (window.__ryugakuWidgetLoaded) return;
  window.__ryugakuWidgetLoaded = true;

  var currentScript = document.currentScript;
  if (!currentScript || !currentScript.src) return;

  var WIDGET_ORIGIN = new URL(currentScript.src, window.location.href).origin;
  var TENANT_KEY = currentScript.getAttribute("data-key") || "";

  var WIDGET_SRC =
    WIDGET_ORIGIN +
    "/widget" +
    (TENANT_KEY ? "?key=" + encodeURIComponent(TENANT_KEY) : "");

  var isOpen = false;
  var iframeLoaded = false;

  var host = document.createElement("div");
  host.setAttribute("data-ryugaku-widget-host", "");
  document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: "closed" });

  var style = document.createElement("style");
  style.textContent =
    ".ryugaku-toggle{position:fixed;right:20px;bottom:20px;width:56px;height:56px;" +
    "border-radius:9999px;border:none;background:#2563eb;color:#fff;font-size:24px;" +
    "line-height:56px;text-align:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);" +
    "z-index:2147483000;padding:0;}" +
    ".ryugaku-toggle:hover{background:#1d4ed8;}" +
    ".ryugaku-panel{position:fixed;right:20px;bottom:88px;width:360px;max-width:calc(100vw - 40px);" +
    "height:600px;max-height:calc(100vh - 120px);border-radius:16px;overflow:hidden;" +
    "box-shadow:0 8px 30px rgba(0,0,0,.3);z-index:2147483000;display:none;background:#fff;}" +
    ".ryugaku-panel.open{display:block;}" +
    ".ryugaku-panel iframe{width:100%;height:100%;border:0;display:block;}";
  shadow.appendChild(style);

  var toggleButton = document.createElement("button");
  toggleButton.className = "ryugaku-toggle";
  toggleButton.type = "button";
  toggleButton.setAttribute("aria-label", "留学カウンセリングAIを開く");
  toggleButton.textContent = "💬";
  shadow.appendChild(toggleButton);

  var panel = document.createElement("div");
  panel.className = "ryugaku-panel";
  shadow.appendChild(panel);

  var iframe = document.createElement("iframe");
  iframe.title = "留学カウンセリングAI";
  // 初回オープン時に src をセットする（未使用時に無駄な読み込みをしないため）

  function openPanel() {
    if (!iframeLoaded) {
      iframe.src = WIDGET_SRC;
      panel.appendChild(iframe);
      iframeLoaded = true;
    }
    panel.classList.add("open");
    toggleButton.textContent = "×";
    toggleButton.setAttribute("aria-label", "留学カウンセリングAIを閉じる");
    isOpen = true;
  }

  function closePanel() {
    panel.classList.remove("open");
    toggleButton.textContent = "💬";
    toggleButton.setAttribute("aria-label", "留学カウンセリングAIを開く");
    isOpen = false;
  }

  toggleButton.addEventListener("click", function () {
    if (isOpen) {
      closePanel();
    } else {
      openPanel();
    }
  });

  // iframe（/widget）からの postMessage を受け取り、開閉などを制御する。
  // 埋め込み先は任意のドメインになり得るため、送信元 origin はウィジェット自身のオリジンで検証する。
  window.addEventListener("message", function (event) {
    if (event.origin !== WIDGET_ORIGIN) return;
    var data = event.data;
    if (!data || data.source !== "ryugaku-widget") return;
    if (data.type === "close") {
      closePanel();
    }
    // TODO: 将来、高さ調整が必要になった場合は data.type === "resize" 等を追加する。
  });
})();
