import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export default function LegalPageLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white text-xs font-bold">AM</div>
            <span className="text-lg font-semibold tracking-tight text-gray-900">AdMafia</span>
          </Link>
          <Link to="/" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
            Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">Effective date: {updated}</p>

        <div className="prose-legal mt-10 space-y-8">
          {children}
        </div>
      </main>

      <footer className="border-t border-gray-100 py-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-4 px-6 text-sm text-gray-400 md:flex-row">
          <p>© 2026 AdMafia. All rights reserved.</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-gray-900 transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-gray-900 transition-colors">Terms</Link>
            <Link to="/data-deletion" className="hover:text-gray-900 transition-colors">Data Deletion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-gray-600">{children}</div>
    </section>
  );
}
