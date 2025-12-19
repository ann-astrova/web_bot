import { Bot, InlineKeyboard } from "grammy";
import { BOT_TOKEN } from "./config.ts";
import type { Expense, Category } from "./types.ts";
import type { AuthTokens } from "./api.ts";
import {
  login as apiLogin,
  register as apiRegister,
  getMe as apiGetMe,
  getExpenses as apiGetExpenses,
  addExpense as apiAddExpense,
  deleteExpense as apiDeleteExpense,
  getCategories as apiGetCategories,
  // добавим обновление
  updateExpense as apiUpdateExpense,
} from "./api.ts";

// ==========================
// BOT INIT
// ==========================
const bot = new Bot(BOT_TOKEN);

// ==========================
// KEYBOARDS
// ==========================
const authKeyboard = new InlineKeyboard()
  .text("🔐 Войти", "login")
  .row()
  .text("📝 Регистрация", "register");

const mainKeyboard = new InlineKeyboard()
  .text("📋 Мои расходы", "expenses")
  .row()
  .text("➕ Добавить расход", "add")
  .row()
  .text("✏️ Обновить расход", "update")
  .row()
  .text("🗑️ Удалить расход", "delete")
  .row()
  .text("👤 Профиль", "profile");

// ==========================
// TEMP STORAGE
// ==========================
interface TempExpense {
  id?: number;
  amount?: number;
  description?: string;
  categoryId?: string;
  date?: string;
  updateField?: keyof Expense;
}

interface UserSession {
  tokens?: AuthTokens;
  tempStep?: 
    | "login"
    | "register"
    | "addAmount"
    | "addDescription"
    | "updateSelect"
    | "updateField"
    | "updateValue"
    | "updateCategory"
    | "deleteSelect";
  tempExpense?: TempExpense;
  categories?: Category[];
}

const sessions: Record<number, UserSession> = {};

// ==========================
// HELPER: проверка токенов
// ==========================
function ensureTokens(s: UserSession) {
  if (!s.tokens?.accessToken || !s.tokens?.refreshToken) throw new Error("NO_TOKENS");
  return s.tokens;
}

// ==========================
// START COMMAND
// ==========================
bot.command("start", async (ctx) => {
  const userId = ctx.from!.id;
  sessions[userId] ??= {};
  const s = sessions[userId];

  if (!s.tokens) {
    await ctx.reply("👋 Привет! Я бот для учёта расходов", { reply_markup: authKeyboard });
  } else {
    await ctx.reply("Вы снова в боте!", { reply_markup: mainKeyboard });
  }
});

