ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS coil_id uuid REFERENCES public.cable_coils(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coil_number_snapshot text;

CREATE OR REPLACE FUNCTION public.create_sale(_customer_id uuid, _notes text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sale_id uuid;
  _item jsonb;
  _product public.cable_products%ROWTYPE;
  _coil public.cable_coils%ROWTYPE;
  _coil_id uuid;
  _coil_number text;
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
    _coil_id := NULLIF(_item->>'coil_id','')::uuid;
    _coil_number := NULL;

    IF _coil_id IS NOT NULL THEN
      SELECT * INTO _coil FROM public.cable_coils WHERE id = _coil_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Coil not found'; END IF;
      IF _coil.product_id <> _product.id THEN RAISE EXCEPTION 'Coil belongs to another product'; END IF;
      IF _coil.meters < _meters THEN
        RAISE EXCEPTION 'Not enough cable on coil %: % m available', _coil.coil_number, _coil.meters;
      END IF;
      _coil_number := _coil.coil_number;
      UPDATE public.cable_coils
        SET meters = meters - _meters, updated_at = now()
        WHERE id = _coil_id;
    END IF;

    INSERT INTO public.sale_items (sale_id, product_id, product_name_snapshot, meters, unit_price, unit_cost, line_total, coil_id, coil_number_snapshot)
      VALUES (_sale_id, _product.id, _product.brand || ' ' || _product.cross_section, _meters, _unit_price, _product.purchase_price, _line_total, _coil_id, _coil_number);

    UPDATE public.cable_products SET stock_meters = stock_meters - _meters, updated_at = now() WHERE id = _product.id;
    INSERT INTO public.stock_movements (product_id, sale_id, kind, change_meters, note)
      VALUES (_product.id, _sale_id, 'sale', -_meters,
        CASE WHEN _coil_number IS NULL THEN 'Продажа' ELSE 'Продажа (бухта ' || _coil_number || ')' END);

    _total := _total + _line_total;
    _cost_total := _cost_total + _meters * _product.purchase_price;
  END LOOP;

  UPDATE public.sales SET total = _total, cost_total = _cost_total WHERE id = _sale_id;

  DELETE FROM public.cable_coils WHERE meters <= 0;

  RETURN _sale_id;
END; $function$;