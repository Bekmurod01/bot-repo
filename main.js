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
  console.log("SQLite database ga ulanildi");

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
  await db.run(`UPDATE categories SET name_uz=?, name_ru=? WHERE id=?`, [newNameUz, newNameRu, id]);
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
  return { id: result.lastID };
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
  await db.run(`DELETE FROM product_media WHERE product_id=?`, [id]);
  await db.run(`DELETE FROM products WHERE id=?`, [id]);
}

async function addProductMedia(productId, fileId, mediaType, fileSize = null, mimeType = null, orderIndex = 0) {
  await db.run(
    `INSERT INTO product_media (product_id, file_id, media_type, file_size, mime_type, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
    [productId, fileId, mediaType, fileSize, mimeType, orderIndex]
  );
}

async function getProductMedia(productId) {
  return await db.all(
    `SELECT * FROM product_media WHERE product_id=? ORDER BY order_index ASC, created_at ASC`,
    [productId]
  );
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
    company_info: { uz: "IZOLUX KOMPANIYASI HAQIDA\n\nManzil: Toshkent shahar\nTelefon: +998 88 980 60 09\nAdmin: @Muzropov_Dilmurod\n\nBizning kompaniya yuqori sifatli izolyatsiya materiallari bilan ta'minlaydi.", ru: "О КОМПАНИИ IZOLUX\n\nАдрес: г. Ташкент\nТелефон: +998 88 980 60 09\nAdmin: @Muzropov_Dilmurod\n\nНаша компания обеспечивает высококачественными изоляционными материалами." },
    contact_info: { uz: "ALOQA MA'LUMOTLARI\n\nAdmin: Dilmurod\nTelefon: +998 88 980 60 09\nManzil: Toshkent shahar\nIsh vaqti: 9:00 - 18:00\nTelegram: @Muzropov_Dilmurod", ru: "КОНТАКТНАЯ ИНФОРМАЦИЯ\n\nAdmin: Dilmurod\nTelefon: +998 88 980 60 09\nАдрес: г. Ташкент\nВремя работы: 9:00 - 18:00\nTelegram: @Muzropov_Dilmurod" },
    add_category: { uz: "Kategoriya qo'shish", ru: "Добавить категорию" },
    add_subcategory: { uz: "Bo'lim qo'shish", ru: "Добавить подкатегорию" },
    add_product: { uz: "Mahsulot qo'shish", ru: "Добавить товар" },
    edit_menu: { uz: "Tahrirlash", ru: "Редактировать" },
    delete_menu: { uz: "O'chirish", ru: "Удалить" },
    back: { uz: "Orqaga", ru: "Назад" },
    edit_category: { uz: "Kategoriya tahrirlash", ru: "Редактировать категорию" },
    edit_subcategory: { uz: "Bo'lim tahrirlash", ru: "Редактировать подкатегорию" },
    edit_product: { uz: "Mahsulot tahrirlash", ru: "Редактировать товар" },
    edit_product_name: { uz: "Nom tahrirlash", ru: "Редактировать название" },
    edit_product_description: { uz: "Tavsif tahrirlash", ru: "Редактировать описание" },
    edit_product_media: { uz: "Rasm tahrirlash", ru: "Редактировать фото" },
    delete_category: { uz: "Kategoriya o'chirish", ru: "Удалить категорию" },
    delete_subcategory: { uz: "Bo'lim o'chirish", ru: "Удалить подкатегорию" },
    delete_product: { uz: "Mahsulot o'chirish", ru: "Удалить товар" },
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
  setTimeout(() => ctx.reply(getText('uz', 'main_menu'), getMainMenu('uz')), 500);
});

bot.action("lang_ru", async (ctx) => {
  userLang[ctx.chat.id] = "ru";
  await ctx.answerCbQuery();
  await ctx.editMessageText(getText('ru', 'language_selected'));
  setTimeout(() => ctx.reply(getText('ru', 'main_menu'), getMainMenu('ru')), 500);
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
bot.hears([/Kategoriya qo'shish/i, /Добавить категорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  session[ctx.chat.id] = { step: "add_category_name_uz", data: {} };
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(getText(lang, 'enter_category_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

// ===================== ADD SUBCATEGORY =====================
bot.hears([/Bo'lim qo'shish/i, /Добавить подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const categories = await getRootCategories();
    const lang = userLang[ctx.chat.id] || "uz";

    if (categories.length === 0) {
      return ctx.reply(getText(lang, 'no_categories'), Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }

    const buttons = categories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `add_subcat_to_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Subcategory qo\'shishda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/add_subcat_to_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  session[ctx.chat.id] = { step: "add_subcategory_name_uz", parentId: categoryId, data: {} };
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'enter_subcategory_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

// ===================== ADD PRODUCT =====================
bot.hears([/Mahsulot qo'shish/i, /Добавить товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC`);
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'), Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }

    const buttons = subCategories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `add_prod_to_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Mahsulot qo\'shishda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.action(/add_prod_to_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  session[ctx.chat.id] = { step: "add_product_name_uz", categoryId, data: {} };
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'enter_product_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

// ===================== EDIT HANDLERS =====================
bot.hears([/Tahrirlash/i, /Редактировать/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  setCurrentMenu(ctx.chat.id, 'edit');
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.reply(getText(lang, 'select_edit_option'), getEditMenu(lang));
});

bot.hears([/Kategoriya tahrirlash/i, /Редактировать категорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const categories = await getRootCategories();
    const lang = userLang[ctx.chat.id] || "uz";

    if (categories.length === 0) {
      return ctx.reply(getText(lang, 'no_categories'), Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }

    const buttons = categories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `edit_cat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Kategoriya tahrirlashda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.hears([/Bo'lim tahrirlash/i, /Редактировать подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC`);
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'), Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }

    const buttons = subCategories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `edit_subcat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Bo\'lim tahrirlashda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.hears([/Mahsulot tahrirlash/i, /Редактировать товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC`);
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'), Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }

    const buttons = subCategories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `edit_prod_cat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Mahsulot tahrirlashda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

// ===================== DELETE HANDLERS =====================
bot.hears([/O'chirish/i, /Удалить/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  setCurrentMenu(ctx.chat.id, 'delete');
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.reply(getText(lang, 'select_edit_option'), getDeleteMenu(lang));
});

bot.hears([/Kategoriya o'chirish/i, /Удалить категорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const categories = await getRootCategories();
    const lang = userLang[ctx.chat.id] || "uz";

    if (categories.length === 0) {
      return ctx.reply(getText(lang, 'no_categories'), Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }

    const buttons = categories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(`${name}`, `delete_cat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Kategoriya o\'chirishda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.hears([/Bo'lim o'chirish/i, /Удалить подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC`);
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'), Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }

    const buttons = subCategories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(`${name}`, `delete_subcat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Bo\'lim o\'chirishda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

bot.hears([/Mahsulot o'chirish/i, /Удалить товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  try {
    const subCategories = await db.all(`SELECT * FROM categories WHERE parent_id IS NOT NULL ORDER BY id DESC`);
    const lang = userLang[ctx.chat.id] || "uz";

    if (subCategories.length === 0) {
      return ctx.reply(getText(lang, 'no_subcategories'), Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }

    const buttons = subCategories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `delete_prod_cat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Mahsulot o\'chirishda xato:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

// ===================== BACK BUTTON =====================
bot.hears([/Orqaga/i, /Назад/i], async (ctx) => {
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
bot.hears([/Katalog/i, /Каталог/i], async (ctx) => {
  setCurrentMenu(ctx.chat.id, 'catalog');
  try {
    const categories = await getRootCategories();
    const lang = userLang[ctx.chat.id] || "uz";

    if (categories.length === 0) {
      return ctx.reply(getText(lang, 'no_categories'));
    }

    const buttons = categories.map(c => {
      const name = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
      return [Markup.button.callback(name, `view_cat_${c.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "back_to_menu")]);

    session[ctx.chat.id] = { categoryPath: [] };

    ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Katalog xatosi:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

// ===================== CALLBACK ACTIONS =====================
bot.action(/edit_cat_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  session[ctx.chat.id] = { step: "edit_category_name_uz", categoryId: id };
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'enter_new_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

bot.action(/edit_subcat_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  session[ctx.chat.id] = { step: "edit_subcategory_name_uz", categoryId: id };
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
      return ctx.reply(getText(lang, 'no_products'), Markup.inlineKeyboard([
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }

    const buttons = products.map((p, i) => {
      const name = lang === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz);
      return [Markup.button.callback(`${i + 1}. ${name}`, `edit_prod_${p.id}`)];
    });
    buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

    ctx.reply(getText(lang, 'select_product'), Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('Mahsulot ro\'yxatida xato:', error);
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

bot.hears([/Nom tahrirlash/i, /Редактировать название/i], async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state?.productId) return;
  state.step = "edit_product_name_uz";
  state.data = {};
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(getText(lang, 'enter_new_name_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

bot.hears([/Tavsif tahrirlash/i, /Редактировать описание/i], async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state?.productId) return;
  state.step = "edit_product_description_uz";
  state.data = {};
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(getText(lang, 'enter_new_description_uz'), Markup.inlineKeyboard([
    [Markup.button.callback(getText(lang, 'back'), "admin_back")]
  ]));
});

bot.hears([/Rasm tahrirlash/i, /Редактировать фото/i], async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state?.productId) return;
  state.step = "edit_product_media_multiple";
  state.data = { mediaFiles: [] };
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(
    `Yangi media yuklang. Eski medialar o'chiriladi.\nRasm/videoni yuboring, keyin "Tayyor" ni bosing.`,
    Markup.inlineKeyboard([
      [Markup.button.callback("Tayyor", "finish_media_edit")],
      [Markup.button.callback(getText(lang, 'back'), "admin_back")]
    ])
  );
});

bot.action(/delete_cat_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  await deleteCategory(id);
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'category_deleted'), getAdminMenu(lang));
});

bot.action(/delete_subcat_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  await deleteCategory(id);
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'subcategory_deleted'), getAdminMenu(lang));
});

bot.action(/delete_prod_cat_(\d+)/, async (ctx) => {
  const categoryId = ctx.match[1];
  const products = await getProductsByCategory(categoryId);
  const lang = userLang[ctx.chat.id] || "uz";

  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  if (products.length === 0) {
    return ctx.reply(getText(lang, 'no_products'));
  }

  const buttons = products.map((p, i) => {
    const name = lang === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz);
    return [Markup.button.callback(`${i + 1}. ${name}`, `delete_prod_${p.id}`)];
  });
  buttons.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);

  ctx.reply(getText(lang, 'select_product'), Markup.inlineKeyboard(buttons));
});

bot.action(/delete_prod_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  await deleteProduct(id);
  const lang = userLang[ctx.chat.id] || "uz";
  await ctx.answerCbQuery();
  await ctx.deleteMessage();
  ctx.reply(getText(lang, 'product_deleted'), getAdminMenu(lang));
});

// ===================== MEDIA & TEXT HANDLERS =====================
bot.on(['photo', 'video'], async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state || !['add_product_media_multiple', 'edit_product_media_multiple'].includes(state.step)) return;

  const mediaType = ctx.message.photo ? 'photo' : 'video';
  const file = mediaType === 'photo' ? ctx.message.photo.pop() : ctx.message.video;

  if (!state.data.mediaFiles) state.data.mediaFiles = [];
  state.data.mediaFiles.push({
    fileId: file.file_id,
    mediaType,
    fileSize: file.file_size,
    mimeType: file.mime_type
  });

  const count = state.data.mediaFiles.length;
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.reply(`${count}-ta media qabul qilindi. Yana yuboring yoki "Tayyor" ni bosing.`);
});

bot.action('finish_media_upload', async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state || state.step !== 'add_product_media_multiple') return;

  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  const { nameUz, nameRu, descriptionUz, descriptionRu } = state.data;
  const product = await addProduct(state.categoryId, nameUz, nameRu, descriptionUz, descriptionRu);

  for (let i = 0; i < state.data.mediaFiles.length; i++) {
    const m = state.data.mediaFiles[i];
    await addProductMedia(product.id, m.fileId, m.mediaType, m.fileSize, m.mimeType, i);
  }

  delete session[ctx.chat.id];
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'product_saved'), getAdminMenu(userLang[ctx.chat.id] || "uz"));
});

