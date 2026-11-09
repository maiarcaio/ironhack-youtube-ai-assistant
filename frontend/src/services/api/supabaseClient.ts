
import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js'

// The browser may use only the project's public credentials.
// Never put a Supabase secret or service-role key here.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL

const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Allow the existing mock-mode tests and demonstrations
// to run without a configured Supabase project.
export const supabase: SupabaseClient | null =
  supabaseUrl && publishableKey
    ? createClient(supabaseUrl, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

/**
 * Resolve the current access token whenever an API request
 * needs authentication.
 *
 * Do not cache tokens independently: Supabase manages
 * session restoration and token refresh.
 */
export async function getAccessToken():
  Promise<string | null> {
  if (!supabase) return null

  const { data, error } =
    await supabase.auth.getSession()

  if (error) {
    throw new Error(
      `Authentication failed: ${error.message}`,
    )
  }

  return data.session?.access_token ?? null
}
