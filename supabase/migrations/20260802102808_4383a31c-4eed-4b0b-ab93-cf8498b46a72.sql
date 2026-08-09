
CREATE TYPE public.app_role AS ENUM ('admin','staff');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_all" ON public.profiles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO anon, authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_all" ON public.user_roles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE TABLE public.cable_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  cross_section text NOT NULL,
  batch text,
  supplier text,
  notes text,
  purchase_price numeric NOT NULL DEFAULT 0,
  sale_price numeric NOT NULL DEFAULT 0,
  stock_meters numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 100,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cable_products TO anon, authenticated;
GRANT ALL ON public.cable_products TO service_role;
ALTER TABLE public.cable_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cable_products_all" ON public.cable_products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER cable_products_updated_at BEFORE UPDATE ON public.cable_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.cable_coils (
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
CREATE POLICY "cable_coils_all" ON public.cable_coils FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER cable_coils_updated_at BEFORE UPDATE ON public.cable_coils FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.customers (
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
CREATE POLICY "customers_all" ON public.customers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name_snapshot text,
  notes text,
  total numeric NOT NULL DEFAULT 0,
  cost_total numeric NOT NULL DEFAULT 0,
  sold_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO anon, authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_all" ON public.sales FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.cable_products(id),
  product_name_snapshot text NOT NULL,
  meters numeric NOT NULL,
  unit_price numeric NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_items TO anon, authenticated;
GRANT ALL ON public.sale_items TO service_role;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sale_items_all" ON public.sale_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.cable_products(id) ON DELETE CASCADE,
  sale_id uuid,
  kind text NOT NULL,
  change_meters numeric NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO anon, authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_movements_all" ON public.stock_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.calculate_stock_from_coils(_product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(meters), 0) FROM public.cable_coils WHERE product_id = _product_id;
$$;

CREATE OR REPLACE FUNCTION public.adjust_stock(_product_id uuid, _change_meters numeric, _kind text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cable_products
    SET stock_meters = stock_meters + _change_meters, updated_at = now()
    WHERE id = _product_id;
  INSERT INTO public.stock_movements (product_id, kind, change_meters, note)
    VALUES (_product_id, COALESCE(_kind, 'adjust'), _change_meters, _note);
END; $$;

CREATE OR REPLACE FUNCTION public.create_sale(_customer_id uuid, _notes text, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sale_id uuid;
  _item jsonb;
  _product public.cable_products%ROWTYPE;
  _meters numeric;
  _unit_price numeric;
  _line_total numeric;
  _total numeric := 0;
  _cost_total numeric := 0;
  _customer_name text;
BEGIN
  SELECT name INTO _customer_name FROM public.customers WHERE id = _customer_id;

  INSERT INTO public.sales (customer_id, customer_name_snapshot, notes)
    VALUES (_customer_id, _customer_name, _notes)
    RETURNING id INTO _sale_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    SELECT * INTO _product FROM public.cable_products WHERE id = (_item->>'product_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

    _meters := COALESCE((_item->>'meters')::numeric, 0);
    _unit_price := COALESCE(NULLIF(_item->>'unit_price','')::numeric, _product.sale_price);
    _line_total := _meters * _unit_price;

    INSERT INTO public.sale_items (sale_id, product_id, product_name_snapshot, meters, unit_price, unit_cost, line_total)
      VALUES (_sale_id, _product.id, _product.brand || ' ' || _product.cross_section, _meters, _unit_price, _product.purchase_price, _line_total);

    UPDATE public.cable_products SET stock_meters = stock_meters - _meters, updated_at = now() WHERE id = _product.id;
    INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, note)
      VALUES (_product.id, _sale_id, 'sale', -_meters, 'Продажа');

    _total := _total + _line_total;
    _cost_total := _cost_total + _meters * _product.purchase_price;
  END LOOP;

  UPDATE public.sales SET total = _total, cost_total = _cost_total WHERE id = _sale_id;
  RETURN _sale_id;
END; $$;
