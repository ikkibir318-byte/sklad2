-- Products can be sold by length, weight, or individual pieces. Existing cable
-- records remain metre-based, so this migration is safe for already entered data.
ALTER TABLE public.cable_products
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'meter',
  ADD COLUMN IF NOT EXISTS stock_quantity numeric NOT NULL DEFAULT 0;

UPDATE public.cable_products
  SET stock_quantity = stock_meters
  WHERE stock_quantity = 0 AND stock_meters <> 0;

ALTER TABLE public.cable_products
  DROP CONSTRAINT IF EXISTS cable_products_unit_type_check;
ALTER TABLE public.cable_products
  ADD CONSTRAINT cable_products_unit_type_check
  CHECK (unit_type IN ('meter', 'kilogram', 'piece'));

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS unit_type text NOT NULL DEFAULT 'meter';
UPDATE public.sale_items SET quantity = meters WHERE quantity IS NULL;
ALTER TABLE public.sale_items
  ALTER COLUMN quantity SET NOT NULL;
ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_unit_type_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_unit_type_check
  CHECK (unit_type IN ('meter', 'kilogram', 'piece'));

ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS change_quantity numeric;
UPDATE public.stock_movements SET change_quantity = change_meters WHERE change_quantity IS NULL;
ALTER TABLE public.stock_movements
  ALTER COLUMN change_quantity SET NOT NULL;

-- Sale creation works for every unit. Coils are required only for metre-based
-- products and continue to be updated exactly as before.
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
    IF _quantity > _product.stock_quantity THEN RAISE EXCEPTION 'Недостаточно товара на складе'; END IF;
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
      RAISE EXCEPTION 'Выберите бухту, с которой уходит кабель';
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, product_name_snapshot, meters, quantity, unit_type, unit_price, unit_cost, line_total, coil_id, coil_number_snapshot)
      VALUES (_sale_id, _product.id, _product_name, _quantity, _quantity, _product.unit_type, _unit_price, _product.purchase_price, _line_total, _coil_id, CASE WHEN _coil_id IS NULL THEN NULL ELSE _coil.coil_number END);
    UPDATE public.cable_products
      SET stock_quantity = stock_quantity - _quantity,
          stock_meters = CASE WHEN unit_type = 'meter' THEN stock_meters - _quantity ELSE stock_meters END,
          updated_at = now()
      WHERE id = _product.id;
    INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, change_quantity, note)
      VALUES (_product.id, _sale_id, 'sale', CASE WHEN _product.unit_type = 'meter' THEN -_quantity ELSE 0 END, -_quantity, 'Продажа');
    _total := _total + _line_total;
    _cost_total := _cost_total + _quantity * _product.purchase_price;
  END LOOP;
  UPDATE public.sales SET total = _total, cost_total = _cost_total WHERE id = _sale_id;
  RETURN _sale_id;
END; $$;

