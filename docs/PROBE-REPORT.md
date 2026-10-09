# تقرير الفحوصات — `dsh-notify-ar` (نهائي)

> فحوصات جدوى (spike) على ويندوز 10 (10.0.19045) · PowerShell 5.1.19041.7725 · DSH desktop profile
> كل الأدلة من تنفيذ فعلي على جهاز قصي، مو من وثائق.

## الحكم السريع

| الفحص | الحكم | الدليل |
|---|---|---|
| 1 · أزرار الإشعار تظهر | ✅ | الإشعار بينحفظ مع `<actions>` سليمة |
| 1b · التنشيط يصير (الضغط يشتغل) | ✅ | `ms-settings:` فتح الإعدادات · `dsh://open` رجّع نافذة DSH |
| 2 · الضغطة توصل لكودنا | ✅ | `dshxexe://ping?btn=e1` و `btn=e2` سجّلهن exe تبعنا |
| 3 · الحقن بجلسة شغّالة | ✅ حي | `prompted → {"accepted":true}` والرسالة وصلت للمحادثة |
| 4 · exe تبعنا كهدف تنشيط | ✅ | المعالج الوحيد يلي انشغّل فعلاً |
| **5 · زر «وقّف» يوقف الجولة** | ✅ **حي** | `action=cancel` ⇒ `stage: cancelled` ⇒ `{"accepted":true}` |
| **5b · العربي يظهر سليم** | ✅ | بـ`-EncodedCommand` (base64 UTF-16LE) بلا ملف |

## إضافة بعد Probe 5 (2026-10-09)

### زر «وقّف» — الـAPI الحقيقي
```js
ctx.sessionController.cancel({ sessionId })   // ⇒ { accepted: true }
// يساوي داخلياً: agent.cancel({ kind: 'user' }, { keepInbox: true })
// (sc-index.js:994‑1000 · سطح الخدمة 3121)
```
- **`keepInbox: true`** ⇒ بيوقف الجولة الجارية **وبيحتفظ بطابور الانتظار** (مو قتل أعمى).
- نفس سطح `prompt` بالضبط ⇒ الثقة عالية، والفحص الحي أكّده.

### 🔴 اكتشاف: `dsh-notify` بتستعير هوية PowerShell
من `dsh-notify/lib/index.js:55‑56`:
```js
/** Toast 归属的 AppUserModelID；默认借用 Windows PowerShell 5.1 已注册的 AUMID。 */
aumid: '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe',
```
- إشعاراتها **تنخلط مع أي إشعار تاني بستعمل نفس الهوية** (شوفنا 12 إشعار بمخزن PowerShell).
- **لازم المنتج يسجّل AUMID خاص فيه** (`Qusay.DshNotifyAr`) ⇒ مخزن نظيف ومستقل.
- ملاحظة تقنية: `History.GetHistory(aumid)` بترجّع الإشعارات تبع هويات تانية بس WinRT **ما بيكشف محتواها** (`0xC00CE556`) ⇒ بتقدر تعدّهن بس ما بتقراهن.

### إشعارات ويندوز ≠ ملف `.ps1` فيه عربي
- `.ps1` بلا **UTF-8 BOM** ⇒ PowerShell 5.1 بيقراه ANSI ⇒ **رموز مشوّهة** (شوفناها فعلياً).
- **الحل للمنتج:** `powershell -EncodedCommand <base64 UTF-16LE>` — بنبني السكربت كامل بالـJS وبنرسله base64 ⇒ **بلا ملف، بلا تخمين ترميز** (مجرَّب ✅).

## السلسلة الكاملة يلي صارت (الإثبات)

| الوقت | الحدث |
|---|---|
| `07:11:25.603` | الضغطة شغّلت `probe-click.exe` → كتب الـURI بـ`exe-clicks.jsonl` |
| `04:11:25.844Z` | الإضافة `dsh-notify-ar-poc` قرأت الضغطة (`stage: received`, `v:2`) |
| `04:11:25.846Z` | `stage: prompted` → `result: {"accepted": true}` |
| بعدها مباشرة | رسالة جديدة طلعت بالمحادثة: «أنا ضغطة الإشعار — كمّل شغل notify-ar» |

