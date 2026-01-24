import { DateTime } from "luxon";
import db from "@adonisjs/lucid/services/db";

import Discount from "#models/discount";
import DiscountTarget from "#models/discount_target";

import {
  buildMaskFromDays,
  daysFromMask,
  findDiscountByIdentifier,
  normalizeIdentifier,
  parseEndDate,
  parseStartDate,
  pick,
  toInt,
  toIsActive,
  toNum,
  uniqNums,
  buildTargetProductIdsForConflict,
  getActivePromoProductIds,
  transferOutFromActivePromos,
} from "#services/discount/discount_cms_utils";

type NormalizedTargets = {
  brandIds: number[];
  productIds: number[];
  variantIds: number[]; // legacy: attribute_value_id (target_type=5)
  categoryTypeIds: number[];
};

type NormalizedVariantItem = {
  productVariantId: number;
  productId: number | null;
  isActive: boolean;

  valueType: "percent" | "fixed";
  value: number;
  maxDiscount: number | null;

  promoStock: number | null;
  purchaseLimit: number | null;
};

type NormalizedPayload = {
  name: string;
  code: string;
  description: string | null;

  valueType: number;
  value: number;
  maxDiscount: number | null;

  appliesTo: number;
  minOrderAmount: number | null;
  eligibilityType: number;

  usageLimit: number | null;

  isActive: boolean;
  isEcommerce: boolean;
  isPos: boolean;
  isAuto: boolean;

  startedAt: DateTime | null;
  expiredAt: DateTime | null;
  daysMask: number;

  targets: NormalizedTargets;
  customerIds: number[];
  customerGroupIds: number[];

  variantItems: NormalizedVariantItem[];

  transfer: boolean;
};

export type PromoConflictDetail = {
  flash: number[];
  sale: number[];
};

export class PromoConflictError extends Error {
  public readonly conflicts: PromoConflictDetail;
  public readonly canTransfer = true;

  constructor(conflicts: PromoConflictDetail) {
    super("Produk sedang ikut promo aktif");
    this.name = "PromoConflictError";
    this.conflicts = conflicts;
  }
}

export class DiscountCmsService {
  private normalizeTargets(payload: any): NormalizedTargets {
    return {
      brandIds: uniqNums(pick(payload, "brand_ids", "brandIds") ?? []),
      productIds: uniqNums(pick(payload, "product_ids", "productIds") ?? []),
      variantIds: uniqNums(pick(payload, "variant_ids", "variantIds") ?? []),
      categoryTypeIds: uniqNums(
        pick(payload, "category_type_ids", "categoryTypeIds") ?? []
      ),
    };
  }

  private normalizeVariantItems(payload: any): NormalizedVariantItem[] {
    const raw = pick(payload, "items", "variant_items", "variantItems") ?? [];
    if (!Array.isArray(raw)) return [];

    const tmp: NormalizedVariantItem[] = [];

    for (const it of raw) {
      const productVariantId = toInt(
        pick(
          it,
          "product_variant_id",
          "productVariantId",
          "attribute_value_id",
          "attributeValueId"
        ) ?? 0,
        0
      );
      if (!productVariantId) continue;

      const productIdNum = toInt(pick(it, "product_id", "productId") ?? 0, 0);
      const productId = productIdNum > 0 ? productIdNum : null;

      const isActive = toIsActive(pick(it, "is_active", "isActive"), true);

      const vtRaw = pick(it, "value_type", "valueType");
      let valueType: "percent" | "fixed" = "percent";
      if (typeof vtRaw === "number") {
        valueType = vtRaw === 2 ? "fixed" : "percent";
      } else {
        const s = String(vtRaw ?? "percent").toLowerCase().trim();
        valueType = s === "fixed" || s === "nominal" ? "fixed" : "percent";
      }

      const value = Math.max(0, toNum(pick(it, "value"), 0) ?? 0);

      const maxDiscountRaw = toNum(pick(it, "max_discount", "maxDiscount"));
      const maxDiscount =
        maxDiscountRaw === null ? null : Math.max(0, maxDiscountRaw);

      const promoStockRaw = pick(it, "promo_stock", "promoStock");
      const promoStockInt =
        promoStockRaw === null || promoStockRaw === undefined
          ? null
          : toInt(promoStockRaw, 0);
      const promoStock =
        promoStockInt !== null &&
        Number.isFinite(promoStockInt) &&
        promoStockInt > 0
          ? promoStockInt
          : null;

      const purchaseLimitRaw = pick(it, "purchase_limit", "purchaseLimit");
      const purchaseLimitInt =
        purchaseLimitRaw === null || purchaseLimitRaw === undefined
          ? null
          : toInt(purchaseLimitRaw, 0);
      const purchaseLimit =
        purchaseLimitInt !== null &&
        Number.isFinite(purchaseLimitInt) &&
        purchaseLimitInt > 0
          ? purchaseLimitInt
          : null;

      tmp.push({
        productVariantId,
        productId,
        isActive,
        valueType,
        value,
        maxDiscount,
        promoStock,
        purchaseLimit,
      });
    }

    const map = new Map<number, NormalizedVariantItem>();
    for (const it of tmp) map.set(it.productVariantId, it);
    return Array.from(map.values());
  }

