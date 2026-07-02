"use client";

import { useState } from "react";

// DiceBear avataaars uses PascalCase values (matching the original avataaars library)
// e.g. topType=ShortHairShortFlat, eyeType=Default, mouthType=Smile

const DB_BASE = "https://api.dicebear.com/9.x/avataaars/svg";
const BG = "b6e3f4";

export type AvataaarsConfig = {
  topType: string;
  hairColor: string;
  facialHairType: string;
  facialHairColor: string;
  accessoriesType: string;
  clotheType: string;
  clotheColor: string;
  eyeType: string;
  eyebrowType: string;
  mouthType: string;
  skinColor: string;
};

export const DEFAULT_AVATAAARS_CONFIG: AvataaarsConfig = {
  topType: "ShortHairShortFlat",
  hairColor: "Brown",
  facialHairType: "Blank",
  facialHairColor: "Brown",
  accessoriesType: "Blank",
  clotheType: "Hoodie",
  clotheColor: "PastelBlue",
  eyeType: "Default",
  eyebrowType: "Default",
  mouthType: "Smile",
  skinColor: "Light",
};

export function buildAvataaarsUrl(cfg: AvataaarsConfig): string {
  const p = new URLSearchParams({
    backgroundColor: BG,
    topType: cfg.topType,
    hairColor: cfg.hairColor,
    facialHairType: cfg.facialHairType,
    facialHairColor: cfg.facialHairColor,
    accessoriesType: cfg.accessoriesType,
    clotheType: cfg.clotheType,
    clotheColor: cfg.clotheColor,
    eyeType: cfg.eyeType,
    eyebrowType: cfg.eyebrowType,
    mouthType: cfg.mouthType,
    skinColor: cfg.skinColor,
  });
  return `${DB_BASE}?${p.toString()}`;
}

export const DEFAULT_AVATAAARS_URL = buildAvataaarsUrl(DEFAULT_AVATAAARS_CONFIG);

export function parseAvataaarsUrl(url: string): AvataaarsConfig | null {
  if (!url.startsWith(DB_BASE)) return null;
  try {
    const p = new URLSearchParams(url.slice(DB_BASE.length + 1));
    return {
      topType:        p.get("topType")        ?? DEFAULT_AVATAAARS_CONFIG.topType,
      hairColor:      p.get("hairColor")      ?? DEFAULT_AVATAAARS_CONFIG.hairColor,
      facialHairType: p.get("facialHairType") ?? DEFAULT_AVATAAARS_CONFIG.facialHairType,
      facialHairColor:p.get("facialHairColor")?? DEFAULT_AVATAAARS_CONFIG.facialHairColor,
      accessoriesType:p.get("accessoriesType")?? DEFAULT_AVATAAARS_CONFIG.accessoriesType,
      clotheType:     p.get("clotheType")     ?? DEFAULT_AVATAAARS_CONFIG.clotheType,
      clotheColor:    p.get("clotheColor")    ?? DEFAULT_AVATAAARS_CONFIG.clotheColor,
      eyeType:        p.get("eyeType")        ?? DEFAULT_AVATAAARS_CONFIG.eyeType,
      eyebrowType:    p.get("eyebrowType")    ?? DEFAULT_AVATAAARS_CONFIG.eyebrowType,
      mouthType:      p.get("mouthType")      ?? DEFAULT_AVATAAARS_CONFIG.mouthType,
      skinColor:      p.get("skinColor")      ?? DEFAULT_AVATAAARS_CONFIG.skinColor,
    };
  } catch { return null; }
}

// ── Option values (PascalCase, matching original avataaars library) ────────────

