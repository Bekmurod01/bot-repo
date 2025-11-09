import { Telegraf, Markup } from "telegraf";
import { config } from "dotenv";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import fetch from "node-fetch";

config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const adminId = parseInt(process.env.ADMIN_ID);

// SQLite ulanish
let db;
(async () => {
  db = await open({
    filename: "./database.sqlite",
    driver: sqlite3.Database,
  });
  console.log("SQLite database ga muvaffaqiyatli ulanildi");

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

// ===================== DATABASE FUNCTIONS =====================
async function addCategory(name_uz, name_ru, parent_id = null) {
  const result = await db.run(
    `INSERT INTO categories (name_uz, name_ru, parent_id) VALUES (?, ?, ?)`,
    [name_uz, name_ru, parent_id]
  );
  return { id: result.lastID, name_uz, name_ru, parent_id };
}

async function getCategories() {
  return await db.all(`SELECT * FROM categories ORDER BY id DESC`);
}

async function getRootCategories() {
  return await db.all(`SELECT * FROM categories WHERE parent_id IS NULL ORDER BY id DESC`);
}

async function getSubCategories(parentId) {
  return await db.all(`SELECT * FROM categories WHERE parent_id = ? ORDER BY id DESC`, [parentId]);
}

async function getCategoryById(id) {
  return await db.get(`SELECT * FROM categories WHERE id = ?`, [id]);
}

async function updateCategory(id, newNameUz, newNameRu) {
  await db.run(`UPDATE categories SET name_uz=?, name_ru=? WHERE id=?`, [
    newNameUz,
    newNameRu,
    id,
  ]);
}

async function deleteCategory(id) {
  const subCategories = await getSubCategories(id);
  for (const subCat of subCategories) {
    await deleteCategory(subCat.id);
  }
  await db.run(`DELETE FROM products WHERE category_id=?`, [id]);
  await db.run(`DELETE FROM categories WHERE id=?`, [id]);
}

async function addProduct(categoryId, nameUz, nameRu, descriptionUz, descriptionRu) {
  const result = await db.run(
    `INSERT INTO products (category_id, name_uz, name_ru, description_uz, description_ru) VALUES (?, ?, ?, ?, ?)`,
    [categoryId, nameUz, nameRu, descriptionUz, descriptionRu]
  );
  return { id: result.lastID, categoryId, nameUz, nameRu, descriptionUz, descriptionRu };
}

async function getProductsByCategory(categoryId) {
  return await db.all(`SELECT * FROM products WHERE category_id=? ORDER BY id DESC`, [categoryId]);
}

async function getProductById(id) {
  return await db.get(`SELECT * FROM products WHERE id=?`, [id]);
}

async function updateProduct(id, nameUz, nameRu, descriptionUz, descriptionRu) {
  await db.run(
    `UPDATE products SET name_uz=?, name_ru=?, description_uz=?, description_ru=? WHERE id=?`,
    [nameUz, nameRu, descriptionUz, descriptionRu, id]
  );
}

async function deleteProduct(id) {
  await deleteProductMedia(id);
  await db.run(`DELETE FROM products WHERE id=?`, [id]);
}

async function addProductMedia(productId, fileId, mediaType, fileSize = null, mimeType = null, orderIndex = 0) {
  const result = await db.run(
    `INSERT INTO product_media (product_id, file_id, media_type, file_size, mime_type, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
    [productId, fileId, mediaType, fileSize, mimeType, orderIndex]
  );
  return { id: result.lastID, productId, fileId, mediaType, fileSize, mimeType, orderIndex };
}

async function getProductMedia(productId) {
  return await db.all(
    `SELECT * FROM product_media WHERE product_id=? ORDER BY order_index ASC, created_at ASC`,
    [productId]
  );
}

async function deleteProductMedia(productId) {
  await db.run(`DELETE FROM product_media WHERE product_id=?`, [productId]);
}

// ===================== GLOBAL VARIABLES =====================
const userLang = {};
const session = {};
const userCurrentMenu = {};

function setCurrentMenu(chatId, menuType) {
  userCurrentMenu[chatId] = menuType;
}

function getCurrentMenu(chatId) {
  return userCurrentMenu[chatId] || 'main';
}

function isAdmin(userId) {
  return parseInt(userId) === adminId;
}

// ===================== TEXT FUNCTIONS =====================
function getText(lang, key) {
  const texts = {
    choose_language: { uz: "Tilni tanlang:", ru: "Выберите язык:" },
    language_selected: { uz: "O'zbek tili tanlandi", ru: "Русский язык выбран" },
    admin_panel: { uz: "Admin paneli:", ru: "Панель администратора:" },
    not_admin: { uz: "Siz admin emassiz!", ru: "Вы не администратор!" },
    main_menu: { uz: "Asosiy menyu:", ru: "Главное меню:" },
    company_info: {
      uz: "IZOLUX KOMPANIYASI HAQIDA\n\nManzil: Toshkent shahar\nTelefon: +998 88 980 60 09\nAdmin: @Muzropov_Dilmurod\n\nBizning kompaniya yuqori sifatli izolyatsiya materiallari bilan ta'minlaydi.",
      ru: "О КОМПАНИИ IZOLUX\n\nАдрес: г. Ташкент\nТелефон: +998 88 980 60 09\nAdmin: @Muzropov_Dilmurod\n\nНаша компания обеспечивает высококачественными изоляционными материалами."
    },
    contact_info: {
      uz: "ALOQA MA'LUMOTLARI\n\nAdmin: Dilmurod\nTelefon: +998 88 980 60 09\nManzil: Toshkent shahar\nIsh vaqti: 9:00 - 18:00\n\nTelegram: @Muzropov_Dilmurod",
      ru: "КОНТАКТНАЯ ИНФОРМАЦИЯ\n\nAdmin: Dilmurod\nTelefon: +998 88 980 60 09\nАдрес: г. Ташкент\nВремя работы: 9:00 - 18:00\n\nTelegram: @Muzropov_Dilmurod"
    },
    add_category: { uz: "Kategoriya qo'shish", ru: "Добавить категорию" },
    add_subcategory: { uz: "Bo'lim qo'shish", ru: "Добавить подкатегорию" },
    add_product: { uz: "Mahsulot qo'shish", ru: "Добавить товар" },
    edit_menu: { uz: "Tahrirlash", ru: "Редактировать" },
    delete_menu: { uz: "O'chirish", ru: "Удалить" },
    back: { uz: "Orqaga", ru: "Назад" },
    edit_category: { uz: "Kategoriya tahrirlash", ru: "Редактировать категорию" },
    edit_subcategory: { uz: "Bo'lim tahrirlash", ru: "Редактировать подкатегорию" },
    edit_product: { uz: "Mahsulot tahrirlash", ru: "Редактировать товар" },
    edit_product_details: { uz: "Ma'lumot tahrirlash", ru: "Редактировать информацию" },
    edit_product_media: { uz: "Rasm tahrirlash", ru: "Редактировать фото" },
    delete_category: { uz: "Kategoriya o'chirish", ru: "Удалить категорию" },
    delete_subcategory: { uz: "Bo'lim o'chirish", ru: "Удалить подкатегорию" },
    delete_product: { uz: "Mahsulot o'chirish", ru: "Удалить товар" },
    edit_product_name: { uz: "Nom tahrirlash", ru: "Редактировать название" },
    edit_product_description: { uz: "Tavsif tahrirlash", ru: "Редактировать описание" },
    enter_category_name_uz: { uz: "Kategoriya nomini o'zbekcha kiriting:", ru: "Введите название категории на узбекском:" },
    enter_category_name_ru: { uz: "Kategoriya nomini ruscha kiriting:", ru: "Введите название категории на русском:" },
    enter_subcategory_name_uz: { uz: "Bo'lim nomini o'zbekcha kiriting:", ru: "Введите название подкатегории на узбекском:" },
    enter_subcategory_name_ru: { uz: "Bo'lim nomini ruscha kiriting:", ru: "Введите название подкатегории на русском:" },
    enter_product_name_uz: { uz: "Mahsulot nomini o'zbekcha kiriting:", ru: "Введите название товара на узбекском:" },
    enter_product_name_ru: { uz: "Mahsulot nomini ruscha kiriting:", ru: "Введите название товара на русском:" },
    enter_product_description_uz: { uz: "Mahsulot tavsifini o'zbekcha kiriting:", ru: "Введите описание товара на узбекском:" },
    enter_product_description_ru: { uz: "Mahsulot tavsifini ruscha kiriting:", ru: "Введите описание товара на русском:" },
    enter_new_name_uz: { uz: "Yangi nomni o'zbekcha kiriting:", ru: "Введите новое название на узбекском:" },
    enter_new_name_ru: { uz: "Yangi nomni ruscha kiriting:", ru: "Введите новое название на русском:" },
    enter_new_description_uz: { uz: "Yangi tavsifni o'zbekcha kiriting:", ru: "Введите новое описание на узбекском:" },
    enter_new_description_ru: { uz: "Yangi tavsifni ruscha kiriting:", ru: "Введите новое описание на русском:" },
    send_multiple_media: { uz: "Mahsulot rasmlari va videolarini yuboring.\nTugagach 'Tayyor' tugmasini bosing:", ru: "Отправьте фото и видео товара.\nПо завершении нажмите 'Готово':" },
    category_saved: { uz: "Kategoriya saqlandi!", ru: "Категория сохранена!" },
    subcategory_saved: { uz: "Bo'lim saqlandi!", ru: "Подкатегория сохранена!" },
    product_saved: { uz: "Mahsulot saqlandi!", ru: "Товар сохранен!" },
    category_updated: { uz: "Kategoriya yangilandi!", ru: "Категория обновлена!" },
    subcategory_updated: { uz: "Bo'lim yangilandi!", ru: "Подкатегория обновлена!" },
    product_updated: { uz: "Mahsulot yangilandi!", ru: "Товар обновлен!" },
    media_updated: { uz: "Rasm yangilandi!", ru: "Фото обновлено!" },
    category_deleted: { uz: "Kategoriya o'chirildi!", ru: "Категория удалена!" },
    subcategory_deleted: { uz: "Bo'lim o'chirildi!", ru: "Подкатегория удалена!" },
    product_deleted: { uz: "Mahsulot o'chirildi!", ru: "Товар удален!" },
    select_category: { uz: "Kategoriyani tanlang:", ru: "Выберите категорию:" },
    select_subcategory: { uz: "Bo'limni tanlang:", ru: "Выберите подкатегорию:" },
    select_product: { uz: "Mahsulotni tanlang:", ru: "Выберите товар:" },
    select_edit_option: { uz: "Nimani tahrirlaysiz?", ru: "Что будете редактировать?" },
    no_categories: { uz: "Kategoriyalar topilmadi", ru: "Категории не найдены" },
    no_subcategories: { uz: "Bo'limlar topilmadi", ru: "Подкатегории не найдены" },
    no_products: { uz: "Bu bo'limda mahsulotlar yo'q", ru: "В этой подкатегории нет товаров" },
    catalog: { uz: "Katalog", ru: "Каталог" },
    info: { uz: "Ma'lumot", ru: "О компании" },
    contact: { uz: "Aloqa", ru: "Контакты" }
  };

  return texts[key] ? texts[key][lang] || texts[key]['uz'] : key;
}

// ===================== KEYBOARD FUNCTIONS =====================
function getMainMenu(lang) {
  return Markup.keyboard([
    [getText(lang, 'catalog')],
    [getText(lang, 'info'), getText(lang, 'contact')]
  ]).resize();
}

function getAdminMenu(lang) {
  return Markup.keyboard([
    [getText(lang, 'add_category'), getText(lang, 'add_subcategory')],
    [getText(lang, 'add_product')],
    [getText(lang, 'edit_menu'), getText(lang, 'delete_menu')],
    [getText(lang, 'back')]
  ]).resize();
}

function getEditMenu(lang) {
  return Markup.keyboard([
    [getText(lang, 'edit_category'), getText(lang, 'edit_subcategory')],
    [getText(lang, 'edit_product')],
    [getText(lang, 'back')]
  ]).resize();
}

function getDeleteMenu(lang) {
  return Markup.keyboard([
    [getText(lang, 'delete_category'), getText(lang, 'delete_subcategory')],
    [getText(lang, 'delete_product')],
    [getText(lang, 'back')]
  ]).resize();
}

function getProductEditMenu(lang) {
  return Markup.keyboard([
    [getText(lang, 'edit_product_name')],
    [getText(lang, 'edit_product_description')],
    [getText(lang, 'edit_product_media')],
    [getText(lang, 'back')]
  ]).resize();
}

// ===================== BOT START =====================
console.log('Bot ishga tushmoqda...');
console.log(`Admin ID: ${adminId} (${typeof adminId})`);

bot.start((ctx) => {
  const lang = userLang[ctx.chat.id] || 'uz';
  ctx.reply(
    getText(lang, 'choose_language'),
    Markup.inlineKeyboard([
      [Markup.button.callback("O'zbek tili", "lang_uz")],
      [Markup.button.callback("Русский язык", "lang_ru")]
    ])
  );
});

bot.action("lang_uz", async (ctx) => {
  userLang[ctx.chat.id] = "uz";
  await ctx.answerCbQuery();
  await ctx.editMessageText(getText('uz', 'language_selected'));
  setTimeout(() => {
    ctx.reply(getText('uz', 'main_menu'), getMainMenu('uz'));
  }, 500);
});

bot.action("lang_ru", async (ctx) => {
  userLang[ctx.chat.id] = "ru";
  await ctx.answerCbQuery();
  await ctx.editMessageText(getText('ru', 'language_selected'));
  setTimeout(() => {
    ctx.reply(getText('ru', 'main_menu'), getMainMenu('ru'));
  }, 500);
});

// ===================== ADMIN PANEL =====================
bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    const lang = userLang[ctx.chat.id] || "uz";
    return ctx.reply(getText(lang, 'not_admin'));
  }
  setCurrentMenu(ctx.chat.id, 'admin');
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.reply(getText(lang, 'admin_panel'), getAdminMenu(lang));
});

// ===================== MAIN MENU HANDLERS =====================
bot.hears([/Ma'lumot/i, /О компании/i, /Ma'lumot/i, /О компании/i], async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(getText(lang, 'company_info'));
});

bot.hears([/Aloqa/i, /Контакты/i, /Aloqa/i, /Контакты/i], async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(getText(lang, 'contact_info'));
});

// ===================== ADD CATEGORY =====================
bot.hears([/Kategoriya qo'shish/i, /Добавить категорию/i, /Kategoriya qo'shish/i, /Добавить категорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  session[ctx.chat.id] = { step: "add_category_name_uz", data: {} };
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(getText(lang, 'enter_category_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

// ===================== ADD SUBCATEGORY =====================
bot.hears([/Bo'lim qo'shish/i, /Добавить подкатегорию/i, /Bo'lim qo'shish/i, /Добавить подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const categories = await getRootCategories();
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
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/add_subcat_to_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  session[ctx.chat.id] = {
    step: "add_subcategory_name_uz",
    parentId: categoryId,
    data: {}
  };
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'enter_subcategory_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

// ===================== ADD PRODUCT =====================
bot.hears([/Mahsulot qo'shish/i, /Добавить товар/i, /Mahsulot qo'shish/i, /Добавить товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC");
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'));
    }

    const categoryButtons = subCategories.map((c) => {
      const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(categoryName, `add_prod_to_${c.id}`)];
    });

    categoryButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_subcategory'),
      Markup.inlineKeyboard(categoryButtons)
    );
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/add_prod_to_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  session[ctx.chat.id] = {
    step: "add_product_name_uz",
    categoryId: categoryId,
    data: {}
  };
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'enter_product_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

// ===================== EDIT HANDLERS =====================
bot.hears([/^Tahrirlash$/i, /^Редактировать$/i, /Tahrirlash/i, /Редактировать/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  setCurrentMenu(ctx.chat.id, 'edit');
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.reply(getText(lang, 'select_edit_option'), getEditMenu(lang));
});

// Edit Category
bot.hears([/Kategoriya tahrirlash/i, /Редактировать категорию/i, /Kategoriya tahrirlash/i, /Редактировать категорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const categories = await getRootCategories();
    const lang = userLang[ctx.chat.id] || "uz";

    if (categories.length === 0) {
      return ctx.reply(getText(lang, 'no_categories'));
    }

    const categoryButtons = categories.map((c) => {
      const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(categoryName, `edit_cat_${c.id}`)];
    });

    categoryButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_category'),
      Markup.inlineKeyboard(categoryButtons)
    );
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

// Edit Subcategory
bot.hears([/Bo'lim tahrirlash/i, /Редактировать подкатегорию/i, /Bo'lim tahrirlash/i, /Редактировать подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC");
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'));
    }

    const categoryButtons = subCategories.map((c) => {
      const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(categoryName, `edit_subcat_${c.id}`)];
    });

    categoryButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_subcategory'),
      Markup.inlineKeyboard(categoryButtons)
    );
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

// Edit Product
bot.hears([/Mahsulot tahrirlash/i, /Редактировать товар/i, /Mahsulot tahrirlash/i, /Редактировать товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC");
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'));
    }

    const categoryButtons = subCategories.map((c) => {
      const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(categoryName, `edit_prod_cat_${c.id}`)];
    });

    categoryButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_subcategory'),
      Markup.inlineKeyboard(categoryButtons)
    );
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

// ===================== DELETE HANDLERS =====================
bot.hears([/^O'chirish$/i, /^Удалить$/i, /O'chirish/i, /Удалить/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  setCurrentMenu(ctx.chat.id, 'delete');
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.reply(getText(lang, 'select_edit_option'), getDeleteMenu(lang));
});

// Delete Category
bot.hears([/Kategoriya o'chirish/i, /Удалить категорию/i, /Kategoriya o'chirish/i, /Удалить категорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const categories = await getRootCategories();
    const lang = userLang[ctx.chat.id] || "uz";

    if (categories.length === 0) {
      return ctx.reply(getText(lang, 'no_categories'));
    }

    const categoryButtons = categories.map((c) => {
      const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(`${categoryName}`, `delete_cat_${c.id}`)];
    });

    categoryButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_category'),
      Markup.inlineKeyboard(categoryButtons)
    );
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

// Delete Subcategory
bot.hears([/Bo'lim o'chirish/i, /Удалить подкатегорию/i, /Bo'lim o'chirish/i, /Удалить подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC");
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'));
    }

    const categoryButtons = subCategories.map((c) => {
      const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(`${categoryName}`, `delete_subcat_${c.id}`)];
    });

    categoryButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_subcategory'),
      Markup.inlineKeyboard(categoryButtons)
    );
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

// Delete Product
bot.hears([/Mahsulot o'chirish/i, /Удалить товар/i, /Mahsulot o'chirish/i, /Удалить товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC");
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'));
    }

    const categoryButtons = subCategories.map((c) => {
      const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(categoryName, `delete_prod_cat_${c.id}`)];
    });

    categoryButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_subcategory'),
      Markup.inlineKeyboard(categoryButtons)
    );
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

// ===================== BACK BUTTON =====================
bot.hears([/^Orqaga$/i, /^Назад$/i, /Orqaga/i, /Назад/i], async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  const currentMenu = getCurrentMenu(ctx.chat.id);

  delete session[ctx.chat.id];

  switch (currentMenu) {
    case 'edit':
    case 'delete':
      setCurrentMenu(ctx.chat.id, 'admin');
      ctx.reply(getText(lang, 'admin_panel'), getAdminMenu(lang));
      break;

    case 'admin':
      setCurrentMenu(ctx.chat.id, 'main');
      ctx.reply(getText(lang, 'main_menu'), getMainMenu(lang));
      break;

    case 'product_edit':
      setCurrentMenu(ctx.chat.id, 'edit');
      ctx.reply(getText(lang, 'select_edit_option'), getEditMenu(lang));
      break;

    default:
      setCurrentMenu(ctx.chat.id, 'main');
      ctx.reply(getText(lang, 'main_menu'), getMainMenu(lang));
  }
});

// ===================== CATALOG HANDLER =====================
bot.hears([/Katalog/i, /Каталог/i, /Katalog/i, /Каталог/i], async (ctx) => {
  setCurrentMenu(ctx.chat.id, 'catalog');
  try {
    const categories = await getRootCategories();
    const lang = userLang[ctx.chat.id] || "uz";

    if (categories.length === 0) {
      return ctx.reply(getText(lang, 'no_categories'));
    }

    const categoryButtons = categories.map((c) => {
      const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(categoryName, `view_cat_${c.id}`)];
    });

    categoryButtons.push([Markup.button.callback(getText(lang, 'back'), "back_to_menu")]);

    session[ctx.chat.id] = { categoryPath: [] };

    ctx.reply(
      getText(lang, 'select_category'),
      Markup.inlineKeyboard(categoryButtons)
    );
  } catch (error) {
    console.error('Katalog xatosi:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

// ===================== CALLBACK ACTION HANDLERS =====================
bot.action(/edit_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  session[ctx.chat.id] = { step: "edit_category_name_uz", categoryId };
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'enter_new_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

bot.action(/edit_subcat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  session[ctx.chat.id] = { step: "edit_subcategory_name_uz", categoryId };
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'enter_new_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

bot.action(/edit_prod_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  try {
    const products = await getProductsByCategory(categoryId);
    const lang = userLang[ctx.chat.id] || "uz";

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    if (products.length === 0) {
      return ctx.reply(getText(lang, 'no_products'));
    }

    const productButtons = products.map((p, index) => {
      const productName = lang === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz);
      return [Markup.button.callback(`${index + 1}. ${productName || 'Nomsiz'}`, `edit_prod_${p.id}`)];
    });

    productButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_product'),
      Markup.inlineKeyboard(productButtons)
    );
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/edit_prod_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  session[ctx.chat.id] = { productId, step: "select_product_edit_option" };
  const lang = userLang[ctx.chat.id] || "uz";
  setCurrentMenu(ctx.chat.id, 'product_edit');
  
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  
  ctx.reply(getText(lang, 'select_edit_option'), getProductEditMenu(lang));
});

bot.hears([/Nom tahrirlash/i, /Редактировать название/i, /Nom tahrirlash/i, /Редактировать название/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const state = session[ctx.chat.id];
  if (!state || !state.productId) return;
  
  state.step = "edit_product_name_uz";
  state.data = {};
  const lang = userLang[ctx.chat.id] || "uz";
  
  ctx.reply(getText(lang, 'enter_new_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

bot.hears([/Tavsif tahrirlash/i, /Редактировать описание/i, /Tavsif tahrirlash/i, /Редактировать описание/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const state = session[ctx.chat.id];
  if (!state || !state.productId) return;
  
  state.step = "edit_product_description_uz";
  state.data = {};
  const lang = userLang[ctx.chat.id] || "uz";
  
  ctx.reply(getText(lang, 'enter_new_description_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

bot.hears([/Rasm tahrirlash/i, /Редактировать фото/i, /Rasm tahrirlash/i, /Редактировать фото/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  
  const state = session[ctx.chat.id];
  if (!state || !state.productId) return;
  
  try {
    const existingMedia = await getProductMedia(state.productId);
    const lang = userLang[ctx.chat.id] || "uz";

    state.step = "edit_product_media_multiple";
    state.data = { mediaFiles: [] };

    let mediaInfo = "";
    if (existingMedia.length > 0) {
      const photoCount = existingMedia.filter(m => m.media_type === 'photo').length;
      const videoCount = existingMedia.filter(m => m.media_type === 'video').length;
      mediaInfo = `\n\nHozirgi media: ${existingMedia.length} ta (${photoCount}, ${videoCount})`;
    }

    ctx.reply(
      `Yangi media yuklang. Barcha eski medialar almashtiriladi.${mediaInfo}\n\nRasm va videolarni yuboring, keyin 'Tayyor' tugmasini bosing.`,
      Markup.inlineKeyboard([
        [Markup.button.callback("Tayyor, saqlash", "finish_media_edit")],
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ])
    );
  } catch (error) {
    console.error('Media tahrirlash xatosi:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/delete_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  try {
    await deleteCategory(categoryId);
    const lang = userLang[ctx.chat.id] || "uz";
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    ctx.reply(getText(lang, 'category_deleted'));
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/delete_subcat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  try {
    await deleteCategory(categoryId);
    const lang = userLang[ctx.chat.id] || "uz";
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    ctx.reply(getText(lang, 'subcategory_deleted'));
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
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
      return ctx.reply(getText(lang, 'no_products'));
    }

    const productButtons = products.map((p, index) => {
      const productName = lang === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz);
      return [Markup.button.callback(`${index + 1}. ${productName || 'Nomsiz'}`, `delete_prod_${p.id}`)];
    });

    productButtons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(
      getText(lang, 'select_product'),
      Markup.inlineKeyboard(productButtons)
    );
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/delete_prod_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  try {
    await deleteProduct(productId);
    const lang = userLang[ctx.chat.id] || "uz";
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    ctx.reply(getText(lang, 'product_deleted'));
  } catch (error) {
    ctx.reply("Xatolik yuz berdi");
  }
});

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
    if (!session[ctx.chat.id].categoryPath) session[ctx.chat.id].categoryPath = [];

    const path = session[ctx.chat.id].categoryPath;
    if (!path.some(cat => cat.id == categoryId)) {
      path.push(category);
    }

    const buttons = [];

    if (subCategories.length > 0) {
      subCategories.forEach((c) => {
        const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
        buttons.push([Markup.button.callback(`${categoryName}`, `view_cat_${c.id}`)]);
      });
    }

    if (products.length > 0) {
      products.forEach((p, index) => {
        const productName = lang === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz);
        buttons.push([Markup.button.callback(`${index + 1}. ${productName || 'Nomsiz'}`, `view_product_${p.id}`)]);
      });
    }

    if (path.length > 1) {
      const parentCategory = path[path.length - 2];
      buttons.push([Markup.button.callback(getText(lang, 'back'), `back_to_cat_${parentCategory.id}`)]);
    } else {
      buttons.push([Markup.button.callback(getText(lang, 'back'), "back_to_menu")]);
    }

    const currentCategoryName = lang === 'uz' ? (category.name_uz || category.name_ru) : (category.name_ru || category.name_uz);

    if (subCategories.length > 0 || products.length > 0) {
      ctx.reply(
        `${currentCategoryName}`,
        Markup.inlineKeyboard(buttons)
      );
    } else {
      ctx.reply(
        getText(lang, 'no_products'),
        Markup.inlineKeyboard(buttons)
      );
    }

  } catch (error) {
    console.error('Katalog ko\'rishda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/view_product_(\d+)/, async (ctx) => {
  const productId = ctx.match[1];
  try {
    const product = await getProductById(productId);
    const lang = userLang[ctx.chat.id] || "uz";

    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    const productName = lang === 'uz' ? (product.name_uz || product.name_ru) : (product.name_ru || product.name_uz);
    const productDescription = lang === 'uz' ? (product.description_uz || product.description_ru) : (product.description_ru || product.description_uz);

    const caption = `${productName}\n\n${productDescription}`;

    const mediaList = await getProductMedia(productId);

    const path = session[ctx.chat.id]?.categoryPath || [];
    const buttons = [];
    if (path.length > 0) {
      const parentCategory = path[path.length - 1];
      buttons.push([Markup.button.callback(getText(lang, 'back'), `back_to_cat_${parentCategory.id}`)]);
    } else {
      buttons.push([Markup.button.callback(getText(lang, 'back'), "back_to_menu")]);
    }

    if (mediaList.length === 0) {
      await ctx.reply(caption, Markup.inlineKeyboard(buttons));
      return;
    }

    if (mediaList.length === 1) {
      const media = mediaList[0];
      if (media.media_type === 'video') {
        await ctx.replyWithVideo(media.file_id, {
          caption,
          reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
      } else if (media.media_type === 'photo') {
        await ctx.replyWithPhoto(media.file_id, {
          caption,
          reply_markup: Markup.inlineKeyboard(buttons).reply_markup
        });
      }
    } else {
      const mediaGroup = mediaList.map((media, index) => ({
        type: media.media_type,
        media: media.file_id,
        caption: index === 0 ? caption : undefined
      }));

      await ctx.replyWithMediaGroup(mediaGroup);
      await ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(buttons));
    }

  } catch (error) {
    console.error(`Mahsulot ${productId} ko'rishda xato:`, error);
    ctx.reply("Xatolik yuz berdi");
  }
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

    if (!session[ctx.chat.id]) session[ctx.chat.id] = {};
    if (!session[ctx.chat.id].categoryPath) session[ctx.chat.id].categoryPath = [];

    const path = session[ctx.chat.id].categoryPath;
    const categoryIndex = path.findIndex(cat => cat.id == categoryId);
    if (categoryIndex !== -1) {
      session[ctx.chat.id].categoryPath = path.slice(0, categoryIndex + 1);
    }

    const buttons = [];

    if (subCategories.length > 0) {
      subCategories.forEach((c) => {
        const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
        buttons.push([Markup.button.callback(`${categoryName}`, `view_cat_${c.id}`)]);
      });
    }

    if (products.length > 0) {
      products.forEach((p, index) => {
        const productName = lang === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz);
        buttons.push([Markup.button.callback(`${index + 1}. ${productName || 'Nomsiz'}`, `view_product_${p.id}`)]);
      });
    }

    const currentPath = session[ctx.chat.id].categoryPath;
    if (currentPath.length > 1) {
      const parentCategory = currentPath[currentPath.length - 2];
      buttons.push([Markup.button.callback(getText(lang, 'back'), `back_to_cat_${parentCategory.id}`)]);
    } else {
      buttons.push([Markup.button.callback(getText(lang, 'back'), "back_to_menu")]);
    }

    const currentCategoryName = lang === 'uz' ? (category.name_uz || category.name_ru) : (category.name_ru || category.name_uz);

    if (subCategories.length > 0 || products.length > 0) {
      ctx.reply(
        `${currentCategoryName}`,
        Markup.inlineKeyboard(buttons)
      );
    } else {
      ctx.reply(
        getText(lang, 'no_products'),
        Markup.inlineKeyboard(buttons)
      );
    }

  } catch (error) {
    console.error('Orqaga qaytishda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action("back_to_menu", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  delete session[ctx.chat.id];
  setCurrentMenu(ctx.chat.id, 'main');
  ctx.reply(getText(lang, 'main_menu'), getMainMenu(lang));
});

bot.action("admin_back", async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  delete session[ctx.chat.id];
  setCurrentMenu(ctx.chat.id, 'admin');
  ctx.reply(getText(lang, 'admin_panel'), getAdminMenu(lang));
});