  private buildNormalizedPayload(payload: any): NormalizedPayload {
    const normalizedVariantItems = this.normalizeVariantItems(payload);

    const appliesToRaw = toInt(pick(payload, "applies_to", "appliesTo") ?? 0, 0);
    const appliesTo = normalizedVariantItems.length ? 3 : appliesToRaw;

    const eligibilityType = toInt(
      pick(payload, "eligibility_type", "eligibilityType") ?? 0,
      0
    );

    const unlimited = toInt(
      pick(payload, "is_unlimited", "isUnlimited") ?? 1,
      1
    );
    const noExpiry =
      toInt(pick(payload, "no_expiry", "noExpiry") ?? 1, 1) === 1;

    const isAuto =
      normalizedVariantItems.length
        ? false
        : toInt(pick(payload, "is_auto", "isAuto") ?? 1, 1) === 1;

    const valueType = toInt(pick(payload, "value_type", "valueType") ?? 1, 1);
    const rawValue = pick(payload, "value");
    const rawMax = pick(payload, "max_discount", "maxDiscount");
    const rawMinOrder = pick(payload, "min_order_amount", "minOrderAmount");
    const description = String(payload?.description ?? "").trim() || null;

    const normalizedTargetsRaw = this.normalizeTargets(payload);

    const normalizedTargets: NormalizedTargets = normalizedVariantItems.length
      ? { brandIds: [], productIds: [], variantIds: [], categoryTypeIds: [] }
      : normalizedTargetsRaw;

    const customerIds = uniqNums(
      pick(payload, "customer_ids", "customerIds") ?? []
    );
    const customerGroupIds = uniqNums(
      pick(payload, "customer_group_ids", "customerGroupIds") ?? []
    );

    const daysRaw = pick(payload, "days_of_week", "daysOfWeek") ?? [];
    const daysArr =
      Array.isArray(daysRaw) && daysRaw.length
        ? daysRaw
        : ["0", "1", "2", "3", "4", "5", "6"];

    return {
      name: String(payload?.name ?? "").trim(),
      code: String(payload?.code ?? "").trim(),
      description,

      valueType,
      value: toNum(rawValue, 0) ?? 0,
      maxDiscount: toNum(rawMax),

      appliesTo,
      minOrderAmount: appliesTo === 1 ? toNum(rawMinOrder) : null,
      eligibilityType,

      usageLimit:
        unlimited === 1
          ? null
          : toInt(pick(payload, "qty", "qty") ?? 0, 0) || null,

      isActive: toIsActive(pick(payload, "is_active", "isActive"), true),
      isEcommerce: toIsActive(
        pick(payload, "is_ecommerce", "isEcommerce"),
        true
      ),
      isPos: toIsActive(pick(payload, "is_pos", "isPos"), false),
      isAuto,

      startedAt: parseStartDate(pick(payload, "started_at", "startedAt")),
      expiredAt: noExpiry
        ? null
        : parseEndDate(pick(payload, "expired_at", "expiredAt")),
      daysMask: buildMaskFromDays(daysArr),

      targets: normalizedTargets,
      customerIds,
      customerGroupIds,

      variantItems: normalizedVariantItems,

      transfer:
        payload?.transfer === 1 ||
        payload?.transfer === "1" ||
        payload?.transfer === true,
    };
  }

