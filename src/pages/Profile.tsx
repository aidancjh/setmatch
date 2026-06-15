import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getUserHighlights } from "../services/gamesService";
import { api } from "../lib/api";
import type { Highlight, SkillLevel } from "../types";
import { SkillBadge, RatingHero } from "../components/Badges";

const skills: SkillLevel[] = ["Beginner", "Intermediate", "Advanced", "All Levels"];
const GENDER_OPTIONS = ["Man", "Woman", "Non-binary", "Prefer not to say"];
const POSITION_OPTIONS = ["Setter", "Outside Hitter", "Middle Blocker", "Opposite", "Libero", "Defensive Specialist"];

const POSITION_ABBR: Record<string, string> = {
  "Setter": "SET",
  "Outside Hitter": "OH",
  "Middle Blocker": "MB",
  "Opposite": "OPP",
  "Libero": "LIB",
  "Defensive Specialist": "DS",
};

// "" = gradient default; hex = solid color
const BANNER_COLORS = [
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
  "#ef4444", "#64748b", "#0f172a",
];

function computeAge(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const [y, m, d] = birthdate.split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 ? age : null;
}

const SKILL_INFO: Record<SkillLevel, { emoji: string; desc: string }> = {
  Beginner:       { emoji: "🌱", desc: "New to the game. Casual, friendly rallies — mistakes totally fine." },
  Intermediate:   { emoji: "⚡", desc: "Comfortable with bumping, setting, serving. Know the rules and rotations." },
  Advanced:       { emoji: "🏆", desc: "Consistent technique. Competitive experience, performs under pressure." },
  "All Levels":   { emoji: "🤝", desc: "Happy in any game at any pace. Just here to play!" },
};

// ---------------------------------------------------------------------------
// Banner image cropper (3:1 aspect ratio)
// ---------------------------------------------------------------------------

