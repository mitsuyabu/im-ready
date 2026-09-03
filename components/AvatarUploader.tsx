"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { initialsFrom } from "@/lib/accountProfile";

/**
 * プロフィール画像のアップロード / 削除（Account ページ内でのみ表示）。
 *
 * - Supabase Storage の private bucket "avatars" に {userId}/avatar.webp で保存する。
 * - アップロード前に client 側で type / サイズを検証し、canvas で正方形 center crop ＋
 *   最大 512px へ縮小してから WebP で保存する（新しい画像ライブラリは追加しない）。
 * - 保存に成功したら profiles.avatar_path を upsert し、署名付き URL を取り直して表示を更新する。
 * - 失敗時は既存の avatar 表示を消さない（optimistic な見せかけ成功はしない）。
 * - 表示は署名付き URL の <img>（private のため next/image の remote 設定は使わない）。
 *
 * AppNav / Menu のアイコンには反映しない（別タスク）。Plan / Karte にも一切書き込まない。
 */

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const OUTPUT_SIZE = 512;
const SIGNED_URL_TTL = 60 * 60; // 1h

function GenericUserIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c1.2-3.7 4.1-5.4 7.5-5.4s6.3 1.7 7.5 5.4" />
    </svg>
  );
}

/** File を正方形 center-crop ＋ 最大 OUTPUT_SIZE へ縮小した WebP Blob にする。 */
async function toSquareWebpBlob(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode-failed"));
    el.src = dataUrl;
  });

  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error("empty-image");
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const target = Math.min(OUTPUT_SIZE, side);

  const canvas = document.createElement("canvas");
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas-context");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", 0.85),
  );
  if (!blob) throw new Error("encode-failed");
  return blob;
}

export default function AvatarUploader({
  userId,
  initialAvatarPath,
  initialAvatarUrl,
  displayName,
  email,
  onAvatarPathChange,
}: {
  userId: string;
  initialAvatarPath: string | null;
  initialAvatarUrl: string | null;
  displayName: string;
  email: string | null;
  onAvatarPathChange?: (path: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(initialAvatarPath);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initials = initialsFrom(displayName, email);

  async function refreshSignedUrl(path: string) {
    const supabase = createClient();
    const { data } = await supabase.storage.from("avatars").createSignedUrl(path, SIGNED_URL_TTL);
    if (data?.signedUrl) {
      // 同一 path を上書きするため、cache bust の param を付ける（§31）。
      const sep = data.signedUrl.includes("?") ? "&" : "?";
      setAvatarUrl(`${data.signedUrl}${sep}t=${Date.now()}`);
    }
  }

  async function handleFile(file: File) {
    setError(null);

    if (!ACCEPTED.includes(file.type)) {
      setError("JPEG / PNG / WebP のいずれかの画像を選んでください。");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("画像サイズは 5MB 以下にしてください。");
      return;
    }

    setBusy("upload");
    try {
      const blob = await toSquareWebpBlob(file);
      const path = `${userId}/avatar.webp`;
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/webp" });
      if (uploadError) {
        setError("画像をアップロードできませんでした。しばらくしてから再度お試しください。");
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          { user_id: userId, avatar_path: path, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (profileError) {
        setError("プロフィールを更新できませんでした。しばらくしてから再度お試しください。");
        return;
      }

      setAvatarPath(path);
      onAvatarPathChange?.(path);
      await refreshSignedUrl(path);
    } catch {
      setError("画像を処理できませんでした。別の画像でお試しください。");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete() {
    if (!avatarPath) return;
    setError(null);
    setBusy("delete");
    try {
      const supabase = createClient();
      const { error: removeError } = await supabase.storage.from("avatars").remove([avatarPath]);
      if (removeError) {
        setError("画像を削除できませんでした。しばらくしてから再度お試しください。");
        return;
      }
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert(
          { user_id: userId, avatar_path: null, updated_at: new Date().toISOString() },
          { onConflict: "user_id" },
        );
      if (profileError) {
        setError("プロフィールを更新できませんでした。しばらくしてから再度お試しください。");
        return;
      }
      setAvatarPath(null);
      setAvatarUrl(null);
      onAvatarPathChange?.(null);
    } catch {
      setError("通信エラーが発生しました。ネットワーク状態を確認してください。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-4 sm:gap-5">
      <div className="relative">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- private bucket の署名付き URL のため next/image は使わない
          <img
            src={avatarUrl}
            alt="プロフィール画像"
            width={96}
            height={96}
            className="h-20 w-20 rounded-full border border-[#e6e2d8] object-cover sm:h-24 sm:w-24"
          />
        ) : (
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full border border-[#e6e2d8] bg-[#f2efe6] text-2xl font-semibold text-[#5f7050] sm:h-24 sm:w-24"
            aria-hidden={initials ? undefined : true}
          >
            {initials ? initials : <GenericUserIcon className="h-9 w-9 text-[#8a8578]" />}
          </div>
        )}
      </div>

      <div className="min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null}
            className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-[#1e2b3d] px-4 py-2 text-sm font-medium text-[#172033] transition-colors duration-150 hover:bg-[#1e2b3d]/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "upload" ? "アップロード中…" : "画像を変更"}
          </button>
          {avatarPath && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy !== null}
              className="inline-flex min-h-[40px] items-center justify-center rounded-full px-3 py-2 text-sm text-[#8a5a3c] transition-colors duration-150 hover:bg-[#8a5a3c]/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "delete" ? "削除中…" : "削除"}
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs text-[#817b71]">JPEG / PNG / WebP・5MB まで</p>
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
