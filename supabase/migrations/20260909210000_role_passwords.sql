-- Включение расширения pgcrypto для хэширования digest(..., 'sha256')
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Таблица хранения хэшей паролей для ролей
CREATE TABLE IF NOT EXISTS public.system_auth (
  role text PRIMARY KEY CHECK (role IN ('admin', 'worker')),
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Включаем RLS и закрываем прямой доступ для anon/authenticated
ALTER TABLE public.system_auth ENABLE ROW LEVEL SECURITY;

-- Удаляем все прямые политики доступа, чтобы хэши нельзя было прочитать через REST API
DROP POLICY IF EXISTS "system_auth_no_direct_read" ON public.system_auth;

-- Начальные пароли по умолчанию:
-- admin: Sm.1234567# (стандартный системный код проекта)
-- worker: worker123 (пароль для обычного рабочего/склада)
INSERT INTO public.system_auth (role, password_hash)
VALUES
  ('admin', encode(extensions.digest('Sm.1234567#', 'sha256'), 'hex')),
  ('worker', encode(extensions.digest('worker123', 'sha256'), 'hex'))
ON CONFLICT (role) DO NOTHING;

-- Функция проверки пароля на стороне сервера (БЭКЕНДЕ)
CREATE OR REPLACE FUNCTION public.verify_system_password(input_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _admin_hash text;
  _worker_hash text;
  _input_hash text;
BEGIN
  IF input_password IS NULL OR length(trim(input_password)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'role', null, 'message', 'Пароль не указан');
  END IF;

  -- Хэшируем введённый пароль
  _input_hash := encode(extensions.digest(input_password, 'sha256'), 'hex');

  SELECT password_hash INTO _admin_hash FROM public.system_auth WHERE role = 'admin';
  SELECT password_hash INTO _worker_hash FROM public.system_auth WHERE role = 'worker';

  IF _admin_hash IS NOT NULL AND _admin_hash = _input_hash THEN
    RETURN jsonb_build_object('success', true, 'role', 'admin');
  ELSIF _worker_hash IS NOT NULL AND _worker_hash = _input_hash THEN
    RETURN jsonb_build_object('success', true, 'role', 'worker');
  ELSE
    RETURN jsonb_build_object('success', false, 'role', null, 'message', 'Неверный пароль');
  END IF;
END;
$$;

-- Предоставляем право вызова функции проверки для anon и authenticated
GRANT EXECUTE ON FUNCTION public.verify_system_password(text) TO anon, authenticated, service_role;

-- Функция смены пароля для администратора
-- Требует обязательного подтверждения текущим паролем администратора
CREATE OR REPLACE FUNCTION public.change_system_password(
  admin_password text,
  target_role text,
  new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _admin_hash text;
  _input_admin_hash text;
  _new_hash text;
BEGIN
  IF target_role NOT IN ('admin', 'worker') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Некорректная роль');
  END IF;

  IF new_password IS NULL OR length(trim(new_password)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Пароль должен содержать не менее 4 символов');
  END IF;

  -- Проверяем текущий пароль администратора
  _input_admin_hash := encode(extensions.digest(admin_password, 'sha256'), 'hex');
  SELECT password_hash INTO _admin_hash FROM public.system_auth WHERE role = 'admin';

  IF _admin_hash IS NULL OR _admin_hash <> _input_admin_hash THEN
    RETURN jsonb_build_object('success', false, 'message', 'Неверный текущий пароль администратора');
  END IF;

  -- Обновляем пароль целевой роли
  _new_hash := encode(extensions.digest(new_password, 'sha256'), 'hex');

  INSERT INTO public.system_auth (role, password_hash, updated_at)
  VALUES (target_role, _new_hash, now())
  ON CONFLICT (role) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Пароль успешно обновлён');
END;
$$;

-- Предоставляем право вызова функции смены пароля
GRANT EXECUTE ON FUNCTION public.change_system_password(text, text, text) TO anon, authenticated, service_role;
