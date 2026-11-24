-- Reference data: booking window, price and the recurring weekly menu.

insert into public.app_settings (id, price_per_day_irt, min_lead_days, max_advance_days)
values (1, 100000, 1, 14)
on conflict (id) do nothing;

insert into public.weekly_menu (weekday, main_dish, side_or_drink, tag, is_enabled)
values
  (0, 'چلوکباب کوبیده ویژه', 'دوغ محلی و ماست خیار', 'محبوب', true),
  (1, 'قرمه‌سبزی با برنج ایرانی', 'سالاد شیرازی و نوشابه', 'سنتی', true),
  (2, 'زرشک‌پلو با مرغ زعفرانی', 'ماست و نعناع', 'پیشنهاد سرآشپز', true),
  (3, 'خورشت قیمه سیب‌زمینی', 'دوغ و ترشی لیته', 'کلاسیک', true),
  (4, 'جوجه کباب بدون استخوان', 'کره، سماق و نوشیدنی', 'سبک', true),
  (5, 'عدس‌پلو با گوشت چرخ‌کرده', 'سالاد فصل و دوغ', 'خانگی', true),
  (6, 'تعطیل هفتگی (جمعه)', null, null, false)
on conflict (weekday) do nothing;
