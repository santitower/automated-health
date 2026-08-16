export const MAX_ITEMS_PER_RUN = 75;
export const MAX_PACKAGE_QUANTITY = 12;

export function parseAllowedOrigins(raw) {
  return raw.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function normalizeStoreHref(value) {
  if (typeof value !== "string" || value.length > 500) {
    throw new RequestError("Choose a valid Instacart store.");
  }

  const url = new URL(value, "https://www.instacart.com");
  if (url.protocol !== "https:" || url.hostname !== "www.instacart.com") {
    throw new RequestError("The selected store must be on instacart.com.");
  }
  if (!/^\/store\/[^/?#]+\/storefront\/?$/.test(url.pathname)) {
    throw new RequestError("Choose a valid Instacart storefront.");
  }
  return `${url.pathname}${url.search}`;
}

export function normalizeItems(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RequestError("Add at least one grocery item.");
  }
  if (value.length > MAX_ITEMS_PER_RUN) {
    throw new RequestError(`A cart run can contain at most ${MAX_ITEMS_PER_RUN} items.`);
  }

  return value.map((item, index) => {
    const query = typeof item?.query === "string" ? item.query.trim().replace(/\s+/g, " ") : "";
    if (!query || query.length > 120) {
      throw new RequestError(`Item ${index + 1} needs a grocery name under 120 characters.`);
    }

    const quantity = item?.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PACKAGE_QUANTITY) {
      throw new RequestError(`Item ${index + 1} quantity must be an integer from 1 to ${MAX_PACKAGE_QUANTITY}.`);
    }
    return { query, quantity };
  });
}

export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}
