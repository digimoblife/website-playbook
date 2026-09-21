export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="konten" className="auth-page">
      <div className="auth-box">{children}</div>
    </main>
  );
}
