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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const prisma = new PrismaClient();

async function main() {
  await prisma.species.upsert({
    where: { name: "小鼠" },
    update: { grade: "SPF", sortOrder: 1 },
    create: { name: "小鼠", grade: "SPF", sortOrder: 1 }
  });

  await prisma.user.upsert({
    where: { username: requiredEnv("BOOTSTRAP_ADMIN_USERNAME") },
    update: {
      displayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME ?? "系统管理员",
      role: "manager",
      isActive: true
    },
    create: {
      username: requiredEnv("BOOTSTRAP_ADMIN_USERNAME"),
      passwordHash: await hashPassword(requiredEnv("BOOTSTRAP_ADMIN_PASSWORD")),
      displayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME ?? "系统管理员",
      role: "manager",
      isActive: true
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
