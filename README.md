# المفاضلة الذكية | M-Fair

نظام مستقل لترشيح المعلمات لسداد حصص الاحتياط — الثانوية الرابعة والتسعون (مسارات).

## الحالة
**1.0.0-setup**: قاعدة بيانات مستقلة محمية، ملفات اتصال، صفحة دخول إدارية، وفحص قراءة البيانات.
لا توجد خوارزمية مفاضلة مفعلة ولا تكليفات معتمدة في هذا الإصدار.

## عزل «منجز»
- المستودع: `duaaaalharbi-ops/manjaz-smart-ranking`.
- قاعدة البيانات: مشروع Supabase مستقل `ayinxhdmojmtgycwqmah` في `ap-south-1`.
- لا توجد أي كتابة أو قراءة لقاعدة منجز الحالية، ولا استدعاء لملفات الاحتياط اليومي أو تفعيل الاحتياط.
- الربط مع رئيسية منجز **مؤجل حتى انتهاء الاختبارات والموافقة**.
- الملفات منشورة في مستودع عام، لكن الجداول محمية بسياسات RLS؛ لا تُحفظ البيانات الشخصية أو كلمات المرور في المستودع.

## ملفات التطبيق
- `index.html`: صفحة مستقلة متجاوبة بالعربية واتجاه RTL.
- `styles.css`: التنسيق.
- `config.js`: عنوان المشروع ومفتاح Supabase publishable **العام فقط**.
- `app.js`: دخول إداري واختبار اتصال وقراءة آمنة.
- `supabase/migrations/20261021_000001_mfair_initial.sql`: إنشاء الجداول وسياسات RLS.

## الجداول الجديدة
`mfair_members`, `mfair_teachers`, `mfair_schedules`,
`mfair_exclusions`, `mfair_absences`, `mfair_assignments`,
`mfair_settings`, `mfair_simulations`, `mfair_audit_logs`.

الحالة الأولية: صفر معلمات، صفر تكليفات، صفر حسابات إدارة في Supabase الجديد. لا يوجد تسجيل ذاتي.

## نشر GitHub Pages (بعد اعتماد النشر)
اذهبي إلى **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.
العنوان المتوقع بعد إتمام النشر:
`https://duaaaalharbi-ops.github.io/manjaz-smart-ranking/`
ليس رابطًا فعّالًا بالضرورة حتى يظهر نجاح النشر في Pages.

## تفعيل حساب الإدارة المستقل
1. افتحي مشروع Supabase الجديد فقط → **Authentication → Users → Add user**، وأنشئي مستخدمًا إداريًا. احتفظي بكلمة المرور لنفسك، ولا ترسليها في المحادثة.
2. بعد إنشاء المستخدم، أضيفي عضويته إلى `mfair_members` في Supabase SQL Editor (أو بعد إسناد هذه الخطوة للمساعد مع عنوان البريد فقط، دون كلمة مرور):
```sql
insert into public.mfair_members (user_id,role)
select id,'admin' from auth.users
where lower(email)=lower('ADMIN_EMAIL_HERE')
on conflict (user_id) do update set role=excluded.role;
```
3. افحصي تسجيل الدخول باستخدام صفحة التطبيق المنشورة.
4. بيانات المعلمات والجداول تُستورد بعد مراجعتها، وليس بصورة تلقائية من منجز.

## الحماية والاختبار
- فُحص نشاط مشروع Supabase وتأكدت سلامته `ACTIVE_HEALTHY`.
- فُعلت RLS على الجداول التسعة؛ السماح للقراءة والكتابة الإدارية يقتصر على أعضاء `mfair_members` المصرح لهم.
- لا يُستخدم في الواجهة أي `service_role` أو مفتاح سري.
- اختبار المتصفح ودخول الإدارة ينتظر تفعيل GitHub Pages وإنشاء مستخدم الإدارة.
