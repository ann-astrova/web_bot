import fetch from "node-fetch";
import type { Expense, UserProfile, Category } from "./types.ts";
import { API_URL } from "./config.ts";

// === LOGIN ===
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password: string): Promise<AuthTokens> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) throw new Error("Ошибка входа");

  const data = await res.json();
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

// === REGISTER ===
export async function register(
  email: string,
  password: string,
  name: string
): Promise<{ status: number; message?: string }> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  const data = await res.json().catch(() => ({}));
  return { status: res.status, message: data.message };
}

// === REFRESH TOKEN ===
async function refreshTokens(refresh: string): Promise<AuthTokens> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refresh }),
  });

  if (!res.ok) throw new Error("Refresh token истёк");

  const data = await res.json();
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

// === AUTH FETCH ===
async function authFetch(
  url: string,
  access: string,
  refresh: string,
  options: RequestInit = {}
): Promise<{ res: Response; accessToken: string; refreshToken: string }> {
  let res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${access}` },
  });

  if (res.status === 401) {
    if (!refresh) throw new Error("NO_TOKENS");

    const newTokens = await refreshTokens(refresh);
    access = newTokens.accessToken;
    refresh = newTokens.refreshToken;

    res = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${access}` },
    });
  }

  return { res, accessToken: access, refreshToken: refresh };
}

// === GET ME ===
export async function getMe(access: string, refresh: string) {
  const { res, accessToken, refreshToken } = await authFetch(
    `${API_URL}/users/me`,
    access,
    refresh
  );

  if (!res.ok) throw new Error("Не авторизован");

  return { me: await res.json(), accessToken, refreshToken };
}

// === GET EXPENSES (с порядковыми номерами) ===
export async function getExpenses(access: string, refresh: string) {
  const { res, accessToken, refreshToken } = await authFetch(
    `${API_URL}/expenses`,
    access,
    refresh
  );

  if (!res.ok) throw new Error("Не авторизован");

  const items = await res.json();

  // Добавляем indexNumber
  const expenses = items.map((e: any, i: number) => ({
    ...e,
    indexNumber: i + 1,
  }));

  return { expenses, accessToken, refreshToken };
}

// === ADD EXPENSE ===
export async function addExpense(
  access: string,
  refresh: string,
  expense: Expense
) {
  const { res, accessToken, refreshToken } = await authFetch(
    `${API_URL}/expenses`,
    access,
    refresh,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expense),
    }
  );

  if (!res.ok) throw new Error("Не авторизован или ошибка добавления");

  return { accessToken, refreshToken };
}

// === DELETE EXPENSE (по ID) ===
export async function deleteExpense(
  access: string,
  refresh: string,
  expenseId: number
) {
  const { res, accessToken, refreshToken } = await authFetch(
    `${API_URL}/expenses/${expenseId}`,
    access,
    refresh,
    {
      method: "DELETE",
    }
  );

  if (!res.ok) throw new Error("Ошибка удаления");

  return { accessToken, refreshToken };
}

// === UPDATE EXPENSE (по ID) ===
export async function updateExpense(
  access: string,
  refresh: string,
  expenseId: number,
  expense: Partial<Expense>
) {
  const { res, accessToken, refreshToken } = await authFetch(
    `${API_URL}/expenses/${expenseId}`,
    access,
    refresh,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expense),
    }
  );

  if (!res.ok) throw new Error("Ошибка обновления расхода");

  return { accessToken, refreshToken };
}

// === GET CATEGORIES ===
export async function getCategories(access: string, refresh: string) {
  const { res, accessToken, refreshToken } = await authFetch(
    `${API_URL}/categories`,
    access,
    refresh
  );

  if (!res.ok) throw new Error("Не авторизован");

  return { categories: await res.json(), accessToken, refreshToken };
}




