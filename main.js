import { Telegraf, Markup } from "telegraf";
import { config } from "dotenv";
import sqlite3 from "sqlite3"; // npm install sqlite3
import { open } from "sqlite";
import fetch from "node-fetch"; // npm install node-fetch

// Environment variables ni yuklash
config();

// Remove Pool, not needed for sqlite
const bot = new Telegraf(process.env.BOT_TOKEN);
const adminId = parseInt(process.env.ADMIN_ID); // parseInt qilish muhim

// 📂 PostgreSQL ulanish
let db;
(async () => {
  db = await open({
    filename: "./database.sqlite",
    driver: sqlite3.Database,
  });
  console.log("✅ SQLite database ga muvaffaqiyatli ulanildi");

  // Create tables if not exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_uz TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      parent_id INTEGER,
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name_uz TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      description_uz TEXT,
      description_ru TEXT,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS product_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      file_id TEXT NOT NULL,
      media_type TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      order_index INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);
})();

// 🔑 DB funksiyalar
async function addCategory(name_uz, name_ru, parent_id = null) {
  const result = await db.run(
    `INSERT INTO categories (name_uz, name_ru, parent_id) VALUES (?, ?, ?)`,
    [name_uz, name_ru, parent_id]
  );
  return await getCategoryById(result.lastID);
}

async function getCategories() {
  try {
    return await db.all("SELECT * FROM categories ORDER BY id DESC");
  } catch (error) {
    console.error("Kategoriyalarni olishda xato:", error);
    throw error;
  }
}

async function getRootCategories() {
  try {
    return await db.all(
      "SELECT * FROM categories WHERE parent_id IS NULL ORDER BY id DESC"
    );
  } catch (error) {
    console.error("Root kategoriyalarni olishda xato:", error);
    throw error;
  }
}

async function getSubCategories(parentId) {
  try {
    return await db.all(
      "SELECT * FROM categories WHERE parent_id = ? ORDER BY id DESC",
      [parentId]
    );
  } catch (error) {
    console.error("Sub-kategoriyalarni olishda xato:", error);
    throw error;
  }
}

async function getCategoryPath(categoryId) {
  try {
    const path = [];
    let currentId = categoryId;

    while (currentId) {
      const category = await getCategoryById(currentId);
      if (!category) break;
      path.unshift(category);
      currentId = category.parent_id;
    }

    return path;
  } catch (error) {
    console.error("Kategoriya yo'lini olishda xato:", error);
    throw error;
  }
}

async function getCategoryById(id) {
  try {
    return await db.get("SELECT * FROM categories WHERE id = ?", [id]);
  } catch (error) {
    console.error("Kategoriyani ID bo'yicha olishda xato:", error);
    throw error;
  }
}

async function addProduct(
  categoryId,
  nameUz,
  nameRu,
  descriptionUz,
  descriptionRu
) {
  try {
    const result = await db.run(
      "INSERT INTO products (category_id, name_uz, name_ru, description_uz, description_ru) VALUES (?, ?, ?, ?, ?)",
      [categoryId, nameUz, nameRu, descriptionUz, descriptionRu]
    );
    return await getProductById(result.lastID);
  } catch (error) {
    console.error("Mahsulot qo'shishda xato:", error);
    throw error;
  }
}

async function getProductsByCategory(categoryId) {
  try {
    return await db.all(
      "SELECT * FROM products WHERE category_id = ? ORDER BY id DESC",
      [categoryId]
    );
  } catch (error) {
    console.error("Mahsulotlarni olishda xato:", error);
    throw error;
  }
}

async function getProductById(id) {
  try {
    return await db.get("SELECT * FROM products WHERE id = ?", [id]);
  } catch (error) {
    console.error("Mahsulotni ID bo'yicha olishda xato:", error);
    throw error;
  }
}

async function updateCategory(id, newNameUz, newNameRu) {
  try {
    await db.run("UPDATE categories SET name_uz=?, name_ru=? WHERE id=?", [
      newNameUz,
      newNameRu,
      id,
    ]);
  } catch (error) {
    console.error("Kategoriyani yangilashda xato:", error);
    throw error;
  }
}

async function deleteCategory(id) {
  try {
    await db.run("DELETE FROM products WHERE category_id=?", [id]);
    await db.run("DELETE FROM categories WHERE id=?", [id]);
  } catch (error) {
    console.error("Kategoriyani o'chirishda xato:", error);
    throw error;
  }
}

async function updateProduct(id, nameUz, nameRu, descriptionUz, descriptionRu) {
  try {
    await db.run(
      "UPDATE products SET name_uz=?, name_ru=?, description_uz=?, description_ru=? WHERE id=?",
      [nameUz, nameRu, descriptionUz, descriptionRu, id]
    );
  } catch (error) {
    console.error("Mahsulotni yangilashda xato:", error);
    throw error;
  }
}

async function addProductMedia(
  productId,
  fileId,
  mediaType,
  fileSize = null,
  mimeType = null,
  orderIndex = 0
) {
  try {
    const result = await db.run(
      "INSERT INTO product_media (product_id, file_id, media_type, file_size, mime_type, order_index) VALUES (?, ?, ?, ?, ?, ?)",
      [productId, fileId, mediaType, fileSize, mimeType, orderIndex]
    );
    return await db.get("SELECT * FROM product_media WHERE id = ?", [
      result.lastID,
    ]);
  } catch (error) {
    console.error("Media qo'shishda xato:", error);
    throw error;
  }
}

async function deleteProduct(id) {
  try {
    await deleteProductMedia(id);
    await db.run("DELETE FROM products WHERE id=?", [id]);
  } catch (error) {
    console.error("Mahsulotni o'chirishda xato:", error);
    throw error;
  }
}

async function getProductMedia(productId) {
  try {
    return await db.all(
      "SELECT * FROM product_media WHERE product_id = ? ORDER BY order_index ASC, created_at ASC",
      [productId]
    );
  } catch (error) {
    console.error("Media olishda xato:", error);
    throw error;
  }
}

async function deleteProductMedia(productId) {
  try {
    await db.run("DELETE FROM product_media WHERE product_id = ?", [productId]);
  } catch (error) {
    console.error("Media o'chirishda xato:", error);
    throw error;
  }
}

// 🌐 Foydalanuvchi tilini saqlash
const userLang = {};
const session = {};
const userCurrentMenu = {};
const navigationStack = {};

function setCurrentMenu(chatId, menuType) {
  userCurrentMenu[chatId] = menuType;
}

function getCurrentMenu(chatId) {
  return userCurrentMenu[chatId] || "main";
}

function pushNavigation(chatId, type, data = {}) {
  if (!navigationStack[chatId]) navigationStack[chatId] = [];
  navigationStack[chatId].push({ type, data });
}

function popNavigation(chatId) {
  if (!navigationStack[chatId] || navigationStack[chatId].length === 0)
    return null;
  return navigationStack[chatId].pop();
}

function getPreviousNavigation(chatId) {
  if (!navigationStack[chatId] || navigationStack[chatId].length === 0)
    return null;
  return navigationStack[chatId][navigationStack[chatId].length - 1];
}

function clearNavigation(chatId) {
  navigationStack[chatId] = [];
}

function isAdmin(userId) {
  return parseInt(userId) === adminId;
}

