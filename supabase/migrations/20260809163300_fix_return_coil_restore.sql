-- Fix: restore coil on return even when coil_id was set to NULL by FK cascade.
--
-- Problem: When a coil is fully sold, `DELETE FROM cable_coils WHERE meters <= 0`
-- removes it, and the FK `ON DELETE SET NULL` nullifies `sale_items.coil_id`.
-- On return, `return_sale_item` checked only `coil_id IS NOT NULL`, which was
-- always false after a full-coil sale, so the coil was never restored.
--
-- Fix: Also check `coil_number_snapshot` when `coil_id` is NULL to recreate coil.

CREATE OR REPLACE FUNCTION public.return_sale_item(_sale_item_id uuid, _meters numeric, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _item public.sale_items%ROWTYPE;
  _coil_exists boolean := false;
  _new_coil_id uuid;
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
    -- coil_id ещё на месте — бухта не была удалена
    SELECT EXISTS(SELECT 1 FROM public.cable_coils WHERE id = _item.coil_id) INTO _coil_exists;
    IF _coil_exists THEN
      UPDATE public.cable_coils SET meters = meters + _meters, updated_at = now() WHERE id = _item.coil_id;
    ELSIF _item.coil_number_snapshot IS NOT NULL THEN
      INSERT INTO public.cable_coils (id, product_id, coil_number, meters)
        VALUES (_item.coil_id, _item.product_id, _item.coil_number_snapshot, _meters);
    END IF;
  ELSIF _item.coil_number_snapshot IS NOT NULL THEN
    -- coil_id = NULL из-за FK ON DELETE SET NULL (бухта была удалена при продаже)
    -- Пробуем найти бухту с таким же номером у этого продукта
    SELECT id INTO _new_coil_id
      FROM public.cable_coils
      WHERE product_id = _item.product_id AND coil_number = _item.coil_number_snapshot
      LIMIT 1;

    IF _new_coil_id IS NOT NULL THEN
      -- Бухта с таким номером уже есть — добавляем метры к ней
      UPDATE public.cable_coils SET meters = meters + _meters, updated_at = now() WHERE id = _new_coil_id;
    ELSE
      -- Бухты нет — создаём заново
      INSERT INTO public.cable_coils (product_id, coil_number, meters)
        VALUES (_item.product_id, _item.coil_number_snapshot, _meters);
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
