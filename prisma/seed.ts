/**
 * Nashriyot-Master — base seed (npm run db:seed).
 *
 * Reference/base world (distinct from the demo world in prisma/seed-demo.ts,
 * Task 22). Idempotent: every record uses a stable id and is upserted, so the
 * seed can be re-run safely.
 *
 * Seed password for all 5 users: "Parol123!"
 */
import {
  PrismaClient,
  EntityType,
  WarehouseType,
  PartnerRole,
  SalesChannelType,
  DiscountScope,
  Currency,
} from "@prisma/client";
import { hash } from "@node-rs/argon2";

const prisma = new PrismaClient();

const SEED_PASSWORD = "Parol123!";
const permId = (code: string) => `perm-${code.replace(/\./g, "-")}`;

// ── Permission catalogue ──────────────────────────────────────────────────────
const PERMISSIONS: [string, string][] = [
  ["dashboard.read", "dashboard"],
  ["titles.read", "titles"],
  ["titles.write", "titles"],
  ["titles.transition", "titles"],
  ["acquisitions.read", "acquisitions"],
  ["acquisitions.write", "acquisitions"],
  ["production.read", "production"],
  ["production.write", "production"],
  ["inventory.read", "inventory"],
  ["inventory.write", "inventory"],
  ["inventory.adjust", "inventory"],
  ["sales.read", "sales"],
  ["sales.write", "sales"],
  ["sales.approve", "sales"],
  ["transfers.read", "transfers"],
  ["transfers.write", "transfers"],
  ["transfers.override", "transfers"],
  ["contracts.read", "contracts"],
  ["contracts.write", "contracts"],
  ["royalty.read", "royalty"],
  ["royalty.write", "royalty"],
  ["royalty.approve", "royalty"],
  ["finance.read", "finance"],
  ["finance.write", "finance"],
  ["finance.reconcile", "finance"],
  ["leads.read", "leads"],
  ["leads.write", "leads"],
  ["costing.read", "costing"],
  ["analytics.read", "analytics"],
  ["ai.read", "ai"],
  ["ai.apply", "ai"],
  ["reports.read", "reports"],
  ["portal.read", "portal"],
  ["admin.users", "admin"],
  ["admin.roles", "admin"],
  ["admin.settings", "admin"],
  ["admin.import", "admin"],
  ["admin.integrations", "admin"],
  ["admin.audit", "admin"],
];
const ALL_PERMS = PERMISSIONS.map(([code]) => code);

// ── 9 standard roles ──────────────────────────────────────────────────────────
const ROLES: { code: string; name: string; perms: string[] }[] = [
  { code: "DIRECTOR", name: "Direktor", perms: ALL_PERMS },
  {
    code: "ACQUISITION_EDITOR",
    name: "Akvizitsiya muharriri",
    perms: [
      "dashboard.read",
      "titles.read",
      "titles.write",
      "titles.transition",
      "acquisitions.read",
      "acquisitions.write",
      "costing.read",
      "analytics.read",
      "reports.read",
      "ai.read",
    ],
  },
  {
    code: "PRODUCTION_MANAGER",
    name: "Ishlab chiqarish menejeri",
    perms: [
      "dashboard.read",
      "production.read",
      "production.write",
      "titles.read",
      "inventory.read",
      "reports.read",
    ],
  },
  {
    code: "WAREHOUSE_MANAGER",
    name: "Ombor menejeri",
    perms: [
      "dashboard.read",
      "inventory.read",
      "inventory.write",
      "inventory.adjust",
      "production.read",
      "reports.read",
    ],
  },
  {
    code: "SALES_MANAGER",
    name: "Sotuv menejeri",
    perms: [
      "dashboard.read",
      "sales.read",
      "sales.write",
      "leads.read",
      "leads.write",
      "transfers.read",
      "transfers.write",
      "inventory.read",
      "costing.read",
      "analytics.read",
      "reports.read",
    ],
  },
  {
    code: "ACCOUNTANT",
    name: "Buxgalter",
    perms: [
      "dashboard.read",
      "finance.read",
      "finance.write",
      "finance.reconcile",
      "sales.read",
      "royalty.read",
      "analytics.read",
      "reports.read",
    ],
  },
  {
    code: "RIGHTS_MANAGER",
    name: "Huquqlar menejeri",
    perms: [
      "dashboard.read",
      "contracts.read",
      "contracts.write",
      "royalty.read",
      "royalty.write",
      "royalty.approve",
      "titles.read",
      "reports.read",
    ],
  },
  { code: "AUTHOR", name: "Muallif", perms: ["portal.read"] },
  { code: "ADMIN", name: "Administrator", perms: ALL_PERMS },
];

// ── Entities ──────────────────────────────────────────────────────────────────
const ENTITIES = [
  { id: "ent-tasnim", code: "TASNIM", name: "Tasnim nashriyoti", type: EntityType.PUBLISHER },
  { id: "ent-tahlil", code: "TAHLIL", name: "Tahlil nashriyoti", type: EntityType.PUBLISHER },
  { id: "ent-sotuv", code: "SOTUV_BOLIMI", name: "Sotuv bo'limi", type: EntityType.DISTRIBUTOR },
];

