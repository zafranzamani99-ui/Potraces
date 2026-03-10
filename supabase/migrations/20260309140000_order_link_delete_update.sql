-- Allow sellers to DELETE order_link orders for their shop.
-- order_link orders have user_id = null, so the seller_orders_owner policy doesn't cover them.
CREATE POLICY "seller_orders_link_delete" ON public.seller_orders
  FOR DELETE USING (
    source = 'order_link'
    AND seller_id IN (
      SELECT id FROM public.seller_profiles WHERE user_id = auth.uid()
    )
  );

-- Allow sellers to UPDATE order_link orders for their shop.
CREATE POLICY "seller_orders_link_update" ON public.seller_orders
  FOR UPDATE USING (
    source = 'order_link'
    AND seller_id IN (
      SELECT id FROM public.seller_profiles WHERE user_id = auth.uid()
    )
  );
