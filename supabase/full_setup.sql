-- ==============================================================================
-- ПОЛНЫЙ СКРИПТ ИНИЦИАЛИЗАЦИИ БАЗЫ ДАННЫХ (SUPABASE / POSTGRESQL)
-- Складской учёт: кабель, килограммы, штуки, клиенты, продажи, долги и роли
-- ==============================================================================

-- 1. РАСШИРЕНИЯ (EXTENSIONS)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. ТИПЫ ДАННЫХ
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'staff');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

-- 4. ТАБЛИЦА АВТОРИЗАЦИИ И ПАРОЛЕЙ РОЛЕЙ (system_auth)
CREATE TABLE IF NOT EXISTS public.system_auth (
  role text PRIMARY KEY CHECK (role IN ('admin', 'worker')),
  password_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_auth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "system_auth_no_direct_read" ON public.system_auth;

-- Начальные пароли по умолчанию:
-- admin: Sm.1234567#
-- worker: worker123
INSERT INTO public.system_auth (role, password_hash)
VALUES
  ('admin', encode(extensions.digest('Sm.1234567#', 'sha256'), 'hex')),
  ('worker', encode(extensions.digest('worker123', 'sha256'), 'hex'))
ON CONFLICT (role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verify_system_password(input_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  _admin_hash text;
  _worker_hash text;
  _input_hash text;
BEGIN
  IF input_password IS NULL OR length(trim(input_password)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'role', null, 'message', 'Пароль не указан');
  END IF;

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
END; $$;
GRANT EXECUTE ON FUNCTION public.verify_system_password(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.change_system_password(admin_password text, target_role text, new_password text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
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

  _input_admin_hash := encode(extensions.digest(admin_password, 'sha256'), 'hex');
  SELECT password_hash INTO _admin_hash FROM public.system_auth WHERE role = 'admin';

  IF _admin_hash IS NULL OR _admin_hash <> _input_admin_hash THEN
    RETURN jsonb_build_object('success', false, 'message', 'Неверный текущий пароль администратора');
  END IF;

  _new_hash := encode(extensions.digest(new_password, 'sha256'), 'hex');
  INSERT INTO public.system_auth (role, password_hash, updated_at)
  VALUES (target_role, _new_hash, now())
  ON CONFLICT (role) DO UPDATE
  SET password_hash = EXCLUDED.password_hash, updated_at = now();

  RETURN jsonb_build_object('success', true, 'message', 'Пароль успешно обновлён');
END; $$;
GRANT EXECUTE ON FUNCTION public.change_system_password(text, text, text) TO anon, authenticated, service_role;

-- 5. ТАБЛИЦА ПРОФИЛЕЙ И ПОЛЬЗОВАТЕЛЕЙ (profiles & user_roles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_all" ON public.profiles;
CREATE POLICY "profiles_all" ON public.profiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO anon, authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles_all" ON public.user_roles;
CREATE POLICY "user_roles_all" ON public.user_roles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- 6. ТАБЛИЦА ТОВАРОВ / ПОЗИЦИЙ СКЛАДА (cable_products)
CREATE TABLE IF NOT EXISTS public.cable_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  cross_section text NOT NULL,
  batch text,
  supplier text,
  notes text,
  purchase_price numeric NOT NULL DEFAULT 0,
  sale_price numeric NOT NULL DEFAULT 0,
  stock_meters numeric NOT NULL DEFAULT 0,
  stock_quantity numeric NOT NULL DEFAULT 0,
  unit_type text NOT NULL DEFAULT 'meter' CHECK (unit_type IN ('meter', 'kilogram', 'piece')),
  low_stock_threshold numeric NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cable_products TO anon, authenticated;
GRANT ALL ON public.cable_products TO service_role;
ALTER TABLE public.cable_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cable_products_all" ON public.cable_products;
CREATE POLICY "cable_products_all" ON public.cable_products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS cable_products_updated_at ON public.cable_products;
CREATE TRIGGER cable_products_updated_at BEFORE UPDATE ON public.cable_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. ТАБЛИЦА БУХТ КАБЕЛЯ (cable_coils)
CREATE TABLE IF NOT EXISTS public.cable_coils (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.cable_products(id) ON DELETE CASCADE,
  coil_number text NOT NULL,
  meters numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cable_coils TO anon, authenticated;
GRANT ALL ON public.cable_coils TO service_role;
ALTER TABLE public.cable_coils ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cable_coils_all" ON public.cable_coils;
CREATE POLICY "cable_coils_all" ON public.cable_coils FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS cable_coils_updated_at ON public.cable_coils;
CREATE TRIGGER cable_coils_updated_at BEFORE UPDATE ON public.cable_coils FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. ТАБЛИЦА КЛИЕНТОВ (customers)
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO anon, authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_all" ON public.customers;
CREATE POLICY "customers_all" ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS customers_updated_at ON public.customers;
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. ТАБЛИЦА ПРОДАЖ (sales)
CREATE TABLE IF NOT EXISTS public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name_snapshot text,
  notes text,
  discount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  cost_total numeric NOT NULL DEFAULT 0,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO anon, authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sales_all" ON public.sales;
CREATE POLICY "sales_all" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 10. ТАБЛИЦА ПОЗИЦИЙ ПРОДАЖИ (sale_items)
CREATE TABLE IF NOT EXISTS public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.cable_products(id),
  product_name_snapshot text NOT NULL,
  meters numeric NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_type text NOT NULL DEFAULT 'meter' CHECK (unit_type IN ('meter', 'kilogram', 'piece')),
  unit_price numeric NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL,
  coil_id uuid REFERENCES public.cable_coils(id) ON DELETE SET NULL,
  coil_number_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO anon, authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sale_items_all" ON public.sale_items;
CREATE POLICY "sale_items_all" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 11. ТАБЛИЦА ДВИЖЕНИЯ СКЛАДА (stock_movements)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.cable_products(id) ON DELETE CASCADE,
  sale_id uuid,
  kind text NOT NULL,
  change_meters numeric NOT NULL,
  change_quantity numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO anon, authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_movements_all" ON public.stock_movements;
CREATE POLICY "stock_movements_all" ON public.stock_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 12. ИНДЕКСЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
CREATE INDEX IF NOT EXISTS idx_cable_coils_product_id ON public.cable_coils(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON public.sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_sale_id ON public.stock_movements(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at ON public.sales(sold_at DESC);

-- 13. ХРАНИМЫЕ ПРОЦЕДУРЫ И RPC ФУНКЦИИ

-- Пересчет итогов продажи
CREATE OR REPLACE FUNCTION public.recompute_sale_totals(_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _total numeric;
  _cost_total numeric;
  _discount numeric;
BEGIN
  SELECT COALESCE(SUM(line_total), 0), COALESCE(SUM(COALESCE(quantity, meters) * unit_cost), 0)
    INTO _total, _cost_total FROM public.sale_items WHERE sale_id = _sale_id;
  SELECT COALESCE(discount, 0) INTO _discount FROM public.sales WHERE id = _sale_id;
  UPDATE public.sales SET total = GREATEST(0, _total - _discount), cost_total = _cost_total WHERE id = _sale_id;
END; $$;

-- Создание продажи (поддерживает метры, кг, штуки)
CREATE OR REPLACE FUNCTION public.create_sale(_customer_id uuid, _notes text, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sale_id uuid;
  _item jsonb;
  _product public.cable_products%ROWTYPE;
  _quantity numeric;
  _unit_price numeric;
  _line_total numeric;
  _total numeric := 0;
  _cost_total numeric := 0;
  _customer_name text;
  _coil_id uuid;
  _coil record;
  _product_name text;
BEGIN
  SELECT name INTO _customer_name FROM public.customers WHERE id = _customer_id;
  INSERT INTO public.sales (customer_id, customer_name_snapshot, notes)
    VALUES (_customer_id, _customer_name, _notes) RETURNING id INTO _sale_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _product FROM public.cable_products WHERE id = (_item->>'product_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Товар не найден'; END IF;

    _quantity := COALESCE((_item->>'quantity')::numeric, (_item->>'meters')::numeric, 0);
    IF _quantity <= 0 THEN RAISE EXCEPTION 'Укажите количество'; END IF;
    IF _quantity > _product.stock_quantity AND _quantity > _product.stock_meters THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    _unit_price := COALESCE(NULLIF(_item->>'unit_price','')::numeric, _product.sale_price);
    _line_total := _quantity * _unit_price;
    _coil_id := NULLIF(_item->>'coil_id','')::uuid;
    _product_name := trim(_product.brand || CASE WHEN coalesce(_product.cross_section, '') IN ('', '-') THEN '' ELSE ' ' || _product.cross_section END);

    IF _product.unit_type = 'meter' AND _coil_id IS NOT NULL THEN
      SELECT * INTO _coil FROM public.cable_coils WHERE id = _coil_id AND product_id = _product.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Бухта не найдена'; END IF;
      IF _coil.meters < _quantity THEN RAISE EXCEPTION 'На бухте % только % м', _coil.coil_number, _coil.meters; END IF;
      UPDATE public.cable_coils SET meters = meters - _quantity, updated_at = now() WHERE id = _coil_id;
    ELSIF _product.unit_type = 'meter' THEN
      -- Если для метража не указали бухту, но бухты есть
      IF EXISTS(SELECT 1 FROM public.cable_coils WHERE product_id = _product.id) THEN
        RAISE EXCEPTION 'Выберите бухту, с которой уходит кабель';
      END IF;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, product_name_snapshot, meters, quantity, unit_type, unit_price, unit_cost, line_total, coil_id, coil_number_snapshot)
      VALUES (_sale_id, _product.id, _product_name, _quantity, _quantity, _product.unit_type, _unit_price, _product.purchase_price, _line_total, _coil_id, CASE WHEN _coil_id IS NULL THEN NULL ELSE _coil.coil_number END);

    UPDATE public.cable_products
      SET stock_quantity = GREATEST(0, stock_quantity - _quantity),
          stock_meters = GREATEST(0, stock_meters - _quantity),
          updated_at = now()
      WHERE id = _product.id;

    INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, change_quantity, note)
      VALUES (_product.id, _sale_id, 'sale', -_quantity, -_quantity, 'Продажа');

    _total := _total + _line_total;
    _cost_total := _cost_total + _quantity * _product.purchase_price;
  END LOOP;

  DELETE FROM public.cable_coils WHERE meters <= 0;
  UPDATE public.sales SET total = _total, cost_total = _cost_total WHERE id = _sale_id;
  RETURN _sale_id;
END; $$;

-- Корректировка остатка
CREATE OR REPLACE FUNCTION public.adjust_stock_quantity(_product_id uuid, _new_quantity numeric, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _product public.cable_products%ROWTYPE; _change numeric;
BEGIN
  SELECT * INTO _product FROM public.cable_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Товар не найден'; END IF;
  IF _new_quantity IS NULL OR _new_quantity < 0 THEN RAISE EXCEPTION 'Укажите корректный остаток'; END IF;
  _change := _new_quantity - COALESCE(_product.stock_quantity, _product.stock_meters);
  UPDATE public.cable_products SET stock_quantity = _new_quantity, stock_meters = _new_quantity, updated_at = now() WHERE id = _product_id;
  IF _change <> 0 THEN
    INSERT INTO public.stock_movements (product_id, kind, change_meters, change_quantity, note)
      VALUES (_product_id, 'adjustment', _change, _change, coalesce(_note, 'Корректировка остатка'));
  END IF;
END; $$;

-- Возврат позиции продажи
CREATE OR REPLACE FUNCTION public.return_sale_item(_sale_item_id uuid, _meters numeric, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _item public.sale_items%ROWTYPE; _product public.cable_products%ROWTYPE; _new_coil_id uuid; _item_qty numeric;
BEGIN
  SELECT * INTO _item FROM public.sale_items WHERE id = _sale_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Позиция продажи не найдена'; END IF;
  _item_qty := COALESCE(_item.quantity, _item.meters);
  IF _meters IS NULL OR _meters <= 0 OR _meters > _item_qty THEN RAISE EXCEPTION 'Укажите корректное количество для возврата'; END IF;

  SELECT * INTO _product FROM public.cable_products WHERE id = _item.product_id FOR UPDATE;
  UPDATE public.cable_products
    SET stock_quantity = stock_quantity + _meters, stock_meters = stock_meters + _meters, updated_at = now()
    WHERE id = _item.product_id;

  IF _item.unit_type = 'meter' AND _item.coil_number_snapshot IS NOT NULL THEN
    SELECT id INTO _new_coil_id FROM public.cable_coils WHERE product_id = _item.product_id AND coil_number = _item.coil_number_snapshot LIMIT 1;
    IF _new_coil_id IS NULL THEN
      INSERT INTO public.cable_coils (product_id, coil_number, meters) VALUES (_item.product_id, _item.coil_number_snapshot, _meters);
    ELSE
      UPDATE public.cable_coils SET meters = meters + _meters, updated_at = now() WHERE id = _new_coil_id;
    END IF;
  END IF;

  INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, change_quantity, note)
    VALUES (_item.product_id, _item.sale_id, 'return', _meters, _meters, coalesce(_note, 'Возврат'));

  IF _meters = _item_qty THEN
    DELETE FROM public.sale_items WHERE id = _item.id;
  ELSE
    UPDATE public.sale_items SET quantity = _item_qty - _meters, meters = _item_qty - _meters, line_total = (_item_qty - _meters) * unit_price WHERE id = _item.id;
  END IF;

  PERFORM public.recompute_sale_totals(_item.sale_id);
END; $$;

-- Добавление позиции в существующую продажу
CREATE OR REPLACE FUNCTION public.add_sale_item(_sale_id uuid, _product_id uuid, _coil_id uuid, _meters numeric, _unit_price numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _product public.cable_products%ROWTYPE; _coil record; _item_id uuid; _price numeric; _name text;
BEGIN
  IF _meters IS NULL OR _meters <= 0 THEN RAISE EXCEPTION 'Укажите количество'; END IF;
  SELECT * INTO _product FROM public.cable_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Товар не найден'; END IF;

  IF _product.unit_type = 'meter' AND _coil_id IS NOT NULL THEN
    SELECT * INTO _coil FROM public.cable_coils WHERE id = _coil_id AND product_id = _product_id FOR UPDATE;
    IF NOT FOUND OR _coil.meters < _meters THEN RAISE EXCEPTION 'Недостаточно кабеля на бухте'; END IF;
    UPDATE public.cable_coils SET meters = meters - _meters, updated_at = now() WHERE id = _coil_id;
  END IF;

  _price := COALESCE(_unit_price, _product.sale_price);
  _name := trim(_product.brand || CASE WHEN coalesce(_product.cross_section, '') IN ('', '-') THEN '' ELSE ' ' || _product.cross_section END);

  INSERT INTO public.sale_items (sale_id, product_id, product_name_snapshot, meters, quantity, unit_type, unit_price, unit_cost, line_total, coil_id, coil_number_snapshot)
    VALUES (_sale_id, _product_id, _name, _meters, _meters, _product.unit_type, _price, _product.purchase_price, _meters * _price, _coil_id, CASE WHEN _coil_id IS NULL THEN NULL ELSE _coil.coil_number END) RETURNING id INTO _item_id;

  UPDATE public.cable_products SET stock_quantity = GREATEST(0, stock_quantity - _meters), stock_meters = GREATEST(0, stock_meters - _meters), updated_at = now() WHERE id = _product_id;
  INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, change_quantity, note) VALUES (_product_id, _sale_id, 'sale', -_meters, -_meters, 'Продажа');

  DELETE FROM public.cable_coils WHERE meters <= 0;
  PERFORM public.recompute_sale_totals(_sale_id);
  RETURN _item_id;
END; $$;

-- Изменение цены позиции
CREATE OR REPLACE FUNCTION public.set_sale_item_price(_sale_item_id uuid, _unit_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sale_id uuid;
BEGIN
  IF _unit_price IS NULL OR _unit_price < 0 THEN RAISE EXCEPTION 'Некорректная цена'; END IF;
  UPDATE public.sale_items SET unit_price = _unit_price, line_total = COALESCE(quantity, meters) * _unit_price WHERE id = _sale_item_id RETURNING sale_id INTO _sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Позиция продажи не найдена'; END IF;
  PERFORM public.recompute_sale_totals(_sale_id);
END; $$;

-- Установка скидки
CREATE OR REPLACE FUNCTION public.set_sale_discount(_sale_id uuid, _discount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _discount IS NULL OR _discount < 0 THEN RAISE EXCEPTION 'Некорректная скидка'; END IF;
  UPDATE public.sales SET discount = _discount WHERE id = _sale_id;
  PERFORM public.recompute_sale_totals(_sale_id);
END; $$;

-- ==============================================================================
-- ГОТОВО! ВСЕ ТАБЛИЦЫ, ПОЛИТИКИ И ФУНКЦИИ СОЗДАНЫ.
-- ==============================================================================
