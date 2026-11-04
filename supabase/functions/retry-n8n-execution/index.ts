import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRetryHandler } from "../_shared/executionRetry.js";

serve(createRetryHandler({
  createClient,
  env: (name: string) => Deno.env.get(name),
  fetchImpl: fetch,
}));
