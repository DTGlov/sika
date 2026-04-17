export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-[#0A0A0B]">
      {children}
    </main>
  );
}
