import { Telegraf, Markup } from "telegraf";
import { config } from "dotenv";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const adminId = parseInt(process.env.ADMIN_ID);

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
  return { id: result.lastID };
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

async function updateCategory(id, name_uz, name_ru) {
  await db.run(`UPDATE categories SET name_uz = ?, name_ru = ? WHERE id = ?`, [name_uz, name_ru, id]);
}

async function deleteCategory(id) {
  const subs = await getSubCategories(id);
  for (const sub of subs) await deleteCategory(sub.id);
  const products = await getProductsByCategory(id);
  for (const p of products) await deleteProduct(p.id);
  await db.run(`DELETE FROM categories WHERE id = ?`, [id]);
}

async function addProduct(categoryId, nameUz, nameRu, descUz, descRu) {
  const res = await db.run(
    `INSERT INTO products (category_id, name_uz, name_ru, description_uz, description_ru) VALUES (?, ?, ?, ?, ?)`,
    [categoryId, nameUz, nameRu, descUz, descRu]
  );
  return { id: res.lastID };
}

async function getProductsByCategory(id) {
  return await db.all(`SELECT * FROM products WHERE category_id = ? ORDER BY id DESC`, [id]);
}

async function getProductById(id) {
  return await db.get(`SELECT * FROM products WHERE id = ?`, [id]);
}

async function updateProduct(id, nameUz, nameRu, descUz, descRu) {
  await db.run(
    `UPDATE products SET name_uz = ?, name_ru = ?, description_uz = ?, description_ru = ? WHERE id = ?`,
    [nameUz, nameRu, descUz, descRu, id]
  );
}

async function deleteProduct(id) {
  await deleteProductMedia(id);
  await db.run(`DELETE FROM products WHERE id = ?`, [id]);
}

async function addProductMedia(productId, fileId, type, size = null, mime = null, index = 0) {
  await db.run(
    `INSERT INTO product_media (product_id, file_id, media_type, file_size, mime_type, order_index) VALUES (?, ?, ?, ?, ?, ?)`,
    [productId, fileId, type, size, mime, index]
  );
}

async function getProductMedia(id) {
  return await db.all(`SELECT * FROM product_media WHERE product_id = ? ORDER BY order_index`, [id]);
}

async function deleteProductMedia(id) {
  await db.run(`DELETE FROM product_media WHERE product_id = ?`, [id]);
}

// ===================== GLOBAL =====================
const userLang = {};
const session = {};
const userMenu = {};

function setMenu(id, menu) { userMenu[id] = menu; }
function getMenu(id) { return userMenu[id] || 'main'; }
function isAdmin(id) { return parseInt(id) === adminId; }

