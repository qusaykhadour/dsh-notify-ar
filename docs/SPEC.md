# `dsh-notify-ar` — SPEC (المواصفة)

> **الحالة:** الفحوصات خلصت كلها ✅ (شوف `PROBE-REPORT.md`). هي المواصفة مبنية **على أدلة تنفيذ فعلية**، مو على وثائق.
> **التصنيف:** Architectural — spec ⇒ plan ⇒ build ⇒ publish.
> **آخر تحديث:** 2026-10-09 · **المنصة:** Windows 10 (10.0.19045) · DSH desktop profile.

---

## 0) الجملة الواحدة

إشعارات ويندوز الأصلية لـDSH **فيها أزرار شغّالة**، بواجهة **عربي/إنجليزي**، وأهم زر فيها:
**الموافقة/الرفض على طلبات الأذونات** — بلا ما تفتح التطبيق.

## 1) المشكلة والفرق

| `dsh-notify` (الموجودة) | `dsh-notify-ar` (منتجنا) |
|---|---|
| نصوص **صينية hard-coded** (L369‑375 · L314‑316) | i18n `ar`/`en` + RTL · **الافتراضي = لغة التطبيق** |
| `activationType="background"` ⇒ **الضغط ما بيعمل شي** (L129) | أزرار `protocol` ⇒ كل ضغطة **تنفّذ إجراء** |
| `webUrl: http://127.0.0.1:3080` (بورت خطأ) | بيتقرو من بيئة DSH الفعلية (`DSH_WEB_URL`) |
| إشعار = «خلص الشغل» فقط | إشعار = **قرار**: موافقة · رفض · تابع · وقّف · افتح |
| ما بتدعم RTL | RTL مضبوط بالعربي + أسماء أدوات/مسارات LTR |
| **بتستعير هوية PowerShell** (`lib/index.js:55‑56` ⇒ إشعاراتها تنخلط بمخزن PowerShell، ولاحظناها فعلياً: 12 إشعار تحته) | **AUMID خاص** (`Qusay.DshNotifyAr`) ⇒ مخزن نظيف ومستقل |

**ميزة السبق:** 33+ إضافة إشعارات بالسوق و**ولا وحدة عربية**، وولا وحدة بتخليك **توافق على الأذونات من الإشعار**.

## 2) الميزات (مرتبة بالأولوية)

### 🥇 F1 — أزرار الأذونات (الميزة الأهم)
لما الوكيل يطلب إذن (sandbox escalation · موافقة أداة)، بدل ما توقف الشغل وترجع للتطبيق:
إشعار فيه **«موافق»** / **«رفض»** ⇒ القرار يرجع للوكيل فوراً وهو شغّال.
- المصدر: `ctx.on('approval/request', (request, next) => …)` (waterfall).
- الإجابة: `'allowed-once'` (الوحيد يلي بيمنح) · `'rejected'` · `'cancelled'` · `'unavailable'`.
- **Timeout ⇒ `next()`** (نرجع للواجهة داخل التطبيق) — ما منسدّ الباب أبداً.
- **fail-closed:** إذا فشلنا، الرد `unavailable` ⇒ الأمان محفوظ.

### 🥈 F2 — تابع / وقّف (التحكم من الإشعار)
- **«تابع»** ⇒ `ctx.sessionController.prompt({sessionId, requestId, content:[{type:'text',text}]}, signal)`.
  - `mode:'steer'` ⇒ يدخل بالنص الجاري · بدونه ⇒ `followup`.
  - ✅ **مجرَّب حي**: `{"accepted":true}` والرسالة وصلت للمحادثة.
- **«وقّف»** ⇒ `ctx.sessionController.cancel({ sessionId })` ⇒ `{ accepted: true }`.
  - كود DSH الفعلي: `agent.cancel({ kind: "user" }, { keepInbox: true })` — **يلغي الجولة الجارية وبيحتفظ بطابور الانتظار** (sc-index.js:994‑1000 · سطح الخدمة 3121).
  - ✅ **فحص حي ناجح (Probe 5)**: ضغطة الإشعار ⇒ `action=cancel` ⇒ `stage: cancelled` ⇒ `{"accepted": true}`.

### 🥉 F3 — افتح التطبيق
- `dsh://open` ⇒ `focusPrimaryWindow()` (`lib/main.js:12192`).
- **لا** نستعمل `webUrl` — السيرفر `127.0.0.1:19387` بده توثيق (401).
- نقرأ `DSH_WEB_URL` من البيئة للعرض/النسخ فقط، مو للفتح.

