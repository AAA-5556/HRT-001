# معماری پایگاه داده و منطق سمت سرور در Supabase

این سند به صورت جامع و دقیق، تمام جنبه‌های فنی پیاده‌سازی شده در پلتفرم Supabase را تشریح می‌کند. هدف از این مستند، فراهم کردن دانشی عمیق برای توسعه‌دهندگان آینده است تا بتوانند بدون نیاز به دسترسی مستقیم به پنل Supabase، سیستم را درک کرده، توسعه دهند و مشکلات احتمالی آن را برطرف کنند.

---

## فهرست مطالب

1.  [معماری کلی و ساختار سلسله مراتبی](#1-معماری-کلی-و-ساختار-سلسله-مراتبی)
2.  [جداول پایگاه داده (Tables)](#2-جداول-پایگاه-داده-tables)
    *   [2.1. `institutions` - جدول موسسات](#21-institutions---جدول-موسسات)
    *   [2.2. `profiles` - جدول کاربران](#22-profiles---جدول-کاربران)
    *   [2.3. `members` - جدول اعضای موسسات](#23-members---جدول-اعضای-موسسات)
    *   [2.4. `attendance` - جدول حضور و غیاب](#24-attendance---جدول-حضور-و-غیاب)
    *   [2.5. `scoped_settings` - جدول تنظیمات سلسله مراتبی](#25-scoped_settings---جدول-تنظیمات-سلسله-مراتبی)
    *   [2.6. `impersonation_log` - جدول ثبت اقدامات مدیریتی](#26-impersonation_log---جدول-ثبت-اقدامات-مدیریتی)
3.  [توابع پایگاه داده (PostgreSQL Functions)](#3-توابع-پایگاه-داده-postgresql-functions)
    *   [3.1. `get_my_claim` - استخراج اطلاعات از توکن JWT](#31-get_my_claim---استخراج-اطلاعات-از-توکن-jwt)
    *   [3.2. `get_user_role` - دریافت نقش کاربر](#32-get_user_role---دریافت-نقش-کاربر)
    *   [3.3. `is_admin` - بررسی سطح دسترسی ادمین](#33-is_admin---بررسی-سطح-دسترسی-ادمین)
    *   [3.4. `get_managed_institution_ids` - دریافت لیست موسسات تحت مدیریت](#34-get_managed_institution_ids---دریافت-لیست-موسسات-تحت-مدیریت)
    *   [3.5. `get_setting` - دریافت تنظیمات سلسله مراتبی](#35-get_setting---دریافت-تنظیمات-سلسله-مراتبی)
4.  [سیاست‌های امنیتی (Row-Level Security)](#4-سیاستهای-امنیتی-row-level-security)
    *   [4.1. سیاست‌های جدول `institutions`](#41-سیاستهای-جدول-institutions)
    *   [4.2. سیاست‌های جدول `profiles`](#42-سیاستهای-جدول-profiles)
    *   [4.3. سیاست‌های جدول `members`](#43-سیاستهای-جدول-members)
    *   [4.4. سیاست‌های جدول `attendance`](#44-سیاستهای-جدول-attendance)
5.  [توابع اج (Edge Functions)](#5-توابع-اج-edge-functions)
    *   [5.1. `change-password` - تغییر رمز عبور کاربر توسط ادمین](#51-change-password---تغییر-رمز-عبور-کاربر-توسط-ادمین)

---

## 1. معماری کلی و ساختار سلسله مراتبی

سیستم بر پایه یک معماری دسترسی چهار سطحی و سلسله مراتبی طراحی شده است. این ساختار تضمین می‌کند که هر سطح دسترسی، کنترل کاملی بر سطوح پایین‌تر از خود دارد و در عین حال، توسط سطوح بالاتر مدیریت می‌شود.

**سطوح دسترسی به ترتیب از بالاترین به پایین‌ترین:**

1.  **`root` (ریشه):**
    *   **توضیح:** بالاترین سطح دسترسی در کل سیستم. این نقش برای توسعه‌دهندگان اصلی و مدیریت کلان سیستم طراحی شده است.
    *   **قابلیت‌ها:** دسترسی کامل به تمام داده‌ها در تمام جداول. قابلیت ایجاد، ویرایش و حذف کاربران `superadmin`.

2.  **`superadmin` (ابر ادمین):**
    *   **توضیح:** مدیران اصلی که بر چندین `admin` نظارت دارند.
    *   **قابلیت‌ها:** ایجاد، مشاهده، ویرایش و حذف کاربران `admin` که توسط خودشان ایجاد شده‌اند. دسترسی کامل به اطلاعات تمام موسساتی که زیرمجموعه `admin`های تحت مدیریتشان هستند.

3.  **`admin` (ادمین):**
    *   **توضیح:** مدیران منطقه‌ای یا بخشی که مسئولیت مدیریت چندین موسسه (`institute`) را بر عهده دارند.
    *   **قابلیت‌ها:** ایجاد، مشاهده، ویرایش و حذف موسسات (`institutions`) و کاربران با نقش `institute`. دسترسی کامل به اطلاعات این موسسات و اعضای آن‌ها.

4.  **`institute` (موسسه):**
    *   **توضیح:** پایین‌ترین سطح دسترسی که به یک موسسه خاص تعلق دارد. این کاربران فقط می‌توانند اطلاعات مربوط به موسسه خود را مدیریت کنند.
    *   **قابلیت‌ها:** مدیریت اعضا (`members`) و ثبت حضور و غیاب (`attendance`) فقط برای موسسه خود.

این ساختار سلسله مراتبی از طریق ستون `created_by` در جداول `profiles` و `institutions` پیاده‌سازی شده است که شناسه کاربری که رکورد را ایجاد کرده، در آن ذخیره می‌شود. این ستون، اساس قوانین RLS برای محدود کردن دسترسی‌ها است.

---

## 2. جداول پایگاه داده (Tables)

در این بخش، ساختار هر یک از جداول پایگاه داده به همراه کد SQL مربوط به ایجاد آن‌ها و توضیح کامل هر ستون ارائه می‌شود.

### 2.1. `institutions` - جدول موسسات

این جدول اطلاعات اصلی موسسات را در خود نگهداری می‌کند.

**کد SQL:**
```sql
CREATE TABLE public.institutions (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    name CHARACTER VARYING NOT NULL,
    city CHARACTER VARYING,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_by UUID,
    CONSTRAINT institutions_pkey PRIMARY KEY (id),
    CONSTRAINT institutions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL
);
```

**توضیح ستون‌ها:**
*   `id`: شناسه منحصر به فرد هر موسسه (Primary Key). به صورت خودکار توسط `gen_random_uuid()` تولید می‌شود.
*   `created_at`: زمان دقیق ایجاد رکورد به وقت جهانی (UTC).
*   `name`: نام موسسه. این فیلد اجباری است.
*   `city`: نام شهر موسسه. این فیلد اختیاری است.
*   `is_active`: وضعیت فعال یا غیرفعال بودن موسسه را مشخص می‌کند. به طور پیش‌فرض `true` است.
*   `created_by`: شناسه کاربری (`admin`) که این موسسه را ایجاد کرده است. این ستون برای پیاده‌سازی دسترسی سلسله مراتبی حیاتی است و به جدول `profiles` ارجاع دارد. اگر کاربر создатель حذف شود، این مقدار `NULL` می‌شود (`ON DELETE SET NULL`).

### 2.2. `profiles` - جدول کاربران

این جدول اطلاعات تکمیلی کاربران سیستم را که در جدول `auth.users` خود Supabase ثبت‌نام کرده‌اند، ذخیره می‌کند.

**کد SQL:**
```sql
CREATE TABLE public.profiles (
    id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    username CHARACTER VARYING,
    role CHARACTER VARYING NOT NULL,
    institution_id UUID,
    created_by UUID,
    CONSTRAINT profiles_pkey PRIMARY KEY (id),
    CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT profiles_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL,
    CONSTRAINT profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT profiles_username_key UNIQUE (username)
);
```

**توضیح ستون‌ها:**
*   `id`: شناسه منحصر به فرد کاربر که همان شناسه کاربر در جدول `auth.users` است. این ستون هم Primary Key و هم Foreign Key است. اگر کاربر از سیستم احراز هویت Supabase حذف شود، این رکورد نیز به صورت خودکار حذف می‌شود (`ON DELETE CASCADE`).
*   `created_at`: زمان ایجاد پروفایل.
*   `username`: نام کاربری منحصر به فرد برای ورود به سیستم.
*   `role`: نقش کاربر در سیستم. یکی از مقادیر `root`, `superadmin`, `admin`, `institute` را می‌پذیرد.
*   `institution_id`: اگر نقش کاربر `institute` باشد، این ستون شناسه موسسه‌ای که کاربر به آن تعلق دارد را مشخص می‌کند.
*   `created_by`: شناسه کاربری (`root`, `superadmin`, `admin`) که این کاربر را ایجاد کرده است. کلید اصلی در ساختار سلسله مراتبی.

### 2.3. `members` - جدول اعضای موسسات

این جدول اطلاعات افرادی (مددجویان) که عضو یک موسسه هستند را نگهداری می‌کند.

**کد SQL:**
```sql
CREATE TABLE public.members (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    full_name CHARACTER VARYING,
    national_id CHARACTER VARYING,
    mobile CHARACTER VARYING,
    is_active BOOLEAN DEFAULT true NOT NULL,
    institution_id UUID NOT NULL,
    CONSTRAINT members_pkey PRIMARY KEY (id),
    CONSTRAINT members_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE
);
```

**توضیح ستون‌ها:**
*   `id`: شناسه منحصر به فرد و عددی هر عضو.
*   `created_at`: زمان ثبت عضو.
*   `full_name`: نام و نام خانوادگی عضو.
*   `national_id`: کد ملی عضو.
*   `mobile`: شماره موبایل عضو.
*   `is_active`: وضعیت فعال یا غیرفعال بودن عضو در موسسه.
*   `institution_id`: شناسه موسسه‌ای که این عضو به آن تعلق دارد. اگر موسسه حذف شود، تمام اعضای آن نیز حذف می‌شوند (`ON DELETE CASCADE`).

### 2.4. `attendance` - جدول حضور و غیاب

این جدول داده‌های مربوط به حضور و غیاب روزانه اعضا را ثبت می‌کند.

**کد SQL:**
```sql
CREATE TABLE public.attendance (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    member_id BIGINT NOT NULL,
    date DATE NOT NULL,
    status CHARACTER VARYING NOT NULL,
    institution_id UUID NOT NULL,
    recorded_by UUID,
    CONSTRAINT attendance_pkey PRIMARY KEY (id),
    CONSTRAINT attendance_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE,
    CONSTRAINT attendance_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE,
    CONSTRAINT attendance_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT attendance_member_id_date_key UNIQUE (member_id, date)
);
```

**توضیح ستون‌ها:**
*   `id`: شناسه منحصر به فرد رکورد حضور و غیاب.
*   `created_at`: زمان دقیق ثبت رکورد.
*   `member_id`: شناسه عضوی که این رکورد برای او ثبت شده.
*   `date`: تاریخ حضور و غیاب.
*   `status`: وضعیت حضور (مثلاً `present`, `absent`).
*   `institution_id`: شناسه موسسه برای دسترسی سریع‌تر و اعمال قوانین RLS.
*   `recorded_by`: شناسه کاربری که این رکورد را ثبت کرده است.
*   `attendance_member_id_date_key`: یک محدودیت منحصر به فرد که تضمین می‌کند برای هر عضو در هر روز، فقط یک رکورد حضور و غیاب ثبت شود.

### 2.5. `scoped_settings` - جدول تنظیمات سلسله مراتبی

این جدول برای پیاده‌سازی یک سیستم تنظیمات قدرتمند و سلسله مراتبی طراحی شده است.

**کد SQL:**
```sql
CREATE TABLE public.scoped_settings (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    name TEXT NOT NULL,
    value JSONB,
    scope TEXT NOT NULL,
    scope_id UUID,
    CONSTRAINT scoped_settings_pkey PRIMARY KEY (id)
);
```

**توضیح ستون‌ها:**
*   `name`: نام کلید تنظیم (مثلاً `max_members`).
*   `value`: مقدار تنظیم به صورت `JSONB` که امکان ذخیره انواع داده‌های پیچیده را می‌دهد.
*   `scope`: سطح اعمال این تنظیم. مقادیر ممکن: `global`, `superadmin`, `admin`, `institution`.
*   `scope_id`: شناسه مربوط به آن سطح. برای مثال، اگر `scope` برابر با `institution` باشد، `scope_id` شناسه آن موسسه خواهد بود. اگر `scope` برابر با `global` باشد، این فیلد `NULL` است.

### 2.6. `impersonation_log` - جدول ثبت اقدامات مدیریتی

این جدول برای ثبت اقداماتی طراحی شده که یک ادمین به نیابت از یک کاربر دیگر (مثلاً یک موسسه) انجام می‌دهد.

**کد SQL:**
```sql
CREATE TABLE public.impersonation_log (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    admin_id UUID NOT NULL,
    target_user_id UUID,
    target_institution_id UUID,
    action TEXT NOT NULL,
    details JSONB,
    CONSTRAINT impersonation_log_pkey PRIMARY KEY (id),
    CONSTRAINT impersonation_log_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE,
    CONSTRAINT impersonation_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT impersonation_log_target_institution_id_fkey FOREIGN KEY (target_institution_id) REFERENCES public.institutions(id) ON DELETE SET NULL
);
```

**توضیح ستون‌ها:**
*   `admin_id`: شناسه کاربری ادمینی که عمل را انجام داده است.
*   `target_user_id`: شناسه کاربری که عمل به نیابت از او انجام شده.
*   `target_institution_id`: شناسه موسسه‌ای که عمل روی آن انجام شده.
*   `action`: شرح عمل انجام شده (مثلاً `create_member`).
*   `details`: جزئیات بیشتر در مورد عمل انجام شده به صورت `JSONB`.

---

## 3. توابع پایگاه داده (PostgreSQL Functions)

توابع سفارشی برای کپسوله کردن منطق‌های پیچیده و استفاده مجدد از آن‌ها، به خصوص در سیاست‌های RLS، ایجاد شده‌اند.

### 3.1. `get_my_claim` - استخراج اطلاعات از توکن JWT

این تابع یک مقدار خاص را از بخش `raw_user_meta_data` توکن JWT کاربر فعلی استخراج می‌کند.

**کد SQL:**
```sql
CREATE OR REPLACE FUNCTION public.get_my_claim(claim TEXT)
RETURNS JSONB
LANGUAGE 'sql' STABLE
AS $$
  SELECT coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'raw_user_meta_data' -> claim, null);
$$;
```

**توضیح:**
*   `claim`: نام کلیدی که می‌خواهیم مقدار آن را از متادیتای کاربر استخراج کنیم (مثلاً `role`).
*   `current_setting('request.jwt.claims', true)`: به توکن JWT درخواست فعلی دسترسی پیدا می‌کند.
*   این تابع به ما اجازه می‌دهد تا بدون نیاز به کوئری اضافی به جدول `profiles`، به نقش یا دیگر اطلاعات کاربر در قوانین RLS دسترسی داشته باشیم که باعث بهینگی عملکرد می‌شود.

### 3.2. `get_user_role` - دریافت نقش کاربر

این تابع نقش کاربر فعلی را با استفاده از تابع `get_my_claim` برمی‌گرداند.

**کد SQL:**
```sql
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE 'plpgsql' STABLE
AS $$
BEGIN
  RETURN (SELECT public.get_my_claim('role'))::text;
END;
$$;
```

**توضیح:**
این تابع صرفاً یک Wrapper برای خوانایی بیشتر است و نقش کاربر را به صورت `TEXT` برمی‌گرداند.

### 3.3. `is_admin` - بررسی سطح دسترسی ادمین

این تابع بررسی می‌کند که آیا کاربر فعلی یکی از نقش‌های مدیریتی (`root`, `superadmin`, `admin`) را دارد یا خیر.

**کد SQL:**
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE 'plpgsql' STABLE
AS $$
DECLARE
  user_role TEXT;
BEGIN
  user_role := public.get_user_role();
  RETURN user_role IN ('root', 'superadmin', 'admin');
END;
$$;
```

**توضیح:**
این تابع در قوانین RLS بسیار پرکاربرد است تا مشخص کند آیا یک کاربر اجازه انجام عملیات مدیریتی را دارد یا خیر.

### 3.4. `get_managed_institution_ids` - دریافت لیست موسسات تحت مدیریت

این تابع یک آرایه از شناسه‌های موسساتی را برمی‌گرداند که کاربر ادمین فعلی اجازه مدیریت آن‌ها را دارد.

**کد SQL:**
```sql
CREATE OR REPLACE FUNCTION public.get_managed_institution_ids()
RETURNS UUID[]
LANGUAGE 'plpgsql' STABLE SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    user_role TEXT := public.get_user_role();
    admin_ids UUID[];
BEGIN
    IF user_role = 'root' THEN
        RETURN ARRAY(SELECT id FROM public.institutions);
    ELSIF user_role = 'superadmin' THEN
        -- Find admins created by this superadmin
        SELECT array_agg(id) INTO admin_ids FROM public.profiles WHERE created_by = current_user_id AND role = 'admin';
        -- Return institutions created by those admins
        RETURN ARRAY(SELECT id FROM public.institutions WHERE created_by = ANY(admin_ids));
    ELSIF user_role = 'admin' THEN
        -- Return institutions created by this admin
        RETURN ARRAY(SELECT id FROM public.institutions WHERE created_by = current_user_id);
    ELSE
        RETURN ARRAY[]::UUID[];
    END IF;
END;
$$;
```

**توضیح:**
*   `SECURITY DEFINER`: این تابع با دسترسی‌های سازنده‌اش (که معمولاً `postgres` است) اجرا می‌شود تا بتواند به تمام رکوردها دسترسی داشته باشد و لیست کامل را بر اساس منطق سلسله مراتبی فیلتر کند.
*   منطق تابع بر اساس نقش کاربر (`user_role`) متفاوت است:
    *   `root`: تمام موسسات را برمی‌گرداند.
    *   `superadmin`: ادمین‌های زیرمجموعه خود را پیدا کرده و سپس موسسات ساخته شده توسط آن ادمین‌ها را برمی‌گرداند.
    *   `admin`: موسساتی که مستقیماً توسط خودش ساخته شده را برمی‌گرداند.
    *   نقش‌های دیگر: یک آرایه خالی برمی‌گرداند.

### 3.5. `get_setting_value` - دریافت تنظیمات سلسله مراتبی

این تابع یک تنظیم خاص را بر اساس نام آن و با رعایت ساختار سلسله مراتبی جستجو و برمی‌گرداند.

**کد SQL:**
```sql
CREATE OR REPLACE FUNCTION public.get_setting_value(setting_name TEXT, p_institution_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    result JSONB;
    admin_creator_id UUID;
    superadmin_creator_id UUID;
BEGIN
    -- 1. Check for institution-specific setting
    IF p_institution_id IS NOT NULL THEN
        SELECT value INTO result FROM public.scoped_settings
        WHERE name = setting_name AND scope = 'institution' AND scope_id = p_institution_id;
        IF result IS NOT NULL THEN RETURN result; END IF;
    END IF;

    -- 2. Find creators in the hierarchy
    IF p_institution_id IS NOT NULL THEN
        SELECT created_by INTO admin_creator_id FROM public.institutions WHERE id = p_institution_id;
        IF admin_creator_id IS NOT NULL THEN
             SELECT created_by INTO superadmin_creator_id FROM public.profiles WHERE id = admin_creator_id;
        END IF;
    END IF;

    -- 3. Check for admin-specific setting
    IF admin_creator_id IS NOT NULL THEN
        SELECT value INTO result FROM public.scoped_settings
        WHERE name = setting_name AND scope = 'admin' AND scope_id = admin_creator_id;
        IF result IS NOT NULL THEN RETURN result; END IF;
    END IF;

    -- 4. Check for superadmin-specific setting
    IF superadmin_creator_id IS NOT NULL THEN
        SELECT value INTO result FROM public.scoped_settings
        WHERE name = setting_name AND scope = 'superadmin' AND scope_id = superadmin_creator_id;
        IF result IS NOT NULL THEN RETURN result; END IF;
    END IF;

    -- 5. Check for global setting
    SELECT value INTO result FROM public.scoped_settings
    WHERE name = setting_name AND scope = 'global';
    IF result IS NOT NULL THEN RETURN result; END IF;

    -- 6. Return NULL if not found
    RETURN NULL;
END;
$$;
```

**توضیح:**
این تابع به ترتیب زیر عمل می‌کند:
1.  ابتدا به دنبال تنظیم خاص برای یک موسسه (`p_institution_id`) می‌گردد.
2.  اگر پیدا نشد، سازنده آن موسسه (ادمین) را پیدا می‌کند.
3.  به دنبال تنظیم خاص برای آن ادمین می‌گردد.
4.  اگر پیدا نشد، سازنده آن ادمین (سوپر ادمین) را پیدا می‌کند.
5.  به دنبال تنظیم خاص برای آن سوپر ادمین می‌گردد.
6.  اگر باز هم پیدا نشد، به دنبال تنظیم عمومی (`global`) می‌گردد.
7.  در نهایت اگر هیچ تنظیمی یافت نشد، `NULL` برمی‌گرداند.

---

## 4. سیاست‌های امنیتی (Row-Level Security)

امنیت داده‌ها در این سیستم به طور کامل توسط سیاست‌های RLS در سطح پایگاه داده تضمین می‌شود. این سیاست‌ها مشخص می‌کنند که هر کاربر تحت چه شرایطی اجازه مشاهده (`SELECT`)، افزودن (`INSERT`)، ویرایش (`UPDATE`) یا حذف (`DELETE`) رکوردها را در هر جدول دارد. این بخش کد کامل و توضیح هر سیاست را ارائه می‌دهد.

**نکته مهم:** قبل از فعال کردن RLS برای هر جدول، دستور زیر برای فعال‌سازی آن اجرا می‌شود:
`ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;`

---

### 4.1. سیاست‌های جدول `institutions`

**1. سیاست مشاهده (SELECT):**
*   **هدف:** کاربران `institute` فقط موسسه خود را می‌بینند. ادمین‌ها موسسات زیرمجموعه خود را می‌بینند.
*   **کد SQL:**
    ```sql
    CREATE POLICY "Institutions SELECT Policy" ON public.institutions
    FOR SELECT USING (
        (get_user_role() = 'institute' AND id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()))
        OR
        (is_admin() AND id = ANY(get_managed_institution_ids()))
    );
    ```
*   **توضیح `USING`:**
    *   **بخش اول:** اگر نقش کاربر `institute` است، تنها رکوردی قابل مشاهده است که `id` آن با `institution_id` ثبت شده در پروفایل همان کاربر برابر باشد.
    *   **بخش دوم:** اگر کاربر ادمین است (`is_admin()` تابع کمکی است)، تنها رکوردهایی قابل مشاهده هستند که `id` آن‌ها در لیست خروجی تابع `get_managed_institution_ids()` (موسسات تحت مدیریت) وجود داشته باشد.

**2. سیاست افزودن (INSERT):**
*   **هدف:** فقط `admin` ها می‌توانند موسسه جدید ایجاد کنند و `created_by` را به درستی مقداردهی کنند.
*   **کد SQL:**
    ```sql
    CREATE POLICY "Institutions INSERT Policy" ON public.institutions
    FOR INSERT WITH CHECK (
        get_user_role() = 'admin' AND created_by = auth.uid()
    );
    ```
*   **توضیح `WITH CHECK`:**
    *   یک رکورد جدید فقط زمانی ایجاد می‌شود که نقش کاربر `admin` باشد و مقدار ستون `created_by` در رکورد جدید، برابر با شناسه (`uid`) کاربر فعلی باشد. این کار از ثبت اطلاعات نادرست جلوگیری می‌کند.

**3. سیاست ویرایش (UPDATE):**
*   **هدف:** فقط ادمین‌ها می‌توانند موسسات تحت مدیریت خود را ویرایش کنند.
*   **کد SQL:**
    ```sql
    CREATE POLICY "Institutions UPDATE Policy" ON public.institutions
    FOR UPDATE USING (
        is_admin() AND id = ANY(get_managed_institution_ids())
    );
    ```
*   **توضیح `USING`:**
    *   شرایط ویرایش دقیقاً مشابه شرایط مشاهده برای ادمین‌ها است. یک ادمین تنها رکوردهایی را می‌تواند ویرایش کند که اجازه مشاهده آن‌ها را دارد.

**4. سیاست حذف (DELETE):**
*   **هدف:** فقط ادمین‌ها می‌توانند موسسات تحت مدیریت خود را حذف کنند.
*   **کد SQL:**
    ```sql
    CREATE POLICY "Institutions DELETE Policy" ON public.institutions
    FOR DELETE USING (
        is_admin() AND id = ANY(get_managed_institution_ids())
    );
    ```
*   **توضیح `USING`:**
    *   شرایط حذف نیز مشابه شرایط مشاهده و ویرایش برای ادمین‌ها است.

---

### 4.2. سیاست‌های جدول `profiles`

**1. سیاست مشاهده (SELECT):**
*   **هدف:** هر کاربر پروفایل خود را می‌بیند. ادمین‌ها پروفایل کاربران زیرمجموعه خود را می‌بینند.
*   **کد SQL:**
    ```sql
    CREATE POLICY "Profiles SELECT Policy" ON public.profiles
    FOR SELECT USING (
        id = auth.uid() OR is_admin()
    );
    ```
*   **توضیح `USING`:**
    *   **بخش اول:** هر کاربری می‌تواند پروفایل خودش را مشاهده کند (`id = auth.uid()`).
    *   **بخش دوم:** ادمین‌ها (`is_admin()`) می‌توانند تمام پروفایل‌ها را ببینند. (این سیاست می‌تواند با بررسی `created_by` محدودتر شود تا هر ادمین فقط کاربران زیرمجموعه خود را ببیند).

**2. سیاست افزودن (INSERT):**
*   **هدف:** ادمین‌ها می‌توانند کاربران زیرمجموعه خود را ایجاد کنند.
*   **کد SQL:**
    ```sql
    CREATE POLICY "Profiles INSERT Policy" ON public.profiles
    FOR INSERT WITH CHECK (
        is_admin() AND created_by = auth.uid()
    );
    ```
*   **توضیح `WITH CHECK`:**
    *   فقط یک ادمین می‌تواند کاربر جدید ایجاد کند و باید `created_by` را برابر با شناسه خودش قرار دهد.

**3. سیاست ویرایش (UPDATE):**
*   **هدف:** هر کاربر پروفایل خود را ویرایش می‌کند. ادمین‌ها پروفایل کاربران زیرمجموعه را ویرایش می‌کنند.
*   **کد SQL:**
    ```sql
    CREATE POLICY "Profiles UPDATE Policy" ON public.profiles
    FOR UPDATE USING (
        id = auth.uid() OR is_admin()
    );
    ```
*   **توضیح `USING`:**
    *   هر کاربر می‌تواند پروفایل خود را ویرایش کند.
    *   ادمین‌ها نیز می‌توانند پروفایل‌های کاربران زیرمجموعه خود را ویرایش کنند.

---

### 4.3. سیاست‌های جدول `members`

**1. سیاست جامع (FOR ALL):**
*   **هدف:** کاربران (هم `institute` و هم ادمین‌ها) فقط به اعضای موسساتی که به آن‌ها دسترسی دارند، بتوانند دسترسی کامل (مشاهده، افزودن، ویرایش، حذف) داشته باشند.
*   **کد SQL:**
    ```sql
    CREATE POLICY "Members FULL ACCESS Policy" ON public.members
    FOR ALL USING (
        (get_user_role() = 'institute' AND institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()))
        OR
        (is_admin() AND institution_id = ANY(get_managed_institution_ids()))
    )
    WITH CHECK (
        (get_user_role() = 'institute' AND institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()))
        OR
        (is_admin() AND institution_id = ANY(get_managed_institution_ids()))
    );
    ```
*   **توضیح:**
    *   از آنجایی که شرایط برای تمام عملیات‌ها یکسان است، یک سیاست `FOR ALL` با هر دو بخش `USING` (برای دسترسی) و `WITH CHECK` (برای ثبت و ویرایش) نوشته شده است.
    *   منطق این سیاست تضمین می‌کند که هر عملیاتی روی رکوردهای این جدول، فقط در صورتی مجاز است که `institution_id` آن رکورد در لیست موسسات مجاز کاربر فعلی باشد.

---

### 4.4. سیاست‌های جدول `attendance`

سیاست‌های این جدول کاملاً مشابه جدول `members` است و دسترسی را بر اساس `institution_id` محدود می‌کند.

*   **کد SQL (سیاست جامع):**
    ```sql
    CREATE POLICY "Attendance FULL ACCESS Policy" ON public.attendance
    FOR ALL USING (
        (get_user_role() = 'institute' AND institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()))
        OR
        (is_admin() AND institution_id = ANY(get_managed_institution_ids()))
    )
    WITH CHECK (
        (get_user_role() = 'institute' AND institution_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid()))
        OR
        (is_admin() AND institution_id = ANY(get_managed_institution_ids()))
    );
    ```

---

## 5. توابع اج (Edge Functions)

Edge Functions کدهای سمت سروری هستند که به صورت جداگانه از پایگاه داده اجرا می‌شوند و برای منطق‌هایی که نیاز به دسترسی سطح بالا یا ارتباط با سرویس‌های خارجی دارند، استفاده می‌شوند.

### 5.1. `update-user-password` - تغییر رمز عبور کاربر توسط ادمین

*   **هدف:** فراهم کردن امکانی امن برای ادمین‌ها تا بتوانند رمز عبور کاربران زیرمجموعه خود را تغییر دهند. این عمل مستقیماً با استفاده از `supabase-js` در کلاینت امن نیست، زیرا به کلید `service_role_key` نیاز دارد.

*   **منطق داخلی تابع:**
    1.  **دریافت ورودی:** تابع یک درخواست `POST` با `userId` (شناسه کاربری که رمز عبورش باید تغییر کند) و `newPassword` دریافت می‌کند.
    2.  **احراز هویت و بررسی دسترسی:**
        *   تابع ابتدا کاربر ارسال‌کننده درخواست (ادمین) را از طریق توکن JWT شناسایی می‌کند.
        *   سپس بررسی می‌کند که آیا این ادمین (بر اساس ساختار سلسله مراتبی) اجازه مدیریت `userId` هدف را دارد یا خیر. این کار با کوئری به پایگاه داده و بررسی رابطه `created_by` انجام می‌شود.
    3.  **ایجاد کلاینت Supabase با دسترسی کامل:** تابع یک نمونه جدید از کلاینت Supabase را با استفاده از `service_role_key` (که به صورت امن در متغیرهای محیطی تابع ذخیره شده) ایجاد می‌کند. این کلاینت تمام محدودیت‌های RLS را نادیده می‌گیرد.
    4.  **تغییر رمز عبور:** با استفاده از این کلاینت قدرتمند، متد `supabase.auth.admin.updateUserById()` را فراخوانی کرده و رمز عبور کاربر هدف را به‌روزرسانی می‌کند.
    5.  **پاسخ:** در صورت موفقیت، یک پیام موفقیت و در غیر این صورت، یک خطای مناسب برمی‌گرداند.

این معماری تضمین می‌کند که کلید حساس `service_role_key` هرگز در سمت کلاینت قرار نمی‌گیرد و عملیات تغییر رمز عبور تحت یک بررسی امنیتی دقیق در سمت سرور انجام می‌شود.
