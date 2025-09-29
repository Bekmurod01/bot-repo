bot.action(/view_cat_(\d+)/, async (ctx) => {
  const categoryId = parseInt(ctx.match[1], 10);

  try {
    const category = await getCategoryById(categoryId);
    if (!category) {
      await ctx.answerCbQuery().catch(() => {});
      return ctx.reply("❌ Kategoriya topilmadi");
    }

    const subCategories = await getSubCategories(categoryId);
    const products = await getProductsByCategory(categoryId);
    const lang = (userLang && userLang[ctx.chat?.id]) ? userLang[ctx.chat.id] : "uz";

    await ctx.answerCbQuery().catch(() => {});
    // Ba'zan deleteMessage muvaffaqiyatsiz tugashi mumkin, shu uchun try/catch
    try { await ctx.deleteMessage(); } catch (e) {}

    if (!session[ctx.chat.id]) session[ctx.chat.id] = {};
    if (!session[ctx.chat.id].categoryPath) session[ctx.chat.id].categoryPath = [];
    const path = session[ctx.chat.id].categoryPath;

    // path ichidagi idlarni son qilib solishtiramiz
    if (!path.some(cat => Number(cat.id) === categoryId)) {
      path.push(category);
    }

    const buttons = [];

    // Sub-kategoriyalar tugmalari
    if (subCategories && subCategories.length > 0) {
      subCategories.forEach((c) => {
        const categoryName = lang === 'uz' ? (c.name_uz || c.name_ru) : (c.name_ru || c.name_uz);
        buttons.push([ Markup.button.callback(`📁 ${categoryName}`, `view_cat_${c.id}`) ]);
      });
    }

    // Mahsulotlar tugmalari
    if (products && products.length > 0) {
      products.forEach((p, index) => {
        const productName = lang === 'uz' ? (p.name_uz || p.name_ru) : (p.name_ru || p.name_uz);
        buttons.push([ Markup.button.callback(`${index + 1}. ${productName || 'Nomsiz'}`, `view_product_${p.id}`) ]);
      });
    }

    // Orqaga tugma (yo'lga qarab)
    if (path.length > 1) {
      const parentCategory = path[path.length - 2];
      buttons.push([ Markup.button.callback(getText(lang, 'back'), `back_to_cat_${parentCategory.id}`) ]);
    } else {
      buttons.push([ Markup.button.callback(getText(lang, 'back'), "back_to_menu") ]);
    }

    const currentCategoryName = lang === 'uz' ? (category.name_uz || category.name_ru) : (category.name_ru || category.name_uz);

    if ((subCategories && subCategories.length > 0) || (products && products.length > 0)) {
      await ctx.reply(`📂 ${currentCategoryName}`, Markup.inlineKeyboard(buttons));
    } else {
      await ctx.reply(getText(lang, 'no_products'), Markup.inlineKeyboard(buttons));
    }

  } catch (error) {
    console.error("Katalog ko'rishda xato: ", error);
    try { await ctx.reply("❌ Xatolik yuz berdi"); } catch(e) {}
  }
});
