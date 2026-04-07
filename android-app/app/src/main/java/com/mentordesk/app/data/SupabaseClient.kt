package com.mentordesk.app.data

import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.gotrue.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.serialization.json.Json

val lenientJson = Json {
    ignoreUnknownKeys = true
}

object SupabaseClient {
    val client = createSupabaseClient(
        supabaseUrl = "https://gmukitlqvuhlonlhlimw.supabase.co",
        supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtdWtpdGxxdnVobG9ubGhsaW13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjYwOTMsImV4cCI6MjA4ODkwMjA5M30.DnrHWjOOAikfKjp5WWqHv_IL9_zAZkswfOsRwbsaHnY"
    ) {
        install(Auth)
        install(Postgrest) {
            serializer = io.github.jan.supabase.serializer.KotlinXSerializer(lenientJson)
        }
    }
}
