ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recompute_sale_totals(_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sum numeric := 0;
  _cost numeric := 0;
  _disc numeric := 0;
BEGIN
  SELECT COALESCE(SUM(line_total),0), COALESCE(SUM(meters * unit_cost),0)
    INTO _sum, _cost
    FROM public.sale_items WHERE sale_id = _sale_id;
  SELECT COALESCE(discount,0) INTO _disc FROM public.sales WHERE id = _sale_id;
  UPDATE public.sales SET total = GREATEST(_sum - _disc, 0), cost_total = _cost WHERE id = _sale_id;
END; $$;

CREATE OR REPLACE FUNCTION public.return_sale_item(_sale_item_id uuid, _meters numeric, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _item public.sale_items%ROWTYPE;
  _coil_exists boolean := false;
BEGIN
  SELECT * INTO _item FROM public.sale_items WHERE id = _sale_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Позиция не найдена'; END IF;
  IF _meters IS NULL OR _meters <= 0 THEN RAISE EXCEPTION 'Укажите количество метров для возврата'; END IF;
  IF _meters > _item.meters THEN RAISE EXCEPTION 'Нельзя вернуть больше, чем продано (% м)', _item.meters; END IF;

  -- вернуть на склад
  UPDATE public.cable_products
    SET stock_meters = stock_meters + _meters, updated_at = now()
    WHERE id = _item.product_id;

  -- вернуть на бухту
  IF _item.coil_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM public.cable_coils WHERE id = _item.coil_id) INTO _coil_exists;
    IF _coil_exists THEN
      UPDATE public.cable_coils SET meters = meters + _meters, updated_at = now() WHERE id = _item.coil_id;
    ELSIF _item.coil_number_snapshot IS NOT NULL THEN
      INSERT INTO public.cable_coils (id, product_id, coil_number, meters)
        VALUES (_item.coil_id, _item.product_id, _item.coil_number_snapshot, _meters);
    END IF;
  END IF;

  INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, note)
    VALUES (_item.product_id, _item.sale_id, 'return', _meters,
      COALESCE(_note, 'Возврат позиции' ||
        CASE WHEN _item.coil_number_snapshot IS NULL THEN '' ELSE ' (бухта ' || _item.coil_number_snapshot || ')' END));

  IF _meters >= _item.meters THEN
    DELETE FROM public.sale_items WHERE id = _sale_item_id;
  ELSE
    UPDATE public.sale_items
      SET meters = meters - _meters,
          line_total = (meters - _meters) * unit_price
      WHERE id = _sale_item_id;
  END IF;

  PERFORM public.recompute_sale_totals(_item.sale_id);
END; $$;

CREATE OR REPLACE FUNCTION public.add_sale_item(_sale_id uuid, _product_id uuid, _coil_id uuid, _meters numeric, _unit_price numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _product public.cable_products%ROWTYPE;
  _coil public.cable_coils%ROWTYPE;
  _coil_number text := NULL;
  _price numeric;
  _new_id uuid;
BEGIN
  IF _meters IS NULL OR _meters <= 0 THEN RAISE EXCEPTION 'Укажите количество метров'; END IF;
  SELECT * INTO _product FROM public.cable_products WHERE id = _product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Кабель не найден'; END IF;
  _price := COALESCE(_unit_price, _product.sale_price);

  IF _coil_id IS NOT NULL THEN
    SELECT * INTO _coil FROM public.cable_coils WHERE id = _coil_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Бухта не найдена'; END IF;
    IF _coil.product_id <> _product_id THEN RAISE EXCEPTION 'Бухта относится к другому кабелю'; END IF;
    IF _coil.meters < _meters THEN RAISE EXCEPTION 'На бухте % только % м', _coil.coil_number, _coil.meters; END IF;
    _coil_number := _coil.coil_number;
    UPDATE public.cable_coils SET meters = meters - _meters, updated_at = now() WHERE id = _coil_id;
  END IF;

  INSERT INTO public.sale_items (sale_id, product_id, product_name_snapshot, meters, unit_price, unit_cost, line_total, coil_id, coil_number_snapshot)
    VALUES (_sale_id, _product.id, _product.brand || ' ' || _product.cross_section, _meters, _price, _product.purchase_price, _meters * _price, _coil_id, _coil_number)
    RETURNING id INTO _new_id;

  UPDATE public.cable_products SET stock_meters = stock_meters - _meters, updated_at = now() WHERE id = _product_id;
  INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, note)
    VALUES (_product_id, _sale_id, 'sale', -_meters,
      CASE WHEN _coil_number IS NULL THEN 'Добавлено в продажу' ELSE 'Добавлено в продажу (бухта ' || _coil_number || ')' END);

  DELETE FROM public.cable_coils WHERE meters <= 0;
  PERFORM public.recompute_sale_totals(_sale_id);
  RETURN _new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_sale_item_price(_sale_item_id uuid, _unit_price numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sale uuid;
BEGIN
  IF _unit_price IS NULL OR _unit_price < 0 THEN RAISE EXCEPTION 'Некорректная цена'; END IF;
  UPDATE public.sale_items
    SET unit_price = _unit_price, line_total = meters * _unit_price
    WHERE id = _sale_item_id
    RETURNING sale_id INTO _sale;
  IF _sale IS NULL THEN RAISE EXCEPTION 'Позиция не найдена'; END IF;
  PERFORM public.recompute_sale_totals(_sale);
END; $$;

CREATE OR REPLACE FUNCTION public.set_sale_discount(_sale_id uuid, _discount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _discount IS NULL OR _discount < 0 THEN RAISE EXCEPTION 'Некорректная скидка'; END IF;
  UPDATE public.sales SET discount = _discount WHERE id = _sale_id;
  PERFORM public.recompute_sale_totals(_sale_id);
END; $$;