### F4 — إشعارات الحالة (أساس `dsh-notify`)
خلص · انلغى · خطأ · وصل حد المخرجات · بانتظار اختيار · الجلسة مسكّرة — بس **بالعربي/الإنجليزي** و**بأزرار**.

## 3) البنية المعمارية (4 قطع — كلها مثبتة)

```
┌─ DSH (host plugin: dsh-notify-ar) ─────────────────────────────┐
│  • يبني الـXML بـi18n + RTL + nonce                            │
│  • يرسل الإشعار عبر powershell -EncodedCommand (base64 UTF-16LE)│
│  • يراقب ملف الضغطات (byte-offset tail)                        │
│  • يتحقق من الـnonce ⇒ ينفّذ: prompt / cancel / approval        │
└────────────────────────────────────────────────────────────────┘
        │ يرسل XML                        ▲ يقرأ الضغطات
        ▼                                 │
┌─ Windows Toast ─────────┐   ┌─ click-gateway.exe ─────────────┐
│ <toast scenario=         │   │ هدف التنشيط الوحيد يلي بيشتغل   │
│   "reminder"             │──▶│ • ياخد "%1" (الـURI)            │
│   activationType=        │   │ • يكتب سطر JSONL + قفل ACL      │
│   "background">          │   └─────────────────────────────────┘
│  <actions><action        │              ▲
│   activationType=        │              │ protocol: dshnar://
│   "protocol" …/></actions│        HKCU\Software\Classes\dshnar
└──────────────────────────┘              ▲
                            AUMID مسجّل (Start Menu shortcut
                            + System.AppUserModel.ID + PROPVARIANT 24B)
```

### 3.1 القواعد الأربعة (إلزامية — من الفحوصات)

1. **جذر الـXML:** `<toast scenario="reminder" activationType="background">` — بدونه ويندوز **بيرمي الإشعار بصمت**. `&` ⇒ `&amp;`. **الإشعار بيختفي بعد أول ضغطة** ⇒ **زر فعّال واحد لكل إشعار** (قرار تصميمي: إشعار واحد لكل قرار).
2. **AUMID:** لازم shortcut بمجلد Start Menu عليه `System.AppUserModel.ID` (PKEY `{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}` pid `5`) عبر `SHGetPropertyStoreFromParsingName` + `IPropertyStore`. **`PROPVARIANT` = 24 بايت على x64** (16 ⇒ ختم فاضي بصمت). + `HKCU\Software\Classes\AppUserModelId\<aumid>` بـ`DisplayName`.
3. **هدف التنشيط لازم exe حقيقي:** `powershell.exe` و`cmd.exe` **ما بينشغّلوا أبداً** من الإشعار. الريجستري متطابق ⇒ الفرق نوع الملف. سياق التنشيط: `cwd=C:\Windows\system32` ⇒ **مرّر مسارات absolute كوسائط**.
4. **الحقن:** `prompt(request, signal)` — **`signal` إلزامي** (`throwIfAborted()` أول سطر). `create(request)` ما بدها signal. `requestId` مكرر ⇒ `{accepted:true}` (idempotent).

## 4) الأمان (بند إلزامي — مو اختياري)

جسر الضغطات **ملف نصي**: أي عملية على الجهاز بتقدر تكتب فيه ⇒ **بتقدر تحقن تعليمات بالوكيل**.