**يعني: ضغطة زر بالإشعار ⇒ الوكيل كمّل شغلو بالجلسة، بلا ما ينفتح التطبيق.**

## القواعد الأربعة (كلها متحقَّق منها)

### 1. صيغة الإشعار
- **لازم** `<toast scenario="reminder" activationType="background">` على وسم الجذر.
- بدون `activationType` على الجذر: ويندوز **بيرمي الإشعار بصمت** (لا يظهر ولا ينحفظ) — كان سبب فشل الـXML بالـREADME.
- الأزرار: `<action content="…" activationType="protocol" arguments="scheme://…" />`.
- `&` داخل الـ`arguments` لازم يتكتب `&amp;` (XML).
- **الإشعار بيختفي بعد أول ضغطة** ⇒ عمليًا زر فعّال واحد لكل إشعار.

### 2. الهوية (AUMID) — شرط التنشيط
- الإظهار بيشتغل مع أي AUMID (استعرنا تبع PowerShell).
- **التنشيط ما بيوصل** إلا إذا الهوية مسجّلة: shortcut بمجلد Start Menu عليه خاصية `System.AppUserModel.ID`.
- `WScript.Shell` ما بيكتب هالخاصية ⇒ لازم `SHGetPropertyStoreFromParsingName` + `IPropertyStore`، PKEY `{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}` pid `5`.
- **فخ**: `PROPVARIANT` على x64 = **24 بايت**؛ لو 16، الكتابة بتطلع خارج المخزن والختم بيرجع فاضي **بصمت**.
- زيادة: `HKCU\Software\Classes\AppUserModelId\<aumid>` بـ`DisplayName` لعرض اسم مرتّب بمخزن الإشعارات.

### 3. هدف التنشيط — **لازم exe تطبيق، مو قشرة أوامر**

| الهدف | النتيجة |
|---|---|
| `powershell.exe -File …` | ❌ ما انشغّل ولا مرة |
| `cmd.exe /c echo … >> …` | ❌ ما انشغّل |
| **exe تبعنا (`csc /target:winexe`)** | ✅ انشغّل وكتب الـURI |

- الريجستري **متطابق** بين `dsh://` (اشتغل) و`dshxcmd://` (ما اشتغل) ⇒ الفرق نوع الملف الهدف، مو التسجيل.
- البروتوكول: `HKCU\Software\Classes\<scheme>` بـ`URL Protocol` = `` و`shell\open\command` = `"<abs exe path>" --log "<abs>" "%1"`.
- **مرّر المسارات كوسائط absolute** — سياق التنشيط مقيّد: `cwd = C:\Windows\system32` (لهيك المسارات النسبية فشلت بأول نسخة).
- سياق التنشيط المقيس: `user=DESKTOP-U3V7ALO\qusay` · `interactive=True` · `envUSERPROFILE/LOCALAPPDATA/TEMP` موجودة.

### 4. الحقن بالجلسة (الـAPI الحقيقي)

```js
export const inject = ['sessionController']
await ctx.sessionController.prompt(
  {
    sessionId,                                  // الجلسة المستهدفة (بتتقوّم إذا باردة)
    requestId: randomUUID(),                    // مكرر ⇒ {accepted:true} (idempotent)
    content: [{ type: 'text', text }],          // لازم نص غير فراغي
    ...(mode === 'steer' ? { mode: 'steer' } : {}),
  },
  signal,                                       // ← إلزامي! AbortSignal
)
```

- **`signal` إلزامي**: بدونو بيطيح `TypeError: Cannot read properties of undefined (reading 'throwIfAborted')` (صار معنا).
- `mode: 'steer'` ⇒ `agent.steer(message)` (يدخل بالنص الجاري) · غيره ⇒ `agent.followup(message)`.
- `create(request)` ما بدها signal.

## قيود بيئة DSH (تدخل بالـSPEC)

