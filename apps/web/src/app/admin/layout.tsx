// Admin layout — completely separate from the main app (no BookHeader, no auth provider wrapper)
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
