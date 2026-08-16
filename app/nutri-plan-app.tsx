"use client";

import { useState, type CSSProperties } from "react";
import Onboarding from "./onboarding";
import {
  budgetLabel,
  buildGroceryHandoff,
  buildGroceryList,
  calculateTargets,
  defaultProfile,
  generateMealPlan,
  goalLabel,
  validatePlan,
  type GroceryHandoff,
  type Meal,
  type PlanDay,
  type Profile,
  type Targets,
} from "./planner";
import { approvePlan as persistApprovedPlan, restoreGroceries, savePlanDraft, setGroceryRemoved, setMealSaved } from "./app-actions";
import { signOut } from "./auth/actions";
import type { AppUser, PersistedAppState } from "../lib/app-state";

type Page = "today" | "plan" | "groceries" | "progress";
type Stage = "onboarding" | "review" | "app";

type InstacartStore = { href: string; name: string };
type InstacartResult = { query: string; added: boolean; matchedName?: string; reason?: string };

// Local companion agent (see the instacart-agent repo). Runs on the same
// machine, next to a real logged-in Chrome — never a hosted/shared service.
const INSTACART_AGENT_URL = process.env.NEXT_PUBLIC_INSTACART_AGENT_URL ?? "http://localhost:4545";

export default function NutriPlanApp({ initialState, user, persistenceEnabled = false, persistenceWarning }: { initialState: PersistedAppState; user: AppUser | null; persistenceEnabled?: boolean; persistenceWarning?: string }) {
  const [stage, setStage] = useState<Stage>(initialState.stage);
  const [page, setPage] = useState<Page>("today");
  const [profile, setProfile] = useState<Profile | null>(initialState.profile ?? (user ? { ...defaultProfile, name: user.name } : null));
  const [targets, setTargets] = useState<Targets | null>(initialState.targets);
  const [plan, setPlan] = useState<PlanDay[]>(initialState.plan);
  const [planSeed, setPlanSeed] = useState(initialState.planSeed);
  const [planId, setPlanId] = useState<string | null>(initialState.planId);
  const [selectedDay, setSelectedDay] = useState("Mon");
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [savedMeals, setSavedMeals] = useState<string[]>(initialState.savedMeals);
  const [removedGroceries, setRemovedGroceries] = useState<string[]>(initialState.removedGroceries);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [persistence, setPersistence] = useState<Persistence>(persistenceWarning ? { state: "error", message: persistenceWarning } : { state: "idle" });
  const [instacartStores, setInstacartStores] = useState<InstacartStore[] | null>(null);
  const [selectedStore, setSelectedStore] = useState("");
  const [instacartStatus, setInstacartStatus] = useState<"idle" | "loading-stores" | "adding" | "done" | "error">("idle");
  const [instacartError, setInstacartError] = useState("");
  const [instacartResults, setInstacartResults] = useState<InstacartResult[]>([]);

  async function finishOnboarding(nextProfile: Profile) {
    const nextTargets = calculateTargets(nextProfile);
    const nextPlan = generateMealPlan(nextProfile, nextTargets);
    setProfile(nextProfile);
    setTargets(nextTargets);
    setPlan(nextPlan);
    setPlanSeed(0);
    setSelectedDay("Mon");
    setRemovedGroceries([]);
    setCopyStatus("idle");
    setStage("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
    await persistDraft(nextProfile, nextTargets, nextPlan, 0, planId);
  }

  async function regeneratePlan() {
    if (!profile || !targets) return;
    const nextSeed = planSeed + 1;
    const nextPlan = generateMealPlan(profile, targets, nextSeed);
    setPlanSeed(nextSeed);
    setPlan(nextPlan);
    setSelectedDay("Mon");
    setRemovedGroceries([]);
    setCopyStatus("idle");
    await persistDraft(profile, targets, nextPlan, nextSeed, planId);
  }

  async function approvePlan() {
    if (!profile || !targets || !validatePlan(profile, targets, plan).valid) return;
    if (!persistenceEnabled) {
      setStage("app");
      setPage("today");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (persistence.state === "saving") return;
    setPersistence({ state: "saving" });
    const result = await persistApprovedPlan(profile, targets, plan, planSeed, planId);
    if (!result.ok) {
      setPersistence({ state: "error", message: result.error });
      return;
    }
    if (result.planId) setPlanId(result.planId);
    setPersistence({ state: "saved" });
    setStage("app");
    setPage("today");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function editProfile() {
    setStage("onboarding");
    setRemovedGroceries([]);
    setCopyStatus("idle");
  }

  async function saveMeal(mealName: string) {
    const shouldSave = !savedMeals.includes(mealName);
    setSavedMeals((current) => shouldSave ? [...current, mealName] : current.filter((item) => item !== mealName));
    if (!persistenceEnabled) return;
    setPersistence({ state: "saving" });
    const result = await setMealSaved(mealName, shouldSave);
    if (!result.ok) {
      setSavedMeals((current) => shouldSave ? current.filter((item) => item !== mealName) : [...current, mealName]);
      setPersistence({ state: "error", message: result.error });
      return;
    }
    setPersistence({ state: "saved" });
  }

  async function persistDraft(nextProfile: Profile, nextTargets: Targets, nextPlan: PlanDay[], seed: number, currentPlanId: string | null) {
    if (!persistenceEnabled) return;
    setPersistence({ state: "saving" });
    const result = await savePlanDraft(nextProfile, nextTargets, nextPlan, seed, currentPlanId);
    if (!result.ok) {
      setPersistence({ state: "error", message: result.error });
      return;
    }
    if (result.planId) setPlanId(result.planId);
    setPersistence({ state: "saved" });
  }

  if (stage === "onboarding") {
    return <><Onboarding initialProfile={profile ?? undefined} onComplete={finishOnboarding} />{user && <AccountChip user={user} />}<PersistenceToast persistence={persistence} /></>;
  }

  if (!profile || !targets || plan.length === 0) return null;

  if (stage === "review") {
    return <><PlanReview profile={profile} targets={targets} plan={plan} validation={validatePlan(profile, targets, plan)} persistenceSaving={persistence.state === "saving"} selectedDay={selectedDay} setSelectedDay={setSelectedDay} onMeal={setSelectedMeal} onEdit={editProfile} onRegenerate={regeneratePlan} onApprove={approvePlan} selectedMeal={selectedMeal} closeMeal={() => setSelectedMeal(null)} />{user && <AccountChip user={user} />}<PersistenceToast persistence={persistence} /></>;
  }

  const today = plan[0];
  const groceries = buildGroceryList(plan);
  const groceryItems = groceries.flatMap((group) => group.items);
  const groceryCount = groceryItems.length;
  const includedGroceryCount = groceryCount - removedGroceries.length;
  const groceryHandoff = buildGroceryHandoff(profile, groceryItems, removedGroceries);
  const groceryHandoffJson = JSON.stringify(groceryHandoff, null, 2);
  const dayCalories = sum(today.meals, "calories");
  const dayProtein = sum(today.meals, "protein");
  const calorieFit = Math.round((dayCalories / targets.calories) * 100);
  const navItems: { id: Page; label: string; icon: string }[] = [
    { id: "today", label: "Today", icon: "⌂" },
    { id: "plan", label: "Meal plan", icon: "▦" },
    { id: "groceries", label: "Groceries", icon: "◫" },
    { id: "progress", label: "Progress", icon: "↗" },
  ];

  async function toggleRemoved(itemId: string) {
    const shouldRemove = !removedGroceries.includes(itemId);
    setRemovedGroceries((current) => current.includes(itemId)
      ? current.filter((value) => value !== itemId)
      : [...current, itemId]);
    setCopyStatus("idle");
    if (!persistenceEnabled || !planId) return;
    setPersistence({ state: "saving" });
    const result = await setGroceryRemoved(planId, itemId, shouldRemove);
    if (!result.ok) {
      setRemovedGroceries((current) => shouldRemove ? current.filter((value) => value !== itemId) : [...current, itemId]);
      setPersistence({ state: "error", message: result.error });
      return;
    }
    setPersistence({ state: "saved" });
  }

  async function restoreAllGroceries() {
    if (removedGroceries.length === 0) return;
    const previous = removedGroceries;
    setRemovedGroceries([]);
    setCopyStatus("idle");
    if (!persistenceEnabled || !planId) return;
    setPersistence({ state: "saving" });
    const result = await restoreGroceries(planId);
    if (!result.ok) {
      setRemovedGroceries(previous);
      setPersistence({ state: "error", message: result.error });
      return;
    }
    setPersistence({ state: "saved" });
  }

  async function copyGroceryHandoff() {
    try {
      await navigator.clipboard.writeText(groceryHandoffJson);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  function downloadGroceryHandoff() {
    const blob = new Blob([groceryHandoffJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "nutriplan-instacart-handoff.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function loadInstacartStores() {
    setInstacartStatus("loading-stores");
    setInstacartError("");
    try {
      const res = await fetch(`${INSTACART_AGENT_URL}/stores`);
      if (!res.ok) throw new Error(`Agent responded ${res.status}`);
      const data = await res.json();
      setInstacartStores(data.stores);
      setInstacartStatus("idle");
    } catch {
      setInstacartStatus("error");
      setInstacartError("Could not reach the Instacart agent. Is it running on this machine (npm run serve in instacart-agent)?");
    }
  }

  // Package overage is allowed by design (see quantityPolicy in the handoff
  // schema), so one retail unit per item satisfies the "minimum required" —
  // there's no way to ask Instacart's cart for an exact weight/volume.
  async function sendGroceriesToInstacart(handoffItems: GroceryHandoff["items"]) {
    if (!selectedStore) return;
    setInstacartStatus("adding");
    setInstacartError("");
    try {
      const res = await fetch(`${INSTACART_AGENT_URL}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeHref: selectedStore,
          items: handoffItems.map((item) => ({ query: item.name, quantity: 1 })),
        }),
      });
      if (!res.ok) throw new Error(`Agent responded ${res.status}`);
      const data = await res.json();
      setInstacartResults(data.results);
      setInstacartStatus("done");
    } catch {
      setInstacartStatus("error");
      setInstacartError("Could not reach the Instacart agent. Is it running on this machine (npm run serve in instacart-agent)?");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setPage("today")}><span className="brand-mark">✳</span> NutriPlan</button>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => <button className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)} key={item.id}><span>{item.icon}</span>{item.label}{item.id === "groceries" && <b>{includedGroceryCount}</b>}</button>)}
        </nav>
        <div className="sidebar-note"><span className="tiny-label">APPROVED PLAN</span><strong>{goalLabel(profile.goal)}</strong><p>{targets.calories.toLocaleString()} kcal · {targets.protein}g protein</p></div>
        {user && <div className="account-panel"><span className="tiny-label">SIGNED IN</span><strong>{user.name}</strong><small>{user.email}</small><form action={signOut}><button type="submit">Sign out</button></form></div>}
        <button className="profile" onClick={editProfile}><span>{profile.name.slice(0, 2).toUpperCase()}</span><span>{profile.name}<small>Edit onboarding</small></span><i>···</i></button>
      </aside>

      <section className="content">
        {page === "today" && (
          <>
            {targets.clinicalSupervisionRequired && <ClinicalNotice targets={targets} />}
            <header className="topbar"><div><span className="eyebrow">PLAN APPROVED</span><h1>Your week is ready, {profile.name}.</h1><p className="lede">Every meal below comes from the plan you approved. Its ingredients now power the grocery list.</p></div><button className="outline-btn" onClick={() => setPage("plan")}>Review plan</button></header>
            <section className="hero-grid">
              <article className="target-card">
                <div className="card-heading"><div><span className="eyebrow">MONDAY&apos;S PLAN</span><h2>{dayCalories.toLocaleString()} calories</h2></div><span className="on-track">{Math.abs(dayCalories - targets.calories) <= 100 ? "Target fit" : "Close fit"}</span></div>
                <div className="rings" aria-label="Planned nutrition against daily targets">
                  <div className="ring calories" style={{ "--progress": `${Math.min(100, calorieFit)}%` } as CSSProperties}><div><strong>{calorieFit}%</strong><span>of calorie target</span></div></div>
                  <div className="mini-stat"><span className="dot protein" /><div><strong>{dayProtein}g</strong><small>of {targets.protein}g protein</small></div></div>
                  <div className="mini-stat"><span className="dot fiber" /><div><strong>{targets.method === "psmf" ? "Care plan" : `${targets.fiber}g`}</strong><small>{targets.method === "psmf" ? "controls other limits" : "daily fiber target"}</small></div></div>
                </div>
                <p className="insight">This day lands {Math.abs(dayCalories - targets.calories)} calories from your target and uses ingredients again later in the week.</p>
              </article>
              <article className="week-card">
                <div className="card-heading"><div><span className="eyebrow">APPROVAL STATUS</span><h2>7 days approved</h2></div><button aria-label="Open weekly plan" onClick={() => setPage("plan")}>→</button></div>
                <div className="week-days">{plan.map((day) => <div className={day.day === "Mon" ? "current" : ""} key={day.day}><span>{day.day[0]}</span><i className="done">✓</i></div>)}</div>
                <div className="week-footer"><strong>{profile.diet}</strong><span>meal pattern</span><strong>{budgetLabel(profile)}</strong><span>budget target</span></div>
              </article>
            </section>
            <MealsSection title="Meals for Monday" eyebrow="YOUR APPROVED DAY" meals={today.meals} savedMeals={savedMeals} onSave={saveMeal} onOpen={setSelectedMeal} onFullWeek={() => setPage("plan")} />
            <section className="grocery-strip"><div className="basket">◫</div><div><span className="eyebrow">GENERATED FROM YOUR PLAN</span><h3>{groceryCount} minimum grocery requirements</h3><p>Review what you already have before an AI shopping agent matches products and packages.</p></div><div className="grocery-total"><span>Budget target</span><strong>{budgetLabel(profile)}</strong></div><button className="primary-btn" onClick={() => setPage("groceries")}>Review pantry & groceries →</button></section>
          </>
        )}

        {page === "plan" && (
          <section className="page-view">
            {targets.clinicalSupervisionRequired && <ClinicalNotice targets={targets} />}
            <header className="topbar compact-topbar"><div><span className="eyebrow">APPROVED · WEEK OF AUGUST 17</span><h1>Your meal plan</h1><p className="lede">See the whole week, then choose a day for recipe details.</p></div><button className="outline-btn" onClick={editProfile}>Edit profile</button></header>
            <PlanWorkspace plan={plan} targets={targets} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenMeal={setSelectedMeal} />
            <div className="plan-note"><span>♻</span><div><strong>Plan-to-cart traceability</strong><p>Each ingredient is stored with its meal, serving quantity, unit, and aisle category. The grocery list is the exact aggregate of this approved week.</p></div></div>
          </section>
        )}

        {page === "groceries" && (
          <section className="page-view">
            <header className="topbar"><div><span className="eyebrow">FROM APPROVED PLAN · THEN PRODUCT MATCHING</span><h1>Your grocery list.</h1><p className="lede" aria-live="polite">All {groceryCount} items start included. Remove only what you already have.{removedGroceries.length > 0 ? ` ${removedGroceries.length} removed.` : ""}</p></div><span className="total-pill">{includedGroceryCount} included</span></header>
            <div className="grocery-layout">
              <div className="grocery-groups">
                <div className="minimum-notice"><span>↓</span><div><strong>These are minimum recipe requirements—not package recommendations.</strong><p>The shopping agent must choose enough product packages to cover each amount, then optimize total price, unit value, and unnecessary overage.</p></div></div>
                <div className="inventory-summary"><div><span className="eyebrow">QUICK REVIEW</span><strong>{includedGroceryCount} included · {removedGroceries.length} removed</strong></div><button className="text-btn" disabled={removedGroceries.length === 0} onClick={restoreAllGroceries}>Restore all items</button></div>
                {groceries.map((group) => {
                  const includedInGroup = group.items.filter((item) => !removedGroceries.includes(item.id)).length;
                  return <article className="grocery-group" key={group.group}><div className="group-heading"><h2>{group.group}</h2><span>{includedInGroup} of {group.items.length} included</span></div>{group.items.map((item) => {
                    const isRemoved = removedGroceries.includes(item.id);
                    return <div className={`grocery-item ${isRemoved ? "removed" : ""}`} key={item.id}><i aria-hidden="true">{isRemoved ? "−" : "✓"}</i><span><strong>{item.name}</strong><small>Minimum needed · {item.displayQuantity} · {isRemoved ? "Removed" : "Included"}</small></span><button type="button" aria-pressed={isRemoved} onClick={() => toggleRemoved(item.id)}>{isRemoved ? "Undo" : "Remove"}</button></div>;
                  })}</article>;
                })}
              </div>
              <aside className="retailer-card">
                <span className="retailer-logo">{includedGroceryCount}</span>
                <div><span className="eyebrow">AI SHOPPING HANDOFF</span><h2>{includedGroceryCount === 0 ? "Nothing left to buy" : `${includedGroceryCount} items ready to match`}</h2><p>The payload excludes every removed item and preserves numeric minimums for future product and package matching.</p></div>
                <div className="readiness"><span>Dietary constraints</span><b>Applied</b><span>Minimum coverage</span><b>Required</b><span>Removed items</span><b>{removedGroceries.length}</b><span>Value optimization</span><b>Requested</b><span>Instacart connection</span><b className={instacartStatus === "done" ? "" : "waiting"}>{instacartStatus === "done" ? "Done" : "Next"}</b></div>
                <div className="handoff-actions"><button className="copy-handoff" onClick={copyGroceryHandoff}>{copyStatus === "copied" ? "Copied JSON ✓" : "Copy AI handoff JSON"}</button><button className="download-handoff" onClick={downloadGroceryHandoff}>Download .json</button></div>
                <p className={`copy-status ${copyStatus}`} aria-live="polite">{copyStatus === "error" ? "Clipboard unavailable—use the download instead." : copyStatus === "copied" ? "Ready to paste into an AI shopping workflow." : ""}</p>
                <details className="json-preview"><summary>Preview handoff payload</summary><pre>{groceryHandoffJson}</pre></details>

                <div className="instacart-connect">
                  {!instacartStores && (
                    <button className="copy-handoff" onClick={loadInstacartStores} disabled={instacartStatus === "loading-stores"}>
                      {instacartStatus === "loading-stores" ? "Finding stores…" : "Connect Instacart agent"}
                    </button>
                  )}

                  {instacartStores && (
                    <>
                      <label className="store-picker">
                        <span>Store</span>
                        <select value={selectedStore} onChange={(event) => setSelectedStore(event.target.value)}>
                          <option value="">Choose a store…</option>
                          {instacartStores.map((store) => <option key={store.href} value={store.href}>{store.name}</option>)}
                        </select>
                      </label>
                      <button className="copy-handoff" onClick={() => sendGroceriesToInstacart(groceryHandoff.items)} disabled={!selectedStore || instacartStatus === "adding"}>
                        {instacartStatus === "adding" ? "Adding items…" : `Add ${includedGroceryCount} items to cart`}
                      </button>
                    </>
                  )}

                  {instacartStatus === "error" && <p className="instacart-error">{instacartError}</p>}

                  {instacartResults.length > 0 && (
                    <ul className="instacart-results">
                      {instacartResults.map((result) => (
                        <li key={result.query} className={result.added ? "added" : "skipped"}>
                          {result.added ? `✓ ${result.matchedName ?? result.query}` : `✗ ${result.query}${result.reason ? ` (${result.reason})` : ""}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <small>Instacart connection runs via a local agent on your own machine — see the instacart-agent repo. It never checks out for you.</small>
              </aside>
            </div>
          </section>
        )}

        {page === "progress" && (
          <section className="page-view">
            <header className="topbar"><div><span className="eyebrow">BASELINE CREATED</span><h1>Your progress starts here.</h1><p className="lede">Once check-ins are added, targets can adjust from multi-week trends instead of reacting to one day.</p></div><button className="outline-btn" disabled>Check-ins coming next</button></header>
            <div className="progress-grid"><article className="progress-chart empty-progress"><span className="eyebrow">STARTING POINT</span><div className="progress-kpis"><div><strong>{profile.weightKg.toFixed(1)} kg</strong><span>current weight</span></div><div><strong>{targets.projectedKg || "—"}{targets.projectedKg ? " kg" : ""}</strong><span>projected weekly change</span></div></div><div className="baseline-line"><i /><span>Log your first weekly check-in to begin the trend.</span></div></article><article className="consistency-card"><span className="eyebrow">PLAN FOUNDATION</span><h2>Consistency over precision</h2><p>Your approved plan is the baseline. Future adjustments should use adherence, hunger, energy, and weight trends together.</p><div className="signal"><span>✓</span><div><strong>Week one ready</strong><small>{plan.length} days · {groceryCount} grocery items</small></div></div></article></div>
            <div className="safety-note"><span>ⓘ</span><p>NutriPlan uses conservative general-wellness estimates. It does not diagnose conditions or replace guidance from a registered clinician.</p></div>
          </section>
        )}
      </section>

      {selectedMeal && <MealModal meal={selectedMeal} saved={savedMeals.includes(selectedMeal.name)} onSave={() => saveMeal(selectedMeal.name)} onClose={() => setSelectedMeal(null)} />}
      <PersistenceToast persistence={persistence} />
    </main>
  );
}

type Persistence = { state: "idle" | "saving" | "saved" | "error"; message?: string };

function PersistenceToast({ persistence }: { persistence: Persistence }) {
  if (persistence.state === "idle") return null;
  const label = persistence.state === "saving" ? "Saving…" : persistence.state === "saved" ? "Saved to your account ✓" : persistence.message ?? "Unable to save";
  return <p className={`persistence-toast ${persistence.state}`} role={persistence.state === "error" ? "alert" : "status"}>{label}</p>;
}

function AccountChip({ user }: { user: AppUser }) {
  return <aside className="account-chip"><span>{user.name.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.email}</small></div><form action={signOut}><button type="submit">Sign out</button></form></aside>;
}

function PlanReview({ profile, targets, plan, validation, persistenceSaving, selectedDay, setSelectedDay, onMeal, onEdit, onRegenerate, onApprove, selectedMeal, closeMeal }: { profile: Profile; targets: Targets; plan: PlanDay[]; validation: ReturnType<typeof validatePlan>; persistenceSaving: boolean; selectedDay: string; setSelectedDay: (day: string) => void; onMeal: (meal: Meal) => void; onEdit: () => void; onRegenerate: () => void; onApprove: () => void; selectedMeal: Meal | null; closeMeal: () => void }) {
  const weeklyAverage = Math.round(plan.reduce((total, item) => total + sum(item.meals, "calories"), 0) / plan.length);
  const averageProtein = Math.round(plan.reduce((total, item) => total + sum(item.meals, "protein"), 0) / plan.length);
  const matchingDays = plan.filter((item) => targets.method === "psmf"
    ? sum(item.meals, "calories") <= targets.calories && sum(item.meals, "protein") >= targets.protein
    : Math.abs(sum(item.meals, "calories") - targets.calories) <= Math.max(100, targets.calories * .05)).length;

  return (
    <main className="review-screen">
      <header className="review-top">
        <button className="brand" onClick={onEdit}><span className="brand-mark">✳</span> NutriPlan</button>
        <div className="workflow-steps" aria-label="Planning progress"><span className="done">✓ Profile</span><i /><span className="active">2 Review</span><i /><span>3 Groceries</span></div>
        <button className="text-btn" onClick={onEdit}>Edit profile</button>
      </header>

      <section className="review-content">
        {targets.clinicalSupervisionRequired && <ClinicalNotice targets={targets} />}
        <div className="review-intro">
          <div className="review-heading">
            <span className="eyebrow">YOUR PROPOSED WEEK</span>
            <h1>Review your week, {profile.name}.</h1>
            <p>Start with the seven-day overview. Choose any day to inspect its meals and open a recipe.</p>
            <div className="plan-context" aria-label="Plan preferences">
              <span>{profile.diet}</span>
              <span>{profile.allergies.length || profile.customAllergy ? `${profile.allergies.length + (profile.customAllergy ? 1 : 0)} exclusions` : "No allergies"}</span>
              <span>{budgetLabel(profile)} target</span>
            </div>
          </div>
          <aside className="plan-fit" aria-label="Weekly nutrition fit">
            <div className="fit-heading"><span>✓</span><div><strong>{targets.method === "psmf" ? "Plan fits the provided clinical targets" : "Plan fits your targets"}</strong><small>{matchingDays} of 7 days are within range</small></div></div>
            <div className="fit-stats"><span><b>{weeklyAverage.toLocaleString()}</b><small>avg. kcal</small></span><span><b>{averageProtein}g</b><small>avg. protein</small></span><span><b>28</b><small>meals</small></span></div>
          </aside>
        </div>

        <PlanWorkspace plan={plan} targets={targets} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenMeal={onMeal} />

        {!validation.valid && <section className="plan-audit" role="alert"><strong>Plan needs correction before grocery approval</strong><ul>{validation.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><button className="outline-btn" onClick={onEdit}>Edit profile and constraints</button></section>}

        <section className="approval-card">
          <div className="approval-copy"><span className="approval-check">✓</span><div><span className="eyebrow">NEXT STEP</span><h2>Ready to turn this into groceries?</h2><p>Approving locks this version and creates one consolidated grocery list. Nothing is ordered yet.</p></div></div>
          <div className="approval-actions"><button className="outline-btn" onClick={onRegenerate} disabled={persistenceSaving}>Generate a different week</button><button className="approve-btn" onClick={onApprove} disabled={!validation.valid || persistenceSaving}>{persistenceSaving ? "Saving plan…" : "Approve week & create groceries →"}</button></div>
        </section>
      </section>

      {selectedMeal && <MealModal meal={selectedMeal} saved={false} onSave={() => {}} onClose={closeMeal} reviewMode />}
    </main>
  );
}

function ClinicalNotice({ targets }: { targets: Targets }) {
  return <aside className="clinical-notice" role="note"><strong>Clinician-directed PSMF</strong><span>Planning around the {targets.calories} kcal and {targets.protein}g protein targets you entered. Your prescribing team’s food list, carbohydrate and fat limits, supplements, lab schedule, medication changes, and refeeding plan always take precedence.</span></aside>;
}

function PlanWorkspace({ plan, targets, selectedDay, onSelectDay, onOpenMeal }: { plan: PlanDay[]; targets: Targets; selectedDay: string; onSelectDay: (day: string) => void; onOpenMeal: (meal: Meal) => void }) {
  const activeDay = plan.find((item) => item.day === selectedDay) ?? plan[0];

  return (
    <div className="plan-workspace">
      <WeekOverview plan={plan} selectedDay={selectedDay} onSelectDay={onSelectDay} />
      <DayPlan day={activeDay} targets={targets} onOpenMeal={onOpenMeal} />
    </div>
  );
}

function WeekOverview({ plan, selectedDay, onSelectDay }: { plan: PlanDay[]; selectedDay: string; onSelectDay: (day: string) => void }) {
  return (
    <aside className="week-overview">
      <div className="week-overview-heading"><div><span className="eyebrow">WEEK AT A GLANCE</span><h2>Your seven days</h2></div><small>Choose a day</small></div>
      <nav className="week-day-list" aria-label="Days in this meal plan">
        {plan.map((day) => {
          const dinner = day.meals.find((meal) => meal.type === "Dinner");
          return (
            <button key={day.day} aria-label={`${dayName(day.day)}, August ${day.date}; dinner: ${dinner?.name}; ${sum(day.meals, "calories").toLocaleString()} calories`} aria-pressed={selectedDay === day.day} className={selectedDay === day.day ? "selected" : ""} onClick={() => onSelectDay(day.day)}>
              <span className="week-date"><b>{day.day}</b><small>Aug {day.date}</small></span>
              <span className="week-dinner"><small>Dinner</small><b>{dinner?.name}</b></span>
              <span className="week-kcal"><b>{sum(day.meals, "calories").toLocaleString()}</b><small>kcal</small></span>
              <i aria-hidden="true">›</i>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function DayPlan({ day, targets, onOpenMeal }: { day: PlanDay; targets: Targets; onOpenMeal: (meal: Meal) => void }) {
  const calories = sum(day.meals, "calories");
  const protein = sum(day.meals, "protein");
  const prepMinutes = day.meals.reduce((total, meal) => total + Number(meal.prep.split(" ")[0]), 0);
  const calorieDifference = calories - targets.calories;

  return (
    <section className="day-plan" aria-live="polite">
      <header className="day-plan-heading">
        <div><span className="eyebrow">{dayName(day.day).toUpperCase()} · AUGUST {day.date}</span><h2>{dayName(day.day)}&apos;s meals</h2><p>{day.meals.length} meals · about {prepMinutes} minutes total prep</p></div>
        <span className="fit-badge">✓ On target</span>
      </header>

      <div className="day-targets">
        <NutritionTarget label="Calories" value={`${calories.toLocaleString()} kcal`} detail={targets.method === "psmf" ? `${targets.calories} kcal clinician-provided target` : `${Math.abs(calorieDifference)} ${calorieDifference >= 0 ? "over" : "under"} target`} progress={calories / targets.calories} />
        <NutritionTarget label="Protein" value={`${protein}g`} detail={`${targets.protein}g target`} progress={protein / targets.protein} />
      </div>

      <div className="review-meal-list">
        {day.meals.map((meal) => (
          <article className="review-meal-row" key={meal.id}>
            <div className={`review-meal-icon ${meal.tone}`} aria-hidden="true">{meal.icon}</div>
            <div className="review-meal-time"><strong>{meal.type}</strong><span>{meal.time}</span></div>
            <div className="review-meal-copy"><h3>{meal.name}</h3><p>{meal.description}</p><span>{meal.calories} kcal <i>•</i> {meal.protein}g protein <i>•</i> {meal.prep}</span></div>
            <button className="recipe-link" onClick={() => onOpenMeal(meal)} aria-label={`View recipe for ${meal.name}`}>Recipe <span>→</span></button>
          </article>
        ))}
      </div>
    </section>
  );
}

function NutritionTarget({ label, value, detail, progress }: { label: string; value: string; detail: string; progress: number }) {
  return (
    <div className="nutrition-target">
      <div><span>{label}</span><strong>{value}</strong></div>
      <progress aria-label={`${label}: ${value}, ${detail}`} value={Math.min(progress, 1)} max={1} />
      <small>{detail}</small>
    </div>
  );
}

function MealsSection({ title, eyebrow, meals, savedMeals = [], onSave, onOpen, onFullWeek }: { title: string; eyebrow: string; meals: Meal[]; savedMeals?: string[]; onSave?: (name: string) => void; onOpen: (meal: Meal) => void; onFullWeek?: () => void }) {
  return <section className="meal-section"><div className="section-title"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{onFullWeek && <button className="text-btn" onClick={onFullWeek}>View full week →</button>}</div><div className="meal-grid">{meals.map((meal) => <article className="meal-card" key={meal.id}><div className={`meal-art ${meal.tone}`}><span>{meal.icon}</span>{onSave && <button className={savedMeals.includes(meal.name) ? "saved" : ""} onClick={() => onSave(meal.name)} aria-label={`Save ${meal.name}`}>{savedMeals.includes(meal.name) ? "♥" : "♡"}</button>}</div><div className="meal-copy"><span>{meal.type} · {meal.time}</span><h3>{meal.name}</h3><p>{meal.calories} kcal · {meal.protein}g protein · {meal.prep}</p><button onClick={() => onOpen(meal)}>View recipe <b>→</b></button></div></article>)}</div></section>;
}

function MealModal({ meal, saved, onSave, onClose, reviewMode = false }: { meal: Meal; saved: boolean; onSave: () => void; onClose: () => void; reviewMode?: boolean }) {
  return <div className="modal-backdrop"><button className="modal-dismiss" onClick={onClose} aria-label="Close recipe" /><article className="recipe-modal" role="dialog" aria-modal="true" aria-labelledby="recipe-title"><div className={`recipe-hero ${meal.tone}`}><span>{meal.icon}</span><button onClick={onClose} aria-label="Close">×</button></div><div className="recipe-body"><span className="eyebrow">{meal.type} · {meal.prep}</span><h2 id="recipe-title">{meal.name}</h2><p>{meal.description}</p><div className="recipe-macros"><span><b>{meal.calories}</b> calories</span><span><b>{meal.protein}g</b> protein</span><span><b>1</b> serving</span></div><h3>What you’ll need</h3><ul>{meal.ingredients.map((ingredient) => <li key={ingredient.name}><span>✓</span>{ingredient.name} · {ingredient.quantity} {ingredient.unit}</li>)}</ul><h3>Quick method</h3><p>Prep the ingredients, cook the main protein or legume until ready, and assemble with the vegetables and grain. Season to taste and serve warm.</p>{reviewMode ? <button className="primary-btn" onClick={onClose}>Looks good</button> : <button className="primary-btn" onClick={onSave}>{saved ? "Saved to favorites ♥" : "Save this meal ♡"}</button>}</div></article></div>;
}

function sum(meals: Meal[], key: "calories" | "protein") {
  return meals.reduce((total, meal) => total + meal[key], 0);
}

function dayName(day: string) {
  return ({ Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" } as Record<string, string>)[day] ?? day;
}
