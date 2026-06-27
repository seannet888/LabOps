import { readFileSync, existsSync } from "node:fs";

function loadLocalEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^"|"$/g, "");
    process.env[key] ??= value;
  }
}

loadLocalEnv();
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${Buffer.from(derivedKey).toString("hex")}`;
}
const prisma = new PrismaClient();

const catalogSeed = [
  {
    species: { name: "小鼠", grade: "SPF", sortOrder: 1 },
    strains: ["C57BL/6", "BALB/c", "ICR", "KM"]
  },
  {
    species: { name: "大鼠", grade: "SPF", sortOrder: 2 },
    strains: ["SD", "Wistar"]
  },
  {
    species: { name: "豚鼠", grade: "SPF", sortOrder: 3 },
    strains: ["Hartley"]
  },
  {
    species: { name: "兔子", grade: "SPF", sortOrder: 4 },
    strains: ["New Zealand White"]
  }
];

async function seedCatalog(adminId) {
  const strainsByName = new Map();

  for (const entry of catalogSeed) {
    const species = await prisma.species.upsert({
      where: { name: entry.species.name },
      update: { grade: entry.species.grade, sortOrder: entry.species.sortOrder },
      create: entry.species
    });

    for (const strainName of entry.strains) {
      const strain = await prisma.strain.upsert({
        where: { speciesId_name: { speciesId: species.id, name: strainName } },
        update: { isActive: true },
        create: { speciesId: species.id, name: strainName, isActive: true }
      });
      strainsByName.set(strainName, strain);

      await prisma.priceListEntry.upsert({
        where: {
          strainId_ageWeeks_effectiveFrom: {
            strainId: strain.id,
            ageWeeks: 4,
            effectiveFrom: new Date("2026-01-01T00:00:00.000Z")
          }
        },
        update: { unitPrice: "28.00", createdById: adminId },
        create: {
          strainId: strain.id,
          ageWeeks: 4,
          unitPrice: "28.00",
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          createdById: adminId
        }
      });
    }
  }

  return strainsByName;
}

async function main() {
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "admin-dev-password";
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: { displayName: "系统管理员", role: "manager", isActive: true },
    create: {
      username: "admin",
      passwordHash: await hashPassword(adminPassword),
      displayName: "系统管理员",
      role: "manager",
      isActive: true
    }
  });

  const sales = await prisma.user.upsert({
    where: { username: "sales01" },
    update: { displayName: "销售一号", role: "sales", isActive: true },
    create: {
      username: "sales01",
      passwordHash: await hashPassword("sales-dev-password"),
      displayName: "销售一号",
      role: "sales",
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { username: "log01" },
    update: { displayName: "后勤一号", role: "logistics", isActive: true },
    create: {
      username: "log01",
      passwordHash: await hashPassword("logistics-dev-password"),
      displayName: "后勤一号",
      role: "logistics",
      isActive: true
    }
  });

  const strainsByName = await seedCatalog(admin.id);
  const strain = strainsByName.get("C57BL/6");
  if (!strain) {
    throw new Error("C57BL/6 seed strain was not created");
  }

  const customer = await prisma.customer.create({
    data: {
      primarySalesRepId: sales.id,
      geoArea: "北京",
      name: "北京大学实验动物中心",
      unitName: "北京大学",
      researchGroup: "神经科学组",
      settlementType: "monthly",
      creditDays: 30,
      defaultDelivery: "135",
      defaultInvoiceType: "normal",
      notes: "北京 mock 客户"
    }
  });

  await prisma.customerAddress.create({
    data: { customerId: customer.id, addressType: "delivery", detail: "北京市海淀区学院路 mock 楼 101", isDefault: true }
  });

  await prisma.inventoryBatch.create({
    data: {
      strainId: strain.id,
      birthDate: new Date("2026-05-28T00:00:00.000Z"),
      gender: "M",
      initialQty: 100,
      reservedQty: 0,
      entryDate: new Date("2026-06-25T00:00:00.000Z"),
      enteredById: admin.id,
      notes: "北京 mock 批次"
    }
  });

  const order = await prisma.order.create({
    data: {
      orderNumber: `DEV${Date.now()}`,
      customerId: customer.id,
      salesRepId: sales.id,
      status: "pending",
      deliveryMethod: "135",
      deliveryDate: new Date("2026-06-30T00:00:00.000Z"),
      requiresInvoice: true,
      invoiceType: "normal",
      totalAmount: "280.00",
      notes: "北京 mock 订单",
      items: {
        create: [{ strainId: strain.id, ageWeeks: 4, gender: "M", quantity: 10, unitPrice: "28.00", actualPrice: "28.00" }]
      }
    }
  });

  console.log(JSON.stringify({ admin: "admin", sales: "sales01", logistics: "log01", customerId: customer.id, strainId: strain.id, orderId: order.id }, null, 2));
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
