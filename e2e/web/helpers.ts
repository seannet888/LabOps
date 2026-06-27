import { expect, type Page } from "@playwright/test";

type UserRole = "sales" | "logistics" | "manager";

const credentials: Record<UserRole, { username: string; loginCode: string }> = {
  sales: { username: "sales01", loginCode: "sales-dev-password" },
  logistics: { username: "log01", loginCode: "logistics-dev-password" },
  manager: { username: "admin", loginCode: "admin-dev-password" }
};

export async function loginAs(page: Page, role: UserRole): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(credentials[role].username);
  await page.getByLabel("密码").fill(credentials[role].loginCode);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
}

export async function apiLogin(page: Page, role: UserRole): Promise<string> {
  const response = await page.request.post("/api/v1/auth/login", {
    data: {
      username: credentials[role].username,
      password: credentials[role].loginCode
    }
  });
  expect(response.ok()).toBe(true);
  const body = await response.json() as { data: { access_token: string } };
  return body.data.access_token;
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "退出" }).click();
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
}

export function firstTableRow(page: Page) {
  return page.locator("tbody tr").first();
}
