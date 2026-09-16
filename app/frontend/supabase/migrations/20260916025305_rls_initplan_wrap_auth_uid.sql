-- ============================================================================
--  PROPOSITION DE MIGRATION (point 4) — optimisation auth_rls_initplan
--  STATUT : NON APPLIQUÉE. À valider avant exécution.
--
--  Objet : remplacer auth.uid() par (select auth.uid()) dans TOUTES les
--  policies du schéma public qui l'utilisent (directement ou via
--  is_admin(auth.uid()) / business_role(..., auth.uid()) / is_business_member(
--  ..., auth.uid())), pour que l'appel soit évalué une seule fois par requête
--  (recommandation Supabase « auth_rls_initplan »). AUCUN changement de
--  logique, de rôle, de commande ni de portée : seules les policies sont
--  recréées à l'identique avec l'appel encapsulé.
--
--  Généré depuis les définitions live (pg_policies) — 88 policies sur 43 tables,
--  `to public`. Enveloppé dans une transaction : tout passe ou rien.
-- ============================================================================

begin;

drop policy "admin_users admin read" on public.admin_users;
create policy "admin_users admin read" on public.admin_users as permissive for select to public
  using ((select is_admin((select auth.uid()))));

drop policy "admin_users admin write" on public.admin_users;
create policy "admin_users admin write" on public.admin_users as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy api_keys_delete on public.api_keys;
create policy api_keys_delete on public.api_keys as permissive for delete to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])));

drop policy api_keys_insert on public.api_keys;
create policy api_keys_insert on public.api_keys as permissive for insert to public
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])));

drop policy api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy api_keys_update on public.api_keys;
create policy api_keys_update on public.api_keys as permissive for update to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])))
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])));

drop policy api_plans_admin_write on public.api_plans;
create policy api_plans_admin_write on public.api_plans as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy api_usage_log_select on public.api_usage_log;
create policy api_usage_log_select on public.api_usage_log as permissive for select to public
  using (((business_id IS NULL) OR (business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text]))));

drop policy "auth_providers admin write" on public.auth_providers;
create policy "auth_providers admin write" on public.auth_providers as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "blog_posts admin write" on public.blog_posts;
create policy "blog_posts admin write" on public.blog_posts as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "blog_posts public read published" on public.blog_posts;
create policy "blog_posts public read published" on public.blog_posts as permissive for select to public
  using (((published = true) OR (select is_admin((select auth.uid())))));

drop policy "customers manager write" on public.business_customers;
create policy "customers manager write" on public.business_customers as permissive for all to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text])))
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text])));

drop policy "customers member read" on public.business_customers;
create policy "customers member read" on public.business_customers as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy "invitations admin all" on public.business_invitations;
create policy "invitations admin all" on public.business_invitations as permissive for all to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])))
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])));

drop policy "members admin write" on public.business_members;
create policy "members admin write" on public.business_members as permissive for all to public
  using (((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])) AND ((role <> 'owner'::text) OR (business_role(business_id, (select auth.uid())) = 'owner'::text))))
  with check (((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])) AND ((role <> 'owner'::text) OR (business_role(business_id, (select auth.uid())) = 'owner'::text))));

drop policy "members read own business" on public.business_members;
create policy "members read own business" on public.business_members as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy "members self leave" on public.business_members;
create policy "members self leave" on public.business_members as permissive for delete to public
  using (((user_id = (select auth.uid())) AND (role <> 'owner'::text)));

drop policy business_plans_admin_write on public.business_plans;
create policy business_plans_admin_write on public.business_plans as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy business_plans_select on public.business_plans;
create policy business_plans_select on public.business_plans as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy "businesses authenticated insert" on public.businesses;
create policy "businesses authenticated insert" on public.businesses as permissive for insert to public
  with check ((owner_user_id = (select auth.uid())));