// ── Partners ──────────────────────────────────────────────────────────────────
const AGENTS = [
  { id: "partner-akmal", name: "Akmal (agent)", defaultDiscount: 0.12, creditLimit: 40_000_000 },
  { id: "partner-bahodir", name: "Bahodir (agent)", defaultDiscount: 0.1, creditLimit: 25_000_000 },
  { id: "partner-sardor", name: "Sardor (agent)", defaultDiscount: 0.11, creditLimit: 30_000_000 },
];
const CLIENT_NAMES = [
  "Kitob olami",
  "Ma'rifat do'koni",
  "Ilm ziyo",
  "Bilim tarqatuvchi",
  "Yangi asr kitob",
  "Zakovat",
  "Durdona books",
  "Sahifa",
  "Mutolaa",
  "Kitobxon",
];
const PRINTERS = [
  { id: "partner-qamar", name: "Qamar bosmaxonasi", currency: Currency.UZS },
  { id: "partner-istanbul", name: "Istanbul Print", currency: Currency.USD },
  { id: "partner-yoshkuch", name: "Yoshkuch bosmaxonasi", currency: Currency.UZS },
];

// ── Warehouses ────────────────────────────────────────────────────────────────
const WAREHOUSES = [
  { id: "wh-tasnim-main", name: "Tasnim asosiy ombor", entityId: "ent-tasnim", type: WarehouseType.MAIN, partnerId: null },
  { id: "wh-tahlil-main", name: "Tahlil asosiy ombor", entityId: "ent-tahlil", type: WarehouseType.MAIN, partnerId: null },
  { id: "wh-sotuv-sales", name: "Sotuv bo'limi ombori", entityId: "ent-sotuv", type: WarehouseType.SALES, partnerId: null },
  { id: "wh-agent-akmal", name: "Akmal konsignatsiya", entityId: "ent-sotuv", type: WarehouseType.AGENT, partnerId: "partner-akmal" },
  { id: "wh-agent-bahodir", name: "Bahodir konsignatsiya", entityId: "ent-sotuv", type: WarehouseType.AGENT, partnerId: "partner-bahodir" },
  { id: "wh-agent-sardor", name: "Sardor konsignatsiya", entityId: "ent-sotuv", type: WarehouseType.AGENT, partnerId: "partner-sardor" },
];

// ── Users ─────────────────────────────────────────────────────────────────────
const ALL_ENTITY_IDS = ENTITIES.map((e) => e.id);
const USERS = [
  { id: "user-director", email: "director@nashriyot.uz", fullName: "Direktor", role: "DIRECTOR", entities: ALL_ENTITY_IDS },
  { id: "user-sales", email: "sales@nashriyot.uz", fullName: "Sotuv menejeri", role: "SALES_MANAGER", entities: ["ent-sotuv"] },
  { id: "user-editor", email: "editor@nashriyot.uz", fullName: "Tasnim muharriri", role: "ACQUISITION_EDITOR", entities: ["ent-tasnim"] },
  { id: "user-accountant", email: "accountant@nashriyot.uz", fullName: "Buxgalter", role: "ACCOUNTANT", entities: ALL_ENTITY_IDS },
  { id: "user-admin", email: "admin@nashriyot.uz", fullName: "Administrator", role: "ADMIN", entities: ALL_ENTITY_IDS },
];

// ── Sales channels ────────────────────────────────────────────────────────────
const CHANNELS = [
  { id: "chan-retail", name: "Chakana", type: SalesChannelType.RETAIL, defaultDiscount: 0.35, feeRate: 0, paymentTermDays: 0 },
  { id: "chan-distributor", name: "Distributor", type: SalesChannelType.DISTRIBUTOR, defaultDiscount: 0.55, feeRate: 0, paymentTermDays: 30 },
  { id: "chan-marketplace", name: "Marketpleys", type: SalesChannelType.MARKETPLACE, defaultDiscount: 0.4, feeRate: 0.05, paymentTermDays: 15 },
  { id: "chan-ownstore", name: "O'z do'koni", type: SalesChannelType.OWN_STORE, defaultDiscount: 0, feeRate: 0, paymentTermDays: 0 },
];

// ── Discount rules (priority: PARTNER > VOLUME > TITLE > ENTITY > DEFAULT) ─────
const DISCOUNT_RULES = [
  { id: "rule-default", scope: DiscountScope.DEFAULT, refId: null, minQty: null, rate: 0.1, priority: 10 },
  { id: "rule-volume", scope: DiscountScope.VOLUME, refId: null, minQty: 50, rate: 0.12, priority: 40 },
  { id: "rule-partner", scope: DiscountScope.PARTNER, refId: "partner-client-1", minQty: null, rate: 0.15, priority: 50 },
];

