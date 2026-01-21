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
  variantIds: number[];
  categoryTypeIds: number[];
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

  private buildNormalizedPayload(payload: any): NormalizedPayload {
    const appliesTo = toInt(pick(payload, "applies_to", "appliesTo") ?? 0, 0);
    const eligibilityType = toInt(
      pick(payload, "eligibility_type", "eligibilityType") ?? 0,
      0
    );
    const unlimited = toInt(
      pick(payload, "is_unlimited", "isUnlimited") ?? 1,
      1
    );
    const noExpiry = toInt(
      pick(payload, "no_expiry", "noExpiry") ?? 1,
      1
    ) === 1;
    const isAuto =
      toInt(pick(payload, "is_auto", "isAuto") ?? 1, 1) === 1;

    const valueType = toInt(pick(payload, "value_type", "valueType") ?? 1, 1);
    const rawValue = pick(payload, "value");
    const rawMax = pick(payload, "max_discount", "maxDiscount");
    const rawMinOrder = pick(payload, "min_order_amount", "minOrderAmount");
    const description =
      String(payload?.description ?? "").trim() || null;

    const normalizedTargets = this.normalizeTargets(payload);
    const customerIds = uniqNums(
      pick(payload, "customer_ids", "customerIds") ?? []
    );
    const customerGroupIds = uniqNums(
      pick(payload, "customer_group_ids", "customerGroupIds") ?? []
    );

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
      isEcommerce: toIsActive(pick(payload, "is_ecommerce", "isEcommerce"), true),
      isPos: toIsActive(pick(payload, "is_pos", "isPos"), false),
      isAuto,

      startedAt: parseStartDate(
        pick(payload, "started_at", "startedAt")
      ),
      expiredAt: noExpiry
        ? null
        : parseEndDate(pick(payload, "expired_at", "expiredAt")),
      daysMask: buildMaskFromDays(
        pick(payload, "days_of_week", "daysOfWeek") ?? []
      ),

      targets: normalizedTargets,
      customerIds,
      customerGroupIds,

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
    const rows: { discount_id: number; target_type: number; target_id: number }[] =
      [];

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
    await trx.from("discount_customer_users").where("discount_id", discountId).delete();
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

  private async requireNoPromoConflicts(
    trx: any,
    normalized: NormalizedPayload
  ) {
    const targetPayload = this.buildConflictPayload(normalized.targets);
    const productIds = await buildTargetProductIdsForConflict(
      trx,
      targetPayload,
      normalized.appliesTo
    );

    if (!productIds.length) return;

    const conflicts = await getActivePromoProductIds(trx, productIds);
    const hasConflict =
      (conflicts.flash?.length ?? 0) > 0 || (conflicts.sale?.length ?? 0) > 0;

    if (!hasConflict) return;

    if (normalized.transfer) {
      await transferOutFromActivePromos(trx, productIds);
      const remaining = await getActivePromoProductIds(trx, productIds);
      const stillConflict =
        (remaining.flash?.length ?? 0) > 0 ||
        (remaining.sale?.length ?? 0) > 0;
      if (stillConflict) {
        throw new PromoConflictError(remaining);
      }
      return;
    }

    throw new PromoConflictError(conflicts);
  }

  public async list(qs: any) {
    const query = Discount.query().whereNull("discounts.deleted_at");
    const q = String(qs?.q ?? "").trim();
    const page = toInt(qs?.page, 1) || 1;
    const perPage = toInt(qs?.per_page, 10) || 10;

    if (q) {
      query.where((sub) => {
        sub
          .whereILike("discounts.name", `%${q}%`)
          .orWhereILike("discounts.code", `%${q}%`);
      });
    }

    const result = await query.orderBy("discounts.id", "desc").paginate(page, perPage);
    const json = result.toJSON();

    return { data: json.data ?? [], meta: json.meta ?? {} };
  }

  public async show(identifier: string | number) {
    const normalizedId = normalizeIdentifier(identifier);
    const discount = await findDiscountByIdentifier(normalizedId);
    if (!discount) throw new Error("Discount not found");

    const targets = await DiscountTarget.query()
      .where("discount_id", discount.id);

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
      new Set(
        customerRows
          .map((r: any) => Number(r.user_id))
          .filter((x) => Number.isFinite(x) && x > 0)
      )
    );
    const customerGroupIds = Array.from(
      new Set(
        groupRows
          .map((r: any) => Number(r.customer_group_id))
          .filter((x) => Number.isFinite(x) && x > 0)
      )
    );

    return {
      ...discount.toJSON(),
      brandIds,
      productIds,
      variantIds,
      categoryTypeIds,
      customerIds,
      customerGroupIds,
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