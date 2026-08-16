#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import {
  goHome,
  launchBrowser,
  listStores,
  openCart,
  openStore,
  searchAndAdd,
} from "./instacart.js";
import { normalizeItems } from "./validation.js";

async function promptChoice(question, options) {
  const input = createInterface({ input: process.stdin, output: process.stdout });
  options.forEach((option, index) => console.log(`  ${index + 1}. ${option}`));
  while (true) {
    const answer = Number((await input.question(`${question} `)).trim());
    if (Number.isInteger(answer) && answer >= 1 && answer <= options.length) {
      input.close();
      return answer - 1;
    }
    console.log(`Enter a number between 1 and ${options.length}.`);
  }
}

async function main() {
  const itemsFile = process.argv[2];
  if (!itemsFile) throw new Error("Usage: nutriplan-instacart <items.json>");
  const items = normalizeItems(JSON.parse(await readFile(itemsFile, "utf8")));
  const { page } = await launchBrowser();
  await goHome(page);
  const stores = await listStores(page);
  if (!stores.length) throw new Error("No stores were found. Set your delivery address and sign into Instacart, then retry.");
  const store = stores[await promptChoice("Choose a store:", stores.map((item) => item.name))];
  await openStore(page, store.href);

  const results = [];
  for (const item of items) {
    try {
      results.push(await searchAndAdd(page, item));
    } catch (error) {
      results.push({ query: item.query, added: false, reason: error.message });
    }
  }
  await openCart(page);
  console.table(results);
  console.log("Cart ready for review. Checkout was not automated.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