bot.action('finish_media_edit', async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state || state.step !== 'edit_product_media_multiple') return;

  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  await db.run(`DELETE FROM product_media WHERE product_id = ?`, [state.productId]);

  for (let i = 0; i < state.data.mediaFiles.length; i++) {
    const m = state.data.mediaFiles[i];
    await addProductMedia(state.productId, m.fileId, m.mediaType, m.fileSize, m.mimeType, i);
  }

  delete session[ctx.chat.id];
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'media_updated'), getAdminMenu(userLang[ctx.chat.id] || "uz"));
});

bot.on("text", async (ctx) => {
  const state = session[ctx.chat.id];
  if (!state) return;

  const lang = userLang[ctx.chat.id] || "uz";
  const text = ctx.message.text.trim();

  try {
    if (state.step === "add_category_name_uz") {
      state.data.nameUz = text;
      state.step = "add_category_name_ru";
      return ctx.reply(getText(lang, 'enter_category_name_ru'));
    }
    if (state.step === "add_category_name_ru") {
      await addCategory(state.data.nameUz, text);
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'category_saved'), getAdminMenu(lang));
    }
    if (state.step === "add_subcategory_name_uz") {
      state.data.nameUz = text;
      state.step = "add_subcategory_name_ru";
      return ctx.reply(getText(lang, 'enter_subcategory_name_ru'));
    }
    if (state.step === "add_subcategory_name_ru") {
      await addCategory(state.data.nameUz, text, state.parentId);
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'subcategory_saved'), getAdminMenu(lang));
    }
    if (state.step === "add_product_name_uz") {
      state.data.nameUz = text;
      state.step = "add_product_name_ru";
      return ctx.reply(getText(lang, 'enter_product_name_ru'));
    }
    if (state.step === "add_product_name_ru") {
      state.data.nameRu = text;
      state.step = "add_product_description_uz";
      return ctx.reply(getText(lang, 'enter_product_description_uz'));
    }
    if (state.step === "add_product_description_uz") {
      state.data.descriptionUz = text;
      state.step = "add_product_description_ru";
      return ctx.reply(getText(lang, 'enter_product_description_ru'));
    }
    if (state.step === "add_product_description_ru") {
      state.data.descriptionRu = text;
      state.step = "add_product_media_multiple";
      state.data.mediaFiles = [];
      return ctx.reply(getText(lang, 'send_multiple_media'), Markup.inlineKeyboard([
        [Markup.button.callback("Tayyor", "finish_media_upload")],
        [Markup.button.callback(getText(lang, 'back'), "admin_back")]
      ]));
    }
    if (state.step === "edit_category_name_uz") {
      state.data.nameUz = text;
      state.step = "edit_category_name_ru";
      return ctx.reply(getText(lang, 'enter_new_name_ru'));
    }
    if (state.step === "edit_category_name_ru") {
      await updateCategory(state.categoryId, state.data.nameUz, text);
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'category_updated'), getAdminMenu(lang));
    }
    if (state.step === "edit_subcategory_name_uz") {
      state.data.nameUz = text;
      state.step = "edit_subcategory_name_ru";
      return ctx.reply(getText(lang, 'enter_new_name_ru'));
    }
    if (state.step === "edit_subcategory_name_ru") {
      await updateCategory(state.categoryId, state.data.nameUz, text);
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'subcategory_updated'), getAdminMenu(lang));
    }
    if (state.step === "edit_product_name_uz") {
      state.data.nameUz = text;
      state.step = "edit_product_name_ru";
      return ctx.reply(getText(lang, 'enter_new_name_ru'));
    }
    if (state.step === "edit_product_name_ru") {
      const product = await getProductById(state.productId);
      await updateProduct(state.productId, state.data.nameUz, text, product.description_uz, product.description_ru);
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'product_updated'), getAdminMenu(lang));
    }
    if (state.step === "edit_product_description_uz") {
      state.data.descriptionUz = text;
      state.step = "edit_product_description_ru";
      return ctx.reply(getText(lang, 'enter_new_description_ru'));
    }
    if (state.step === "edit_product_description_ru") {
      const product = await getProductById(state.productId);
      await updateProduct(state.productId, product.name_uz, product.name_ru, state.data.descriptionUz, text);
      delete session[ctx.chat.id];
      return ctx.reply(getText(lang, 'product_updated'), getAdminMenu(lang));
    }
  } catch (error) {
    console.error('Text handler xatosi:', error);
    ctx.reply("Xatolik yuz berdi");
  }
});