CREATE OR REPLACE FUNCTION public.adjust_stock_quantity(_product_id uuid, _new_quantity numeric, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _product public.cable_products%ROWTYPE; _change numeric;
BEGIN
  SELECT * INTO _product FROM public.cable_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Товар не найден'; END IF;
  IF _new_quantity IS NULL OR _new_quantity < 0 THEN RAISE EXCEPTION 'Укажите корректный остаток'; END IF;
  IF _product.unit_type = 'meter' THEN RAISE EXCEPTION 'Остаток кабеля в метрах корректируется через бухты'; END IF;
  _change := _new_quantity - _product.stock_quantity;
  UPDATE public.cable_products SET stock_quantity = _new_quantity, updated_at = now() WHERE id = _product_id;
  IF _change <> 0 THEN
    INSERT INTO public.stock_movements (product_id, kind, change_meters, change_quantity, note)
      VALUES (_product_id, 'adjustment', 0, _change, coalesce(_note, 'Корректировка остатка'));
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.recompute_sale_totals(_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _total numeric; _cost_total numeric; _discount numeric;
BEGIN
  SELECT COALESCE(SUM(line_total), 0), COALESCE(SUM(quantity * unit_cost), 0)
    INTO _total, _cost_total FROM public.sale_items WHERE sale_id = _sale_id;
  SELECT COALESCE(discount, 0) INTO _discount FROM public.sales WHERE id = _sale_id;
  UPDATE public.sales SET total = GREATEST(0, _total - _discount), cost_total = _cost_total WHERE id = _sale_id;
END; $$;

CREATE OR REPLACE FUNCTION public.add_sale_item(_sale_id uuid, _product_id uuid, _coil_id uuid, _meters numeric, _unit_price numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _product public.cable_products%ROWTYPE; _coil record; _item_id uuid; _price numeric; _name text;
BEGIN
  IF _meters IS NULL OR _meters <= 0 THEN RAISE EXCEPTION 'Укажите количество'; END IF;
  SELECT * INTO _product FROM public.cable_products WHERE id = _product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Товар не найден'; END IF;
  IF _meters > _product.stock_quantity THEN RAISE EXCEPTION 'Недостаточно товара на складе'; END IF;
  IF _product.unit_type = 'meter' THEN
    IF _coil_id IS NULL THEN RAISE EXCEPTION 'Выберите бухту'; END IF;
    SELECT * INTO _coil FROM public.cable_coils WHERE id = _coil_id AND product_id = _product_id FOR UPDATE;
    IF NOT FOUND OR _coil.meters < _meters THEN RAISE EXCEPTION 'Недостаточно кабеля на бухте'; END IF;
    UPDATE public.cable_coils SET meters = meters - _meters, updated_at = now() WHERE id = _coil_id;
  END IF;
  _price := COALESCE(_unit_price, _product.sale_price);
  _name := trim(_product.brand || CASE WHEN coalesce(_product.cross_section, '') IN ('', '-') THEN '' ELSE ' ' || _product.cross_section END);
  INSERT INTO public.sale_items (sale_id, product_id, product_name_snapshot, meters, quantity, unit_type, unit_price, unit_cost, line_total, coil_id, coil_number_snapshot)
    VALUES (_sale_id, _product_id, _name, _meters, _meters, _product.unit_type, _price, _product.purchase_price, _meters * _price, _coil_id, CASE WHEN _coil_id IS NULL THEN NULL ELSE _coil.coil_number END) RETURNING id INTO _item_id;
  UPDATE public.cable_products SET stock_quantity = stock_quantity - _meters, stock_meters = CASE WHEN unit_type = 'meter' THEN stock_meters - _meters ELSE stock_meters END, updated_at = now() WHERE id = _product_id;
  INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, change_quantity, note) VALUES (_product_id, _sale_id, 'sale', CASE WHEN _product.unit_type = 'meter' THEN -_meters ELSE 0 END, -_meters, 'Продажа');
  PERFORM public.recompute_sale_totals(_sale_id);
  RETURN _item_id;
END; $$;

CREATE OR REPLACE FUNCTION public.return_sale_item(_sale_item_id uuid, _meters numeric, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _item public.sale_items%ROWTYPE; _product public.cable_products%ROWTYPE; _new_coil_id uuid;
BEGIN
  SELECT * INTO _item FROM public.sale_items WHERE id = _sale_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Позиция продажи не найдена'; END IF;
  IF _meters IS NULL OR _meters <= 0 OR _meters > _item.quantity THEN RAISE EXCEPTION 'Укажите корректное количество для возврата'; END IF;
  SELECT * INTO _product FROM public.cable_products WHERE id = _item.product_id FOR UPDATE;
  UPDATE public.cable_products SET stock_quantity = stock_quantity + _meters, stock_meters = CASE WHEN unit_type = 'meter' THEN stock_meters + _meters ELSE stock_meters END, updated_at = now() WHERE id = _item.product_id;
  IF _item.unit_type = 'meter' AND _item.coil_number_snapshot IS NOT NULL THEN
    SELECT id INTO _new_coil_id FROM public.cable_coils WHERE product_id = _item.product_id AND coil_number = _item.coil_number_snapshot LIMIT 1;
    IF _new_coil_id IS NULL THEN
      INSERT INTO public.cable_coils (product_id, coil_number, meters) VALUES (_item.product_id, _item.coil_number_snapshot, _meters);
    ELSE
      UPDATE public.cable_coils SET meters = meters + _meters, updated_at = now() WHERE id = _new_coil_id;
    END IF;
  END IF;
  INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, change_quantity, note) VALUES (_item.product_id, _item.sale_id, 'return', CASE WHEN _item.unit_type = 'meter' THEN _meters ELSE 0 END, _meters, coalesce(_note, 'Возврат'));
  IF _meters = _item.quantity THEN DELETE FROM public.sale_items WHERE id = _item.id;
  ELSE UPDATE public.sale_items SET quantity = quantity - _meters, meters = meters - _meters, line_total = (quantity - _meters) * unit_price WHERE id = _item.id; END IF;
  PERFORM public.recompute_sale_totals(_item.sale_id);
END; $$;

CREATE OR REPLACE FUNCTION public.set_sale_item_price(_sale_item_id uuid, _unit_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _sale_id uuid;
BEGIN
  IF _unit_price IS NULL OR _unit_price < 0 THEN RAISE EXCEPTION 'Некорректная цена'; END IF;
  UPDATE public.sale_items SET unit_price = _unit_price, line_total = quantity * _unit_price WHERE id = _sale_item_id RETURNING sale_id INTO _sale_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Позиция продажи не найдена'; END IF;
  PERFORM public.recompute_sale_totals(_sale_id);
END; $$;