const TOP_TYPES = [
  { id: "NoHair",                    label: "Bald" },
  { id: "Eyepatch",                  label: "Eyepatch" },
  { id: "Hat",                       label: "Cap" },
  { id: "Hijab",                     label: "Hijab" },
  { id: "Turban",                    label: "Turban" },
  { id: "WinterHat1",                label: "Beanie 1" },
  { id: "WinterHat2",                label: "Beanie 2" },
  { id: "WinterHat3",                label: "Beanie 3" },
  { id: "WinterHat4",                label: "Beanie 4" },
  { id: "LongHairBigHair",           label: "Big Hair" },
  { id: "LongHairBob",               label: "Bob" },
  { id: "LongHairBun",               label: "Bun" },
  { id: "LongHairCurly",             label: "Curly Long" },
  { id: "LongHairCurvy",             label: "Curvy" },
  { id: "LongHairDreads",            label: "Dreads" },
  { id: "LongHairFrida",             label: "Frida" },
  { id: "LongHairFro",               label: "Afro" },
  { id: "LongHairFroBand",           label: "Afro + Band" },
  { id: "LongHairMiaWallace",        label: "Mia" },
  { id: "LongHairNotTooLong",        label: "Semi-Long" },
  { id: "LongHairShavedSides",       label: "Shaved Sides" },
  { id: "LongHairStraight",          label: "Straight" },
  { id: "LongHairStraight2",         label: "Straight 2" },
  { id: "LongHairStraightStrand",    label: "Strand" },
  { id: "ShortHairDreads01",         label: "Short Dreads" },
  { id: "ShortHairDreads02",         label: "Short Dreads 2" },
  { id: "ShortHairFrizzle",          label: "Frizzle" },
  { id: "ShortHairShaggyMullet",     label: "Mullet" },
  { id: "ShortHairShortCurly",       label: "Short Curly" },
  { id: "ShortHairShortFlat",        label: "Short Flat" },
  { id: "ShortHairShortRound",       label: "Short Round" },
  { id: "ShortHairShortWaved",       label: "Short Waved" },
  { id: "ShortHairSides",            label: "Sides" },
  { id: "ShortHairTheCaesar",        label: "Caesar" },
  { id: "ShortHairTheCaesarSidePart",label: "Caesar Side" },
];

const HAIR_COLORS = [
  { id: "Auburn",       hex: "#A55728" },
  { id: "Black",        hex: "#2C1B18" },
  { id: "Blonde",       hex: "#B58143" },
  { id: "BlondeGolden", hex: "#D6B370" },
  { id: "Brown",        hex: "#724133" },
  { id: "BrownDark",    hex: "#4A312C" },
  { id: "PastelPink",   hex: "#F59797" },
  { id: "Platinum",     hex: "#ECDCBF" },
  { id: "Red",          hex: "#C93305" },
  { id: "SilverGray",   hex: "#E8E1E1" },
];

const FACIAL_HAIR_TYPES = [
  { id: "Blank",           label: "None" },
  { id: "BeardLight",      label: "Light Beard" },
  { id: "BeardMedium",     label: "Medium Beard" },
  { id: "BeardMajestic",   label: "Full Beard" },
  { id: "MoustacheFancy",  label: "Fancy Moustache" },
  { id: "MoustacheMagnum", label: "Magnum" },
];

const FACIAL_HAIR_COLORS = [
  { id: "Auburn",       hex: "#A55728" },
  { id: "Black",        hex: "#2C1B18" },
  { id: "Blonde",       hex: "#B58143" },
  { id: "BlondeGolden", hex: "#D6B370" },
  { id: "Brown",        hex: "#724133" },
  { id: "BrownDark",    hex: "#4A312C" },
  { id: "Platinum",     hex: "#ECDCBF" },
  { id: "Red",          hex: "#C93305" },
];

const SKIN_COLORS = [
  { id: "Tanned",    hex: "#FD9841" },
  { id: "Yellow",    hex: "#F8D25C" },
  { id: "Pale",      hex: "#FFDBB4" },
  { id: "Light",     hex: "#EDB98A" },
  { id: "Brown",     hex: "#D08B5B" },
  { id: "DarkBrown", hex: "#AE5D29" },
  { id: "Black",     hex: "#614335" },
];