| الطبقة | الإجراء |
|---|---|
| 1 · عزل | مجلد `%LOCALAPPDATA%\dsh-notify-ar\` بـACL: المالك + SYSTEM فقط، لا `Users` write |
| 2 · nonce | كل إشعار يحمل `nonce` عشوائي (128-bit) داخل الـURI — الإضافة بتحتفظ بمجموعة الـnonce الحيّة وترفض أي URI ما بيطابقها |
| 3 · صلاحية | nonce عمره = عمر الإشعار (بينمحي بعد أول استخدام) ⇒ **replay مستحيل** |
| 4 · عدم ثقة | أي سطر بالملف ما بينطابق مع nonce معلّق ⇒ **يتجاهل بصمت + ينسجّل بالـdiag log** |
| 5 · حدود | الإجراءات المسموحة whitelist: `prompt` · `cancel` · `approve` · `reject` · `open` — ولا إجراء ثاني |

> ملاحظة: نفس الخطر قائم بأي قناة محلية مفتوحة (حتى `dsh-notify`). الفرق إننا **منعالجه بالتصميم**.

## 5) الواجهة (i18n + RTL)

- **اللغة الافتراضية = لغة تطبيق DSH** (تُقرأ من إعدادات الواجهة/الـlocale، مو hard-coded).
- حزم: `ar` · `en` — مع إمكانية زيادة لاحقاً.
- **عربي:** RTL كامل + تسميات عربية.
- **إنجليزي:** LTR.
- **قاعدة الخلط:** النص العربي RTL، بس **أسماء الأدوات والمسارات والأوامر LTR** (عزل ثنائي الاتجاه: `\u202B`/`\u202C` أو `<p dir="rtl">`).

| المفتاح | عربي | English |
|---|---|---|
| `approval.title` | `طلب إذن` | `Permission request` |
| `approval.body` | `الوكيل بده إذن: {tool}` | `Agent needs approval: {tool}` |
| `approval.allow` | `موافق` | `Allow` |
| `approval.reject` | `رفض` | `Reject` |
| `action.continue` | `تابع` | `Continue` |
| `action.stop` | `وقّف` | `Stop` |
| `action.open` | `افتح التطبيق` | `Open app` |
| `status.finished` | `خلص الشغل` | `Finished` |
| `status.aborted` | `انلغى` | `Aborted` |
| `status.error` | `صار خطأ` | `Error` |
| `status.limit` | `وصل حد المخرجات` | `Output limit reached` |
| `status.waiting` | `بانتظار اختيارك` | `Waiting for your choice` |
| `status.disposed` | `الجلسة مسكّرة` | `Session closed` |

## 6) التثبيت (تدفق مقترح)

```
dsh plugin --profile desktop add dsh-notify-ar
        │
        ├─ 1. ينسخ ملفات الإضافة (lib · assets · scripts)
        ├─ 2. postinstall: يترجم click-gateway.exe عبر csc.exe المحلي ✅ (قرار مثبّت D1)
        │      C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /target:winexe
        ├─ 3. يسجّل AUMID (shortcut + PROPVARIANT 24B + مفتاح العرض)
        ├─ 4. يسجّل البروتوكول HKCU\Software\Classes\dshnar
        └─ 5. إعادة تشغيل DSH (ما في hot reload لإضافات الـprofile)
