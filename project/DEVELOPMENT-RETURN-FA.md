# بازگرداندن تغییرات این بسته

منبع قابل‌ویرایش همین پوشهٔ `project` است و `combine-source.json` مبنای آن را مشخص می‌کند. برای شروع `LOCAL-DEVELOPMENT-FA.md` را بخوانید. اسکیل‌ها و helper رسمی در همین پوشه قرار دارند.

از یک پوشه بالاتر، پس از تغییر و نوشتن شرح تغییرات بیرون project، اجرا کنید:

```powershell
.\Build-Return.cmd --notes .\changes.txt
```

این فرمان آزمون‌ها را اجرا و پوشه و ZIP تحویل را در `returns` می‌سازد. فقط ZIP تغییرات را برگردانید. فایل شناسنامهٔ مبنا و فایل‌های مرجع نباید تغییر کنند. برای حذف عمدی، از آرایهٔ JSON بیرون project و گزینهٔ `--deletions PATH` استفاده کنید.

فرمان مستقیم helper رسمی در خود `project` نیز چنین است؛ مسیر خروجی حتماً بیرون آن باشد:

```powershell
node .agents/skills/combine-release/scripts/development-bundle.mjs submit --workspace . --output ../returns/manual-submission --notes ../changes.txt
```

این منبع مخصوص توسعهٔ ابزار است؛ نسخه و نصب محصول در این مرحله تعیین نمی‌شود. تغییر ضروری هسته/خانه نیازمند دریافت مبنای دارای مجوز همان اجزا است.