// ── Settings ──────────────────────────────────────────────────────────────────
const SETTINGS: { key: string; value: unknown }[] = [
  { key: "deadStockDays", value: 120 },
  { key: "carryingRate", value: 0.2 },
  { key: "expectedROI", value: 0.25 },
  { key: "allocationMethod", value: "COPY_DAY" }, // NUSXA_KUN
  { key: "baseCurrency", value: "UZS" },
  { key: "vatRate", value: 0 },
  { key: "serviceLevelZ", value: 1.65 },
  { key: "dailyDemandWindowDays", value: 90 },
  {
    key: "ageDiscountTiers",
    value: [
      { fromDays: 0, toDays: 90, discount: 0 },
      { fromDays: 91, toDays: 180, discount: 0.15 },
      { fromDays: 181, toDays: null, discount: 0.3 },
    ],
  },
];

async function main() {
  const passwordHash = await hash(SEED_PASSWORD);

  // Entities
  for (const e of ENTITIES) {
    await prisma.entity.upsert({ where: { id: e.id }, update: { code: e.code, name: e.name, type: e.type }, create: e });
  }

  // Partners: agents, clients, printers, external publisher
  for (const a of AGENTS) {
    const data = { name: a.name, roles: [PartnerRole.AGENT], defaultDiscount: a.defaultDiscount, creditLimit: a.creditLimit, currency: Currency.UZS, paymentTermDays: 30 };
    await prisma.partner.upsert({ where: { id: a.id }, update: data, create: { id: a.id, ...data } });
  }
  for (let i = 0; i < CLIENT_NAMES.length; i++) {
    const id = `partner-client-${i + 1}`;
    const data = { name: CLIENT_NAMES[i], roles: [PartnerRole.CLIENT], currency: Currency.UZS, paymentTermDays: [15, 30, 45][i % 3], creditLimit: 20_000_000 };
    await prisma.partner.upsert({ where: { id }, update: data, create: { id, ...data } });
  }
  for (const p of PRINTERS) {
    const data = { name: p.name, roles: [PartnerRole.PRINTER], currency: p.currency, paymentTermDays: 30 };
    await prisma.partner.upsert({ where: { id: p.id }, update: data, create: { id: p.id, ...data } });
  }
  await prisma.partner.upsert({
    where: { id: "partner-kamolot" },
    update: { name: "Kamolot nashri", roles: [PartnerRole.EXT_PUBLISHER], currency: Currency.UZS },
    create: { id: "partner-kamolot", name: "Kamolot nashri", roles: [PartnerRole.EXT_PUBLISHER], currency: Currency.UZS },
  });

  // Warehouses
  for (const w of WAREHOUSES) {
    await prisma.warehouse.upsert({ where: { id: w.id }, update: w, create: w });
  }

  // Permissions
  for (const [code, module] of PERMISSIONS) {
    await prisma.permission.upsert({ where: { id: permId(code) }, update: { code, module }, create: { id: permId(code), code, module } });
  }

  // Roles + role_permissions
  for (const r of ROLES) {
    const roleId = `role-${r.code}`;
    await prisma.role.upsert({ where: { id: roleId }, update: { code: r.code, name: r.name, isSystem: true }, create: { id: roleId, code: r.code, name: r.name, isSystem: true } });
    for (const code of r.perms) {
      const permissionId = permId(code);
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }

  // Users + entityAccess + user_roles
  for (const u of USERS) {
    const roleId = `role-${u.role}`;
    const connectEntities = u.entities.map((id) => ({ id }));
    await prisma.user.upsert({
      where: { id: u.id },
      update: { email: u.email, fullName: u.fullName, passwordHash, isActive: true, entityAccess: { set: connectEntities } },
      create: { id: u.id, email: u.email, fullName: u.fullName, passwordHash, isActive: true, entityAccess: { connect: connectEntities } },
    });
    await prisma.userRole.upsert({ where: { userId_roleId: { userId: u.id, roleId } }, update: {}, create: { userId: u.id, roleId } });
  }

  // Channels
  for (const c of CHANNELS) {
    await prisma.salesChannel.upsert({ where: { id: c.id }, update: c, create: c });
  }

  // Discount rules
  for (const d of DISCOUNT_RULES) {
    await prisma.discountRule.upsert({ where: { id: d.id }, update: d, create: d });
  }

  // Settings
  for (const s of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as object },
      create: { key: s.key, value: s.value as object },
    });
  }

  // Summary
  const [entities, warehouses, agentWarehouses, roles, permissions, users, partners, channels, rules, settings] = await Promise.all([
    prisma.entity.count(),
    prisma.warehouse.count(),
    prisma.warehouse.count({ where: { type: WarehouseType.AGENT } }),
    prisma.role.count(),
    prisma.permission.count(),
    prisma.user.count(),
    prisma.partner.count(),
    prisma.salesChannel.count(),
    prisma.discountRule.count(),
    prisma.setting.count(),
  ]);
  console.log("Seed complete:");
  console.table({ entities, warehouses, agentWarehouses, roles, permissions, users, partners, channels, discountRules: rules, settings });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