  private buildTargetRows(
    discountId: number,
    appliesTo: number,
    targets: NormalizedTargets
  ): { discount_id: number; target_type: number; target_id: number }[] {
    const rows: {
      discount_id: number;
      target_type: number;
      target_id: number;
    }[] = [];

    if (appliesTo === 2 && targets.categoryTypeIds.length) {
      for (const id of targets.categoryTypeIds) {
        rows.push({ discount_id: discountId, target_type: 1, target_id: id });
      }
    }

    if (appliesTo === 3 && targets.variantIds.length) {
      for (const id of targets.variantIds) {
        rows.push({ discount_id: discountId, target_type: 5, target_id: id });
      }
    }

    if (appliesTo === 4 && targets.brandIds.length) {
      for (const id of targets.brandIds) {
        rows.push({ discount_id: discountId, target_type: 3, target_id: id });
      }
    }

    if (appliesTo === 5 && targets.productIds.length) {
      for (const id of targets.productIds) {
        rows.push({ discount_id: discountId, target_type: 4, target_id: id });
      }
    }

    return rows;
  }

  private async replaceTargets(
    trx: any,
    discountId: number,
    appliesTo: number,
    targets: NormalizedTargets
  ) {
    await trx.from("discount_targets").where("discount_id", discountId).delete();

    const rows = this.buildTargetRows(discountId, appliesTo, targets);
    if (!rows.length) return;
    await trx.table("discount_targets").insert(rows);
  }

  private async replaceCustomerAssociations(
    trx: any,
    discountId: number,
    eligibilityType: number,
    customerIds: number[],
    customerGroupIds: number[]
  ) {
    await trx
      .from("discount_customer_users")
      .where("discount_id", discountId)
      .delete();
    await trx
      .from("discount_customer_groups")
      .where("discount_id", discountId)
      .delete();

    if (eligibilityType === 1 && customerIds.length) {
      await trx.table("discount_customer_users").insert(
        customerIds.map((userId) => ({
          discount_id: discountId,
          user_id: userId,
        }))
      );
    }

    if (eligibilityType === 2 && customerGroupIds.length) {
      await trx.table("discount_customer_groups").insert(
        customerGroupIds.map((groupId) => ({
          discount_id: discountId,
          customer_group_id: groupId,
        }))
      );
    }
  }

  private buildConflictPayload(targets: NormalizedTargets) {
    return {
      brand_ids: targets.brandIds,
      product_ids: targets.productIds,
      variant_ids: targets.variantIds,
      category_type_ids: targets.categoryTypeIds,

      brandIds: targets.brandIds,
      productIds: targets.productIds,
      variantIds: targets.variantIds,
      categoryTypeIds: targets.categoryTypeIds,
    };
  }

  /**
   * Hydrate variant details for CMS (LIST/SHOW).
   * Pakai query langsung biar stabil, dan boleh tampil walau variant soft-deleted (CMS perlu lihat data promo lama).
   */
  private async fetchVariantMap(trx: any, pvIds: number[]) {
    const ids = Array.from(
      new Set((pvIds ?? []).map((x) => Number(x)).filter((x) => x > 0))
    );
    const map = new Map<number, any>();
    if (!ids.length) return map;

    const rows = await trx
      .from("product_variants as pv")
      .leftJoin("products as p", "p.id", "pv.product_id")
      .whereIn("pv.id", ids)
      .select([
        "pv.id",
        "pv.product_id",
        "pv.sku",
        "pv.price",
        "pv.stock",
        "pv.deleted_at as variant_deleted_at",
        "p.id as p_id",
        "p.name as p_name",
        "p.deleted_at as p_deleted_at",
      ]);

    for (const r of rows ?? []) {
      const id = Number(r.id);
      const sku = r.sku ? String(r.sku) : null;

      // label minimal: sku / VAR-id (+ marker kalau deleted)
      const labelBase = sku || `VAR-${id}`;
      const label =
        labelBase + (r.variant_deleted_at ? " (deleted)" : "");

      map.set(id, {
        id,
        product_id: r.product_id ? Number(r.product_id) : null,
        sku,
        price: Number(r.price ?? 0),
        stock: Number(r.stock ?? 0),
        label,
        product:
          r.p_id && r.p_name
            ? { id: Number(r.p_id), name: String(r.p_name) }
            : null,
      });
    }

    return map;
  }

