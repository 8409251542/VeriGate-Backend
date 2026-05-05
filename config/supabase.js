const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL || "https://fnnurbqyyhabwmquntlm.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY;

let supabase;

if (SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn("⚠️ SUPABASE_KEY is missing. Database features will be disabled.");
  // Mock supabase for development safety
  const mockError = { message: "Supabase not configured (check your .env file)" };
  supabase = {
    auth: { 
      admin: {
        createUser: () => Promise.resolve({ data: { user: { id: "mock-id" } }, error: null }),
        getUserById: () => Promise.resolve({ data: { user: { email: "mock@example.com" } }, error: null }),
        updateUserById: () => Promise.resolve({ error: null })
      }, 
      signInWithPassword: () => Promise.resolve({ error: mockError }),
      signUp: () => Promise.resolve({ data: { user: { id: "mock-id" } }, error: null })
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          single: () => Promise.resolve({ data: null, error: null }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
            select: () => ({})
          })
        }),
        order: () => ({
          ascending: () => ({}),
          gte: () => ({ lte: () => Promise.resolve({ data: [], error: null }) })
        }),
        gte: () => ({ order: () => Promise.resolve({ data: [], error: null }) })
      }),
      insert: () => Promise.resolve({ data: [], error: mockError }),
      update: () => ({ 
        eq: () => Promise.resolve({ error: mockError }),
        update: () => ({ eq: () => Promise.resolve({ error: mockError }) })
      }),
      delete: () => ({ eq: () => Promise.resolve({ error: mockError }) })
    }),
    storage: { 
      from: () => ({ 
        upload: () => Promise.resolve({ error: mockError }), 
        getPublicUrl: () => ({ data: { publicUrl: "" } }), 
        createSignedUploadUrl: () => Promise.resolve({ error: mockError }), 
        createSignedUrl: () => Promise.resolve({ error: mockError }) 
      }) 
    }
  };
}

module.exports = supabase;