function getText(lang, key) {
  const texts = {
    choose_language: {
      uz: "🌐 Tilni tanlang:",
      ru: "🌐 Выберите язык:",
    },
    language_selected: {
      uz: "✅ O'zbek tili tanlandi",
      ru: "✅ Русский язык выбран",
    },
    admin_panel: {
      uz: "👨‍💼 Admin paneli:",
      ru: "👨‍💼 Панель администратора:",
    },
    not_admin: {
      uz: "❌ Siz admin emassiz!",
      ru: "❌ Вы не администратор!",
    },
    enter_category_name_uz: {
      uz: "📁 Kategoriya nomini o'zbekcha kiriting:",
      ru: "📁 Введите название категории на узбекском:",
    },
    enter_category_name_ru: {
      uz: "📁 Kategoriya nomini ruscha kiriting:",
      ru: "📁 Введите название категории на русском:",
    },
    enter_subcategory_name_uz: {
      uz: "📁 Bo'lim nomini o'zbekcha kiriting:",
      ru: "📁 Введите название раздела на узбекском:",
    },
    enter_subcategory_name_ru: {
      uz: "📁 Bo'lim nomini ruscha kiriting:",
      ru: "📁 Введите название раздела на русском:",
    },
    enter_product_name_uz: {
      uz: "🏷 Mahsulot nomini o'zbekcha kiriting:",
      ru: "🏷 Введите название продукта на узбекском:",
    },
    enter_product_name_ru: {
      uz: "🏷 Mahsulot nomini ruscha kiriting:",
      ru: "🏷 Введите название продукта на русском:",
    },
    enter_product_description_uz: {
      uz: "📝 Mahsulot tavsifini o'zbekcha kiriting:",
      ru: "📝 Введите описание продукта на узбекском:",
    },
    enter_product_description_ru: {
      uz: "📝 Mahsulot tavsifini ruscha kiriting:",
      ru: "📝 Введите описание продукта на русском:",
    },
    send_multiple_media: {
      uz: "📷📹 Mahsulot rasmlari va videolarini yuboring (bir nechta bo'lishi mumkin).\nTugagach 'Tayyor' tugmasini bosing:",
      ru: "📷📹 Отправьте фото и видео продукта (можно несколько).\nПо завершении нажмите кнопку 'Готово':",
    },
    product_saved: {
      uz: "✅ Mahsulot saqlandi!",
      ru: "✅ Продукт сохранен!",
    },
    category_saved: {
      uz: "✅ Kategoriya saqlandi!",
      ru: "✅ Категория сохранена!",
    },
    no_categories: {
      uz: "🚫 Kategoriyalar topilmadi",
      ru: "🚫 Категории не найдены",
    },
    select_category: {
      uz: "📂 Kategoriyani tanlang:",
      ru: "📂 Выберите категорию:",
    },
    category_updated: {
      uz: "✅ Kategoriya yangilandi!",
      ru: "✅ Категория обновлена!",
    },
    category_deleted: {
      uz: "✅ Kategoriya o'chirildi!",
      ru: "✅ Категория удалена!",
    },
    select_product: {
      uz: "🛍 Mahsulotni tanlang:",
      ru: "🛍 Выберите продукт:",
    },
    no_products: {
      uz: "🚫 Bu kategoriyada mahsulotlar yo'q",
      ru: "🚫 В этой категории нет продуктов",
    },
    product_updated: {
      uz: "✅ Mahsulot yangilandi!",
      ru: "✅ Продукт обновлен!",
    },
    product_deleted: {
      uz: "✅ Mahsulot o'chirildi!",
      ru: "✅ Продукт удален!",
    },
    media_updated: {
      uz: "✅ Media yangilandi!",
      ru: "✅ Медиа обновлено!",
    },
    enter_new_name_uz: {
      uz: "✏️ Yangi nomni o'zbekcha kiriting:",
      ru: "✏️ Введите новое название на узбекском:",
    },
    enter_new_name_ru: {
      uz: "✏️ Yangi nomni ruscha kiriting:",
      ru: "✏️ Введите новое название на русском:",
    },
    enter_new_description_uz: {
      uz: "✏️ Yangi tavsifni o'zbekcha kiriting:",
      ru: "✏️ Введите новое описание на узбекском:",
    },
    enter_new_description_ru: {
      uz: "✏️ Yangi tavsifni ruscha kiriting:",
      ru: "✏️ Введите новое описание на русском:",
    },
    main_menu: {
      uz: "🏠 Asosiy menyu:",
      ru: "🏠 Главное меню:",
    },
    company_info: {
      uz: "🏢 IZOLUX KOMPANIYASI HAQIDA\n\n📍 Manzil:  Toshkent shaxar, Yashnobot tumani, Chigil 6\n📞 Telefon: 33-980-60-09\n                      88-963-70-70\n📞 Admin: @Muzropov_Dilmurod\n\n✨ Bizning kompaniya yuqori sifatli izolyatsiya materiallari bilan ta'minlaydi.",
      ru: "🏢 О КОМПАНИИ IZOLUX\n\n📍 Адрес: Город Ташкент, Яшнабадский район, Чигил, дом 6\n📞 Телефон:33-980-60-09\n                      88-963-70-70\n📞 Admin: @Muzropov_Dilmurod\n\n✨ Наша компания обеспечивает высококачественными изоляционными материалами.",
    },
    contact_info: {
      uz: "📞 ALOQA MA'LUMOTLARI\n\n👤 Admin: Dilmurod\n📱 Telefon: 33-980-60-09\n                      88-963-70-70\n📍 Manzil: Toshkent shaxar, Yashnobot tumani, Chigil 6\n🕒 Ish vaqti: 9:00 - 18:00\n\n💬 Telegram: @Muzropov_Dilmurod",
      ru: "📞 КОНТАКТНАЯ ИНФОРМАЦИЯ\n\n👤 Admin: Dilmurod\n📱 Telefon: 33-980-60-09\n                      88-963-70-70\n📍 Адрес: г. Ташкент\n🕒 Время работы: 9:00 - 18:00\n\n💬 Telegram: @Muzropov_Dilmurod",
    },
    add_category: {
      uz: "➕ Kategoriya qo'shish",
      ru: "➕ Добавить категорию",
    },
    add_product: {
      uz: "🛍 Mahsulot qo'shish",
      ru: "🛍 Добавить продукт",
    },
    edit_menu: {
      uz: "✏️ Tahrirlash",
      ru: "✏️ Редактировать",
    },
    delete_menu: {
      uz: "🗑 O'chirish",
      ru: "🗑 Удалить",
    },
    back: {
      uz: "🔙 Orqaga",
      ru: "🔙 Назад",
    },
    catalog: {
      uz: "🛒 Katalog",
      ru: "🛒 Каталог",
    },
    info: {
      uz: "ℹ️ Ma'lumot",
      ru: "ℹ️ О компании",
    },
    contact: {
      uz: "📞 Aloqa",
      ru: "📞 Контакты",
    },
    edit_category: {
      uz: "📂 Kategoriya tahrirlash",
      ru: "📂 Редактировать категорию",
    },
    edit_product: {
      uz: "📝 Mahsulot tahrirlash",
      ru: "📝 Редактировать продукт",
    },
    edit_media: {
      uz: "🖼📹 Media tahrirlash",
      ru: "🖼📹 Редактировать медиа",
    },
    delete_category: {
      uz: "🗑 Kategoriya o'chirish",
      ru: "🗑 Удалить категорию",
    },
    delete_product: {
      uz: "🗑 Mahsulot o'chirish",
      ru: "🗑 Удалить продукт",
    },
    what_edit: {
      uz: "✏️ Nimani tahrirlaysiz?",
      ru: "✏️ Что редактируем?",
    },
    what_delete: {
      uz: "🗑 Nimani o'chirasiz?",
      ru: "🗑 Что удаляем?",
    },
  };

  return texts[key] ? texts[key][lang] || texts[key]["uz"] : key;
}

