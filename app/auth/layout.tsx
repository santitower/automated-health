import type { ReactNode } from "react";
import Link from "next/link";
import "./auth.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="auth-screen">
      <div className="auth-shell">
        <Link className="auth-brand" href="/" aria-label="NutriPlan home">
          <span aria-hidden="true">✳</span>
          <strong>NutriPlan</strong>
        </Link>
        <section className="auth-panel" aria-label="Account access">
          {children}
        </section>
        <small className="auth-disclaimer">
          General wellness planning—not medical diagnosis or treatment.
        </small>
      </div>
    </main>
  );
}
