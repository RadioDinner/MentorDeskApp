package com.mentordesk.app.data

import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.postgrest

object AppLogger {
    suspend fun log(
        message: String,
        source: String = "android",
        severity: String = "info",
        stack: String? = null
    ) {
        try {
            val user = SupabaseClient.client.auth.currentUserOrNull()
            SupabaseClient.client.postgrest
                .from("error_logs")
                .insert(buildMap {
                    put("message", message)
                    put("source", source)
                    put("severity", severity)
                    put("user_agent", "Android/${android.os.Build.VERSION.SDK_INT} ${android.os.Build.MODEL}")
                    put("url", "android-app")
                    if (stack != null) put("stack", stack)
                    if (user != null) {
                        put("user_id", user.id)
                        put("user_email", user.email)
                    }
                })
        } catch (_: Exception) {
            // Don't crash if logging fails
        }
    }

    suspend fun debug(message: String) = log(message, severity = "info")
    suspend fun error(message: String, exception: Exception? = null) =
        log(message, severity = "error", stack = exception?.stackTraceToString()?.take(2000))
}