drop policy "businesses member read" on public.businesses;
create policy "businesses member read" on public.businesses as permissive for select to public
  using (is_business_member(id, (select auth.uid())));

drop policy "businesses owner delete" on public.businesses;
create policy "businesses owner delete" on public.businesses as permissive for delete to public
  using ((owner_user_id = (select auth.uid())));

drop policy "businesses owner update" on public.businesses;
create policy "businesses owner update" on public.businesses as permissive for update to public
  using ((owner_user_id = (select auth.uid())))
  with check ((owner_user_id = (select auth.uid())));

drop policy "custom_pages admin write" on public.custom_pages;
create policy "custom_pages admin write" on public.custom_pages as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "custom_pages public read published" on public.custom_pages;
create policy "custom_pages public read published" on public.custom_pages as permissive for select to public
  using (((published = true) OR (select is_admin((select auth.uid())))));

drop policy "addresses manager write" on public.customer_addresses;
create policy "addresses manager write" on public.customer_addresses as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM business_customers c
  WHERE ((c.id = customer_addresses.customer_id) AND (business_role(c.business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM business_customers c
  WHERE ((c.id = customer_addresses.customer_id) AND (business_role(c.business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text]))))));

drop policy "addresses member read" on public.customer_addresses;
create policy "addresses member read" on public.customer_addresses as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM business_customers c
  WHERE ((c.id = customer_addresses.customer_id) AND is_business_member(c.business_id, (select auth.uid()))))));

drop policy "destination_cities admin write" on public.destination_cities;
create policy "destination_cities admin write" on public.destination_cities as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy expenses_delete on public.expenses;
create policy expenses_delete on public.expenses as permissive for delete to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'accounting'::text])));

drop policy expenses_insert on public.expenses;
create policy expenses_insert on public.expenses as permissive for insert to public
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'accounting'::text, 'operations'::text])));

drop policy expenses_select on public.expenses;
create policy expenses_select on public.expenses as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy expenses_update on public.expenses;
create policy expenses_update on public.expenses as permissive for update to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'accounting'::text, 'operations'::text])))
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'accounting'::text, 'operations'::text])));

drop policy "forwarding admin read" on public.forwarding_requests;
create policy "forwarding admin read" on public.forwarding_requests as permissive for select to public
  using ((select is_admin((select auth.uid()))));

drop policy "forwarding admin update" on public.forwarding_requests;
create policy "forwarding admin update" on public.forwarding_requests as permissive for update to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy indexnow_state_admin_read on public.indexnow_state;
create policy indexnow_state_admin_read on public.indexnow_state as permissive for select to public
  using ((select is_admin((select auth.uid()))));

drop policy invoice_lines_select on public.invoice_lines;
create policy invoice_lines_select on public.invoice_lines as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_lines.invoice_id) AND is_business_member(i.business_id, (select auth.uid()))))));

drop policy invoice_lines_write on public.invoice_lines;
create policy invoice_lines_write on public.invoice_lines as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_lines.invoice_id) AND (business_role(i.business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'accounting'::text])) AND (i.status = 'draft'::text)))))
  with check ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_lines.invoice_id) AND (business_role(i.business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'accounting'::text])) AND (i.status = 'draft'::text)))));

drop policy invoices_delete on public.invoices;
create policy invoices_delete on public.invoices as permissive for delete to public
  using (((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'accounting'::text])) AND (status = 'draft'::text)));

drop policy invoices_insert on public.invoices;
create policy invoices_insert on public.invoices as permissive for insert to public
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'accounting'::text])));

drop policy invoices_select on public.invoices;
create policy invoices_select on public.invoices as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy invoices_update on public.invoices;
create policy invoices_update on public.invoices as permissive for update to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'accounting'::text])))
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'accounting'::text])));

drop policy "orders admin update" on public.orders;
create policy "orders admin update" on public.orders as permissive for update to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "orders self insert" on public.orders;
create policy "orders self insert" on public.orders as permissive for insert to public
  with check (((select auth.uid()) = user_id));

