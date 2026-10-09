# `dsh-notify-ar` — ملف تسليم (HANDOFF)

> **كيف تكمّل:** افتح محادثة جديدة بنفس الـworkspace وقل:
> «اقرأ `Projects\notify-ar\README.md` ونفّذ مرحلة الفحوصات (Probe 1‑3)».
> هي المحادثة صارت مرجع فقط — لا نكمّل فيها مشان التوفير.

**التاريخ:** 2026-10-09 · **الحالة:** موافقة على الـSpike (فحص إمكانية) — لسا ما انكتب ولا سطر منتج.

---

## 1) الفكرة (طلب قصي الحرفي)
إضافة إشعارات فيها **أزرار**: تضغط الزر من الإشعار ⇒ الوكيل **يكمّل شغله بالخلفية** بلا ما تفتح التطبيق.
- **لغتين:** عربي + إنجليزي.
- **الهدف النهائي:** نشتغل عليها، نتحقق من صلاحيتها، وبعدها **ننشرها على npm/GitHub**.
- **السياق:** `dsh-notify` (المثبَّتة عندنا) نصوصها **صيني hard-coded** والضغط على الإشعار **ما بيعمل شي**.

## 2) أدلة مثبَّتة (كلها متحقَّق منها اليوم — لا تعيدها)
من `C:\Users\qusay\.dsh\profiles\desktop\node_modules\dsh-notify\lib\index.js`:
- **L369‑375**: نصوص الإشعارات الصينية ثابتة (`任务完成` · `任务已停止` · `任务出错` · `达到输出上限` · `回合被阻断` · `在等你选择` · `会话已关闭`).
- **L129**: الإشعار يُبنى بـ`activationType="background"` ⇒ **الضغط لا يفعّل أي إجراء** (تعليق المطوّر L110).
- **L314‑316**: نصوص أيقونة الصينية كمان صينية (`dsh 后台运行中` · `打开 dsh` · `关闭进程`).
- **إعداداتها الموجودة فقط** (`DEFAULT_CONFIG`): `enabled` · `tray` · `rootsOnly` · `notifyFinished/Aborted/Error/Waiting/Disposed` · `cooldownMs` · `titlePrefix` · `iconPath` · `webUrl` · `aumid` · `summaryMaxChars` · `powershellPath`.
- **⚠️ خطأ بالإعداد الافتراضي:** `webUrl: 'http://127.0.0.1:3080'` بينما التطبيق عندنا على **`http://127.0.0.1:19387`** ⇒ بند «Open dsh» بيفشل.
- ترخيصها **MIT** (Copyright 2026 Pasumao) ⇒ الاقتباس مسموح بشرط الإشارة.

من ريجستري ويندوز (`HKCU:\Software\Classes\dsh\shell\open\command`):
```
"C:\Users\qusay\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe" "%1"
```
- **مجرَّب فعلياً:** `Start-Process 'dsh://open'` ⇒ **ما انفتحت نسخة تانية** (نفس الـPIDs) ⇒ التطبيق single-instance وبيستقبل الطلب.

من جوّا `app.asar` (استعمل `tmp\asar-lit.mjs` للبحث و `tmp\asar-get.mjs` لاستخراج ملف):
- `dsh/node_modules/@deepseek-ai/dsh-api-session-controller/README.md`: خدمة Host اسمها **`ctx.sessionController`** = «create, resume, **prompt**, follow history» + Client methods `session.create` · `session.list` · `session.beginSubmission` · `session.projections`.
- `dsh/node_modules/@deepseek-ai/dsh-agent-loop/README.md`: فيه **steering** — «tool calls or steering continue the current turn» ⇒ حقن رسالة بجولة شغّالة ممكن.
- `@agentclientprotocol/sdk` موجود مع `session/prompt` + أمثلة `http-client.js` / `ws-client.js` ⇒ طريق احتياطي.
- **سيرفر الواجهة `127.0.0.1:19387` بده توثيق**: `node -e "fetch('http://127.0.0.1:19387/').then(r=>console.log(r.status))"` ⇒ **401** (`dsh web authentication required`) ⇒ لا نعتمد عليه.
- 🎁 DSH فيه محرّك صوت محلي جاهز بالحزمة: `dsh/node_modules/sherpa-onnx-win-x64` (منفيده للموجة C لاحقاً).

مراجع مايكروسوفت (بدعم الأزرار للتطبيقات غير المعبّأة):
- https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/toast-desktop-apps
- https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/toast-schema

## 3) القيد الصريح (لا تنساه بالتصميم)
- **الأزرار تشتغل بس إذا التطبيق شغّال (ولو مصغّر)** — الوكيل عايش بجوّا عملية التطبيق. إذا التطبيق مسكّر: الزر بس **يفتحه**.
- الإضافات تتثبّت **برا DSH** (جوّا التطبيق يطلع `EPERM` على `package.json.lock`) + **إعادة تشغيل** بعد كل تثبيت.
- كتابة على `D:` بده تصريح `danger-full-access` · Shell = PowerShell 5.1 · `.ps1` غير ASCII بده UTF-8 BOM.