const EYE_TYPES = [
  { id: "Close",      label: "Closed" },
  { id: "Cry",        label: "Cry" },
  { id: "Default",    label: "Default" },
  { id: "Dizzy",      label: "Dizzy" },
  { id: "EyeRoll",    label: "Eye Roll" },
  { id: "Happy",      label: "Happy" },
  { id: "Hearts",     label: "Hearts" },
  { id: "Side",       label: "Side" },
  { id: "Squint",     label: "Squint" },
  { id: "Surprised",  label: "Surprised" },
  { id: "Wink",       label: "Wink" },
  { id: "WinkWacky",  label: "Wacky" },
];

const EYEBROW_TYPES = [
  { id: "Angry",                  label: "Angry" },
  { id: "AngryNatural",           label: "Angry Natural" },
  { id: "Default",                label: "Default" },
  { id: "DefaultNatural",         label: "Natural" },
  { id: "FlatNatural",            label: "Flat" },
  { id: "RaisedExcited",          label: "Raised" },
  { id: "RaisedExcitedNatural",   label: "Raised Natural" },
  { id: "SadConcerned",           label: "Sad" },
  { id: "SadConcernedNatural",    label: "Sad Natural" },
  { id: "UnibrowNatural",         label: "Unibrow" },
  { id: "UpDown",                 label: "Up Down" },
  { id: "UpDownNatural",          label: "Up Down Natural" },
];

const MOUTH_TYPES = [
  { id: "Concerned",   label: "Concerned" },
  { id: "Default",     label: "Default" },
  { id: "Disbelief",   label: "Disbelief" },
  { id: "Eating",      label: "Eating" },
  { id: "Grimace",     label: "Grimace" },
  { id: "Sad",         label: "Sad" },
  { id: "ScreamOpen",  label: "Scream" },
  { id: "Serious",     label: "Serious" },
  { id: "Smile",       label: "Smile" },
  { id: "Tongue",      label: "Tongue" },
  { id: "Twinkle",     label: "Twinkle" },
  { id: "Vomit",       label: "Sick" },
];

const ACCESSORIES = [
  { id: "Blank",          label: "None" },
  { id: "Kurt",           label: "Kurt" },
  { id: "Prescription01", label: "Glasses 1" },
  { id: "Prescription02", label: "Glasses 2" },
  { id: "Round",          label: "Round" },
  { id: "Sunglasses",     label: "Sunglasses" },
  { id: "Wayfarers",      label: "Wayfarers" },
];

const CLOTHE_TYPES = [
  { id: "BlazerShirt",   label: "Blazer + Shirt" },
  { id: "BlazerSweater", label: "Blazer + Sweater" },
  { id: "CollarSweater", label: "Collar Sweater" },
  { id: "GraphicShirt",  label: "Graphic Shirt" },
  { id: "Hoodie",        label: "Hoodie" },
  { id: "Overall",       label: "Overall" },
  { id: "ShirtCrewNeck", label: "Crew Neck" },
  { id: "ShirtScoopNeck",label: "Scoop Neck" },
  { id: "ShirtVNeck",    label: "V-Neck" },
];

const CLOTHE_COLORS = [
  { id: "Black",        hex: "#262E33" },
  { id: "Blue01",       hex: "#65C9FF" },
  { id: "Blue02",       hex: "#5199E4" },
  { id: "Blue03",       hex: "#25557C" },
  { id: "Gray01",       hex: "#E6E6E6" },
  { id: "Gray02",       hex: "#929598" },
  { id: "Heather",      hex: "#3C4F5C" },
  { id: "PastelBlue",   hex: "#B1E2FF" },
  { id: "PastelGreen",  hex: "#A7FFC4" },
  { id: "PastelOrange", hex: "#FFDEB5" },
  { id: "PastelRed",    hex: "#FFAFB9" },
  { id: "PastelYellow", hex: "#FFFFB1" },
  { id: "Pink",         hex: "#FF488E" },
  { id: "Red",          hex: "#FF5C5C" },
  { id: "White",        hex: "#FFFFFF" },
];

// ── Picker component ──────────────────────────────────────────────────────────

type Tab = "hair" | "face" | "outfit" | "extras";