function getMainMenu(lang) {
  return Markup.keyboard([
    [getText(lang, "catalog")],
    [getText(lang, "info"), getText(lang, "contact")],
  ]).resize();
}

function getAdminMenu(lang) {
  return Markup.keyboard([
    [getText(lang, "add_category")],
    [getText(lang, "add_product")],
    [getText(lang, "edit_menu"), getText(lang, "delete_menu")],
    [getText(lang, "back")],
  ]).resize();
}

function getEditMenu(lang) {
  return Markup.keyboard([
    [getText(lang, "edit_category")],
    [getText(lang, "edit_product")],
    [getText(lang, "edit_media")],
    [getText(lang, "back")],
  ]).resize();
}

function getDeleteMenu(lang) {
  return Markup.keyboard([
    [getText(lang, "delete_category")],
    [getText(lang, "delete_product")],
    [getText(lang, "back")],
  ]).resize();
}

// ================= BOT ISHGA TUSHIRISH =================
console.log("🚀 Bot ishga tushmoqda...");
console.log(`Admin ID: ${adminId} (${typeof adminId})`);

// ================= TIL TANLASH =================
bot.start((ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(
    getText(lang, "choose_language"),
    Markup.inlineKeyboard([
      [Markup.button.callback("🇺🇿 O'zbek tili", "lang_uz")],
      [Markup.button.callback("🇷🇺 Русский язык", "lang_ru")],
    ])
  );
});

bot.action("lang_uz", async (ctx) => {
  userLang[ctx.chat.id] = "uz";
  await ctx.answerCbQuery();
  await ctx.editMessageText(getText("uz", "language_selected"));

  setTimeout(() => {
    ctx.reply(getText("uz", "main_menu"), getMainMenu("uz"));
  }, 500);
});

bot.action("lang_ru", async (ctx) => {
  userLang[ctx.chat.id] = "ru";
  await ctx.answerCbQuery();
  await ctx.editMessageText(getText("ru", "language_selected"));

  setTimeout(() => {
    ctx.reply(getText("ru", "main_menu"), getMainMenu("ru"));
  }, 500);
});

// ================= ADMIN PANEL =================
bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    const lang = userLang[ctx.chat.id] || "uz";
    return ctx.reply(getText(lang, "not_admin"));
  }

  setCurrentMenu(ctx.chat.id, "admin");
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.reply(getText(lang, "admin_panel"), getAdminMenu(lang));
});

// ================= ASOSIY MENYU =================
bot.hears(
  [/Ma'lumot/i, /О компании/i, /ℹ️ Ma'lumot/i, /ℹ️ О компании/i],
  async (ctx) => {
    const lang = userLang[ctx.chat.id] || "uz";
    ctx.reply(getText(lang, "company_info"));
  }
);

bot.hears([/Aloqa/i, /Контакты/i, /📞 Aloqa/i, /📞 Контакты/i], async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(getText(lang, "contact_info"));
});

// ============= KATEGORIYA QO'SHISH =============
bot.hears(
  [
    /Kategoriya qo'shish/i,
    /Добавить категорию/i,
    /➕ Kategoriya qo'shish/i,
    /➕ Добавить категорию/i,
  ],
  async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    session[ctx.chat.id] = { step: "add_category_name_uz", data: {} };
    const lang = userLang[ctx.chat.id] || "uz";
    ctx.reply(
      getText(lang, "enter_category_name_uz"),
      Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, "back"), "admin_back")],
      ])
    );
  }
);

