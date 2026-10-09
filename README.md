# dsh-notify-ar

**إشعارات ويندوز بأزرار فعلية لـ DeepSeek Harness — عربي أولاً.**

الوكيل يخلّص شغلو وانت بعيد عن الشاشة؟ بدل ما ترجع تفتح التطبيق، اضغط الزر من الإشعار والوكيل بيكمّل حالو.
ولما الوكيل يطلب **إذن**، بتوافق أو بترفض من الإشعار — وهو شغّال.

[English](README.en.md) · [المواصفة الكاملة](https://github.com/qusaykhadour/dsh-notify-ar/blob/main/SPEC.md)

---

## المشكلة اللي بيحلّها

إضافة `dsh-notify` الموجودة بتوصلك إشعار **صيني ثابت** (مكتوب بالكود)، والضغط عليه **ما بيعمل شي** —
لأنها مبنية بـ`activationType="background"` (تعليق المطوّر نفسه بالكود).

يعني: بتوصلك «خلص الشغل»، وبعدها بتضل ترجع للتطبيق مشان تكمّل، أو مشان توافق على إذن.

## شو بيعمل `dsh-notify-ar`

| الإشعار | الزر | النتيجة |
|---|---|---|
| 🥇 **طلب إذن** | **موافق** | الصلاحية اتعطت — بلا ما تفتح التطبيق |
| خلص الشغل | **تابع** | الوكيل بيكمّل من حيث وقف |
| شغل شغّال | **وقّف** | الجولة بتوقف (والطابور بينحفظ) |
| أي حالة | **افتح التطبيق** | يرجّع نافذة DSH للمقدمة |

- **عربي + إنجليزي** مع RTL مضبوط · **اللغة الافتراضية = لغة التطبيق**
- **هوية خاصة فيه** (`Qusay.DshNotifyAr`) — ما بيشارك مخزن إشعارات PowerShell
- **أمان**: كل إشعار بيحمل **nonce** بستخدم مرة وحدة ⇒ ضغطة قديمة أو مزوّرة **مرفوضة**

## التثبيت

```powershell
dsh plugin --profile desktop add dsh-notify-ar
node "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-notify-ar\scripts\setup.mjs"
```

بعدها **أعد تشغيل DSH**.

`setup.mjs` بيعمل تلات شغلات:
1. بيترجم `click-gateway.exe` بـ`csc.exe` المحلي (موجود بويندوز افتراضياً — **ما في تحميل**)
2. بيسجّل الهوية (AUMID) عبر Start Menu shortcut + خاصية `System.AppUserModel.ID`
3. بيسجّل مخطّط `dshnar://` ويوجّهه للـexe

> ⚠️ **ليش لازم exe؟** فحصنا أثبت إنو ويندوز **ما بيشغّل** `powershell.exe` ولا `cmd.exe` كهدف تنشيط —
> الأزرار بتظهر بس ما بتعمل شي. لازم ملف تنفيذي حقيقي.

## الإعدادات

مثبتة بالـprofile بـ`cordis.patch.yml`:

```yaml
- id: dsh-plugin-notify-ar
  name: dsh-notify-ar
  config:
    locale: auto          # auto | ar | en
    enabled: true
    rootsOnly: true       # الجلسات تبعك بس، مو الوكلاء الفرعيين
    notifyApproval: true  # زر الأذونات
    cooldownMs: 10000     # أقل فترة بين إشعارين لنفس الجلسة
    aumid: Qusay.DshNotifyAr
```

## الحدود (بصراحة)

- **الأزرار بتشتغل بس إذا التطبيق شغّال** (ولو مصغّر) — الوكيل عايش جوّا العملية. إذا مسكّر: الزر بيفتحه.
- **زر فعّال واحد لكل إشعار** — ويندوز بيمحي الإشعار بعد أول ضغطة. لهيك إشعار واحد لكل قرار.
- **ما في موافقة إلا بطلب صريح**: الوكيل لازم يطلب `sandbox_permissions` + `justification` مع بعض.
  رفض عادي بينرفض مباشرة من الـsandbox (ما بيسأل).
- **التثبيت بدو صلاحية أوسع** — كتابة الريجستري ممنوعة جوّا sandbox DSH.

## الأمان

جسر الضغطات ملف JSONL، فأي عملية على الجهاز بتقدر تكتب فيه. لهيك:

- كل إشعار بيحمل **nonce عشوائي 128-bit** بستخدم **مرة وحدة**
- nonce مزوّر / مستعمل / منتهي ⇒ **مرفوض** (مجرّب: replay مرفوض)
- الإجراءات المسموحة whitelist: `approve` · `reject` · `continue` · `stop` · `open`
- مجلد البيانات مقفول قدر الإمكان (بيحتاج `SeSecurityPrivilege` — بيمرق بهدوء إذا مو متوفر، والـnonce هو الحماية الحقيقية)

## التطوير

```powershell
cd Projects\notify-ar\plugin
node scripts\test-toast.mjs          # بناء XML + العربي
node scripts\test-pipeline.mjs       # الضغطة كاملة + الأمان (9 اختبارات)
node scripts\test-approval.mjs       # منطق الموافقة (26 اختبار)
node scripts\test-approval-wire.mjs  # مسار الموافقة كامل
node scripts\smoke.mjs --action continue   # إشعار حقيقي + انتظار الضغطة
```

## الترخيص

**MIT** — © 2026 Qusay Ali Khadour.

مبني على أفكار من [`dsh-notify`](https://github.com/Pasumao/dsh-plugin-notify) © 2026 Pasumao (MIT) —
مع الشكر. الفرق: `dsh-notify-ar` أزراره **بتعمل**، ونصوصه **مو صينية**.