export function AvataaaarsPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [cfg, setCfg] = useState<AvataaarsConfig>(() =>
    parseAvataaarsUrl(value) ?? DEFAULT_AVATAAARS_CONFIG
  );
  const [tab, setTab] = useState<Tab>("hair");

  function update(patch: Partial<AvataaarsConfig>) {
    const next = { ...cfg, ...patch };
    setCfg(next);
    onChange(buildAvataaarsUrl(next));
  }

  const previewUrl = buildAvataaarsUrl(cfg);

  return (
    <div className="flex flex-col gap-3">
      {/* Live preview */}
      <div className="flex justify-center">
        <div className="w-32 h-32 rounded-full overflow-hidden chunky-border bg-[#b6e3f4] flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="" className="w-full h-full" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {([
          { id: "hair"   as Tab, icon: "💇", label: "Hair" },
          { id: "face"   as Tab, icon: "😊", label: "Face" },
          { id: "outfit" as Tab, icon: "👕", label: "Outfit" },
          { id: "extras" as Tab, icon: "🕶️", label: "Extras" },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-xl py-1.5 text-xs font-bold chunky-border transition-colors ${
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-2xl bg-background p-3 chunky-border space-y-3 max-h-56 overflow-y-auto">
        {tab === "hair" && (
          <>
            <Section label="Style">
              <OptionGrid options={TOP_TYPES} selected={cfg.topType} onSelect={(v) => update({ topType: v })} />
            </Section>
            <Section label="Hair Color">
              <ColorRow colors={HAIR_COLORS} selected={cfg.hairColor} onSelect={(v) => update({ hairColor: v })} />
            </Section>
            <Section label="Facial Hair">
              <OptionGrid options={FACIAL_HAIR_TYPES} selected={cfg.facialHairType} onSelect={(v) => update({ facialHairType: v })} />
            </Section>
            <Section label="Facial Hair Color">
              <ColorRow colors={FACIAL_HAIR_COLORS} selected={cfg.facialHairColor} onSelect={(v) => update({ facialHairColor: v })} />
            </Section>
          </>
        )}
        {tab === "face" && (
          <>
            <Section label="Skin Tone">
              <ColorRow colors={SKIN_COLORS} selected={cfg.skinColor} onSelect={(v) => update({ skinColor: v })} />
            </Section>
            <Section label="Eyes">
              <OptionGrid options={EYE_TYPES} selected={cfg.eyeType} onSelect={(v) => update({ eyeType: v })} />
            </Section>
            <Section label="Eyebrows">
              <OptionGrid options={EYEBROW_TYPES} selected={cfg.eyebrowType} onSelect={(v) => update({ eyebrowType: v })} />
            </Section>
            <Section label="Mouth">
              <OptionGrid options={MOUTH_TYPES} selected={cfg.mouthType} onSelect={(v) => update({ mouthType: v })} />
            </Section>
          </>
        )}
        {tab === "outfit" && (
          <>
            <Section label="Clothes">
              <OptionGrid options={CLOTHE_TYPES} selected={cfg.clotheType} onSelect={(v) => update({ clotheType: v })} />
            </Section>
            <Section label="Color">
              <ColorRow colors={CLOTHE_COLORS} selected={cfg.clotheColor} onSelect={(v) => update({ clotheColor: v })} />
            </Section>
          </>
        )}
        {tab === "extras" && (
          <Section label="Accessories">
            <OptionGrid options={ACCESSORIES} selected={cfg.accessoriesType} onSelect={(v) => update({ accessoriesType: v })} />
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-extrabold text-muted-foreground uppercase tracking-wide mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function OptionGrid({ options, selected, onSelect }: {
  options: { id: string; label: string }[];
  selected: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onSelect(o.id)}
          className={`rounded-lg px-2 py-1 text-xs font-bold chunky-border transition-colors ${
            selected === o.id ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorRow({ colors, selected, onSelect }: {
  colors: { id: string; hex: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          title={c.id}
          className={`w-7 h-7 rounded-full chunky-border transition-transform hover:scale-110 ${
            selected === c.id ? "ring-2 ring-primary ring-offset-1 scale-110" : ""
          }`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  );
}