// ==========================
// CALLBACK HANDLERS
// ==========================
bot.callbackQuery("login", async (ctx) => {
  const userId = ctx.from!.id;
  sessions[userId] ??= {};
  sessions[userId].tempStep = "login";
  await ctx.reply("Введите email и пароль через пробел:");
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("register", async (ctx) => {
  const userId = ctx.from!.id;
  sessions[userId] ??= {};
  sessions[userId].tempStep = "register";
  await ctx.reply("Введите: email пароль имя");
  await ctx.answerCallbackQuery();
});

bot.callbackQuery("profile", async (ctx) => {
  const userId = ctx.from!.id;
  const s = sessions[userId];
  if (!s.tokens) return ctx.reply("⚠️ Сначала войдите", { reply_markup: authKeyboard });

  try {
    const tokens = ensureTokens(s);
    const { me, accessToken, refreshToken } = await apiGetMe(tokens.accessToken, tokens.refreshToken);
    s.tokens = { accessToken, refreshToken };
    await ctx.reply(`👤 Профиль\n\nИмя: ${me.name}\nEmail: ${me.email}`, { reply_markup: mainKeyboard });
  } catch (err: any) {
    console.error("[API ERROR] getMe", err);
    s.tokens = undefined;
    await ctx.reply("⚠️ Ошибка загрузки профиля или истёк токен. Войдите снова.", { reply_markup: authKeyboard });
  }

  await ctx.answerCallbackQuery();
});

// ==========================
// VIEW EXPENSES
// ==========================
bot.callbackQuery("expenses", async (ctx) => {
  const userId = ctx.from!.id;
  const s = sessions[userId];
  if (!s.tokens) return ctx.reply("⚠️ Сначала войдите", { reply_markup: authKeyboard });

  try {
    const tokens = ensureTokens(s);

    const { expenses, accessToken, refreshToken } = await apiGetExpenses(tokens.accessToken, tokens.refreshToken);
    s.tokens = { accessToken, refreshToken };

    if (!expenses.length) return ctx.reply("Расходов пока нет.", { reply_markup: mainKeyboard });

    const { categories } = await apiGetCategories(accessToken, refreshToken);
    const catMap = new Map<string, string>();
    categories.forEach(c => catMap.set(c.id, c.name));

    await ctx.reply(
      expenses.map((e: any) =>
        `${e.indexNumber}. Сумма: ${e.amount} ₽\nОписание: ${e.description}\nДата: ${e.date}\nКатегория: ${catMap.get(e.categoryId) ?? "—"}`
      ).join("\n\n"),
      { reply_markup: mainKeyboard }
    );
  } catch (err: any) {
    console.error("[API ERROR] getExpenses", err);
    s.tokens = undefined;
    await ctx.reply("⚠️ Ошибка получения расходов или истёк токен. Войдите снова.", { reply_markup: authKeyboard });
  }

  await ctx.answerCallbackQuery();
});

// ==========================
// ADD EXPENSE
// ==========================
bot.callbackQuery("add", async (ctx) => {
  const userId = ctx.from!.id;
  const s = sessions[userId];
  if (!s.tokens) return ctx.reply("⚠️ Сначала войдите", { reply_markup: authKeyboard });

  s.tempStep = "addAmount";
  s.tempExpense = {};
  await ctx.reply("Введите сумму расхода:");
  await ctx.answerCallbackQuery();
});

// ==========================
// UPDATE EXPENSE
// ==========================
bot.callbackQuery("update", async (ctx) => {
  const userId = ctx.from!.id;
  const s = sessions[userId];
  if (!s.tokens) return ctx.reply("⚠️ Сначала войдите", { reply_markup: authKeyboard });

  s.tempStep = "updateSelect";
  await ctx.reply("Введите номер расхода для обновления:");
  await ctx.answerCallbackQuery();
});

// ==========================
// DELETE EXPENSE
// ==========================
bot.callbackQuery("delete", async (ctx) => {
  const userId = ctx.from!.id;
  const s = sessions[userId];
  if (!s.tokens) return ctx.reply("⚠️ Сначала войдите", { reply_markup: authKeyboard });

  s.tempStep = "deleteSelect";
  await ctx.reply("Введите номер расхода для удаления:");
  await ctx.answerCallbackQuery();
});

// ==========================
// TEXT HANDLER
// ==========================
bot.on("message:text", async (ctx) => {
  const userId = ctx.from!.id;
  const s = sessions[userId];
  if (!s) return;
  const text = ctx.message.text.trim();

  // --------------------------
  // LOGIN
  // --------------------------
  if (s.tempStep === "login") {
    const [email, password] = text.split(" ");
    if (!email || !password) return ctx.reply("Введите email и пароль через пробел");

    try {
      s.tokens = await apiLogin(email, password);
      await ctx.reply("✅ Вы вошли", { reply_markup: mainKeyboard });
    } catch (err) {
      console.error("[API ERROR] login", err);
      await ctx.reply("❌ Ошибка входа: неверный email или пароль");
    }
    s.tempStep = undefined;
    return;
  }

  // --------------------------
  // REGISTER
  // --------------------------
  if (s.tempStep === "register") {
    const [email, password, name] = text.split(" ");
    if (!email || !password || !name) return ctx.reply("Введите: email пароль имя");

    try {
      const res = await apiRegister(email, password, name);
      if (res.status === 201 || res.status === 200) {
        await ctx.reply("✅ Регистрация успешна. Теперь войдите.", { reply_markup: authKeyboard });
      } else if (res.status === 409) {
        await ctx.reply("❌ Пользователь с таким email уже существует");
      } else if (res.status === 404) {
        await ctx.reply("❌ Некорректные данные (email или пароль)");
      } else {
        await ctx.reply(`❌ Ошибка регистрации: ${res.message || res.status}`);
      }
    } catch (err) {
      console.error("[API ERROR] register", err);
      await ctx.reply("⚠️ Не удалось зарегистрироваться. Попробуйте позже.");
    }
    s.tempStep = undefined;
    return;
  }

  // --------------------------
  // ADD EXPENSE FLOW
  // --------------------------
  if (s.tempStep === "addAmount" && s.tempExpense) {
    const amount = Number(text.replace(",", "."));
    if (isNaN(amount)) return ctx.reply("Введите корректное число");
    s.tempExpense.amount = amount;
    s.tempStep = "addDescription";
    return ctx.reply("Введите описание расхода:");
  }

  if (s.tempStep === "addDescription" && s.tempExpense) {
    s.tempExpense.description = text;
    s.tempStep = undefined;

    const d = new Date();
    s.tempExpense.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    try {
      const tokens = ensureTokens(s);
      if (!s.categories) {
        const { categories, accessToken, refreshToken } = await apiGetCategories(tokens.accessToken, tokens.refreshToken);
        s.categories = categories;
        s.tokens = { accessToken, refreshToken };
      }

      const kb = new InlineKeyboard();
      s.categories.forEach(c => kb.text(c.name, `addCat:${c.id}`).row());
      await ctx.reply("Выберите категорию:", { reply_markup: kb });
    } catch (err) {
      console.error("[API ERROR] getCategories", err);
      s.tokens = undefined;
      await ctx.reply("⚠️ Не удалось загрузить категории. Войдите снова.", { reply_markup: authKeyboard });
    }
  }

  // --------------------------
  // DELETE EXPENSE FLOW
  // --------------------------
  if (s.tempStep === "deleteSelect") {
    const index = Number(text);
    if (isNaN(index)) return ctx.reply("Введите корректный номер");

    try {
      const tokens = ensureTokens(s);
      const { expenses, accessToken, refreshToken } = await apiGetExpenses(tokens.accessToken, tokens.refreshToken);
      s.tokens = { accessToken, refreshToken };

      const expense = expenses.find((e: any) => e.indexNumber === index);
      if (!expense) return ctx.reply("Расход с таким номером не найден");

      const { accessToken: a, refreshToken: r } = await apiDeleteExpense(tokens.accessToken, tokens.refreshToken, expense.id!);
      s.tokens = { accessToken: a, refreshToken: r };
      await ctx.reply("✅ Расход удалён", { reply_markup: mainKeyboard });
    } catch (err) {
      console.error("[API ERROR] deleteExpense", err);
      s.tokens = undefined;
      await ctx.reply("⚠️ Ошибка удаления. Войдите снова.", { reply_markup: authKeyboard });
    }

    s.tempStep = undefined;
    return;
  }

  // --------------------------
  // UPDATE EXPENSE FLOW
  // --------------------------
  if (s.tempStep === "updateSelect") {
    const index = Number(text);
    if (isNaN(index)) return ctx.reply("Введите корректный номер");

    try {
      const tokens = ensureTokens(s);
      const { expenses, accessToken, refreshToken } = await apiGetExpenses(tokens.accessToken, tokens.refreshToken);
      s.tokens = { accessToken, refreshToken };

      const expense = expenses.find((e: any) => e.indexNumber === index);
      if (!expense) return ctx.reply("Расход с таким номером не найден");

      s.tempExpense = { ...expense };
      s.tempStep = "updateField";
      await ctx.reply("Введите поле для обновления (amount, description, date, category):");
    } catch (err) {
      console.error("[API ERROR] getExpenses", err);
      s.tokens = undefined;
      await ctx.reply("⚠️ Ошибка получения расходов. Войдите снова.", { reply_markup: authKeyboard });
    }
    return;
  }

  if (s.tempStep === "updateField" && s.tempExpense) {
    const field = text.toLowerCase();
    if (!["amount", "description", "date", "category"].includes(field))
      return ctx.reply("Некорректное поле. Введите: amount, description, date, category");

    if (field === "category") {
      try {
        const tokens = ensureTokens(s);
        if (!s.categories) {
          const { categories, accessToken, refreshToken } = await apiGetCategories(tokens.accessToken, tokens.refreshToken);
          s.categories = categories;
          s.tokens = { accessToken, refreshToken };
        }

        const kb = new InlineKeyboard();
        s.categories.forEach(c => kb.text(c.name, `updateCat:${c.id}`).row());
        s.tempStep = "updateCategory";
        await ctx.reply("Выберите новую категорию:", { reply_markup: kb });
      } catch (err) {
        console.error("[API ERROR] getCategories", err);
        s.tokens = undefined;
        await ctx.reply("⚠️ Не удалось загрузить категории. Войдите снова.", { reply_markup: authKeyboard });
      }
      return;
    }

    s.tempStep = "updateValue";
    s.tempExpense.updateField = field as keyof Expense;
    await ctx.reply(`Введите новое значение для ${field}:`);
    return;
  }

  if (s.tempStep === "updateValue" && s.tempExpense) {
    const field = s.tempExpense.updateField!;
    let value: any = text;
    if (field === "amount") value = Number(text.replace(",", "."));
    s.tempExpense[field] = value;

    try {
      const tokens = ensureTokens(s);
      await apiUpdateExpense(tokens.accessToken, tokens.refreshToken, s.tempExpense.id!, s.tempExpense);
      await ctx.reply("✅ Расход обновлён", { reply_markup: mainKeyboard });
    } catch (err) {
      console.error("[API ERROR] updateExpense", err);
      s.tokens = undefined;
      await ctx.reply("⚠️ Ошибка обновления. Войдите снова.", { reply_markup: authKeyboard });
    }

    s.tempStep = undefined;
    s.tempExpense = undefined;
  }
});

// ==========================
// CALLBACKS CATEGORY (ADD/UPDATE)
// ==========================
bot.callbackQuery(/^addCat:.+$/, async (ctx) => {
  const userId = ctx.from!.id;
  const s = sessions[userId];
  if (!s?.tokens || !s.tempExpense || !s.categories) {
    await ctx.answerCallbackQuery({ text: "❌ Состояние сброшено", show_alert: true });
    return;
  }

  s.tempExpense.categoryId = ctx.callbackQuery.data!.split(":")[1];

  try {
    const tokens = ensureTokens(s);
    const { accessToken, refreshToken } = await apiAddExpense(tokens.accessToken, tokens.refreshToken, s.tempExpense as Expense);
    s.tokens = { accessToken, refreshToken };
    await ctx.reply("✅ Расход добавлен", { reply_markup: mainKeyboard });
  } catch (err) {
    console.error("[API ERROR] addExpense", err);
    s.tokens = undefined;
    await ctx.reply("⚠️ Ошибка добавления. Войдите снова.", { reply_markup: authKeyboard });
  }

  s.tempExpense = undefined;
  s.categories = undefined;
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^updateCat:.+$/, async (ctx) => {
  const userId = ctx.from!.id;
  const s = sessions[userId];
  if (!s?.tokens || !s.tempExpense) {
    await ctx.answerCallbackQuery({ text: "❌ Состояние сброшено", show_alert: true });
    return;
  }

  s.tempExpense.categoryId = ctx.callbackQuery.data!.split(":")[1];

  try {
    const tokens = ensureTokens(s);
    await apiUpdateExpense(tokens.accessToken, tokens.refreshToken, s.tempExpense.id!, s.tempExpense);
    await ctx.reply("✅ Категория обновлена", { reply_markup: mainKeyboard });
  } catch (err) {
    console.error("[API ERROR] updateExpense", err);
    s.tokens = undefined;
    await ctx.reply("⚠️ Ошибка обновления категории. Войдите снова.", { reply_markup: authKeyboard });
  }

  s.tempStep = undefined;
  s.tempExpense = undefined;
  s.categories = undefined;
  await ctx.answerCallbackQuery();
});

// ==========================
// GLOBAL ERROR HANDLER
// ==========================
bot.catch((err) => console.error("⚠️ Bot error:", err));

// ==========================
// START BOT
// ==========================
bot.start();
console.log("🤖 Бот запущен");