- `CreateToastNotifier` وكتابة `HKCU` **ممنوعين جوّا الـsandbox** (`0x80073D54` no package identity) ⇒ أي أداة/وكيل لازم يشتغل بصلاحية أوسع. الإضافة نفسها (جوّا DSH) ما عليها هالحاجز — وهي يلي بترسل الإشعارات (طريقة `dsh-notify`: `powershell -EncodedCommand`).
- أي نص عربي بملف `.ps1` **بدو UTF-8 BOM** وإلا بينقرا ANSI وبينطلع مشوّه بصمت. للتوزيع: `-EncodedCommand` (base64 · UTF-16LE).
- **ما في hot reload لإضافات الـprofile** — أي تعديل كود بدو **إعادة تشغيل DSH كاملة** (ختمت النسخة بـ`VERSION` عشان أعرف يلي انحمّل).
- التثبيت من جوّا DSH نجح مع صلاحية أوسع: `dsh plugin --profile desktop add <folder>` ⇒ dependency `link:` + إضافة بالـ`dsh.profile.bundles` + symlink بالـ`node_modules`.
- DSH بيعالج رابط واحد بس: `dsh://open` ⇒ `focusPrimaryWindow()` (`lib/main.js:12192`)؛ و`second-instance` ⇒ `focusOwner` (سطر 6875) ⇒ **ما فينا نمرّر إجرائنا عبر بروتوكول DSH**.
- `csc.exe` متوفر: `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`.

## ملاحظة أمنية مهمة (للـSPEC)

جسر الضغطات هو **ملف نصي** (`exe-clicks.jsonl`). أي عملية على الجهاز بتقدر تكتب فيه ⇒ بتقدر **تحقن تعليمات بالوكيل**. للمنتج لازم:
- ACL على الملف/المجلد، أو
- **nonce** لكل إشعار + التحقق منو قبل الحقن، و/أو
- تحقّق من أن الـURI جوّا الملف مطابق للـnonce يلي بعتناه.

(نفس الخطر قائم بأي قناة محلية مفتوحة — نقطة تصميم إلزامية.)

## فخاخ صارت معنا (محفوظة)

- `LoadXml 0xC00CE553 / 0xC00CE555`: سلسلة XML بدون وسم `<toast>` الجذر (خطأ ببناء السلاسل بالـPowerShell).
- `History.Clear(aumid)`: بتمحي **كل** إشعارات الهوية.
- `%DATE%`/`%TIME%` جوّا أوامر `cmd` عبر بروتوكول ⇒ تشويه.
- PowerShell 5.1 بيقرا ملفات JSON بلا BOM كـANSI ⇒ تشويه بالعرض بس (الملف سليم؛ للتأكد: `[System.IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)`).
- `Add-Content`/`Set-Content` بتضيف CRLF ⇒ استعمل `[System.IO.File]::WriteAllText` مع `UTF8Encoding($true)` للملفات.

## الخطوة الجاية

1. **SPEC** (`SPEC.md`): الميزة · الأوامر يلي بالأزرار · i18n ar/en + RTL · تدفق التثبيت (exe + protocol + AUMID) · الأمان (nonce/ACL) · الحدود (زر فعّال واحد لكل إشعار).
2. **خطة تنفيذ** ثم **بناء** المنتج تحت `Projects\notify-ar\`.
3. **تنظيف آثار الفحص** قبل النشر: `dsh-notify-ar-poc` من الـprofile، `HKCU\Software\Classes\dshxexe`، `AppUserModelId\Qusay.DshNotifyAr.Probe`، الـshortcut من Start Menu، وإشعارات المخزن.
4. **نشر**: npm + GitHub · MIT مع نسبة `dsh-notify` (Copyright 2026 Pasumao).

## ملفات الفحص (مؤقتة تحت `tmp\probe\`)

| الملف | وظيفته |
|---|---|
| `register-aumid.ps1` | تسجيل الهوية (shortcut + ختم AUMID + مفتاح العرض) |
| `bin\click-receiver-v2.cs` · `bin\probe-click.exe` | هدف التنشيط (ياخد `--log` و`--diag` + `%1`) |
| `poc\index.js` · `poc\package.json` · `poc\cordis.patch.yml` | الإضافة يلي بتحقن بالجلسة (v2 · مع `signal`) |
| `toast-*.ps1` | إشعارات الفحص بمتغيّرات (aumid · one-button · cmd · exe · live) |
| `history.ps1` | قراءة مخزن إشعارات هوية |
| `exe-clicks.jsonl` · `poc-state.jsonl` · `activation-context.txt` | أدلة الضغطات والحقن والسياق |
| `extract\main.js` · `extract\sc-index.js` | استخراجات من `app.asar` (الـAPI والبروتوكول) |