// ===================== TEXTS =====================
function getText(lang, key) {
  const t = {
    choose_language: { uz: "Tilni tanlang:", ru: "Выберите язык:" },
    language_selected: { uz: "O'zbek tili tanlandi", ru: "Русский язык выбран" },
    admin_panel: { uz: "Admin paneli:", ru: "Панель администратора:" },
    not_admin: { uz: "Siz admin emassiz!", ru: "Вы не администратор!" },
    main_menu: { uz: "Asosiy menyu:", ru: "Главное меню:" },
    company_info: { uz: "IZOLUX HAQIDA\n\nToshkent\n+998 88 980 60 09\n@Muzropov_Dilmurod", ru: "О КОМПАНИИ\n\nТашкент\n+998 88 980 60 09\n@Muzropov_Dilmurod" },
    contact_info: { uz: "ALOQA\n\nDilmurod\n+998 88 980 60 09\n@Muzropov_Dilmurod", ru: "КОНТАКТЫ\n\nDilmurod\n+998 88 980 60 09\n@Muzropov_Dilmurod" },
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
    enter_category_name_uz: { uz: "Kategoriya nomini o'zbekcha kiriting:", ru: "Введите название на узбекском:" },
    enter_category_name_ru: { uz: "Kategoriya nomini ruscha kiriting:", ru: "Введите название на русском:" },
    enter_subcategory_name_uz: { uz: "Bo'lim nomini o'zbekcha kiriting:", ru: "Введите название подкатегории на узбекском:" },
    enter_subcategory_name_ru: { uz: "Bo'lim nomini ruscha kiriting:", ru: "Введите название на русском:" },
    enter_product_name_uz: { uz: "Mahsulot nomini o'zbekcha kiriting:", ru: "Введите название товара на узбекском:" },
    enter_product_name_ru: { uz: "Mahsulot nomini ruscha kiriting:", ru: "Введите название на русском:" },
    enter_product_description_uz: { uz: "Tavsifni o'zbekcha kiriting:", ru: "Введите описание на узбекском:" },
    enter_product_description_ru: { uz: "Tavsifni ruscha kiriting:", ru: "Введите описание на русском:" },
    enter_new_name_uz: { uz: "Yangi nomni o'zbekcha kiriting:", ru: "Введите новое название на узбекском:" },
    enter_new_name_ru: { uz: "Yangi nomni ruscha kiriting:", ru: "Введите новое название на русском:" },
    enter_new_description_uz: { uz: "Yangi tavsifni o'zbekcha kiriting:", ru: "Введите новое описание на узбекском:" },
    enter_new_description_ru: { uz: "Yangi tavsifni ruscha kiriting:", ru: "Введите новое описание на русском:" },
    send_multiple_media: { uz: "Rasm va videolarni yuboring → 'Tayyor' bosing", ru: "Отправьте фото и видео → нажмите 'Готово'" },
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
    no_categories: { uz: "Kategoriyalar yo'q", ru: "Категории не найдены" },
    no_subcategories: { uz: "Bo'limlar yo'q", ru: "Подкатегории не найдены" },
    no_products: { uz: "Mahsulotlar yo'q", ru: "Товары не найдены" },
    catalog: { uz: "Katalog", ru: "Каталог" },
    info: { uz: "Ma'lumot", ru: "О компании" },
    contact: { uz: "Aloqa", ru: "Контакты" }
  };
  return t[key]?.[lang] || t[key]?.uz || key;
}

// ===================== KEYBOARDS =====================
function getMainMenu(lang) {
  return Markup.keyboard([[getText(lang, 'catalog')], [getText(lang, 'info'), getText(lang, 'contact')]]).resize();
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

// ===================== BOT =====================
bot.start((ctx) => {
  ctx.reply(getText('uz', 'choose_language'), Markup.inlineKeyboard([
    [Markup.button.callback("O'zbek", "lang_uz")],
    [Markup.button.callback("Русский", "lang_ru")]
  ]));
});

bot.action("lang_uz", async (ctx) => { userLang[ctx.chat.id] = "uz"; await ctx.answerCbQuery(); await ctx.editMessageText(getText('uz', 'language_selected')); setTimeout(() => ctx.reply(getText('uz', 'main_menu'), getMainMenu('uz')), 500); });
bot.action("lang_ru", async (ctx) => { userLang[ctx.chat.id] = "ru"; await ctx.answerCbQuery(); await ctx.editMessageText(getText('ru', 'language_selected')); setTimeout(() => ctx.reply(getText('ru', 'main_menu'), getMainMenu('ru')), 500); });

bot.command("admin", (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'not_admin'));
  setMenu(ctx.chat.id, 'admin');
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'admin_panel'), getAdminMenu(userLang[ctx.chat.id] || "uz"));
});

bot.hears([/Ma'lumot/i, /О компании/i], (ctx) => ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'company_info')));
bot.hears([/Aloqa/i, /Контакты/i], (ctx) => ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'contact_info')));

// ===================== ADD =====================
bot.hears([/Kategoriya qo'shish/i, /Добавить категорию/i], (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  session[ctx.chat.id] = { step: "add_cat_uz" };
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'enter_category_name_uz'), Markup.inlineKeyboard([[Markup.button.callback(getText(userLang[ctx.chat.id] || "uz", 'back'), "admin_back")]]));
});