drop policy "orders self read" on public.orders;
create policy "orders self read" on public.orders as permissive for select to public
  using ((((select auth.uid()) = user_id) OR (select is_admin((select auth.uid())))));

drop policy platform_settings_admin_write on public.platform_settings;
create policy platform_settings_admin_write on public.platform_settings as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "categories admin write" on public.product_categories;
create policy "categories admin write" on public.product_categories as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "product_sources admin all" on public.product_sources;
create policy "product_sources admin all" on public.product_sources as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "products admin write" on public.products;
create policy "products admin write" on public.products as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "products public read active" on public.products;
create policy "products public read active" on public.products as permissive for select to public
  using (((is_active = true) OR (select is_admin((select auth.uid())))));

drop policy "profiles owner read" on public.profiles;
create policy "profiles owner read" on public.profiles as permissive for select to public
  using (((select auth.uid()) = id));

drop policy "profiles owner update" on public.profiles;
create policy "profiles owner update" on public.profiles as permissive for update to public
  using (((select auth.uid()) = id))
  with check (((select auth.uid()) = id));

drop policy "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles as permissive for insert to public
  with check (((select auth.uid()) = id));

drop policy quote_lines_select on public.quote_lines;
create policy quote_lines_select on public.quote_lines as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM quotes q
  WHERE ((q.id = quote_lines.quote_id) AND is_business_member(q.business_id, (select auth.uid()))))));

drop policy quote_lines_write on public.quote_lines;
create policy quote_lines_write on public.quote_lines as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM quotes q
  WHERE ((q.id = quote_lines.quote_id) AND is_business_member(q.business_id, (select auth.uid()))))))
  with check ((EXISTS ( SELECT 1
   FROM quotes q
  WHERE ((q.id = quote_lines.quote_id) AND is_business_member(q.business_id, (select auth.uid()))))));

drop policy quotes_delete on public.quotes;
create policy quotes_delete on public.quotes as permissive for delete to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy quotes_insert on public.quotes;
create policy quotes_insert on public.quotes as permissive for insert to public
  with check (is_business_member(business_id, (select auth.uid())));

drop policy quotes_select on public.quotes;
create policy quotes_select on public.quotes as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy quotes_update on public.quotes;
create policy quotes_update on public.quotes as permissive for update to public
  using (is_business_member(business_id, (select auth.uid())))
  with check (is_business_member(business_id, (select auth.uid())));

drop policy rate_providers_admin_all on public.rate_providers;
create policy rate_providers_admin_all on public.rate_providers as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy rate_rules_admin_all on public.rate_rules;
create policy rate_rules_admin_all on public.rate_rules as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "charges manager write" on public.shipment_charges;
create policy "charges manager write" on public.shipment_charges as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = shipment_charges.shipment_id) AND (business_role(s.business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = shipment_charges.shipment_id) AND (business_role(s.business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text]))))));

drop policy "charges member read" on public.shipment_charges;
create policy "charges member read" on public.shipment_charges as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = shipment_charges.shipment_id) AND is_business_member(s.business_id, (select auth.uid()))))));

drop policy shipment_documents_delete on public.shipment_documents;
create policy shipment_documents_delete on public.shipment_documents as permissive for delete to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy shipment_documents_insert on public.shipment_documents;
create policy shipment_documents_insert on public.shipment_documents as permissive for insert to public
  with check (is_business_member(business_id, (select auth.uid())));

drop policy shipment_documents_select on public.shipment_documents;
create policy shipment_documents_select on public.shipment_documents as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy shipment_documents_update on public.shipment_documents;
create policy shipment_documents_update on public.shipment_documents as permissive for update to public
  using (is_business_member(business_id, (select auth.uid())))
  with check (is_business_member(business_id, (select auth.uid())));

