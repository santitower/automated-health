"use client";

import { useState } from "react";
import Onboarding from "./onboarding";
import InstacartAgentPanel from "./instacart-agent-panel";
import {
  budgetLabel,
  buildGroceryHandoff,
  buildGroceryList,
  calculateTargets,
  defaultProfile,
  generateMealPlan,
  goalLabel,
  validatePlan,
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

  const today = plan.find((item) => item.day === weekdayKey(new Date())) ?? plan[0];
  const groceries = buildGroceryList(plan);
  const groceryItems = groceries.flatMap((group) => group.items);
  const groceryCount = groceryItems.length;
  const includedGroceryCount = groceryCount - removedGroceries.length;
  const groceryHandoff = buildGroceryHandoff(profile, groceryItems, removedGroceries);
  const groceryHandoffJson = JSON.stringify(groceryHandoff, null, 2);
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
            <header className="topbar compact-topbar"><div><span className="eyebrow">TODAY · APPROVED PLAN</span><h1>Your day is ready, {profile.name}.</h1><p className="lede">Start with today&apos;s meals and targets. Open the full meal plan when you want to look ahead or compare days.</p></div><button className="outline-btn" onClick={() => setPage("plan")}>View full week</button></header>
            <div className="today-layout">
              <div className="today-day-card"><DayPlan day={today} targets={targets} onOpenMeal={setSelectedMeal} isToday /></div>
              <aside className="today-rail">
                <article className="today-target-card"><span className="eyebrow">DAILY TARGETS</span><h2>Today at a glance</h2><div className="today-target-list"><span><b>{targets.calories.toLocaleString()}</b><small>calories</small></span><span><b>{targets.protein}g</b><small>protein</small></span><span><b>{today.meals.length}</b><small>meals</small></span></div></article>
                <article className="today-week-card"><span className="eyebrow">WEEK STATUS</span><h2>7 days approved</h2><p>{profile.diet} meals built around your targets and {budgetLabel(profile)} budget.</p><button className="text-btn" onClick={() => setPage("plan")}>Explore the full week →</button></article>
              </aside>
            </div>
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
              <aside className="retailer-card"><span className="retailer-logo">{includedGroceryCount}</span><div><span className="eyebrow">CART READY</span><h2>{includedGroceryCount === 0 ? "Nothing left to buy" : `${includedGroceryCount} items ready to match`}</h2><p>The private Playwright browser uses this reviewed list, opens Instacart for your sign-in and review, and stops at the cart before checkout.</p></div><div className="readiness"><span>Dietary constraints</span><b>Applied</b><span>Minimum coverage</span><b>Required</b><span>Removed items</span><b>{removedGroceries.length}</b><span>Checkout</span><b className="waiting">You approve</b></div><InstacartAgentPanel items={groceryHandoff.items} /><details className="handoff-tools"><summary>Developer handoff tools</summary><div className="handoff-actions"><button className="copy-handoff" onClick={copyGroceryHandoff}>{copyStatus === "copied" ? "Copied JSON ✓" : "Copy JSON"}</button><button className="download-handoff" onClick={downloadGroceryHandoff}>Download .json</button></div><p className={`copy-status ${copyStatus}`} aria-live="polite">{copyStatus === "error" ? "Clipboard unavailable—use the download instead." : copyStatus === "copied" ? "Handoff JSON copied." : ""}</p><details className="json-preview"><summary>Preview payload</summary><pre>{groceryHandoffJson}</pre></details></details></aside>
            </div>
          </section>
        )}

        {page === "progress" && (
          <section className="page-view">
            <header className="topbar compact-topbar"><div><span className="eyebrow">YOUR BASELINE</span><h1>Progress starts with a steady week.</h1><p className="lede">Your starting point is saved. Once weekly check-ins are available, this page will use trends—not single-day changes—to guide adjustments.</p></div><span className="progress-status">Baseline ready</span></header>
            <div className="progress-metrics" aria-label="Starting progress metrics">
              <article><span>Starting weight</span><strong>{profile.weightKg.toFixed(1)} kg</strong><small>From your profile</small></article>
              <article><span>Plan target</span><strong>{targets.calories.toLocaleString()} kcal</strong><small>{targets.protein}g protein daily</small></article>
              <article><span>Planned direction</span><strong>{progressDirection(profile, targets)}</strong><small>{targets.method === "psmf" ? "Set by your care plan" : "Conservative estimate"}</small></article>
            </div>
            <div className="progress-layout">
              <article className="checkin-empty"><div className="checkin-icon">↗</div><span className="eyebrow">WEEKLY CHECK-INS</span><h2>No progress entries yet</h2><p>Complete your approved week first. Future check-ins will combine weight trend, plan adherence, hunger, and energy before suggesting any target change.</p><div className="checkin-timeline" aria-label="Future weekly check-in timeline"><span className="ready"><i>✓</i><b>Baseline</b><small>Saved</small></span><span><i>1</i><b>Week 1</b><small>Next</small></span><span><i>2</i><b>Week 2</b><small>Pending</small></span><span><i>3</i><b>Week 3</b><small>Pending</small></span></div></article>
              <aside className="progress-guide"><span className="eyebrow">WHAT WILL INFORM CHANGES</span><h2>A trend, not one number.</h2><p>NutriPlan should only adjust a plan after there is enough context to make the change useful.</p><ul><li><span>↘</span><div><strong>Weight trend</strong><small>Several check-ins, not daily noise</small></div></li><li><span>✓</span><div><strong>Plan consistency</strong><small>How closely the week was followed</small></div></li><li><span>◌</span><div><strong>Hunger and energy</strong><small>How the plan feels in practice</small></div></li></ul><div className="progress-ready"><span>✓</span><div><strong>Week one is ready</strong><small>{plan.length} days · {groceryCount} grocery items</small></div></div></aside>
            </div>
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

function DayPlan({ day, targets, onOpenMeal, isToday = false }: { day: PlanDay; targets: Targets; onOpenMeal: (meal: Meal) => void; isToday?: boolean }) {
  const calories = sum(day.meals, "calories");
  const protein = sum(day.meals, "protein");
  const prepMinutes = day.meals.reduce((total, meal) => total + Number(meal.prep.split(" ")[0]), 0);
  const calorieDifference = calories - targets.calories;

  return (
    <section className="day-plan" aria-live="polite">
      <header className="day-plan-heading">
        <div><span className="eyebrow">{isToday ? `TODAY · ${dayName(day.day).toUpperCase()}` : `${dayName(day.day).toUpperCase()} · AUGUST ${day.date}`}</span><h2>{isToday ? "Today’s meals" : `${dayName(day.day)}’s meals`}</h2><p>{day.meals.length} meals · about {prepMinutes} minutes total prep</p></div>
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

function MealModal({ meal, saved, onSave, onClose, reviewMode = false }: { meal: Meal; saved: boolean; onSave: () => void; onClose: () => void; reviewMode?: boolean }) {
  return <div className="modal-backdrop"><button className="modal-dismiss" onClick={onClose} aria-label="Close recipe" /><article className="recipe-modal" role="dialog" aria-modal="true" aria-labelledby="recipe-title"><div className={`recipe-hero ${meal.tone}`}><span>{meal.icon}</span><button onClick={onClose} aria-label="Close">×</button></div><div className="recipe-body"><span className="eyebrow">{meal.type} · {meal.prep}</span><h2 id="recipe-title">{meal.name}</h2><p>{meal.description}</p><div className="recipe-macros"><span><b>{meal.calories}</b> calories</span><span><b>{meal.protein}g</b> protein</span><span><b>1</b> serving</span></div><h3>What you’ll need</h3><ul>{meal.ingredients.map((ingredient) => <li key={ingredient.name}><span>✓</span>{ingredient.name} · {ingredient.quantity} {ingredient.unit}</li>)}</ul><h3>Quick method</h3><p>Prep the ingredients, cook the main protein or legume until ready, and assemble with the vegetables and grain. Season to taste and serve warm.</p>{reviewMode ? <button className="primary-btn" onClick={onClose}>Looks good</button> : <button className="primary-btn" onClick={onSave}>{saved ? "Saved to favorites ♥" : "Save this meal ♡"}</button>}</div></article></div>;
}

function sum(meals: Meal[], key: "calories" | "protein") {
  return meals.reduce((total, meal) => total + meal[key], 0);
}

function dayName(day: string) {
  return ({ Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" } as Record<string, string>)[day] ?? day;
}

function weekdayKey(date: Date) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
}

function progressDirection(profile: Profile, targets: Targets) {
  if (targets.method === "psmf") return "Clinician-led";
  if (profile.goal === "maintain") return "Maintain";
  if (profile.goal === "gain") return "Gradual gain";
  return targets.projectedKg ? `${targets.projectedKg} kg/week` : "Gradual loss";
}
