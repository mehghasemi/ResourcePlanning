# نقشهٔ بستهٔ توسعهٔ برنامه ریزی پروژه های استقرار

ابتدا `LOCAL-DEVELOPMENT-FA.md`، سپس فقط اسکیل مرتبط را بخوانید. این بسته کد کامل همین ابزار و وابستگی‌های مرجع لازم را دارد؛ کپی کامل سرور چندابزاری نیست.

- رابط: `platform/public/deploymentplan.html`، `deploymentplan-ui.mjs`، `deploymentplan-view.mjs`، `deploymentplan.css` و لوگوی یشمی `deploymentplan-icon.svg`.
- منطق برنامه: `platform/deploymentplan-engine.mjs`؛ نیم‌روز، بلوک، تخصص، تخصیص، قطعی‌سازی، درخواست، سوئیچ، تداخل، آرشیو و تاریخچه.
- CRM: `platform/deploymentplan-crm.mjs`؛ metadata، وضعیت‌ها، صفحه‌بندی کامل، هفته و مجوز خواندن رکوردها.
- API: `platform/deploymentplan-http.mjs`؛ نقش، کنترل هویت جاری، هم‌زمانی و بازخوانی.
- اکسل: `platform/deploymentplan-import.mjs` و `deploymentplan-reconciliation.mjs`؛ ورود دادهٔ آماده‌شده، حفظ سلول و شاهد و تعیین تکلیف. خواندن فایل خام اکسل در رابط فعلی وجود ندارد؛ برای نمونهٔ قرارداد ورودی، `dev/sample.mjs` را ببینید.
- آزمون‌ها: پنج فایل `platform/deploymentplan-*.test.mjs` با پوشش نقش و دسترسی، و آزمون مشترک `organization-account.test.mjs`؛ اجرای محلی نیز `dev/host.test.mjs` دارد.
- نیازمندی‌های اولیه: `platform/tools/deploymentplan/Deployment_FRD_v2.0.md` و `Codex_Guide.md`. این سندها مرجع دامنه‌اند؛ درخواست جدید کاربر و قواعد بسته مقدم‌اند.
- قرارداد اتصال مشترک: `platform/platform-access.mjs`، `organization-account.mjs`، `organization-http.mjs`، `organization-reader.mjs`، `crm-user.mjs`، `crm-read-policy.mjs` و `workspace-store.mjs` مرجع‌اند.
- اتصال به محصول: ثبت عنوان/مالکیت در `platform/component-catalog.mjs`، کارت خانه در `platform/home.mjs`، نقش در `platform/platform-access.mjs`. اینها همراه بسته برای فهم اتصال آمده‌اند؛ برای تغییر مشترک باید محدودهٔ منبع جداگانه باز شود.
- طراحی: `design-system/STANDARD.md` و فایل‌های همان پوشه؛ قالب و پوسته در `.agents/skills/combine-ui/assets`؛ نمونهٔ Home و میزکار در `reference/ui`.
- اسکیل‌ها: تغییر ابزار `combine-ui`، ساخت ابزار تازه `combine-tool`، تحویل تغییرات `combine-release` در `.agents/skills`.
- اجرای محلی: `dev/host.mjs` همان API و موتور محصول را با ورودی توسعه اجرا می‌کند. `dev/sample.mjs` فقط دادهٔ ساختگی می‌سازد. `dev/home.*` ورودی مستقل توسعه است و جایگزین خانهٔ محصول نیست.
- موجودی و محدودهٔ ویرایش: `combine-source.json`؛ مشخصات کیت: `combine-kit.json`؛ متن شروع GPT در `GPT-PROMPT-FA.txt`.
- فرمان‌های کاربر: در یک پوشه بالاتر، `Start.cmd`، `Start-Live-CRM.cmd`، `Stop.cmd`، `Verify.cmd` و `Build-Return.cmd`.

هیچ فایل داده، حساب، تنظیمات خصوصی، اکسل اصلی یا کش CRM صاحب ابزار داخل این بسته نیست. داده‌های اجرای دریافت‌کننده بیرون `project` و در `.local-data` ساخته می‌شوند؛ خروجی تغییرات نیز بیرون آن و در `returns` می‌ماند.

- پیکربندی اعتبارسنجی‌ها: فهرست `validationRules`، حالت‌های `validationPolicies` و اجرای اتمی قواعد در `platform/deploymentplan-engine.mjs`؛ منوی «پیکربندی سیستم» در رابط، با ثبت مدیریتی از اقدام `validation-settings`.
