-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admins (
  id uuid NOT NULL,
  email text UNIQUE,
  CONSTRAINT admins_pkey PRIMARY KEY (id),
  CONSTRAINT admins_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.ms_teams_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  user_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  email text NOT NULL,
  password text NOT NULL,
  additional_info text,
  is_active boolean DEFAULT true,
  provided_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ms_teams_credentials_pkey PRIMARY KEY (id),
  CONSTRAINT ms_teams_credentials_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.ms_teams_requests(id),
  CONSTRAINT ms_teams_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT ms_teams_credentials_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES public.vendors(id)
);
CREATE TABLE public.ms_teams_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_name text NOT NULL,
  team_size integer NOT NULL,
  purpose text NOT NULL,
  contact_person text NOT NULL,
  phone_number text NOT NULL,
  tx_hash text NOT NULL,
  network text NOT NULL DEFAULT 'TRC20'::text,
  amount numeric NOT NULL,
  payment_screenshot text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'assigned_to_vendor'::text, 'credentials_provided'::text, 'completed'::text, 'rejected'::text])),
  assigned_vendor uuid,
  approved_at timestamp with time zone,
  approved_by uuid,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ms_teams_requests_pkey PRIMARY KEY (id),
  CONSTRAINT ms_teams_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT ms_teams_requests_assigned_vendor_fkey FOREIGN KEY (assigned_vendor) REFERENCES public.vendors(id),
  CONSTRAINT ms_teams_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admins(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  name text,
  mobile text,
  company text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.purchases (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  network text,
  usdt_amount numeric,
  tx_hash text,
  screenshot text,
  status text DEFAULT 'pending'::text,
  created_at timestamp without time zone DEFAULT now(),
  rejection_reason text,
  CONSTRAINT purchases_pkey PRIMARY KEY (id),
  CONSTRAINT purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.rented_servers (
  id integer NOT NULL DEFAULT nextval('rented_servers_id_seq'::regclass),
  user_id text NOT NULL,
  server_id integer,
  ip text,
  port integer,
  username text,
  password text,
  expires_at timestamp with time zone,
  cost_paid numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rented_servers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.report_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  file_name text NOT NULL,
  file_path text NOT NULL,
  tokens_used integer NOT NULL DEFAULT 2000,
  created_at timestamp with time zone DEFAULT now(),
  subscription_based boolean DEFAULT false,
  CONSTRAINT report_history_pkey PRIMARY KEY (id),
  CONSTRAINT report_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.report_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tx_hash text NOT NULL,
  network text NOT NULL DEFAULT 'TRC20'::text,
  amount numeric NOT NULL DEFAULT 30.00,
  payment_screenshot text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'expired'::text, 'cancelled'::text, 'rejected'::text])),
  starts_at timestamp with time zone,
  expires_at timestamp with time zone,
  approved_at timestamp with time zone,
  approved_by uuid,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  name text,
  email text,
  CONSTRAINT report_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT report_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT report_subscriptions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admins(id)
);
CREATE TABLE public.servers (
  id integer NOT NULL DEFAULT nextval('servers_id_seq'::regclass),
  ip text NOT NULL,
  port integer NOT NULL,
  username text,
  password text,
  provider text,
  country text,
  price numeric DEFAULT 10,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT servers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  type text CHECK (type = ANY (ARRAY['credit'::text, 'debit'::text])),
  amount numeric NOT NULL,
  description text,
  status text DEFAULT 'completed'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.user_limits (
  id uuid NOT NULL,
  max_limit integer DEFAULT 10,
  used integer DEFAULT 0,
  usdt_balance numeric DEFAULT 0,
  CONSTRAINT user_limits_pkey PRIMARY KEY (id),
  CONSTRAINT user_limits_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.vendors (
  id uuid NOT NULL,
  email text NOT NULL,
  name text,
  company text,
  phone text,
  specialties ARRAY DEFAULT ARRAY['MS Teams'::text],
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vendors_pkey PRIMARY KEY (id),
  CONSTRAINT vendors_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.verification_history (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid,
  total_uploaded integer NOT NULL,
  duplicates integer NOT NULL DEFAULT 0,
  unique_count integer NOT NULL,
  verified_count integer NOT NULL,
  file_path text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT verification_history_pkey PRIMARY KEY (id),
  CONSTRAINT verification_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_limits(id)
);