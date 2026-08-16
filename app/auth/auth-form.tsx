"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthActionState } from "./actions";

type AuthAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

export function AuthForm({
  action,
  mode,
  next = "/",
}: {
  action: AuthAction;
  mode: "login" | "sign-up" | "forgot" | "update";
  next?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const needsEmail = mode !== "update";
  const needsPassword = mode === "login" || mode === "sign-up" || mode === "update";

  return (
    <>
      <form className="auth-form" action={formAction}>
        <input type="hidden" name="next" value={next} />
        {mode === "sign-up" && <label>First name<input name="name" autoComplete="name" required /></label>}
        {needsEmail && <label>Email address<input name="email" type="email" autoComplete="email" required /></label>}
        {needsPassword && <label>{mode === "update" ? "New password" : "Password"}<input name="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required /></label>}
        {mode === "sign-up" && <label>Confirm password<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label>}
        {state.error && <p className="auth-error" role="alert">{state.error}</p>}
        <button className="auth-submit" disabled={pending}>{pending ? "Working…" : submitLabel(mode)}</button>
      </form>

      {mode === "login" && <div className="auth-links"><Link href="/auth/sign-up">Create an account</Link><Link href="/auth/forgot-password">Forgot password?</Link></div>}
      {mode === "sign-up" && <div className="auth-links"><span>Already have an account?</span><Link href="/auth/login">Sign in</Link></div>}
      {(mode === "forgot" || mode === "update") && <div className="auth-links"><Link href="/auth/login">← Back to sign in</Link></div>}
    </>
  );
}

function submitLabel(mode: "login" | "sign-up" | "forgot" | "update") {
  if (mode === "login") return "Sign in";
  if (mode === "sign-up") return "Create account";
  if (mode === "forgot") return "Send reset link";
  return "Save new password";
}
