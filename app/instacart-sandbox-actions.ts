"use server";

import {
  addInstacartItems,
  deleteInstacartSession,
  findInstacartStores,
  openInstacartSession,
  pauseInstacartSession,
  type InstacartCartSummary,
  type InstacartResult,
  type InstacartStore,
} from "../lib/instacart-sandbox";
import { createClient } from "../lib/supabase/server";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function authenticatedUserId() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Your NutriPlan session expired. Sign in again and retry.");
  return user.id;
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The private Instacart browser could not complete that request.";
}

export async function startInstacartBrowser(): Promise<ActionResult<{ liveUrl: string }>> {
  try {
    return { ok: true, data: await openInstacartSession(await authenticatedUserId()) };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function loadInstacartStores(): Promise<ActionResult<{ stores: InstacartStore[] }>> {
  try {
    return { ok: true, data: await findInstacartStores(await authenticatedUserId()) };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function buildInstacartCart(input: {
  storeHref: string;
  items: { query: string; quantity: number }[];
}): Promise<ActionResult<{ results: InstacartResult[]; summary: InstacartCartSummary }>> {
  try {
    const userId = await authenticatedUserId();
    return {
      ok: true,
      data: await addInstacartItems(userId, input.storeHref, input.items),
    };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function pauseInstacartBrowser(): Promise<ActionResult<Record<string, never>>> {
  try {
    await pauseInstacartSession(await authenticatedUserId());
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function disconnectInstacartBrowser(): Promise<ActionResult<Record<string, never>>> {
  try {
    await deleteInstacartSession(await authenticatedUserId());
    return { ok: true, data: {} };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
