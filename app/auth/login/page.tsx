import { AuthForm } from "../auth-form";
import { signIn } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; confirmed?: string }>;
}) {
  const params = await searchParams;
  return (
    <article className="auth-card">
      <header>
        <span className="auth-kicker">WELCOME BACK</span>
        <h2>Sign in to NutriPlan</h2>
        <p>Use the email and password you created for this account.</p>
      </header>
      {params.confirmed === "1" && (
        <p className="auth-success" role="status">
          Email confirmed. Sign in to open your meal-planning workspace.
        </p>
      )}
      {params.error && (
        <p className="auth-error" role="alert">
          {params.error}
        </p>
      )}
      <AuthForm action={signIn} mode="login" next={params.next} />
    </article>
  );
}