bot.on(['photo', 'video'], async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state || (state.step !== 'add_product_media_multiple' && state.step !== 'edit_product_media_multiple')) return;

  const mediaType = ctx.message.photo ? 'photo' : 'video';
  const file = mediaType === 'photo' ? ctx.message.photo.pop() : ctx.message.video;
  const fileId = file.file_id;

  state.data.mediaFiles.push({
    fileId,
    mediaType,
    fileSize: file.file_size,
    mimeType: file.mime_type
  });
});

bot.action('finish_media_upload', async (ctx) => {
  const state = session[ctx.chat.id];
  const lang = userLang[ctx.chat.id] || "uz";

  if (!state || state.step !== 'add_product_media_multiple') return;

  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    const photoCount = state.data.mediaFiles.filter(m => m.mediaType === 'photo').length;
    const videoCount = state.data.mediaFiles.filter(m => m.mediaType === 'video').length;

    const statsText = lang === 'uz' ? `Yuborilgan: ${photoCount} ta rasm, ${videoCount} ta video. Saqlaysizmi?` : `Отправлено: ${photoCount} фото, ${videoCount} видео. Сохранить?`;

    ctx.reply(statsText, Markup.inlineKeyboard([
      [Markup.button.callback("Ha", "confirm_save_product")],
      [Markup.button.callback("Yo'q", "cancel_save_product")]
    ]));
  } catch (error) {
    console.error('Media tasdiqlashda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action('confirm_save_product', async (ctx) => {
  const state = session[ctx.chat.id];
  const lang = userLang[ctx.chat.id] || "uz";

  if (!state || !state.categoryId) return;

  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    const product = await addProduct(
      state.categoryId,
      state.data.nameUz,
      state.data.nameRu,
      state.data.descriptionUz,
      state.data.descriptionRu
    );

    for (let i = 0; i < state.data.mediaFiles.length; i++) {
      const media = state.data.mediaFiles[i];
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
    ctx.reply(getText(lang, 'product_saved'));
  } catch (error) {
    console.error('Mahsulot saqlashda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action('cancel_save_product', async (ctx) => {
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  delete session[ctx.chat.id];
  ctx.reply(lang === 'uz' ? "Bekor qilindi" : "Отменено");
});

bot.action('finish_media_edit', async (ctx) => {
  const state = session[ctx.chat.id];
  const lang = userLang[ctx.chat.id] || "uz";

  if (!state || state.step !== 'edit_product_media_multiple') return;

  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();

    await deleteProductMedia(state.productId);

    for (let i = 0; i < state.data.mediaFiles.length; i++) {
      const media = state.data.mediaFiles[i];
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
    ctx.reply(getText(lang, 'media_updated'));
  } catch (error) {
    console.error('Media yangilashda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.on("text", async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state) return;

  const lang = userLang[ctx.chat.id] || "uz";
  let inputText = ctx.message.text;

  try {
    if (state.step === "add_category_name_uz") {
      state.data.nameUz = inputText;
      state.step = "add_category_name_ru";
      return ctx.reply(getText(lang, 'enter_category_name_ru'));
    }

    if (state.step === "add_category_name_ru") {
      const category = await addCategory(state.data.nameUz, inputText);
      state.step = "add_subcategory_name_uz";
      state.parentId = category.id;
      return ctx.reply(getText(lang, 'enter_subcategory_name_uz'));
    }

    if (state.step === "add_subcategory_name_uz") {
      state.data.nameUz = inputText;
      state.step = "add_subcategory_name_ru";
      return ctx.reply(getText(lang, 'enter_subcategory_name_ru'));
    }

    if (state.step === "add_subcategory_name_ru") {
      const subcategory = await addCategory(state.data.nameUz, inputText, state.parentId);
      state.step = "add_product_name_uz";
      state.categoryId = subcategory.id;
      state.data = {};
      return ctx.reply(getText(lang, 'enter_product_name_uz'));
    }

    if (state.step === "add_product_name_uz") {
      state.data.nameUz = inputText;
      state.step = "add_product_name_ru";
      return ctx.reply(getText(lang, 'enter_product_name_ru'));
    }

    if (state.step === "add_product_name_ru") {
      state.data.nameRu = inputText;
      state.step = "add_product_description_uz";
      return ctx.reply(getText(lang, 'enter_product_description_uz'));
    }

    if (state.step === "add_product_description_uz") {
      state.data.descriptionUz = inputText;
      state.step = "add_product_description_ru";
      return ctx.reply(getText(lang, 'enter_product_description_ru'));
    }

    if (state.step === "add_product_description_ru") {
      state.data.descriptionRu = inputText;
      state.step = "add_product_media_multiple";
      state.data.mediaFiles = [];
      return ctx.reply(
        getText(lang, 'send_multiple_media'),
        Markup.inlineKeyboard([
          [Markup.button.callback("Tayyor", "finish_media_upload")],
          [Markup.button.callback(getText(lang, 'back'), "admin_back")]
        ])
      );
    }

    if (state.step === "edit_category_name_uz") {
      state.data.nameUz = inputText;
      state.step = "edit_category_name_ru";
      return ctx.reply(getText(lang, 'enter_new_name_ru'));
    }

    if (state.step === "edit_category_name_ru") {
      await updateCategory(state.categoryId, state.data.nameUz, inputText);
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'category_updated'));
    }

    if (state.step === "edit_subcategory_name_uz") {
      state.data.nameUz = inputText;
      state.step = "edit_subcategory_name_ru";
      return ctx.reply(getText(lang, 'enter_new_name_ru'));
    }

    if (state.step === "edit_subcategory_name_ru") {
      await updateCategory(state.categoryId, state.data.nameUz, inputText);
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'subcategory_updated'));
    }

    if (state.step === "edit_product_name_uz") {
      state.data.nameUz = inputText;
      state.step = "edit_product_name_ru";
      return ctx.reply(getText(lang, 'enter_new_name_ru'));
    }

    if (state.step === "edit_product_name_ru") {
      const product = await getProductById(state.productId);
      await updateProduct(
        state.productId,
        state.data.nameUz,
        inputText,
        product.description_uz,
        product.description_ru
      );
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'product_updated'));
    }

    if (state.step === "edit_product_description_uz") {
      state.data.descriptionUz = inputText;
      state.step = "edit_product_description_ru";
      return ctx.reply(getText(lang, 'enter_new_description_ru'));
    }

    if (state.step === "edit_product_description_ru") {
      const product = await getProductById(state.productId);
      await updateProduct(
        state.productId,
        product.name_uz,
        product.name_ru,
        state.data.descriptionUz,
        inputText
      );
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'product_updated'));
    }

  } catch (error) {
    console.error('Matn kiritishda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.launch().then(() => {
  console.log('Bot muvaffaqiyatli ishga tushdi');
}).catch((err) => {
  console.error('Bot ishga tushirishda xato:', err);
});
