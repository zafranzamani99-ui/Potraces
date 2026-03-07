-- Allow sellers to read order_link orders placed by customers for their shop
-- (order_link orders have user_id = null, so seller_orders_owner policy doesn't cover them)
CREATE POLICY "seller_orders_link_read" ON public.seller_orders
  FOR SELECT USING (
    source = 'order_link'
    AND seller_id IN (
      SELECT id FROM public.seller_profiles WHERE user_id = auth.uid()
    )
  );