## 4) الفحوصات الثلاثة (المعتمدة — نفّذها بالترتيب، كلها throwaway)
**Probe 1 — هل يعرض ويندوز أزرار؟**
إشعار تجريبي بـAUMID تبع PowerShell 5.1 (نفس اللي تستعمله dsh-notify) + زرّين:
```xml
<toast>
  <visual><binding template="ToastGeneric">
    <text>dsh — تجربة أزرار</text><text>اضغط زر وشوف شو يصير</text>
  </binding></visual>
  <actions>
    <action content="فتح التطبيق" activationType="protocol" arguments="dsh://open" />
    <action content="تسجيل فقط"  activationType="protocol" arguments="dshxtest://ping?btn=b2" />
  </actions>
</toast>
```
النتيجة المطلوبة: **تظهر الأزرار** فعلاً (وإذا ما ظهرت، نجرب بدون `scenario="reminder"`).

**Probe 2 — هل توصل الضغطة مع بياناتها؟**
- سجّل مخطّط مؤقت: `HKCU\Software\Classes\dshxtest` + `shell\open\command` = `powershell -NoProfile -ExecutionPolicy Bypass -File <path>\on-click.ps1 "%1"`.
- `on-click.ps1` يضيف سطر JSON للملف `%LOCALAPPDATA%\dsh-notify-ar\clicks.jsonl` (وقت + الزر + args).
- اضغط الزر «تسجيل فقط» بالمصغّر/من مركز الإشعارات ⇒ لازم يطلع سطر بالملف.
- **تنظيف:** احذف فرع الريجستري المؤقت بعد الفحص.

**Probe 3 — هل نقدر نحقن رسالة بجلسة شغّالة؟**
- POC إضافة host صغيرة (مجلد مؤقت) بتقرأ `clicks.jsonl` (بالـ`fs.watch`) وبتنادي الخدمة المناسبة (`ctx.sessionController` أو steering) لإرسال «كمّل» أو جواب اختيار.
- **أول خطوة:** استخرج `docs/subsystems/core.md` + `dsh-api-session-controller/lib/types/**` من الـasar (`node tmp\asar-get.mjs <asar> <path> <out>`) لتحديد اسم الدالة بدقة قبل ما نكتب POC.
- إذا فشل: البديل ACP (`session/prompt`) أو emit نفس أحداث الـcomposer.

**تقرير النتيجة:** توصية (ممكن/مش ممكن + شنو الطريق) — وبعدها نصنّف المشروع كـ**Architectural** (spec مكتوب ⇒ plan ⇒ بناء ⇒ نشر).

## 5) لمحة النشر (بعد ما تنجح الفحوصات)
- **ميزة السبق:** 33+ إضافة إشعارات بالسوق و**ولا وحدة عربية** ⇒ «Arabic-first actionable notifications» فاضي.
- أسماء مقترحة (لازم نتحقق من توفّرها على npm وقت الإنشاء): `dsh-notify-ar` · `dsh-toast-ar` · `dsh-notify-interactive`.
- الترخيص: MIT. البنية: bundle patch + host (مراقبة الملف + الحقن) + سكربت الزر (PowerShell خفيف) + i18n (`ar`/`en`) مع دعم RTL.

## 6) حالة الشغل العامة (ما عدا هذا المشروع)
- ✅ **الموجة 0**: نسخ احتياطية + سكربتات استرجاع — `setup-toolkit\` (+ 4 نسخ backups).
- ✅ **الموجة A**: `@hyzyn/dsh-safe` (أداة CLI وليست إضافة) + `dsh-config-manager`.
- ✅ **الموجة B**: `dsh-free-search` + `dsh-notify` (و`dsh-win32` **مرفوضة** من DSH: peer range قديم).
- ✅ **المهارات**: +3 (21 سليمة / 0 مكسورة) · ✅ **الذاكرة**: سطر اللهجة السورية انطبق بالحقن.
- ⏳ **الموجة C (الصوت/Whisper)**: مؤجّلة بموافقة قصي — تحقّق من `@goodandready/dsh-voice` + `sherpa-onnx` قبل التثبيت.
- ⏳ **مشروع `dsh-buttons` على GitHub**: البحث عن طريقة الرفع (بلا `.git` محلي، `git` محجوب، بدنا PAT) — مؤجّل.
- ⏳ **فكرة `dsh-arabic-plus`** (طبقة المحتوى العربي: قوالب/أرقام/تواريخ/تشكيل طرفية): بانتظار الأولوية.

## 7) أدوات جاهزة بالـworkspace (استعملها بلا ما تعيد كتابتها)
- `tmp\asar-lit.mjs` → `node tmp\asar-lit.mjs "<app.asar>" "literal1" "literal2"` يبحث بالحزمة.
- `tmp\asar-get.mjs` → `node tmp\asar-get.mjs "<app.asar>" "dsh/path/file" "out\file"` يستخرج ملف.
- `tmp\asar-ls.mjs` ملفات داخل الـasar · `tmp\npm-peer-compat.mjs` فحص توافق إصدارات إضافة مع نسخة DSH.
- `setup-toolkit\install-wave.ps1` لتثبيت أي إضافة (مع نسخة احتياطية تلقائية) + `restore-profile.ps1` للرجوع.
- `app.asar` = `C:\Users\qusay\AppData\Local\Programs\DeepSeek Harness\resources\app.asar`