  /**
   * ✅ FIX data lama:
   * attribute_value_id -> product_variant_id via beberapa tabel
   */
  private async mapAttributeValueIdsToVariantIds(
    trx: any,
    attributeValueIds: number[]
  ): Promise<Map<number, number>> {
    const ids = Array.from(
      new Set(
        (attributeValueIds ?? [])
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x) && x > 0)
      )
    );

    const map = new Map<number, number>();
    if (!ids.length) return map;

    try {
      const avRows = await trx
        .from("attribute_values")
        .whereIn("id", ids)
        .select(["id", "product_variant_id"]);

      for (const r of avRows ?? []) {
        const avId = Number(r.id);
        const pvId = Number(r.product_variant_id ?? 0);
        if (
          Number.isFinite(avId) &&
          avId > 0 &&
          Number.isFinite(pvId) &&
          pvId > 0
        ) {
          map.set(avId, pvId);
        }
      }
    } catch (_) {}

    const remaining1 = ids.filter((id) => !map.has(id));
    if (!remaining1.length) return map;

    try {
      const vaRows = await trx
        .from("variant_attributes")
        .whereIn("attribute_value_id", remaining1)
        .select(["attribute_value_id", "product_variant_id"]);

      for (const r of vaRows ?? []) {
        const avId = Number(r.attribute_value_id);
        const pvId = Number(r.product_variant_id ?? 0);
        if (
          Number.isFinite(avId) &&
          avId > 0 &&
          Number.isFinite(pvId) &&
          pvId > 0
        ) {
          map.set(avId, pvId);
        }
      }
    } catch (_) {}

    const remaining2 = remaining1.filter((id) => !map.has(id));
    if (!remaining2.length) return map;

    try {
      const pvaRows = await trx
        .from("product_variant_attributes")
        .whereIn("attribute_value_id", remaining2)
        .select(["attribute_value_id", "product_variant_id"]);

      for (const r of pvaRows ?? []) {
        const avId = Number(r.attribute_value_id);
        const pvId = Number(r.product_variant_id ?? 0);
        if (
          Number.isFinite(avId) &&
          avId > 0 &&
          Number.isFinite(pvId) &&
          pvId > 0
        ) {
          map.set(avId, pvId);
        }
      }
    } catch (_) {}

    return map;
  }

  /**
   * LIST/SHOW: deteksi legacy id dalam raw rows (discount_variant_items).
   */
  private async resolveLegacyAttributeValueIdsToVariantIds(
    trx: any,
    rows: any[]
  ): Promise<Map<number, number>> {
    const incoming = Array.from(
      new Set(
        (rows ?? [])
          .map((r: any) => Number(r?.product_variant_id))
          .filter((x: any) => Number.isFinite(x) && x > 0)
      )
    );

    const map = new Map<number, number>();
    if (!incoming.length) return map;

    // ✅ Jangan filter deleted_at di sini.
    // Kalau variant soft-deleted, tetap dianggap "valid pv id" supaya tidak salah dimapping sebagai legacy attribute_value_id.
    const pvFoundRows = await trx
      .from("product_variants")
      .whereIn("id", incoming)
      .select(["id"]);

    const pvFound = new Set(pvFoundRows.map((r: any) => Number(r.id)));
    const missing = incoming.filter((id) => !pvFound.has(id));
    if (!missing.length) return map;

    const legacyMap = await this.mapAttributeValueIdsToVariantIds(trx, missing);
    for (const [k, v] of legacyMap.entries()) map.set(k, v);

    return map;
  }

  private async resolveVariantItemsToProductVariantIds(
    trx: any,
    items: NormalizedVariantItem[]
  ): Promise<NormalizedVariantItem[]> {
    if (!items.length) return [];

    const incomingIds = Array.from(
      new Set(
        items
          .map((x) => Number(x.productVariantId))
          .filter((x) => Number.isFinite(x) && x > 0)
      )
    );
    if (!incomingIds.length) return [];

    // ✅ Jangan filter deleted_at di sini (biar deleted tidak salah dianggap legacy).
    const pvRows = await trx
      .from("product_variants")
      .whereIn("id", incomingIds)
      .select(["id"]);

    const pvFound = new Set(pvRows.map((r: any) => Number(r.id)));
    const missingIds = incomingIds.filter((id) => !pvFound.has(id));

    const legacyMap =
      missingIds.length > 0
        ? await this.mapAttributeValueIdsToVariantIds(trx, missingIds)
        : new Map<number, number>();

    const replaced = items.map((it) => {
      const incoming = Number(it.productVariantId);
      const mapped = legacyMap.get(incoming);
      if (mapped) return { ...it, productVariantId: mapped };
      return it;
    });

    const map = new Map<number, NormalizedVariantItem>();
    for (const it of replaced) {
      const id = Number(it.productVariantId);
      if (Number.isFinite(id) && id > 0) map.set(id, it);
    }
    return Array.from(map.values());
  }

  private async getProductIdsFromVariantItems(trx: any, items: NormalizedVariantItem[]) {
    const resolvedItems = await this.resolveVariantItemsToProductVariantIds(trx, items);

    const direct = resolvedItems
      .map((it) => it.productId)
      .filter((x): x is number => Number.isFinite(x as any) && (x as any) > 0);

    const missingVariantIds = resolvedItems
      .filter((it) => !it.productId)
      .map((it) => it.productVariantId);

    let fromVariants: number[] = [];
    if (missingVariantIds.length) {
      const rows = await trx
        .from("product_variants")
        .whereIn("id", missingVariantIds)
        .select("product_id");

      fromVariants = rows
        .map((r: any) => Number(r.product_id))
        .filter((x: any) => Number.isFinite(x) && x > 0);
    }

    return Array.from(new Set([...direct, ...fromVariants]));
  }

  private async requireNoPromoConflicts(trx: any, normalized: NormalizedPayload) {
    let productIds: number[] = [];

    if (normalized.variantItems.length) {
      productIds = await this.getProductIdsFromVariantItems(trx, normalized.variantItems);
    } else {
      const targetPayload = this.buildConflictPayload(normalized.targets);
      productIds = await buildTargetProductIdsForConflict(
        trx,
        targetPayload,
        normalized.appliesTo
      );
    }

    if (!productIds.length) return;

    const conflicts = await getActivePromoProductIds(trx, productIds);
    const hasConflict =
      (conflicts.flash?.length ?? 0) > 0 || (conflicts.sale?.length ?? 0) > 0;

    if (!hasConflict) return;

    if (normalized.transfer) {
      await transferOutFromActivePromos(trx, productIds);
      const remaining = await getActivePromoProductIds(trx, productIds);
      const stillConflict =
        (remaining.flash?.length ?? 0) > 0 || (remaining.sale?.length ?? 0) > 0;
      if (stillConflict) throw new PromoConflictError(remaining);
      return;
    }

    throw new PromoConflictError(conflicts);
  }

  private async hydrateAndValidateVariantItems(
    trx: any,
    items: NormalizedVariantItem[]
  ): Promise<NormalizedVariantItem[]> {
    if (!items.length) return [];

    const resolvedItems = await this.resolveVariantItemsToProductVariantIds(trx, items);

    const ids = Array.from(
      new Set(resolvedItems.map((x) => Number(x.productVariantId)).filter((x) => x > 0))
    );

    // ✅ Untuk CREATE/UPDATE tetap validasi variant yang aktif (exclude deleted)
    const rows = await trx
      .from("product_variants")
      .whereNull("deleted_at")
      .whereIn("id", ids)
      .select(["id", "product_id", "sku", "price", "stock"]);

    const vmap = new Map<number, any>();
    for (const r of rows) vmap.set(Number(r.id), r);

    const missing = ids.filter((id) => !vmap.has(id));
    if (missing.length) throw new Error(`Product variant not found: ${missing[0]}`);

    return resolvedItems.map((it) => {
      const v = vmap.get(Number(it.productVariantId));
      const productId = it.productId ?? (Number(v?.product_id ?? 0) || null);

      const priceNum = Number(v?.price ?? 0) || 0;
      const stockNum = Number(v?.stock ?? 0) || 0;

      if (it.valueType === "percent") {
        if (it.value < 0 || it.value > 100) {
          throw new Error(
            `Invalid percent discount for variant ${it.productVariantId}. Must be 0..100`
          );
        }
      } else {
        if (it.value < 0 || it.value > priceNum) {
          throw new Error(
            `Invalid fixed discount for variant ${it.productVariantId}. Must be 0..price`
          );
        }
      }

      if (it.promoStock !== null) {
        if (it.promoStock <= 0) {
          throw new Error(`promo_stock must be > 0 for variant ${it.productVariantId}`);
        }
        if (stockNum >= 0 && it.promoStock > stockNum) {
          throw new Error(
            `promo_stock (${it.promoStock}) exceeds stock (${stockNum}) for variant ${it.productVariantId}`
          );
        }
      }

      if (it.purchaseLimit !== null) {
        if (it.purchaseLimit <= 0) {
          throw new Error(
            `purchase_limit must be > 0 for variant ${it.productVariantId}`
          );
        }
        if (it.promoStock !== null && it.purchaseLimit > it.promoStock) {
          throw new Error(
            `purchase_limit (${it.purchaseLimit}) exceeds promo_stock (${it.promoStock}) for variant ${it.productVariantId}`
          );
        }
      }

      return { ...it, productId };
    });
  }

  private async replaceVariantItems(trx: any, discountId: number, items: NormalizedVariantItem[]) {
    await trx.from("discount_variant_items").where("discount_id", discountId).delete();
    if (!items.length) return;

    const hydrated = await this.hydrateAndValidateVariantItems(trx, items);
    const now = DateTime.utc().toISO();

    await trx.table("discount_variant_items").insert(
      hydrated.map((it) => ({
        discount_id: discountId,
        product_id: it.productId,
        product_variant_id: it.productVariantId,
        is_active: it.isActive ? 1 : 0,
        value_type: it.valueType,
        value: it.value,
        max_discount: it.maxDiscount,
        promo_stock: it.promoStock,
        purchase_limit: it.purchaseLimit,
        created_at: now,
        updated_at: now,
      }))
    );
  }

  public async list(qs: any) {
    const query = Discount.query().whereNull("discounts.deleted_at");
    const q = String(qs?.q ?? "").trim();
    const page = toInt(qs?.page, 1) || 1;
    const perPage = toInt(qs?.per_page, 10) || 10;

    if (q) {
      query.where((sub) => {
        sub.whereILike("discounts.name", `%${q}%`).orWhereILike("discounts.code", `%${q}%`);
      });
    }

    const result = await query.orderBy("discounts.id", "desc").paginate(page, perPage);

    const data = result.all().map((row) => row.serialize());
    const meta = result.getMeta();

    const discountIds = data
      .map((row: any) => Number(row?.id ?? 0))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    if (!discountIds.length) return { data, meta };

    const rawVariantItems = await db
      .from("discount_variant_items")
      .whereIn("discount_id", discountIds)
      .orderBy("discount_id", "asc")
      .orderBy("product_variant_id", "asc");

    const legacyMap = await this.resolveLegacyAttributeValueIdsToVariantIds(db, rawVariantItems);
    if (legacyMap.size) {
      for (const r of rawVariantItems) {
        const rawId = Number(r?.product_variant_id ?? 0);
        const mapped = legacyMap.get(rawId);
        if (mapped) {
          r.attribute_value_id = rawId;
          r.product_variant_id = mapped;
        }
      }
    }

    const pvIds = Array.from(
      new Set(
        rawVariantItems
          .map((r: any) => Number(r.product_variant_id))
          .filter((x: any) => Number.isFinite(x) && x > 0)
      )
    );

    const variantMap = await this.fetchVariantMap(db, pvIds);

    const itemsByDiscount = new Map<number, any[]>();
    for (const r of rawVariantItems ?? []) {
      const discountId = Number(r.discount_id ?? 0);
      if (!discountId) continue;

      const pvId = Number(r.product_variant_id);
      const v = variantMap.get(pvId) ?? null;
      const productId = r.product_id ?? (v?.product_id ?? null);

      const item = {
        ...r,

        id: r.id,
        discountId,
        productId,
        productVariantId: pvId,
        isActive: Number(r.is_active ?? 0) === 1 || r.is_active === true,
        valueType: String(r.value_type ?? "percent"),
        value: Number(r.value ?? 0),
        maxDiscount: r.max_discount === null ? null : Number(r.max_discount ?? 0),
        promoStock: r.promo_stock === null ? null : Number(r.promo_stock ?? 0),
        purchaseLimit: r.purchase_limit === null ? null : Number(r.purchase_limit ?? 0),

        variant: v,

        sku: v?.sku ?? null,
        price: v?.price ?? null,
        stock: v?.stock ?? null,
        variantLabel: v?.label ?? null,
        productName: v?.product?.name ?? null,
      };

      if (!itemsByDiscount.has(discountId)) itemsByDiscount.set(discountId, []);
      itemsByDiscount.get(discountId)?.push(item);
    }

    for (const row of data as any[]) {
      const id = Number(row?.id ?? 0);
      row.variantItems = itemsByDiscount.get(id) ?? [];
    }

    return { data, meta };
  }

  public async show(identifier: string | number) {
    const normalizedId = normalizeIdentifier(identifier);
    const discount = await findDiscountByIdentifier(normalizedId);
    if (!discount) throw new Error("Discount not found");

    const targets = await DiscountTarget.query().where("discount_id", discount.id);

    const brandIds: number[] = [];
    const productIds: number[] = [];
    const variantIds: number[] = [];
    const categoryTypeIds: number[] = [];

    for (const target of targets) {
      if (target.targetType === 1) categoryTypeIds.push(target.targetId);
      if (target.targetType === 3) brandIds.push(target.targetId);
      if (target.targetType === 4) productIds.push(target.targetId);
      if (target.targetType === 5) variantIds.push(target.targetId);
    }

    const customerRows = await db
      .from("discount_customer_users")
      .where("discount_id", discount.id)
      .select("user_id");

    const groupRows = await db
      .from("discount_customer_groups")
      .where("discount_id", discount.id)
      .select("customer_group_id");

    const customerIds = Array.from(
      new Set(customerRows.map((r: any) => Number(r.user_id)).filter((x) => Number.isFinite(x) && x > 0))
    );

    const customerGroupIds = Array.from(
      new Set(groupRows.map((r: any) => Number(r.customer_group_id)).filter((x) => Number.isFinite(x) && x > 0))
    );

    const rawVariantItems = await db
      .from("discount_variant_items")
      .where("discount_id", discount.id)
      .orderBy("product_variant_id", "asc");

    const legacyMap = await this.resolveLegacyAttributeValueIdsToVariantIds(db, rawVariantItems);
    if (legacyMap.size) {
      for (const r of rawVariantItems) {
        const rawId = Number(r?.product_variant_id ?? 0);
        const mapped = legacyMap.get(rawId);
        if (mapped) {
          r.attribute_value_id = rawId;
          r.product_variant_id = mapped;
        }
      }
    }

    const pvIds = Array.from(
      new Set(
        rawVariantItems
          .map((r: any) => Number(r.product_variant_id))
          .filter((x: any) => Number.isFinite(x) && x > 0)
      )
    );

    const variantMap = await this.fetchVariantMap(db, pvIds);

    const variantItems = (rawVariantItems ?? []).map((r: any) => {
      const pvId = Number(r.product_variant_id);
      const v = variantMap.get(pvId) ?? null;
      const productId = r.product_id ?? (v?.product_id ?? null);

      return {
        ...r,

        id: r.id,
        discountId: r.discount_id,
        productId,
        productVariantId: pvId,
        isActive: Number(r.is_active ?? 0) === 1 || r.is_active === true,
        valueType: String(r.value_type ?? "percent"),
        value: Number(r.value ?? 0),
        maxDiscount: r.max_discount === null ? null : Number(r.max_discount ?? 0),
        promoStock: r.promo_stock === null ? null : Number(r.promo_stock ?? 0),
        purchaseLimit: r.purchase_limit === null ? null : Number(r.purchase_limit ?? 0),

        variant: v,

        sku: v?.sku ?? null,
        price: v?.price ?? null,
        stock: v?.stock ?? null,
        variantLabel: v?.label ?? null,
        productName: v?.product?.name ?? null,
      };
    });

    return {
      ...discount.toJSON(),

      brandIds,
      productIds,
      variantIds,
      categoryTypeIds,

      customerIds,
      customerGroupIds,

      variantItems,

      daysOfWeek: daysFromMask(discount.daysOfWeekMask ?? 127),
      qty: discount.usageLimit ?? null,
    };
  }

  public async create(payload: any) {
    return db.transaction(async (trx) => {
      const normalized = this.buildNormalizedPayload(payload);
      await this.requireNoPromoConflicts(trx, normalized);

      const discount = await Discount.create(
        {
          name: normalized.name,
          code: normalized.code,
          description: normalized.description,

          valueType: normalized.valueType,
          value: normalized.value,
          maxDiscount: normalized.maxDiscount,

          appliesTo: normalized.appliesTo,
          minOrderAmount: normalized.minOrderAmount,
          eligibilityType: normalized.eligibilityType,
          usageLimit: normalized.usageLimit,

          isActive: normalized.isActive,
          isEcommerce: normalized.isEcommerce,
          isPos: normalized.isPos,
          isAuto: normalized.isAuto,

          startedAt: normalized.startedAt,
          expiredAt: normalized.expiredAt,
          daysOfWeekMask: normalized.daysMask,
        },
        { client: trx }
      );

      await this.replaceTargets(trx, discount.id, normalized.appliesTo, normalized.targets);

      await this.replaceCustomerAssociations(
        trx,
        discount.id,
        normalized.eligibilityType,
        normalized.customerIds,
        normalized.customerGroupIds
      );

      await this.replaceVariantItems(trx, discount.id, normalized.variantItems);

      return discount;
    });
  }

  public async update(identifier: string | number, payload: any) {
    return db.transaction(async (trx) => {
      const normalizedId = normalizeIdentifier(identifier);
      const discount = await findDiscountByIdentifier(normalizedId, trx);
      if (!discount) throw new Error("Discount not found");

      const oldData = discount.toJSON();
      const normalized = this.buildNormalizedPayload(payload);
      await this.requireNoPromoConflicts(trx, normalized);

      discount.useTransaction(trx);
      discount.merge({
        name: normalized.name,
        code: normalized.code,
        description: normalized.description,

        valueType: normalized.valueType,
        value: normalized.value,
        maxDiscount: normalized.maxDiscount,

        appliesTo: normalized.appliesTo,
        minOrderAmount: normalized.minOrderAmount,
        eligibilityType: normalized.eligibilityType,
        usageLimit: normalized.usageLimit,

        isActive: normalized.isActive,
        isEcommerce: normalized.isEcommerce,
        isPos: normalized.isPos,
        isAuto: normalized.isAuto,

        startedAt: normalized.startedAt,
        expiredAt: normalized.expiredAt,
        daysOfWeekMask: normalized.daysMask,
      });
      await discount.save();

      await this.replaceTargets(trx, discount.id, normalized.appliesTo, normalized.targets);

      await this.replaceCustomerAssociations(
        trx,
        discount.id,
        normalized.eligibilityType,
        normalized.customerIds,
        normalized.customerGroupIds
      );

      await this.replaceVariantItems(trx, discount.id, normalized.variantItems);

      return { discount, oldData };
    });
  }

  public async softDelete(identifier: string | number) {
    const normalizedId = normalizeIdentifier(identifier);
    return db.transaction(async (trx) => {
      const discount = await findDiscountByIdentifier(normalizedId, trx);
      if (!discount) throw new Error("Discount not found");

      const timestamp = DateTime.now();
      discount.useTransaction(trx);
      discount.merge({ deletedAt: timestamp });
      await discount.save();

      await trx.from("discount_targets").where("discount_id", discount.id).delete();
      await trx.from("discount_customer_users").where("discount_id", discount.id).delete();
      await trx.from("discount_customer_groups").where("discount_id", discount.id).delete();
      await trx.from("discount_variant_items").where("discount_id", discount.id).delete();

      return discount;
    });
  }

  public async updateStatus(identifier: any, isActivePayload: any) {
    const normalizedId = normalizeIdentifier(identifier);
    const discount = await findDiscountByIdentifier(normalizedId);
    if (!discount) throw new Error("Discount not found");

    discount.isActive = toIsActive(isActivePayload, true);
    await discount.save();

    return discount;
  }
}
