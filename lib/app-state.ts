import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { PlanDay, Profile, Targets } from "../app/planner";

export type AppStage = "onboarding" | "review" | "app";

export type PersistedAppState = {
  stage: AppStage;
  profile: Profile | null;
  targets: Targets | null;
  plan: PlanDay[];
  planSeed: number;
  planId: string | null;
  savedMeals: string[];
  removedGroceries: string[];
};

export const emptyAppState: PersistedAppState = {
  stage: "onboarding",
  profile: null,
  targets: null,
  plan: [],
  planSeed: 0,
  planId: null,
  savedMeals: [],
  removedGroceries: [],
};

export type AppUser = { email: string; name: string };

export function presentUser(user: User): AppUser {
  const email = user.email ?? "Account";
  const metadataName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : "";
  return { email, name: metadataName || email.split("@")[0] || "Account" };
}

export async function loadAppState(supabase: SupabaseClient, userId: string, retryFutureJwt = true) {
  const [profileResult, planResult, savedResult] = await Promise.all([
    supabase.from("health_profiles").select("profile").eq("user_id", userId).maybeSingle(),
    supabase.from("meal_plans").select("id, seed, status, profile_snapshot, targets_snapshot, plan_snapshot").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("saved_meals").select("meal_name").eq("user_id", userId).order("created_at", { ascending: true }),
  ]);

  const error = profileResult.error ?? planResult.error ?? savedResult.error;
  if (error) {
    if (retryFutureJwt && /jwt issued at future/i.test(error.message)) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      return loadAppState(supabase, userId, false);
    }
    return { state: null, setupError: error.message };
  }

  const planRow = planResult.data;
  let removedGroceries: string[] = [];
  if (planRow?.id) {
    const groceryResult = await supabase.from("grocery_item_states").select("item_key").eq("user_id", userId).eq("plan_id", planRow.id);
    if (groceryResult.error) {
      if (retryFutureJwt && /jwt issued at future/i.test(groceryResult.error.message)) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
        return loadAppState(supabase, userId, false);
      }
      return { state: null, setupError: groceryResult.error.message };
    }
    removedGroceries = (groceryResult.data ?? []).map((row) => String(row.item_key));
  }

  const profile = (profileResult.data?.profile ?? planRow?.profile_snapshot ?? null) as Profile | null;
  const targets = (planRow?.targets_snapshot ?? null) as Targets | null;
  const plan = (planRow?.plan_snapshot ?? []) as PlanDay[];

  return {
    setupError: null,
    state: {
      stage: planRow ? (planRow.status === "approved" ? "app" : "review") : "onboarding",
      profile,
      targets,
      plan,
      planSeed: Number(planRow?.seed ?? 0),
      planId: planRow?.id ? String(planRow.id) : null,
      savedMeals: (savedResult.data ?? []).map((row) => String(row.meal_name)),
      removedGroceries,
    } satisfies PersistedAppState,
  };
}
