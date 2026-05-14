import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2];
};

/**
 * Server-side Supabase client
 * - Uses getAll / setAll (NOT deprecated get/set/remove)
 * - Works in Route Handlers & Server Components
 * - Future-safe for Supabase SSR v1+
 */
export async function createClient() {
  const cookieStore = await cookies();  // ✅ AWAIT ADDED

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Expected: Server Components cannot set cookies
          }
        },
      },
    }
  );
}