function BannerCropper({
  preview,
  onDone,
  onCancel,
}: {
  preview: string;
  onDone: (file: File) => void;
  onCancel: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [applying, setApplying] = useState(false);

  function clamp(ox: number, oy: number, dw: number, dh: number) {
    const c = containerRef.current;
    if (!c) return { x: ox, y: oy };
    return {
      x: Math.min(0, Math.max(c.offsetWidth - dw, ox)),
      y: Math.min(0, Math.max(c.offsetHeight - dh, oy)),
    };
  }

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    const c = containerRef.current;
    if (!img || !c) return;
    const scale = Math.max(c.offsetWidth / img.naturalWidth, c.offsetHeight / img.naturalHeight);
    const dw = Math.round(img.naturalWidth * scale);
    const dh = Math.round(img.naturalHeight * scale);
    setImgSize({ w: dw, h: dh });
    setOffset({ x: Math.round((c.offsetWidth - dw) / 2), y: Math.round((c.offsetHeight - dh) / 2) });
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setOffset(clamp(
      dragStart.current.ox + (e.clientX - dragStart.current.x),
      dragStart.current.oy + (e.clientY - dragStart.current.y),
      imgSize.w, imgSize.h
    ));
  }
  function onPointerUp() { setDragging(false); }

  async function applyCrop() {
    const img = imgRef.current;
    const c = containerRef.current;
    if (!img || !c) return;
    setApplying(true);
    const cw = c.offsetWidth;
    const ch = c.offsetHeight;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const srcX = -offset.x / scale;
    const srcY = -offset.y / scale;
    const srcW = cw / scale;
    const srcH = ch / scale;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 400;
    const ctx = canvas.getContext("2d")!;
    const source = new Image();
    source.src = preview;
    await new Promise<void>((res) => { source.onload = () => res(); if (source.complete) res(); });
    ctx.drawImage(source, srcX, srcY, srcW, srcH, 0, 0, 1200, 400);
    canvas.toBlob((blob) => {
      if (blob) onDone(new File([blob], "banner.jpg", { type: "image/jpeg" }));
      setApplying(false);
    }, "image/jpeg", 0.92);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onCancel} className="text-sm text-white/60 hover:text-white">Cancel</button>
        <p className="text-sm font-semibold text-white">Crop banner</p>
        <button
          onClick={applyCrop}
          disabled={applying || imgSize.w === 0}
          className="text-sm font-semibold text-brand disabled:opacity-40"
        >
          {applying ? "Saving…" : "Use photo"}
        </button>
      </div>
      <p className="mb-3 text-center text-xs text-white/40">Drag to reposition</p>

      {/* 3:1 crop frame */}
      <div
        ref={containerRef}
        className="relative mx-4 overflow-hidden rounded-2xl bg-slate-900"
        style={{ aspectRatio: "3/1", cursor: dragging ? "grabbing" : "grab", userSelect: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {imgSize.w > 0 && (
          <img
            ref={imgRef}
            src={preview}
            alt="Crop"
            draggable={false}
            onLoad={handleImgLoad}
            className="absolute pointer-events-none"
            style={{ width: imgSize.w, height: imgSize.h, left: offset.x, top: offset.y }}
          />
        )}
        {imgSize.w === 0 && (
          <img
            ref={imgRef}
            src={preview}
            alt="Crop"
            draggable={false}
            onLoad={handleImgLoad}
            className="absolute pointer-events-none opacity-0"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlights grid
// ---------------------------------------------------------------------------

function HighlightGrid({
  highlights,
  onNavigate,
}: {
  highlights: Highlight[];
  onNavigate: () => void;
}) {
  const [playing, setPlaying] = useState<Highlight | null>(null);

  if (highlights.length === 0) {
    return (
      <div className="mt-6">
        <p className="mb-2 text-sm font-semibold text-slate-900">My Highlights</p>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center">
          <p className="text-2xl">🎬</p>
          <p className="mt-1 text-sm text-slate-400">No highlights yet</p>
          <button
            onClick={onNavigate}
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white"
          >
            Share your first clip
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">
          My Highlights <span className="font-normal text-slate-400">({highlights.length})</span>
        </p>
        <button onClick={onNavigate} className="text-xs font-semibold text-brand">
          + Add
        </button>
      </div>

      <div className="grid grid-cols-4 gap-0.5 overflow-hidden rounded-2xl">
        {highlights.map((h) => (
          <button
            key={h.id}
            onClick={() => setPlaying(h)}
            className="relative aspect-square bg-slate-900"
          >
            {h.thumbUrl || h.mediaType === "photo" ? (
              <img src={h.thumbUrl || h.videoUrl} alt={h.caption} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="text-lg text-white/60">▶</span>
              </div>
            )}
            {h.mediaType !== "photo" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition hover:opacity-100">
                <span className="text-base text-white drop-shadow">▶</span>
              </div>
            )}
            {h.likesCount > 0 && (
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/50 px-0.5 text-[9px] text-white">
                ♥{h.likesCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {playing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setPlaying(null)}
        >
          <div
            className="relative mx-4 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            {playing.mediaType === "photo" ? (
              <img src={playing.videoUrl} alt={playing.caption} className="w-full rounded-2xl object-contain" />
            ) : (
              <video src={playing.videoUrl} controls autoPlay className="w-full rounded-2xl" />
            )}
            {playing.caption && (
              <p className="mt-2 text-center text-sm text-white/80">{playing.caption}</p>
            )}
            <button
              onClick={() => setPlaying(null)}
              className="absolute -top-10 right-0 text-white/60 hover:text-white"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Profile() {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [stats, setStats] = useState<{ gamesHosted: number; gamesPlayed: number } | null>(null);

  // Banner customization
  const [bannerColor, setBannerColor] = useState(user?.bannerColor || "");
  const [bannerImage, setBannerImage] = useState(user?.bannerImage || "");
  const [bannerPickerOpen, setBannerPickerOpen] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState("");
  const bannerFileRef = useRef<HTMLInputElement>(null);

  // Edit-mode state
  const [name, setName] = useState(user?.name ?? "");
  const [skill, setSkill] = useState<SkillLevel>(user?.skill ?? "Intermediate");
  const [homeArea, setHomeArea] = useState(user?.homeArea ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [birthdate, setBirthdate] = useState(user?.birthdate ?? "");
  const [userGender, setUserGender] = useState(user?.userGender ?? "");
  const [showAge, setShowAge] = useState(user?.showAge !== false);
  const [showGender, setShowGender] = useState(user?.showGender !== false);
  const [favoritePositions, setFavoritePositions] = useState<string[]>(user?.favoritePositions ?? []);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showSkillInfo, setShowSkillInfo] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  useEffect(() => {
    if (user?.id) {
      getUserHighlights(user.id).then(setHighlights).catch(() => {});
      api.get<{ gamesHosted: number; gamesPlayed: number }>(`/users/${user.id}/profile`)
        .then(setStats).catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    setBannerColor(user?.bannerColor || "");
    setBannerImage(user?.bannerImage || "");
  }, [user?.bannerColor, user?.bannerImage]);

  // Banner color selection — auto-saves
  const handleColorSelect = async (color: string) => {
    setBannerColor(color);
    setBannerImage("");
    setBannerPickerOpen(false);
    try { await updateProfile({ bannerColor: color, bannerImage: "" }); } catch { /* silent */ }
  };

  // File selected → open cropper
  const handleBannerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBannerCropSrc(URL.createObjectURL(file));
    if (bannerFileRef.current) bannerFileRef.current.value = "";
  };

  // Crop confirmed → upload to Cloudinary → save
  const handleBannerCropDone = async (file: File) => {
    setBannerCropSrc("");
    setBannerPickerOpen(false);
    setBannerUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", uploadPreset);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: fd }
      );
      const data = await res.json();
      if (data.secure_url) {
        const img = data.secure_url;
        setBannerImage(img);
        try { await updateProfile({ bannerColor, bannerImage: img }); } catch { /* silent */ }
      }
    } catch { /* silent */ } finally {
      setBannerUploading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cloudName || !uploadPreset) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", uploadPreset);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: "POST", body: fd }
      );
      const data = await res.json();
      if (data.secure_url) setAvatarUrl(data.secure_url);
    } catch { /* silent */ } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setError("");
    try {
      await updateProfile({
        name: name.trim() || "You",
        skill,
        homeArea: homeArea.trim(),
        bio: bio.trim(),
        avatarUrl,
        birthdate: birthdate || null,
        userGender,
        showAge,
        showGender,
        favoritePositions,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); setEditing(false); }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    }
  };

  const handleCancelEdit = () => {
    setName(user?.name ?? "");
    setSkill(user?.skill ?? "Intermediate");
    setHomeArea(user?.homeArea ?? "");
    setBio(user?.bio ?? "");
    setAvatarUrl(user?.avatarUrl ?? "");
    setBirthdate(user?.birthdate ?? "");
    setUserGender(user?.userGender ?? "");
    setShowAge(user?.showAge !== false);
    setShowGender(user?.showGender !== false);
    setFavoritePositions(user?.favoritePositions ?? []);
    setError("");
    setEditing(false);
  };

  const initials = ((user?.name ?? "Y").trim() || "Y").charAt(0).toUpperCase();
  const displayAvatar = avatarUrl || user?.avatarUrl;

  // "" = gradient (default), hex = solid, bannerImage = photo
  const bannerStyle = bannerImage
    ? { backgroundImage: `url(${bannerImage})`, backgroundSize: "cover", backgroundPosition: "center" }
    : bannerColor
      ? { backgroundColor: bannerColor }
      : undefined;
  const bannerCls = `relative h-24${!bannerStyle ? " bg-gradient-to-br from-brand to-orange-400" : ""}`;

  // ── Edit mode ────────────────────────────────────────────────────────────

  if (editing) {
    return (
      <div>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={handleCancelEdit} className="text-sm font-medium text-slate-400 hover:text-slate-700">
            ← Cancel
          </button>
          <h1 className="text-lg font-bold text-slate-900">Edit profile</h1>
        </div>

        <div className="mb-5 flex flex-col items-center">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-brand text-3xl font-bold text-white"
          >
            {displayAvatar ? (
              <img src={displayAvatar} alt={name} className="h-full w-full object-cover" />
            ) : initials}
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <span className="text-xs font-semibold text-white">{uploading ? "…" : "📷"}</span>
            </div>
          </button>
          <p className="mt-1.5 text-xs text-slate-400">Tap to change photo</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Bio</span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))}
              placeholder="Tell other players a bit about yourself…" rows={2}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
            <p className="mt-0.5 text-right text-xs text-slate-400">{bio.length}/300</p>
          </label>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-sm font-medium text-slate-700">Skill level</span>
              <button onClick={() => setShowSkillInfo((v) => !v)}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[11px] font-bold text-slate-400 hover:border-brand hover:text-brand transition">
                ?
              </button>
            </div>
            {showSkillInfo && (
              <div className="mb-3 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                {(Object.entries(SKILL_INFO) as [SkillLevel, { emoji: string; desc: string }][]).map(([s, { emoji, desc }]) => (
                  <div key={s} className="flex gap-2 text-sm">
                    <span className="shrink-0">{emoji}</span>
                    <div><span className="font-semibold text-slate-800">{s}:</span>{" "}<span className="text-slate-500">{desc}</span></div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <button key={s} onClick={() => setSkill(s)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${skill === s ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Home area</span>
            <input value={homeArea} onChange={(e) => setHomeArea(e.target.value)}
              placeholder="e.g. Santa Monica"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Birthday</span>
            <input type="date" value={birthdate || ""} onChange={(e) => setBirthdate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400" />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Gender</span>
            <div className="flex flex-wrap gap-1.5">
              {GENDER_OPTIONS.map((g) => (
                <button key={g} type="button" onClick={() => setUserGender(g === userGender ? "" : g)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${userGender === g ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Favorite positions</span>
            <div className="flex flex-wrap gap-1.5">
              {POSITION_OPTIONS.map((p) => {
                const active = favoritePositions.includes(p);
                return (
                  <button key={p} type="button"
                    onClick={() => setFavoritePositions((prev) => active ? prev.filter((x) => x !== p) : [...prev, p])}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Privacy</p>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-slate-700">Show my age on profile</span>
              <button type="button" onClick={() => setShowAge((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${showAge ? "bg-brand" : "bg-slate-200"}`}>
                <span className={`mt-0.5 ml-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${showAge ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-slate-700">Show my gender on profile</span>
              <button type="button" onClick={() => setShowGender((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${showGender ? "bg-brand" : "bg-slate-200"}`}>
                <span className={`mt-0.5 ml-0.5 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${showGender ? "translate-x-4" : "translate-x-0"}`} />
              </button>
            </label>
          </div>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}

          <button onClick={handleSave}
            className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-dark">
            {saved ? "Saved ✓" : "Save profile"}
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {user?.role === "admin" && (
            <button onClick={() => navigate("/admin")}
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              🛠 Admin dashboard
            </button>
          )}
          <button onClick={() => { logout(); navigate("/"); }}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ── View mode ────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Profile card */}
      <div className="relative mb-4 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">

        {/* Banner */}
        <div className={bannerCls} style={bannerStyle ?? undefined}>
          {bannerPickerOpen && (
            <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-white/70" />
          )}
          <button
            onClick={() => setBannerPickerOpen((v) => !v)}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-white transition hover:bg-black/40 active:scale-90"
            aria-label={bannerPickerOpen ? "Close background editor" : "Edit background"}
          >
            {bannerPickerOpen ? (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            )}
          </button>
        </div>

        <div className="px-4 pb-5">
          {/* Avatar — centered, overlapping banner */}
          <div className="-mt-12 flex justify-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-3xl font-bold text-white ring-4 ring-white">
              {displayAvatar ? (
                <img src={displayAvatar} alt={user?.name} className="h-full w-full object-cover" />
              ) : initials}
            </div>
          </div>

          {/* Name + info — centered */}
          <div className="mt-3 text-center">
            <p className="text-xl font-bold text-slate-900">{user?.name || "You"}</p>
            <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
              <SkillBadge skill={user?.skill ?? "Intermediate"} />
              {user?.homeArea && (
                <span className="text-xs text-slate-400">📍 {user.homeArea}</span>
              )}
            </div>
            {(() => {
              const age = computeAge(user?.birthdate);
              const parts = [
                user?.showAge !== false && age !== null ? `${age} yrs` : null,
                user?.showGender !== false && user?.userGender ? user.userGender : null,
              ].filter(Boolean);
              return parts.length > 0 ? (
                <p className="mt-1 text-xs text-slate-400">{parts.join(" · ")}</p>
              ) : null;
            })()}
          </div>

          {/* Edit button */}
          <button
            onClick={() => setEditing(true)}
            className="mt-4 w-full rounded-xl border border-brand/30 bg-brand/5 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10 active:scale-[0.98]"
          >
            ✏️ Edit profile
          </button>

          {/* Banner picker box */}
          {bannerPickerOpen && (
            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              {/* Gradient default swatch + color swatches */}
              <div className="grid grid-cols-6 gap-2.5">
                {/* Default gradient swatch */}
                <button
                  onClick={() => handleColorSelect("")}
                  className="aspect-square w-full rounded-xl transition active:scale-90"
                  style={{
                    background: "linear-gradient(135deg, #f4634e, #f97316)",
                    outline: !bannerColor && !bannerImage ? "3px solid rgba(0,0,0,0.35)" : "none",
                    outlineOffset: "2px",
                  }}
                  aria-label="Default gradient"
                />
                {BANNER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleColorSelect(c)}
                    className="aspect-square w-full rounded-xl transition active:scale-90"
                    style={{
                      backgroundColor: c,
                      outline: bannerColor === c && !bannerImage ? "3px solid rgba(0,0,0,0.35)" : "none",
                      outlineOffset: "2px",
                    }}
                    aria-label={`Set banner color`}
                  />
                ))}
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <button
                  onClick={() => bannerFileRef.current?.click()}
                  disabled={bannerUploading}
                  className="w-full rounded-xl border border-dashed border-slate-200 py-3 text-sm text-slate-500 transition hover:border-brand/40 hover:text-brand disabled:opacity-50"
                >
                  {bannerUploading ? "Uploading…" : "Insert your own image"}
                </button>
                {bannerImage && (
                  <button
                    onClick={async () => {
                      setBannerImage("");
                      try { await updateProfile({ bannerColor, bannerImage: "" }); } catch { /* silent */ }
                    }}
                    className="mt-1.5 w-full text-center text-xs text-slate-400 transition hover:text-rose-500"
                  >
                    Remove image
                  </button>
                )}
                <input
                  ref={bannerFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBannerFileSelect}
                />
              </div>
            </div>
          )}

          {/* Bio */}
          {user?.bio ? (
            <p className="mt-4 border-t border-slate-50 pt-4 text-sm leading-relaxed text-slate-600">
              {user.bio}
            </p>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="mt-4 w-full border-t border-slate-50 pt-4 text-center text-xs text-slate-300 hover:text-brand"
            >
              + Add a bio…
            </button>
          )}

          {/* Player rating */}
          {user?.playerRating && user.playerRating.count > 0 && (
            <div className="mt-4">
              <RatingHero avg={user.playerRating.avg ?? 0} count={user.playerRating.count} />
            </div>
          )}

          {/* Favorite positions */}
          {user?.favoritePositions && user.favoritePositions.length > 0 && (
            <div className="mt-4 border-t border-slate-50 pt-4">
              <p className="mb-1.5 text-xs font-medium text-slate-400">Positions</p>
              <div className="flex flex-wrap gap-1.5">
                {user.favoritePositions.map((p) => (
                  <span key={p} className="rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">{p}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats cards — outside card, 3-col */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-gradient-to-br from-brand/10 to-orange-100/60 p-3 text-center ring-1 ring-brand/15">
          <p className="text-2xl font-bold text-brand">{stats?.gamesHosted ?? "—"}</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">Hosted</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/60 p-3 text-center ring-1 ring-sky-200/60">
          <p className="text-2xl font-bold text-sky-600">{stats?.gamesPlayed ?? "—"}</p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">Joined</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-3 text-center ring-1 ring-emerald-200/60">
          <p className="text-2xl font-bold text-emerald-600">
            {user?.favoritePositions?.[0]
              ? (POSITION_ABBR[user.favoritePositions[0]] ?? user.favoritePositions[0].slice(0, 3).toUpperCase())
              : "—"}
          </p>
          <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">Position</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mb-4 space-y-2">
        {user?.role === "admin" && (
          <button onClick={() => navigate("/admin")}
            className="w-full rounded-xl border border-brand/30 bg-brand/5 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/10 active:scale-[0.98]">
            🛠 Admin dashboard
          </button>
        )}
        <button onClick={() => { logout(); navigate("/"); }}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]">
          Sign out
        </button>
      </div>

      {/* Highlights feed */}
      <HighlightGrid
        highlights={highlights}
        onNavigate={() => navigate("/highlights?upload=1")}
      />

      {/* Banner image cropper modal */}
      {bannerCropSrc && (
        <BannerCropper
          preview={bannerCropSrc}
          onDone={handleBannerCropDone}
          onCancel={() => setBannerCropSrc("")}
        />
      )}
    </div>
  );
}