bot.hears([/Bo'lim qo'shish/i, /Добавить подкатегорию/i, /Bo'lim qo'shish/i, /Добавить подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    // SQLite uchun: db.all ishlatiladi
    const categories = await db.all(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY id DESC`);
    const lang = userLang[ctx.chat.id] || "uz";

    if (categories.length === 0) {
      return ctx.reply(getText(lang, 'no_categories'));
    }

    const categoryButtons = categories.map((c) => {
      const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(categoryName, `add_subcat_to_${c.id}`)];
    });

    categoryButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_category'),
      Markup.inlineKeyboard(categoryButtons)
    );
  } catch (error) {
    console.error("Bo'lim qo'shishda xato:", error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/add_subcat_to_(\d+)/, async (ctx) => {
  const parentId = ctx.match[1]; // Ota kategoriya ID si
  const lang = userLang[ctx.chat.id] || "uz";

  // Session ma'lumotlarini to'g'ri saqlash
  session[ctx.chat.id] = {
    step: "add_subcategory_name_uz",
    parentId: parseInt(parentId),
    data: {} // Keyinchalik name_uz, name_ru uchun
  };

  try {
    await ctx.answerCbQuery(); // Tugma bosilganini tasdiqlash
    await ctx.deleteMessage(); // Oldingi xabarni o'chirish

    // Foydalanuvchidan o'zbekcha nom so'rash
    await ctx.reply(
      getText(lang, 'enter_subcategory_name_uz'),
      Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ])
    );
  } catch (error) {
    console.error("add_subcat_to action xatosi:", error);
    await ctx.reply("Xatolik yuz berdi");
  }
});

// ============= MAHSULOT QO'SHISH =============
bot.hears([/Mahsulot qo'shish/i, /Добавить товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    // SQLite: parent_id IS NOT NULL → faqat bo'limlar (subkategoriyalar)
    const subCategories = await db.all(
      `SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC`
    );

    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'));
    }

    const buttons = subCategories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(`${name}`, `add_prod_to_${c.id}`)];
    });

    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    await ctx.reply(
      getText(lang, 'select_subcategory'),
      Markup.inlineKeyboard(buttons)
    );

  } catch (error) {
    console.error("Mahsulot qo'shishda xato:", error);
    await ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/add_prod_to_(\d+)/, async (ctx) => {
  const categoryId = parseInt(ctx.match[1]);
  const lang = userLang[ctx.chat.id] || "uz";

  try {
    // Bo'lim mavjudligini tekshirish
    const category = await db.get(`SELECT * FROM categories WHERE id = ?`, [categoryId]);
    if (!category) {
      await ctx.answerCbQuery("Bo'lim topilmadi");
      return;
    }

    // Session boshlash
    session[ctx.chat.id] = {
      step: "add_product_name_uz",
      categoryId,
      data: {} // name_uz, name_ru, description_uz, description_ru
    };

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    await ctx.reply(
      getText(lang, 'enter_product_name_uz'),
      Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ])
    );

  } catch (error) {
    console.error("add_prod_to action xatosi:", error);
    await ctx.reply("Xatolik yuz berdi");
  }
});

// ============= TAHRIRLASH =============
bot.hears([/^Tahrirlash$/i, /^Редактировать$/i, /Tahrirlash/i, /Редактировать/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  setCurrentMenu(ctx.chat.id, 'edit');
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.reply(getText(lang, 'select_edit_option'), getEditMenu(lang));
});

// === KATEGORIYA TAHRIRLASH ===
bot.hears([/Kategoriya tahrirlash/i, /Редактировать категорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const categories = await db.all(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY id DESC`);
    const lang = userLang[ctx.chat.id] || "uz";

    if (categories.length === 0) {
      return ctx.reply(getText(lang, 'no_categories'));
    }

    const buttons = categories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `edit_cat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    await ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error("Kategoriya tahrirlashda xato:", error);
    await ctx.reply("Xatolik yuz berdi");
  }
});

// === MAHSULOT TAHRIRLASH ===
bot.hears([/Mahsulot tahrirlash/i, /Редактировать товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC`);
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'));
    }

    const buttons = subCategories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `edit_prod_cat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    await ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error("Mahsulot tahrirlashda xato:", error);
    await ctx.reply("Xatolik yuz berdi");
  }
});

// === BO'LIM (SUBCATEGORY) TAHRIRLASH ===
bot.hears([/Bo'lim tahrirlash/i, /Редактировать подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC`);
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'));
    }

    const buttons = subCategories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `edit_subcat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    await ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error("Bo'lim tahrirlashda xato:", error);
    await ctx.reply("Xatolik yuz berdi");
  }
});

bot.hears(
  [
    /Media tahrirlash/i,
    /Редактировать медиа/i,
    /🖼📹 Media tahrirlash/i,
    /🖼📹 Редактировать медиа/i,
  ],
  async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    try {
      const categories = await getCategories();
      const lang = userLang[ctx.chat.id] || "uz";

      if (categories.length === 0) {
        return ctx.reply(getText(lang, "no_categories"));
      }

      const categoryButtons = categories.map((c) => {
        const categoryName =
          lang === "uz" ? c.name_uz || c.name_ru : c.name_ru || c.name_uz;
        return [Markup.button.callback(categoryName, `edit_media_cat_${c.id}`)];
      });

      categoryButtons.push([
        Markup.button.callback(getText(lang, "back"), "admin_back"),
      ]);

      ctx.reply(
        getText(lang, "select_category"),
        Markup.inlineKeyboard(categoryButtons)
      );
    } catch (error) {
      ctx.reply("❌ Xatolik yuz berdi");
    }
  }
);

bot.action(/edit_cat_(\d+)/, async (ctx) => {
  const catId = parseInt(ctx.match[1]);
  const lang = userLang[ctx.chat.id] || "uz";

  try {
    const cat = await db.get(`SELECT * FROM categories WHERE id = ?`, [catId]);
    if (!cat) return ctx.answerCbQuery("Topilmadi");

    session[ctx.chat.id] = {
      step: "edit_category_name_uz",
      categoryId: catId,
      data: { name_uz: cat.name_uz, name_ru: cat.name_ru }
    };

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    await ctx.reply(
      `${getText(lang, 'enter_new_name_uz')}\n\nHozirgi: ${cat.name_uz}`,
      Markup.inlineKeyboard([[Markup.button.callback(getText(lang, 'back'), "admin_back")]])
    );
  } catch (error) {
    console.error(error);
    await ctx.reply("Xatolik");
  }
});


// ============= O'CHIRISH =============
bot.hears(
  [/^O'chirish$/i, /^Удалить$/i, /🗑 O'chirish/i, /🗑 Удалить/i],
  async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    setCurrentMenu(ctx.chat.id, "delete");
    const lang = userLang[ctx.chat.id] || "uz";
    await ctx.reply(getText(lang, "what_delete"), getDeleteMenu(lang));
  }
);

bot.hears(
  [
    /Kategoriya o'chirish/i,
    /Удалить категорию/i,
    /🗑 Kategoriya o'chirish/i,
    /🗑 Удалить категорию/i,
  ],
  async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    try {
      const categories = await getCategories();
      const lang = userLang[ctx.chat.id] || "uz";

      if (categories.length === 0) {
        return ctx.reply(getText(lang, "no_categories"));
      }

      const categoryButtons = categories.map((c) => {
        const categoryName =
          lang === "uz" ? c.name_uz || c.name_ru : c.name_ru || c.name_uz;
        return [
          Markup.button.callback(`🗑 ${categoryName}`, `delete_cat_${c.id}`),
        ];
      });

      categoryButtons.push([
        Markup.button.callback(getText(lang, "back"), "admin_back"),
      ]);

      ctx.reply(
        getText(lang, "select_category"),
        Markup.inlineKeyboard(categoryButtons)
      );
    } catch (error) {
      ctx.reply("❌ Xatolik yuz berdi");
    }
  }
);

bot.hears(
  [
    /Mahsulot o'chirish/i,
    /Удалить продукт/i,
    /🗑 Mahsulot o'chirish/i,
    /🗑 Удалить продукт/i,
  ],
  async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    try {
      const categories = await getCategories();
      const lang = userLang[ctx.chat.id] || "uz";

      if (categories.length === 0) {
        return ctx.reply(getText(lang, "no_categories"));
      }

      const categoryButtons = categories.map((c) => {
        const categoryName =
          lang === "uz" ? c.name_uz || c.name_ru : c.name_ru || c.name_uz;
        return [
          Markup.button.callback(categoryName, `delete_prod_cat_${c.id}`),
        ];
      });

      categoryButtons.push([
        Markup.button.callback(getText(lang, "back"), "admin_back"),
      ]);

      ctx.reply(
        getText(lang, "select_category"),
        Markup.inlineKeyboard(categoryButtons)
      );
    } catch (error) {
      ctx.reply("❌ Xatolik yuz berdi");
    }
  }
);

// ============= ORQAGA =============
bot.hears([/^Orqaga$/i, /^Назад$/i, /🔙 Orqaga/i, /🔙 Назад/i], async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const currentMenu = getCurrentMenu(ctx.chat.id);

  delete session[ctx.chat.id];

  switch (currentMenu) {
    case "edit":
    case "delete":
      setCurrentMenu(ctx.chat.id, "admin");
      ctx.reply(getText(lang, "admin_panel"), getAdminMenu(lang));
      break;

    case "admin":
      setCurrentMenu(ctx.chat.id, "main");
      ctx.reply(getText(lang, "main_menu"), getMainMenu(lang));
      break;

    case "catalog":
      setCurrentMenu(ctx.chat.id, "main");
      ctx.reply(getText(lang, "main_menu"), getMainMenu(lang));
      break;

    default:
      setCurrentMenu(ctx.chat.id, "main");
      ctx.reply(getText(lang, "main_menu"), getMainMenu(lang));
  }
});

// ================= CALLBACK ACTIONS =================
bot.action(/edit_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  session[ctx.chat.id] = { step: "edit_category_name_uz", categoryId };
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(
    getText(lang, "enter_new_name_uz"),
    Markup.inlineKeyboard([
      [Markup.button.callback(getText(lang, "back"), "admin_back")],
    ])
  );
});

bot.action(/edit_prod_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  try {
    const products = await getProductsByCategory(categoryId);
    const lang = userLang[ctx.chat.id] || "uz";

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    if (products.length === 0) {
      return ctx.reply(getText(lang, "no_products"));
    }

    const productButtons = products.map((p, index) => {
      const productName =
        lang === "uz" ? p.name_uz || p.name_ru : p.name_ru || p.name_uz;
      return [
        Markup.button.callback(
          `${index + 1}. ${productName || "Nomsiz"}`,
          `edit_prod_${p.id}`
        ),
      ];
    });

    productButtons.push([
      Markup.button.callback(getText(lang, "back"), "admin_back"),
    ]);

    ctx.reply(
      getText(lang, "select_product"),
      Markup.inlineKeyboard(productButtons)
    );
  } catch (error) {
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.action(/edit_prod_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  session[ctx.chat.id] = { step: "edit_product_name_uz", productId, data: {} };
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(
    getText(lang, "enter_new_name_uz"),
    Markup.inlineKeyboard([
      [Markup.button.callback(getText(lang, "back"), "admin_back")],
    ])
  );
});

bot.action(/edit_media_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  try {
    const products = await getProductsByCategory(categoryId);
    const lang = userLang[ctx.chat.id] || "uz";

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    if (products.length === 0) {
      return ctx.reply(getText(lang, "no_products"));
    }

    const productButtons = products.map((p, index) => {
      const productName =
        lang === "uz" ? p.name_uz || p.name_ru : p.name_ru || p.name_uz;
      return [
        Markup.button.callback(
          `${index + 1}. ${productName || "Nomsiz"}`,
          `edit_media_${p.id}`
        ),
      ];
    });

    productButtons.push([
      Markup.button.callback(getText(lang, "back"), "admin_back"),
    ]);

    ctx.reply(
      getText(lang, "select_product"),
      Markup.inlineKeyboard(productButtons)
    );
  } catch (error) {
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.action(/edit_media_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];

  try {
    const existingMedia = await getProductMedia(productId);
    const lang = userLang[ctx.chat.id] || "uz";

    session[ctx.chat.id] = {
      step: "edit_product_media_multiple",
      productId,
      data: { mediaFiles: [] },
    };

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    let mediaInfo = "";
    if (existingMedia.length > 0) {
      const photoCount = existingMedia.filter(
        (m) => m.media_type === "photo"
      ).length;
      const videoCount = existingMedia.filter(
        (m) => m.media_type === "video"
      ).length;
      mediaInfo = `\n\n📊 Hozirgi media: ${existingMedia.length} ta (📸 ${photoCount}, 🎬 ${videoCount})`;
    }

    ctx.reply(
      `🖼📹 Yangi media yuklang. Barcha eski medialar almashtiriladi.${mediaInfo}\n\n➕ Rasm va videolarni yuboring, keyin 'Tayyor' tugmasini bosing.`,
      Markup.inlineKeyboard([
        [Markup.button.callback("✅ Tayyor, saqlash", "finish_media_edit")],
        [Markup.button.callback(getText(lang, "back"), "admin_back")],
      ])
    );
  } catch (error) {
    console.error("Media tahrirlash xatosi:", error);
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.action(/delete_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  try {
    await deleteCategory(categoryId);
    const lang = userLang[ctx.chat.id] || "uz";
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    ctx.reply(getText(lang, "category_deleted"));
  } catch (error) {
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.action(/delete_prod_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  try {
    const products = await getProductsByCategory(categoryId);
    const lang = userLang[ctx.chat.id] || "uz";

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    if (products.length === 0) {
      return ctx.reply(getText(lang, "no_products"));
    }

    const productButtons = products.map((p, index) => {
      const productName =
        lang === "uz" ? p.name_uz || p.name_ru : p.name_ru || p.name_uz;
      return [
        Markup.button.callback(
          `🗑 ${index + 1}. ${productName || "Nomsiz"}`,
          `delete_prod_${p.id}`
        ),
      ];
    });

    productButtons.push([
      Markup.button.callback(getText(lang, "back"), "admin_back"),
    ]);

    ctx.reply(
      getText(lang, "select_product"),
      Markup.inlineKeyboard(productButtons)
    );
  } catch (error) {
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.action(/delete_prod_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  try {
    await deleteProduct(productId);
    const lang = userLang[ctx.chat.id] || "uz";
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    ctx.reply(getText(lang, "product_deleted"));
  } catch (error) {
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.hears(
  [/Katalog/i, /Каталог/i, /🛒 Katalog/i, /🛒 Каталог/i],
  async (ctx) => {
    setCurrentMenu(ctx.chat.id, "catalog");
    try {
      const categories = await getRootCategories();
      const lang = userLang[ctx.chat.id] || "uz";

      if (categories.length === 0) {
        return ctx.reply(getText(lang, "no_categories"));
      }

      const categoryButtons = categories.map((c) => {
        const categoryName =
          lang === "uz" ? c.name_uz || c.name_ru : c.name_ru || c.name_uz;
        return [Markup.button.callback(categoryName, `view_cat_${c.id}`)];
      });

      // O'ZGARTIRISH: Root katalogda orqaga tugmasini qo'shdik (asosiymenuga qaytish uchun)
      categoryButtons.push([
        Markup.button.callback(getText(lang, "back"), "back_to_menu"),
      ]);

      session[ctx.chat.id] = { categoryPath: [] };

      ctx.reply(
        getText(lang, "select_category"),
        Markup.inlineKeyboard(categoryButtons)
      );
    } catch (error) {
      console.error("Katalog xatosi:", error);
      ctx.reply("❌ Xatolik yuz berdi");
    }
  }
);

bot.action(/view_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  try {
    const category = await getCategoryById(categoryId);
    const subCategories = await getSubCategories(categoryId);
    const products = await getProductsByCategory(categoryId);
    const lang = userLang[ctx.chat.id] || "uz";

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    if (!session[ctx.chat.id]) session[ctx.chat.id] = {};
    if (!session[ctx.chat.id].categoryPath)
      session[ctx.chat.id].categoryPath = [];

    const path = session[ctx.chat.id].categoryPath;
    if (!path.some((cat) => cat.id === categoryId)) {
      path.push(category);
    }

    const buttons = [];

    if (subCategories.length > 0) {
      subCategories.forEach((c) => {
        const categoryName =
          lang === "uz" ? c.name_uz || c.name_ru : c.name_ru || c.name_uz;
        buttons.push([
          Markup.button.callback(`📁 ${categoryName}`, `view_cat_${c.id}`),
        ]);
      });
    }

    if (products.length > 0) {
      products.forEach((p, index) => {
        const productName =
          lang === "uz" ? p.name_uz || p.name_ru : p.name_ru || p.name_uz;
        buttons.push([
          Markup.button.callback(
            `${index + 1}. ${productName || "Nomsiz"}`,
            `view_product_${p.id}`
          ),
        ]);
      });
    }

    if (path.length > 1) {
      const parentCategory = path[path.length - 2];
      buttons.push([
        Markup.button.callback(
          getText(lang, "back"),
          `back_to_cat_${parentCategory.id}`
        ),
      ]);
    } else {
      // O'ZGARTIRISH: Root bo'lsa, orqaga tugmasini asosiy menyuga bog'ladik
      buttons.push([
        Markup.button.callback(getText(lang, "back"), "back_to_menu"),
      ]);
    }

    const currentCategoryName =
      lang === "uz"
        ? category.name_uz || category.name_ru
        : category.name_ru || category.name_uz;

    if (subCategories.length > 0 || products.length > 0) {
      ctx.reply(`📂 ${currentCategoryName}`, Markup.inlineKeyboard(buttons));
    } else {
      ctx.reply(getText(lang, "no_products"), Markup.inlineKeyboard(buttons));
    }
  } catch (error) {
    console.error("Katalog ko'rishda xato:", error);
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

// ================= MATN HANDLER =================
bot.on("text", async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state) return;

  const lang = userLang[ctx.chat.id] || "uz";
  let inputText = ctx.message.text;

  try {
    // Kategoriya qo'shish jarayoni
    if (state.step === "add_category_name_uz") {
      state.data.nameUz = inputText;
      state.step = "add_category_name_ru";
      return ctx.reply(
        getText(lang, "enter_category_name_ru"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_category_name_uz"
            ),
          ],
        ])
      );
    }

    if (state.step === "add_category_name_ru") {
      state.data.nameRu = inputText;
      state.step = "add_subcategory_name_uz";
      return ctx.reply(
        getText(lang, "enter_subcategory_name_uz"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_category_name_ru"
            ),
          ],
        ])
      );
    }

    if (state.step === "add_subcategory_name_uz") {
      state.data.subNameUz = inputText;
      state.step = "add_subcategory_name_ru";
      return ctx.reply(
        getText(lang, "enter_subcategory_name_ru"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_subcategory_name_uz"
            ),
          ],
        ])
      );
    }

    if (state.step === "add_subcategory_name_ru") {
      // O'ZGARTIRISH: state.data.subNameRu = inputText; qo'shdik (ruscha nomni saqlash uchun)
      state.data.subNameRu = inputText;

      const category = await addCategory(state.data.nameUz, state.data.nameRu);
      // O'ZGARTIRISH: addCategory da state.data.subNameUz va state.data.subNameRu ishlatdik (ctx.message.text o'rniga)
      const subcategory = await addCategory(
        state.data.subNameUz,
        state.data.subNameRu,
        category.id
      );
      state.categoryId = subcategory.id;
      state.step = "add_product_name_uz";
      state.data = {};
      return ctx.reply(
        getText(lang, "enter_product_name_uz"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_subcategory_name_ru"
            ),
          ],
        ])
      );
    }

    // Mahsulot qo'shish - nom
    if (state.step === "add_product_name_uz") {
      state.data.nameUz = inputText;
      state.step = "add_product_name_ru";
      return ctx.reply(
        getText(lang, "enter_product_name_ru"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_product_name_uz"
            ),
          ],
        ])
      );
    }

    if (state.step === "add_product_name_ru") {
      state.data.nameRu = inputText;
      state.step = "add_product_description_uz";
      return ctx.reply(
        getText(lang, "enter_product_description_uz"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_product_name_ru"
            ),
          ],
        ])
      );
    }

    if (state.step === "add_product_description_uz") {
      state.data.descriptionUz = inputText;
      state.step = "add_product_description_ru";
      return ctx.reply(
        getText(lang, "enter_product_description_ru"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_product_description_uz"
            ),
          ],
        ])
      );
    }

    if (state.step === "add_product_description_ru") {
      state.data.descriptionRu = inputText;
      state.step = "add_product_media_multiple";
      state.data.mediaFiles = [];
      return ctx.reply(
        getText(lang, "send_multiple_media"),
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Medialar tayyor", "finish_media_upload")],
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_product_description_ru"
            ),
          ],
        ])
      );
    }
    // Kategoriya tahrirlash
    // Kategoriya tahrirlash
    if (state.step === "edit_category_name_uz") {
      if (!state.data) state.data = {}; // <-- shuni qo'shish kerak
      state.data.nameUz = inputText;
      state.step = "edit_category_name_ru";
      return ctx.reply(
        getText(lang, "enter_new_name_ru"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_edit_category_name_uz"
            ),
          ],
        ])
      );
    }

    if (state.step === "edit_category_name_ru") {
      if (!state.data) state.data = {}; // <-- bu yerda ham
      await updateCategory(state.categoryId, state.data.nameUz, inputText);
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, "category_updated"));
    }

    // Mahsulot tahrirlash - nom
    if (state.step === "edit_product_name_uz") {
      state.data.nameUz = inputText;
      state.step = "edit_product_name_ru";
      return ctx.reply(
        getText(lang, "enter_new_name_ru"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_edit_product_name_uz"
            ),
          ],
        ])
      );
    }

    if (state.step === "edit_product_name_ru") {
      state.data.nameRu = inputText;
      state.step = "edit_product_description_uz";
      return ctx.reply(
        getText(lang, "enter_new_description_uz"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_edit_product_name_ru"
            ),
          ],
        ])
      );
    }

    if (state.step === "edit_product_description_uz") {
      state.data.descriptionUz = inputText;
      state.step = "edit_product_description_ru";
      return ctx.reply(
        getText(lang, "enter_new_description_ru"),
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_edit_product_description_uz"
            ),
          ],
        ])
      );
    }

    if (state.step === "edit_product_description_ru") {
      await updateProduct(
        state.productId,
        state.data.nameUz,
        state.data.nameRu,
        state.data.descriptionUz,
        inputText
      );
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, "product_updated"));
    }
  } catch (error) {
    console.error("Matn handler xatosi:", error);
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

// ================= MEDIA HANDLER =================
bot.on("photo", async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state) return;

  const lang = userLang[ctx.chat.id] || "uz";

  try {
    if (state.step === "add_product_media_multiple") {
      const photo = ctx.message.photo.pop();

      if (!state.data.mediaFiles) state.data.mediaFiles = [];

      state.data.mediaFiles.push({
        fileId: photo.file_id,
        mediaType: "photo",
        fileSize: photo.file_size,
        mimeType: "image/jpeg",
      });

      const mediaCount = state.data.mediaFiles.length;
      const photoCount = state.data.mediaFiles.filter(
        (m) => m.mediaType === "photo"
      ).length;
      const videoCount = state.data.mediaFiles.filter(
        (m) => m.mediaType === "video"
      ).length;

      return ctx.reply(
        `📷 Rasm qo'shildi! (${mediaCount} ta media)\n📸 Rasmlar: ${photoCount}\n🎬 Videolar: ${videoCount}\n\n➕ Yana media qo'shing yoki tugmani bosing.`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Tayyor, saqlash", "finish_media_upload")],
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_product_description_ru"
            ),
          ],
        ])
      );
    }

    if (state.step === "edit_product_media_multiple") {
      const photo = ctx.message.photo.pop();

      if (!state.data.mediaFiles) state.data.mediaFiles = [];

      state.data.mediaFiles.push({
        fileId: photo.file_id,
        mediaType: "photo",
        fileSize: photo.file_size,
        mimeType: "image/jpeg",
      });

      const mediaCount = state.data.mediaFiles.length;

      return ctx.reply(
        `📷 Yangi rasm qo'shildi! (${mediaCount} ta yangi media)\n\n➕ Yana media qo'shing yoki tugmani bosing.`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Tayyor, saqlash", "finish_media_edit")],
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_edit_product_media"
            ),
          ],
        ])
      );
    }
  } catch (error) {
    console.error("Rasm handler xatosi:", error);
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.on("video", async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state) return;

  const lang = userLang[ctx.chat.id] || "uz";

  try {
    if (state.step === "add_product_media_multiple") {
      const video = ctx.message.video;

      if (!state.data.mediaFiles) state.data.mediaFiles = [];

      state.data.mediaFiles.push({
        fileId: video.file_id,
        mediaType: "video",
        fileSize: video.file_size,
        mimeType: video.mime_type || "video/mp4",
      });

      const mediaCount = state.data.mediaFiles.length;
      const photoCount = state.data.mediaFiles.filter(
        (m) => m.mediaType === "photo"
      ).length;
      const videoCount = state.data.mediaFiles.filter(
        (m) => m.mediaType === "video"
      ).length;

      return ctx.reply(
        `🎬 Video qo'shildi! (${mediaCount} ta media)\n📸 Rasmlar: ${photoCount}\n🎬 Videolar: ${videoCount}\n\n➕ Yana media qo'shing yoki tugmani bosing.`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Tayyor, saqlash", "finish_media_upload")],
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_add_product_description_ru"
            ),
          ],
        ])
      );
    }

    if (state.step === "edit_product_media_multiple") {
      const video = ctx.message.video;

      if (!state.data.mediaFiles) state.data.mediaFiles = [];

      state.data.mediaFiles.push({
        fileId: video.file_id,
        mediaType: "video",
        fileSize: video.file_size,
        mimeType: video.mime_type || "video/mp4",
      });

      const mediaCount = state.data.mediaFiles.length;

      return ctx.reply(
        `🎬 Yangi video qo'shildi! (${mediaCount} ta yangi media)\n\n➕ Yana media qo'shing yoki tugmani bosing.`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Tayyor, saqlash", "finish_media_edit")],
          [
            Markup.button.callback(
              getText(lang, "back"),
              "admin_back_edit_product_media"
            ),
          ],
        ])
      );
    }
  } catch (error) {
    console.error("Video handler xatosi:", error);
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

// ================= CALLBACK ACTIONS =================
bot.action("finish_media_upload", async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state || state.step !== "add_product_media_multiple") return;

  const lang = userLang[ctx.chat.id] || "uz";

  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    if (!state.data.mediaFiles || state.data.mediaFiles.length === 0) {
      return ctx.reply(
        "❌ Hech qanday media yuklanmadi. Iltimos biror rasm yoki video yuboring."
      );
    }

    const { nameUz, nameRu, descriptionUz, descriptionRu, mediaFiles } =
      state.data;

    const product = await addProduct(
      state.categoryId,
      nameUz,
      nameRu,
      descriptionUz,
      descriptionRu
    );

    for (let i = 0; i < mediaFiles.length; i++) {
      const media = mediaFiles[i];
      await addProductMedia(
        product.id,
        media.fileId,
        media.mediaType,
        media.fileSize,
        media.mimeType,
        i
      );
    }

    delete session[ctx.chat.id];

    const photoCount = mediaFiles.filter((m) => m.mediaType === "photo").length;
    const videoCount = mediaFiles.filter((m) => m.mediaType === "video").length;

    return ctx.reply(
      `✅ Mahsulot saqlandi!\n📸 Rasmlar: ${photoCount}\n🎬 Videolar: ${videoCount}`
    );
  } catch (error) {
    console.error("Media saqlashda xato:", error);
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.action("finish_media_edit", async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state || state.step !== "edit_product_media_multiple") return;

  const lang = userLang[ctx.chat.id] || "uz";

  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    if (!state.data.mediaFiles || state.data.mediaFiles.length === 0) {
      return ctx.reply("❌ Hech qanday yangi media yuklanmadi.");
    }

    const { mediaFiles } = state.data;

    await deleteProductMedia(state.productId);

    for (let i = 0; i < mediaFiles.length; i++) {
      const media = mediaFiles[i];
      await addProductMedia(
        state.productId,
        media.fileId,
        media.mediaType,
        media.fileSize,
        media.mimeType,
        i
      );
    }

    delete session[ctx.chat.id];

    const photoCount = mediaFiles.filter((m) => m.mediaType === "photo").length;
    const videoCount = mediaFiles.filter((m) => m.mediaType === "video").length;

    return ctx.reply(
      `✅ Media yangilandi!\n📸 Rasmlar: ${photoCount}\n🎬 Videolar: ${videoCount}`
    );
  } catch (error) {
    console.error("Media yangilashda xato:", error);
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.action("admin_back", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  delete session[ctx.chat.id];
  setCurrentMenu(ctx.chat.id, "admin");
  ctx.reply(getText(lang, "admin_panel"), getAdminMenu(lang));
});

bot.action("admin_back_add_category_name_uz", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  setCurrentMenu(ctx.chat.id, "admin");
  ctx.reply(getText(lang, "admin_panel"), getAdminMenu(lang));
});

bot.action("admin_back_add_category_name_ru", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "add_category_name_uz";
  ctx.reply(
    getText(lang, "enter_category_name_uz"),
    Markup.inlineKeyboard([
      [Markup.button.callback(getText(lang, "back"), "admin_back")],
    ])
  );
});

bot.action("admin_back_add_subcategory_name_uz", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "add_category_name_ru";
  ctx.reply(
    getText(lang, "enter_category_name_ru"),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          getText(lang, "back"),
          "admin_back_add_category_name_uz"
        ),
      ],
    ])
  );
});

bot.action("admin_back_add_subcategory_name_ru", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "add_subcategory_name_uz";
  ctx.reply(
    getText(lang, "enter_subcategory_name_uz"),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          getText(lang, "back"),
          "admin_back_add_category_name_ru"
        ),
      ],
    ])
  );
});

bot.action("admin_back_add_product_name_uz", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  setCurrentMenu(ctx.chat.id, "admin");
  ctx.reply(getText(lang, "admin_panel"), getAdminMenu(lang));
});

bot.action("admin_back_add_product_name_ru", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "add_product_name_uz";
  ctx.reply(
    getText(lang, "enter_product_name_uz"),
    Markup.inlineKeyboard([
      [Markup.button.callback(getText(lang, "back"), "admin_back")],
    ])
  );
});

bot.action("admin_back_add_product_description_uz", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "add_product_name_ru";
  ctx.reply(
    getText(lang, "enter_product_name_ru"),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          getText(lang, "back"),
          "admin_back_add_product_name_uz"
        ),
      ],
    ])
  );
});

bot.action("admin_back_add_product_description_ru", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "add_product_description_uz";
  ctx.reply(
    getText(lang, "enter_product_description_uz"),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          getText(lang, "back"),
          "admin_back_add_product_name_ru"
        ),
      ],
    ])
  );
});

bot.action("admin_back_edit_category_name_uz", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  setCurrentMenu(ctx.chat.id, "edit");
  ctx.reply(getText(lang, "what_edit"), getEditMenu(lang));
});

bot.action("admin_back_edit_category_name_ru", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "edit_category_name_uz";
  ctx.reply(
    getText(lang, "enter_new_name_uz"),
    Markup.inlineKeyboard([
      [Markup.button.callback(getText(lang, "back"), "admin_back")],
    ])
  );
});

bot.action("admin_back_edit_product_name_uz", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  setCurrentMenu(ctx.chat.id, "edit");
  ctx.reply(getText(lang, "what_edit"), getEditMenu(lang));
});

bot.action("admin_back_edit_product_name_ru", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "edit_product_name_uz";
  ctx.reply(
    getText(lang, "enter_new_name_uz"),
    Markup.inlineKeyboard([
      [Markup.button.callback(getText(lang, "back"), "admin_back")],
    ])
  );
});

bot.action("admin_back_edit_product_description_uz", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "edit_product_name_ru";
  ctx.reply(
    getText(lang, "enter_new_name_ru"),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          getText(lang, "back"),
          "admin_back_edit_product_name_uz"
        ),
      ],
    ])
  );
});

bot.action("admin_back_edit_product_description_ru", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const state = session[ctx.chat.id];
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  state.step = "edit_product_description_uz";
  ctx.reply(
    getText(lang, "enter_new_description_uz"),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          getText(lang, "back"),
          "admin_back_edit_product_name_ru"
        ),
      ],
    ])
  );
});

bot.action("admin_back_edit_product_media", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  setCurrentMenu(ctx.chat.id, "edit");
  ctx.reply(getText(lang, "what_edit"), getEditMenu(lang));
});

bot.action(/back_to_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  try {
    const category = await getCategoryById(categoryId);
    const subCategories = await getSubCategories(categoryId);
    const products = await getProductsByCategory(categoryId);
    const lang = userLang[ctx.chat.id] || "uz";

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    // Path ni yangilash
    if (!session[ctx.chat.id]) session[ctx.chat.id] = {};
    if (!session[ctx.chat.id].categoryPath)
      session[ctx.chat.id].categoryPath = [];

    // Pathdan joriy kategoriyagacha bo'lgan barcha elementlarni olib tashlash
    const path = session[ctx.chat.id].categoryPath;
    const categoryIndex = path.findIndex((cat) => cat.id == categoryId);
    if (categoryIndex !== -1) {
      session[ctx.chat.id].categoryPath = path.slice(0, categoryIndex + 1);
    }

    const buttons = [];

    // Sub-kategoriyalar
    if (subCategories.length > 0) {
      subCategories.forEach((c) => {
        const categoryName =
          lang === "uz" ? c.name_uz || c.name_ru : c.name_ru || c.name_uz;
        buttons.push([
          Markup.button.callback(`📁 ${categoryName}`, `view_cat_${c.id}`),
        ]);
      });
    }

    // Mahsulotlar
    if (products.length > 0) {
      products.forEach((p, index) => {
        const productName =
          lang === "uz" ? p.name_uz || p.name_ru : p.name_ru || p.name_uz;
        buttons.push([
          Markup.button.callback(
            `${index + 1}. ${productName || "Nomsiz"}`,
            `view_product_${p.id}`
          ),
        ]);
      });
    }

    // Orqaga tugmasi
    const currentPath = session[ctx.chat.id].categoryPath;
    if (currentPath.length > 1) {
      const parentCategory = currentPath[currentPath.length - 2];
      buttons.push([
        Markup.button.callback(
          getText(lang, "back"),
          `back_to_cat_${parentCategory.id}`
        ),
      ]);
    } else {
      // O'ZGARTIRISH: back_to_menu o'rniga back_to_main ishlatildi
      buttons.push([
        Markup.button.callback(getText(lang, "back"), "back_to_main"),
      ]);
    }

    const currentCategoryName =
      lang === "uz"
        ? category.name_uz || category.name_ru
        : category.name_ru || category.name_uz;

    if (subCategories.length > 0 || products.length > 0) {
      ctx.reply(`📂 ${currentCategoryName}`, Markup.inlineKeyboard(buttons));
    } else {
      ctx.reply(getText(lang, "no_products"), Markup.inlineKeyboard(buttons));
    }
  } catch (error) {
    console.error("Orqaga qaytishda xato:", error);
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

bot.action("back_to_main", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";

  if (session[ctx.chat.id]) {
    delete session[ctx.chat.id].categoryPath;
  }

  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  const categories = await getRootCategories();

  if (categories.length === 0) {
    return ctx.reply(getText(lang, "no_categories"));
  }

  const categoryButtons = categories.map((c) => {
    const categoryName =
      lang === "uz" ? c.name_uz || c.name_ru : c.name_ru || c.name_uz;
    return [Markup.button.callback(categoryName, `view_cat_${c.id}`)];
  });

  categoryButtons.push([
    Markup.button.callback(getText(lang, "back"), "back_to_menu"),
  ]);

  ctx.reply(
    getText(lang, "select_category"),
    Markup.inlineKeyboard(categoryButtons)
  );
});

// O'ZGARTIRISH: Yangi action qo'shdik - katalogdan asosiy menyuga qaytish uchun
bot.action("back_to_menu", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  delete session[ctx.chat.id];
  setCurrentMenu(ctx.chat.id, "main");
  ctx.reply(getText(lang, "main_menu"), getMainMenu(lang));
});

bot.action(/view_product_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  try {
    const product = await getProductById(productId);
    const lang = userLang[ctx.chat.id] || "uz";

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    const productName =
      lang === "uz"
        ? product.name_uz || product.name_ru
        : product.name_ru || product.name_uz;
    const productDescription =
      lang === "uz"
        ? product.description_uz || product.description_ru
        : product.description_ru || product.description_uz;

    const caption = `🏷 ${productName}\n\n📝 ${productDescription}`;

    const mediaList = await getProductMedia(productId);

    const path = session[ctx.chat.id]?.categoryPath || [];
    const buttons = [];
    if (path.length > 0) {
      const parentCategory = path[path.length - 1];
      buttons.push([
        Markup.button.callback(
          getText(lang, "back"),
          `back_to_cat_${parentCategory.id}`
        ),
      ]);
    } else {
      buttons.push([
        Markup.button.callback(getText(lang, "back"), "back_to_menu"),
      ]); // O'ZGARTIRISH: Orqaga asosiy menyuga
    }

    if (mediaList.length === 0) {
      await ctx.reply(caption, Markup.inlineKeyboard(buttons));
      return;
    }

    if (mediaList.length === 1) {
      const media = mediaList[0];
      if (media.media_type === "video") {
        await ctx.replyWithVideo(media.file_id, {
          caption,
          reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
        });
      } else if (media.media_type === "photo") {
        await ctx.replyWithPhoto(media.file_id, {
          caption,
          reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
        });
      }
    } else {
      const mediaGroup = mediaList.map((media, index) => ({
        type: media.media_type,
        media: media.file_id,
        caption: index === 0 ? caption : undefined,
      }));

      await ctx.replyWithMediaGroup(mediaGroup);
      await ctx.reply(
        getText(lang, "select_category"),
        Markup.inlineKeyboard(buttons)
      );
    }
  } catch (error) {
    console.error(`Mahsulot ${productId} ko'rishda xato:`, error);
    ctx.reply("❌ Xatolik yuz berdi");
  }
});

// ================= XATO HANDLER =================
bot.catch((err, ctx) => {
  console.error("Bot xatosi:", err);
  const lang = userLang[ctx.chat?.id] || "uz";
  if (ctx && ctx.reply) {
    ctx.reply("❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.");
  }
});

// ================== BOT ISHGA TUSHIRISH ==================
bot
  .launch()
  .then(() => {
    console.log("✅ Bot muvaffaqiyatli ishga tushdi!");
    console.log(`📱 Bot username: @${bot.botInfo?.username || "unknown"}`);
  })
  .catch((error) => {
    console.error("❌ Bot ishga tushurishda xato:", error);
    process.exit(1);
  });

process.once("SIGINT", () => {
  console.log("🛑 Bot to'xtatilmoqda (SIGINT)...");
  bot.stop("SIGINT");
  pool.end();
  process.exit(0);
});

process.once("SIGTERM", () => {
  console.log("🛑 Bot to'xtatilmoqda (SIGTERM)...");
  bot.stop("SIGTERM");
  pool.end();
  process.exit(0);
});

console.log("🎯 Bot tayyor! /start buyrug'ini yuboring.");
