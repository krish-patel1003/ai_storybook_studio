"use client";

// Renders an avatar that is either a plain emoji string or an image URL.
// DiceBear URLs and other https:// URLs are rendered as <img>.
export function AvatarDisplay({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  if (value.startsWith("https://") || value.startsWith("http://")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value} alt="avatar" className={`object-cover ${className}`} loading="lazy" />
    );
  }
  return <span className={className}>{value}</span>;
}