// ===================== CATALOG VIEW =====================
bot.action(/view_cat_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  const category = await getCategoryById(id);
  const subCats = await getSubCategories(id);
  const products = await getProductsByCategory(id);
  const lang = userLang[ctx.chat.id] || "uz";

  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  if (!session[ctx.chat.id]?.categoryPath) session[ctx.chat.id].categoryPath = [];
  const path = session[ctx.chat.id].categoryPath;
  if (!path.some(c => c.id == id)) path.push(category);

  const buttons = [];
  subCats.forEach(c => {
    const name = lang === 'uz' ? c.name_uz : c.name_ru;
    buttons.push([Markup.button.callback(` ${name}`, `view_cat_${c.id}`)]);
  });
  products.forEach((p, i) => {
    const name = lang === 'uz' ? p.name_uz : p.name_ru;
    buttons.push([Markup.button.callback(`${i + 1}. ${name}`, `view_product_${p.id}`)]);
  });
  buttons.push([Markup.button.callback(getText(lang, 'back'), path.length > 1 ? `back_to_cat_${path[path.length-2].id}` : "back_to_menu")]);

  ctx.reply(` ${lang === 'uz' ? category.name_uz : category.name_ru}`, Markup.inlineKeyboard(buttons));
});

bot.action(/view_product_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  const product = await getProductById(id);
  const media = await getProductMedia(id);
  const lang = userLang[ctx.chat.id] || "uz";

  await ctx.answerCbQuery();
  await ctx.deleteMessage();

  const caption = `${lang === 'uz' ? product.name_uz : product.name_ru}\n\n${lang === 'uz' ? product.description_uz : product.description_ru}`;
  const buttons = [[Markup.button.callback(getText(lang, 'back'), session[ctx.chat.id]?.categoryPath?.length > 0 ? `back_to_cat_${session[ctx.chat.id].categoryPath[session[ctx.chat.id].categoryPath.length-1].id}` : "back_to_menu")]];

  if (media.length === 0) {
    ctx.reply(caption, Markup.inlineKeyboard(buttons));
  } else if (media.length === 1) {
    const m = media[0];
    if (m.media_type === 'photo') ctx.replyWithPhoto(m.file_id, { caption, reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
    else ctx.replyWithVideo(m.file_id, { caption, reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  } else {
    const group = media.map((m, i) => ({ type: m.media_type, media: m.file_id, caption: i === 0 ? caption : undefined }));
    await ctx.replyWithMediaGroup(group);
    ctx.reply("◀️", Markup.inlineKeyboard(buttons));
  }
});

bot.action(/back_to_cat_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  const index = session[ctx.chat.id].categoryPath.findIndex(c => c.id == id);
  if (index !== -1) session[ctx.chat.id].categoryPath = session[ctx.chat.id].categoryPath.slice(0, index + 1);
  ctx.callbackQuery.data = `view_cat_${id}`;
  bot.handleUpdate(ctx.update);
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

// ===================== LAUNCH =====================
bot.launch().then(() => console.log('Bot ishga tushdi'));