bot.hears([/Bo'lim qo'shish/i, /Добавить подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const cats = await getRootCategories();
  const lang = userLang[ctx.chat.id] || "uz";
  if (cats.length === 0) return ctx.reply(getText(lang, 'no_categories'));
  const btns = cats.map(c => [Markup.button.callback(lang === 'uz' ? c.name_uz : c.name_ru, `add_sub_to_${c.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(btns));
});

bot.action(/add_sub_to_(\d+)/, (ctx) => {
  session[ctx.chat.id] = { step: "add_sub_uz", parentId: ctx.match[1] };
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'enter_subcategory_name_uz'), Markup.inlineKeyboard([[Markup.button.callback(getText(userLang[ctx.chat.id] || "uz", 'back'), "admin_back")]]));
});

bot.hears([/Mahsulot qo'shish/i, /Добавить товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const subs = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL");
  const lang = userLang[ctx.chat.id] || "uz";
  if (subs.length === 0) return ctx.reply(getText(lang, 'no_subcategories'));
  const btns = subs.map(c => [Markup.button.callback(lang === 'uz' ? c.name_uz : c.name_ru, `add_prod_to_${c.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(btns));
});

bot.action(/add_prod_to_(\d+)/, (ctx) => {
  session[ctx.chat.id] = { step: "add_prod_uz", catId: ctx.match[1] };
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'enter_product_name_uz'), Markup.inlineKeyboard([[Markup.button.callback(getText(userLang[ctx.chat.id] || "uz", 'back'), "admin_back")]]));
});

// ===================== TEXT HANDLER =====================
bot.on("text", async (ctx) => {
  const s = session[ctx.chat.id];
  if (!s) return;
  const lang = userLang[ctx.chat.id] || "uz";
  const text = ctx.message.text;

  try {
    if (s.step === "add_cat_uz") { s.nameUz = text; s.step = "add_cat_ru"; return ctx.reply(getText(lang, 'enter_category_name_ru')); }
    if (s.step === "add_cat_ru") { await addCategory(s.nameUz, text); delete session[ctx.chat.id]; return ctx.reply(getText(lang, 'category_saved'), getAdminMenu(lang)); }

    if (s.step === "add_sub_uz") { s.nameUz = text; s.step = "add_sub_ru"; return ctx.reply(getText(lang, 'enter_subcategory_name_ru')); }
    if (s.step === "add_sub_ru") { await addCategory(s.nameUz, text, s.parentId); delete session[ctx.chat.id]; return ctx.reply(getText(lang, 'subcategory_saved'), getAdminMenu(lang)); }

    if (s.step === "add_prod_uz") { s.nameUz = text; s.step = "add_prod_ru"; return ctx.reply(getText(lang, 'enter_product_name_ru')); }
    if (s.step === "add_prod_ru") { s.nameRu = text; s.step = "add_desc_uz"; return ctx.reply(getText(lang, 'enter_product_description_uz')); }
    if (s.step === "add_desc_uz") { s.descUz = text; s.step = "add_desc_ru"; return ctx.reply(getText(lang, 'enter_product_description_ru')); }
    if (s.step === "add_desc_ru") { s.descRu = text; s.step = "add_media"; s.media = []; return ctx.reply(getText(lang, 'send_multiple_media'), Markup.inlineKeyboard([[Markup.button.callback("Tayyor", "save_product")], [Markup.button.callback(getText(lang, 'back'), "admin_back")]])); }

    // Edit
    if (s.step === "edit_cat_uz") { s.nameUz = text; s.step = "edit_cat_ru"; return ctx.reply(getText(lang, 'enter_new_name_ru')); }
    if (s.step === "edit_cat_ru") { await updateCategory(s.id, s.nameUz, text); delete session[ctx.chat.id]; return ctx.reply(getText(lang, 'category_updated'), getAdminMenu(lang)); }

    if (s.step === "edit_sub_uz") { s.nameUz = text; s.step = "edit_sub_ru"; return ctx.reply(getText(lang, 'enter_new_name_ru')); }
    if (s.step === "edit_sub_ru") { await updateCategory(s.id, s.nameUz, text); delete session[ctx.chat.id]; return ctx.reply(getText(lang, 'subcategory_updated'), getAdminMenu(lang)); }

    if (s.step === "edit_name_uz") { s.nameUz = text; s.step = "edit_name_ru"; return ctx.reply(getText(lang, 'enter_new_name_ru')); }
    if (s.step === "edit_name_ru") { const p = await getProductById(s.id); await updateProduct(s.id, s.nameUz, text, p.description_uz, p.description_ru); delete session[ctx.chat.id]; return ctx.reply(getText(lang, 'product_updated'), getAdminMenu(lang)); }

    if (s.step === "edit_desc_uz") { s.descUz = text; s.step = "edit_desc_ru"; return ctx.reply(getText(lang, 'enter_new_description_ru')); }
    if (s.step === "edit_desc_ru") { const p = await getProductById(s.id); await updateProduct(s.id, p.name_uz, p.name_ru, s.descUz, text); delete session[ctx.chat.id]; return ctx.reply(getText(lang, 'product_updated'), getAdminMenu(lang)); }

  } catch (e) { console.error(e); ctx.reply("Xatolik"); }
});

// ===================== MEDIA =====================
bot.on(['photo', 'video'], (ctx) => {
  const s = session[ctx.chat.id];
  if (!s || !['add_media', 'edit_media'].includes(s.step)) return;
  const file = ctx.message.photo ? ctx.message.photo.pop() : ctx.message.video;
  s.media = s.media || [];
  s.media.push({ file_id: file.file_id, type: ctx.message.photo ? 'photo' : 'video' });
});

bot.action("save_product", async (ctx) => {
  const s = session[ctx.chat.id];
  if (!s || s.step !== "add_media") return;
  const lang = userLang[ctx.chat.id] || "uz";
  const p = await addProduct(s.catId, s.nameUz, s.nameRu, s.descUz, s.descRu);
  s.media.forEach((m, i) => addProductMedia(p.id, m.file_id, m.type, null, null, i));
  delete session[ctx.chat.id];
  ctx.reply(getText(lang, 'product_saved'), getAdminMenu(lang));
});

bot.action("save_media_edit", async (ctx) => {
  const s = session[ctx.chat.id];
  if (!s || s.step !== "edit_media") return;
  const lang = userLang[ctx.chat.id] || "uz";
  await deleteProductMedia(s.id);
  s.media.forEach((m, i) => addProductMedia(s.id, m.file_id, m.type, null, null, i));
  delete session[ctx.chat.id];
  ctx.reply(getText(lang, 'media_updated'), getAdminMenu(lang));
});

// ===================== EDIT/DELETE =====================
bot.hears([/Tahrirlash/i, /Редактировать/i], (ctx) => { if (isAdmin(ctx.from.id)) { setMenu(ctx.chat.id, 'edit'); ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'select_edit_option'), getEditMenu(userLang[ctx.chat.id] || "uz")); } });
bot.hears([/O'chirish/i, /Удалить/i], (ctx) => { if (isAdmin(ctx.from.id)) { setMenu(ctx.chat.id, 'delete'); ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'select_edit_option'), getDeleteMenu(userLang[ctx.chat.id] || "uz")); } });

// Edit Category
bot.hears([/Kategoriya tahrirlash/i, /Редактировать категорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const cats = await getRootCategories();
  const lang = userLang[ctx.chat.id] || "uz";
  if (cats.length === 0) return ctx.reply(getText(lang, 'no_categories'));
  const btns = cats.map(c => [Markup.button.callback(lang === 'uz' ? c.name_uz : c.name_ru, `edit_cat_${c.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(btns));
});

bot.action(/edit_cat_(\d+)/, (ctx) => {
  session[ctx.chat.id] = { step: "edit_cat_uz", id: ctx.match[1] };
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'enter_new_name_uz'), Markup.inlineKeyboard([[Markup.button.callback(getText(userLang[ctx.chat.id] || "uz", 'back'), "admin_back")]]));
});

// Edit Subcategory
bot.hears([/Bo'lim tahrirlash/i, /Редактировать подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const subs = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL");
  const lang = userLang[ctx.chat.id] || "uz";
  if (subs.length === 0) return ctx.reply(getText(lang, 'no_subcategories'));
  const btns = subs.map(c => [Markup.button.callback(lang === 'uz' ? c.name_uz : c.name_ru, `edit_sub_${c.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(btns));
});

bot.action(/edit_sub_(\d+)/, (ctx) => {
  session[ctx.chat.id] = { step: "edit_sub_uz", id: ctx.match[1] };
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'enter_new_name_uz'), Markup.inlineKeyboard([[Markup.button.callback(getText(userLang[ctx.chat.id] || "uz", 'back'), "admin_back")]]));
});

// Edit Product
bot.hears([/Mahsulot tahrirlash/i, /Редактировать товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const subs = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL");
  const lang = userLang[ctx.chat.id] || "uz";
  if (subs.length === 0) return ctx.reply(getText(lang, 'no_subcategories'));
  const btns = subs.map(c => [Markup.button.callback(lang === 'uz' ? c.name_uz : c.name_ru, `edit_prod_cat_${c.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(btns));
});

bot.action(/edit_prod_cat_(\d+)/, async (ctx) => {
  const prods = await getProductsByCategory(ctx.match[1]);
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.answerCbQuery(); ctx.deleteMessage();
  if (prods.length === 0) return ctx.reply(getText(lang, 'no_products'));
  const btns = prods.map(p => [Markup.button.callback((lang === 'uz' ? p.name_uz : p.name_ru), `edit_prod_${p.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_product'), Markup.inlineKeyboard(btns));
});

bot.action(/edit_prod_(\d+)/, (ctx) => {
  session[ctx.chat.id] = { id: ctx.match[1] };
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'select_edit_option'), getProductEditMenu(userLang[ctx.chat.id] || "uz"));
});

bot.hears([/Nom tahrirlash/i, /Редактировать название/i], (ctx) => {
  if (!isAdmin(ctx.from.id) || !session[ctx.chat.id]?.id) return;
  session[ctx.chat.id].step = "edit_name_uz";
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'enter_new_name_uz'), Markup.inlineKeyboard([[Markup.button.callback(getText(userLang[ctx.chat.id] || "uz", 'back'), "admin_back")]]));
});

bot.hears([/Tavsif tahrirlash/i, /Редактировать описание/i], (ctx) => {
  if (!isAdmin(ctx.from.id) || !session[ctx.chat.id]?.id) return;
  session[ctx.chat.id].step = "edit_desc_uz";
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'enter_new_description_uz'), Markup.inlineKeyboard([[Markup.button.callback(getText(userLang[ctx.chat.id] || "uz", 'back'), "admin_back")]]));
});

bot.hears([/Rasm tahrirlash/i, /Редактировать фото/i], (ctx) => {
  if (!isAdmin(ctx.from.id) || !session[ctx.chat.id]?.id) return;
  session[ctx.chat.id].step = "edit_media"; session[ctx.chat.id].media = [];
  ctx.reply("Yangi media yuboring → 'Tayyor' bosing", Markup.inlineKeyboard([[Markup.button.callback("Tayyor", "save_media_edit")], [Markup.button.callback(getText(userLang[ctx.chat.id] || "uz", 'back'), "admin_back")]]));
});

// Delete
bot.hears([/Kategoriya o'chirish/i, /Удалить категорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const cats = await getRootCategories();
  const lang = userLang[ctx.chat.id] || "uz";
  if (cats.length === 0) return ctx.reply(getText(lang, 'no_categories'));
  const btns = cats.map(c => [Markup.button.callback(lang === 'uz' ? c.name_uz : c.name_ru, `del_cat_${c.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(btns));
});

bot.action(/del_cat_(\d+)/, async (ctx) => {
  await deleteCategory(ctx.match[1]);
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'category_deleted'), getAdminMenu(userLang[ctx.chat.id] || "uz"));
});

bot.hears([/Bo'lim o'chirish/i, /Удалить подкатегорию/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const subs = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL");
  const lang = userLang[ctx.chat.id] || "uz";
  if (subs.length === 0) return ctx.reply(getText(lang, 'no_subcategories'));
  const btns = subs.map(c => [Markup.button.callback(lang === 'uz' ? c.name_uz : c.name_ru, `del_sub_${c.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(btns));
});

bot.action(/del_sub_(\d+)/, async (ctx) => {
  await deleteCategory(ctx.match[1]);
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'subcategory_deleted'), getAdminMenu(userLang[ctx.chat.id] || "uz"));
});

bot.hears([/Mahsulot o'chirish/i, /Удалить товар/i], async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const subs = await db.all("SELECT * FROM categories WHERE parent_id IS NOT NULL");
  const lang = userLang[ctx.chat.id] || "uz";
  if (subs.length === 0) return ctx.reply(getText(lang, 'no_subcategories'));
  const btns = subs.map(c => [Markup.button.callback(lang === 'uz' ? c.name_uz : c.name_ru, `del_prod_cat_${c.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_subcategory'), Markup.inlineKeyboard(btns));
});

bot.action(/del_prod_cat_(\d+)/, async (ctx) => {
  const prods = await getProductsByCategory(ctx.match[1]);
  const lang = userLang[ctx.chat.id] || "uz";
  ctx.answerCbQuery(); ctx.deleteMessage();
  if (prods.length === 0) return ctx.reply(getText(lang, 'no_products'));
  const btns = prods.map(p => [Markup.button.callback(lang === 'uz' ? p.name_uz : p.name_ru, `del_prod_${p.id}`)]);
  btns.push([Markup.button.callback(getText(lang, 'back'), "admin_back")]);
  ctx.reply(getText(lang, 'select_product'), Markup.inlineKeyboard(btns));
});

bot.action(/del_prod_(\d+)/, async (ctx) => {
  await deleteProduct(ctx.match[1]);
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'product_deleted'), getAdminMenu(userLang[ctx.chat.id] || "uz"));
});

// ===================== CATALOG =====================
bot.hears([/Katalog/i, /Каталог/i], async (ctx) => {
  const cats = await getRootCategories();
  const lang = userLang[ctx.chat.id] || "uz";
  if (cats.length === 0) return ctx.reply(getText(lang, 'no_categories'));
  const btns = cats.map(c => [Markup.button.callback(lang === 'uz' ? c.name_uz : c.name_ru, `view_${c.id}`)]);
  ctx.reply(getText(lang, 'select_category'), Markup.inlineKeyboard(btns));
});

bot.action(/view_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  const cat = await getCategoryById(id);
  const subs = await getSubCategories(id);
  const prods = await getProductsByCategory(id);
  const lang = userLang[ctx.chat.id] || "uz";

  ctx.answerCbQuery(); ctx.deleteMessage();

  const btns = [];
  subs.forEach(s => btns.push([Markup.button.callback(lang === 'uz' ? s.name_uz : s.name_ru, `view_${s.id}`)]));
  prods.forEach(p => btns.push([Markup.button.callback(lang === 'uz' ? p.name_uz : p.name_ru, `prod_${p.id}`)]));
  btns.push([Markup.button.callback(getText(lang, 'back'), "back_to_menu")]);

  ctx.reply(lang === 'uz' ? cat.name_uz : cat.name_ru, Markup.inlineKeyboard(btns));
});

bot.action(/prod_(\d+)/, async (ctx) => {
  const p = await getProductById(ctx.match[1]);
  const media = await getProductMedia(p.id);
  const lang = userLang[ctx.chat.id] || "uz";

  ctx.answerCbQuery(); ctx.deleteMessage();

  const caption = `${lang === 'uz' ? p.name_uz : p.name_ru}\n\n${lang === 'uz' ? p.description_uz : p.description_ru || ''}`;
  const back = Markup.inlineKeyboard([[Markup.button.callback(getText(lang, 'back'), "back_to_menu")]]);

  if (media.length === 0) return ctx.reply(caption, back);
  if (media.length === 1) {
    const m = media[0];
    return m.media_type === 'photo'
      ? ctx.replyWithPhoto(m.file_id, { caption, ...back })
      : ctx.replyWithVideo(m.file_id, { caption, ...back });
  }
  const group = media.map((m, i) => ({ type: m.media_type, media: m.file_id, caption: i === 0 ? caption : '' }));
  await ctx.replyWithMediaGroup(group);
  ctx.reply("Orqaga", back);
});

// ===================== NAVIGATION =====================
bot.hears([/Orqaga/i, /Назад/i], (ctx) => {
  delete session[ctx.chat.id];
  setMenu(ctx.chat.id, 'main');
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'main_menu'), getMainMenu(userLang[ctx.chat.id] || "uz"));
});

bot.action("admin_back", (ctx) => {
  delete session[ctx.chat.id];
  setMenu(ctx.chat.id, 'admin');
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'admin_panel'), getAdminMenu(userLang[ctx.chat.id] || "uz"));
});

bot.action("back_to_menu", (ctx) => {
  delete session[ctx.chat.id];
  setMenu(ctx.chat.id, 'main');
  ctx.answerCbQuery(); ctx.deleteMessage();
  ctx.reply(getText(userLang[ctx.chat.id] || "uz", 'main_menu'), getMainMenu(userLang[ctx.chat.id] || "uz"));
});

bot.launch().then(() => console.log("Bot ishga tushdi!"));