```

**بدائل لو رفض قصي الترجمة وقت التثبيت:**

| البديل | الحسنات | السيئات |
|---|---|---|
| A · ترجمة وقت التثبيت (`csc.exe`) | بلا تحميل، بلا ثقة بطرف تالت | بدو `csc.exe` (موجود بويندوز افتراضياً) |
| B · exe جاهز بالحزمة | تثبيت فوري | ملف ثنائي بالـnpm (بعض الناس ما بتحبه) |
| C · تشغيل **مرة واحدة** بسكربت | أوضح للمستخدم | خطوة يدوية زيادة |

## 7) الحدود المعروفة (نقولها بالـREADME مشان الصدق)

- **الأزرار بتشتغل بس إذا التطبيق شغّال** (ولو مصغّر) — الوكيل عايش جوّا العملية. إذا مسكّر: الزر بس بيفتحه.
- **زر فعّال واحد لكل إشعار** (ويندوز بيمحي الإشعار بعد أول ضغطة) ⇒ إشعار واحد لكل قرار.
- الكتابة بالريجستري و`CreateToastNotifier` **ممنوعين جوّا sandbox DSH** ⇒ التثبيت بدو صلاحية أوسع.
- ما في hot reload لإضافات الـprofile ⇒ **كل تعديل كود بدو إعادة تشغيل DSH**.

## 8) خطة التنفيذ (مراحل)

| المرحلة | الشغل | معيار القبول |
|---|---|---|
| **P1** | ~~Probe 5: فحص حي لـ`cancel()`~~ | ✅ **خلص** — `{"accepted":true}` |
| **P2** | هيكل الحزمة + i18n (`ar`/`en`) + كاشف لغة التطبيق | ✅ **خلص** — i18n مجرَّب |
| **P3** | `click-gateway.exe` (C#) + ترجمة + تسجيل AUMID/protocol | ✅ **خلص** — التثبيت نجح |
| **P4** | الإضافة: إرسال الإشعارات + nonce + قارئ الضغطات | ✅ **خلص** — 9/9 PASS |
| **P6** | F2 تابع/وقّف + F3 افتح + F4 الحالة | ✅ **خلص حي** — شوف تحت |
| **P5** | **F1 الأذونات**: `ctx.on('approval/request')` + timeout⇒`next()` | ✅ **خلص حي** — شوف تحت |
| **P7** | `README.md` + `README.en.md` + `LICENSE` + CHANGELOG | ⏳ |
| **P8** | تنظيف آثار الفحص + نشر npm/GitHub | ⏳ |

### 🔴 أخطر اكتشاف تقني: `prepend: true` إلزامي

`approval/request` **لازم** يتسجّل بـ`{ prepend: true }`. السبب من كود DSH:

```js
// @deepseek-ai/dsh-api-remotes/lib/index.js:147‑151
return ctx.on(event, function (request, next) {
  const carrierAgent = carrierKeyOf(this)
  if (carrierAgent === void 0) return next()
  if (agent === void 0 || agent !== carrierAgent)
    throw new TypeError("forwarded scoped event must carry its Agent directly")
})
```

- `api-remotes` بتراقب **نفس الـwaterfall** (مشان تنقل الطلبات لواجهة المتصفح).
- بترمي `TypeError` لما الـagent ما يطابق الـscope تبعها.
- Cordis بيمسك الخطأ ⇒ `unavailable` **fail-closed** ⇒ الطلب بينتهي **قبل** ما يوصل لأي listener متأخّر.
- إضافة البروفايل بتنسجّل **آخر** (بعد `dsh-web-app`) ⇒ كانت **ما تشوف أي طلب أبداً**.

**الحل:** `ctx.on('approval/request', fn, { prepend: true })` ⇒ نشتغل أول، ونرجّع `next()` لأي شي ما منقدر عليه ⇒ مسار المتصفح يضل سليم.

*(بدون هالسطر: الميزة تبدو سليمة بالكود وميتة تماماً بالتشغيل — وهي بالضبط اللي صار معنا 3 مرات.)*

### ⚠️ شرط تفعيل الموافقة
ما بتصير موافقة إلا إذا الطلب فيه **`sandbox_permissions` + `justification` مع بعض**:
```
tools/pre-execute  →  serviceAsk()  →  ctx.approval.request()  →  approval/request
```
رفض عادي (بدون `sandbox_permissions`) بينرفض من الـsandbox مباشرة ⇒ **ما بيسأل أبداً**.

### ✅ الإثبات الحاسم (2026-10-09) — المنتج شغّال حي

من `%LOCALAPPDATA%\dsh-notify-ar\plugin.log`:

```
toast finished action=continue                          ← الإشعار طلع لحاله (الدور صار idle)
click continue session=session-b053709e-…              ← المستخدم ضغط «تابع» بالإشعار
continued session=session-b053709e-…                   ← الوكيل كمّل بلا ما يفتح التطبيق
```

**يعني الحلم الأصلي تحقّق:** الوكيل خلّص ⇒ إشعار بأزرار ⇒ ضغطة ⇒ الوكيل كمّل.

### 🥇 الإثبات الثاني — زر الموافقة على الأذونات (الميزة الأهم)

نفس الملف، بعد إصلاح `prepend`:

```
approval-request tool=pwsh agent=session-b053709e-… enabled=true   ← DSH بعتلنا الطلب
toast approval tool=Allow this operation with danger-full-access … ← الإشعار طلع
click approve session=session-b053709e-…                           ← ضغطة «موافق» بالإشعار
approve settled=true                                               ← الموافقة رجعت للوكيل
```

**يعني الميزة الأهم عند قصي شغّالة:** الوكيل طلب صلاحية ⇒ إشعار بزر «موافق» ⇒ ضغطة ⇒ الصلاحية اتعطت.

## 9) قرارات قصي (مثبّتة ✅ — 2026-10-09)

| # | القرار | الاختيار |
|---|---|---|
| D1 | ترجمة الـexe وقت التثبيت بـ`csc.exe` المحلي | ✅ **إي** — بلا ملف ثنائي بالـnpm |
| D2 | «وقّف» بـv1 | ✅ **إي** — بعد نجاح Probe 5 (فحص حي) |
| D3 | اسم الحزمة | ✅ `dsh-notify-ar` — **متحقَّق: متوفّر على npm** (وكمان `dsh-toast-ar` و`dsh-notify-interactive` متوفّرين) |
| D4 | `dsh-notify` عندنا | ✅ **استبدال** — منع إشعارات مضاعفة |

## 10) الترخيص والنسبة

- **MIT** — مع نسبة إلزامية: `dsh-notify` © 2026 Pasumao (نفس الترخيص، الاقتباس مسموح بشرط الإشارة).
- الكود الجديد © 2026 Qusay Ali Khadour.
- `LICENSE` فيه النصين (الأصل + مشتقّنا).

## 11) المرجع

- الأدلة الكاملة: `PROBE-REPORT.md` (نفس المجلد).
- الفكرة الأصلية: `README.md` (نفس المجلد).
- الملفات المؤقتة: `tmp\probe\` (تُنظَّف قبل النشر).