drop policy shipment_events_insert on public.shipment_events;
create policy shipment_events_insert on public.shipment_events as permissive for insert to public
  with check (is_business_member(business_id, (select auth.uid())));

drop policy shipment_events_select on public.shipment_events;
create policy shipment_events_select on public.shipment_events as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy "packages manager write" on public.shipment_packages;
create policy "packages manager write" on public.shipment_packages as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = shipment_packages.shipment_id) AND (business_role(s.business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text]))))))
  with check ((EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = shipment_packages.shipment_id) AND (business_role(s.business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text]))))));

drop policy "packages member read" on public.shipment_packages;
create policy "packages member read" on public.shipment_packages as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM shipments s
  WHERE ((s.id = shipment_packages.shipment_id) AND is_business_member(s.business_id, (select auth.uid()))))));

drop policy "templates manager write" on public.shipment_templates;
create policy "templates manager write" on public.shipment_templates as permissive for all to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text])))
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text])));

drop policy "templates member read" on public.shipment_templates;
create policy "templates member read" on public.shipment_templates as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy "shipments manager write" on public.shipments;
create policy "shipments manager write" on public.shipments as permissive for all to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text])))
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'operations'::text])));

drop policy "shipments member read" on public.shipments;
create policy "shipments member read" on public.shipments as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy "site_blocks admin write" on public.site_blocks;
create policy "site_blocks admin write" on public.site_blocks as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "site_content admin write" on public.site_content;
create policy "site_content admin write" on public.site_content as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "site_images admin write" on public.site_images;
create policy "site_images admin write" on public.site_images as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy "stores admin write" on public.stores;
create policy "stores admin write" on public.stores as permissive for all to public
  using ((select is_admin((select auth.uid()))))
  with check ((select is_admin((select auth.uid()))));

drop policy support_conversations_insert on public.support_conversations;
create policy support_conversations_insert on public.support_conversations as permissive for insert to public
  with check (((user_id = (select auth.uid())) AND (select support_access_allowed())));

drop policy support_conversations_select on public.support_conversations;
create policy support_conversations_select on public.support_conversations as permissive for select to public
  using (((user_id = (select auth.uid())) OR (select is_admin((select auth.uid())))));

drop policy support_conversations_update on public.support_conversations;
create policy support_conversations_update on public.support_conversations as permissive for update to public
  using (((user_id = (select auth.uid())) OR (select is_admin((select auth.uid())))))
  with check (((user_id = (select auth.uid())) OR (select is_admin((select auth.uid())))));

drop policy support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages as permissive for insert to public
  with check ((EXISTS ( SELECT 1
   FROM support_conversations c
  WHERE ((c.id = support_messages.conversation_id) AND ((c.user_id = (select auth.uid())) OR (select is_admin((select auth.uid()))))))));

drop policy support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM support_conversations c
  WHERE ((c.id = support_messages.conversation_id) AND ((c.user_id = (select auth.uid())) OR (select is_admin((select auth.uid()))))))));

drop policy webhook_deliveries_select on public.webhook_deliveries;
create policy webhook_deliveries_select on public.webhook_deliveries as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy webhook_endpoints_delete on public.webhook_endpoints;
create policy webhook_endpoints_delete on public.webhook_endpoints as permissive for delete to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])));

drop policy webhook_endpoints_insert on public.webhook_endpoints;
create policy webhook_endpoints_insert on public.webhook_endpoints as permissive for insert to public
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])));

drop policy webhook_endpoints_select on public.webhook_endpoints;
create policy webhook_endpoints_select on public.webhook_endpoints as permissive for select to public
  using (is_business_member(business_id, (select auth.uid())));

drop policy webhook_endpoints_update on public.webhook_endpoints;
create policy webhook_endpoints_update on public.webhook_endpoints as permissive for update to public
  using ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])))
  with check ((business_role(business_id, (select auth.uid())) = ANY (ARRAY['owner'::text, 'admin'::text])));

commit;
