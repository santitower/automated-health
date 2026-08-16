import { redirect } from "next/navigation";
import NutriPlanApp from "./nutri-plan-app";
import { hasSupabaseEnv } from "../lib/supabase/config";
import { createClient } from "../lib/supabase/server";
import { emptyAppState, loadAppState, presentUser } from "../lib/app-state";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function Home() {
  if (!hasSupabaseEnv()) {
    return <NutriPlanApp initialState={emptyAppState} user={null} persistenceEnabled={false} />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { state, setupError } = await loadAppState(supabase, user.id);
  if (!state) {
    return <NutriPlanApp initialState={emptyAppState} user={presentUser(user)} persistenceEnabled={false} persistenceWarning={`Account storage needs setup: ${setupError ?? "database tables are unavailable"}`} />;
  }
  return <NutriPlanApp initialState={state} user={presentUser(user)} persistenceEnabled />;
}
