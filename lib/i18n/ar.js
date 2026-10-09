/**
 * dsh-notify-ar — Arabic strings (the default language when the app's UI is Arabic).
 *
 * RTL needs no markup: Windows lays a toast out per the text's own script, so
 * Arabic copy renders right-to-left on its own. What DOES need help is mixed
 * content — a line carrying an Arabic sentence plus a Latin tool name or a
 * Windows path. `bidi()` in `./index.js` wraps such a Latin run in Unicode
 * isolate marks so the renderer keeps the sentence's RTL flow instead of
 * reordering around the Latin token.
 *
 * @module dsh-notify-ar/i18n/ar
 */

export default {
  /** Toast titles, keyed by the notification kind. */
  title: {
    approval: 'طلب إذن',
    finished: 'خلص الشغل',
    aborted: 'انلغى الشغل',
    error: 'صار خطأ',
    limit: 'وصل حد المخرجات',
    waiting: 'بانتظار اختيارك',
    disposed: 'الجلسة انسكّرت',
  },

  /** Toast body templates. `{tool}` / `{workspace}` / `{session}` are substituted. */
  body: {
    approval: 'الوكيل بده إذن مشان: {tool}',
    approvalReason: 'السبب: {reason}',
    finished: 'خلص الشغل — {workspace} · {session}',
    aborted: 'الشغل توقّف — {workspace} · {session}',
    error: 'صار خطأ أثناء الشغل — {workspace} · {session}',
    limit: 'وصل لسقف المخرجات — {workspace} · {session}',
    waiting: 'الوكيل عم يستنّى اختيارك — {workspace} · {session}',
    disposed: 'الجلسة انسكّرت — {workspace} · {session}',
  },

  /** Action buttons on the toast. */
  button: {
    allow: 'موافق',
    reject: 'رفض',
    continue: 'تابع',
    stop: 'وقّف',
    open: 'افتح التطبيق',
  },

  /** Shown when a click could not be honoured. */
  notice: {
    expired: 'الزر صار قديم — افتح التطبيق وقرّر من هناك.',
    unknown: 'ضغطة غير معروفة — تجاهلناها.',
  },
}
