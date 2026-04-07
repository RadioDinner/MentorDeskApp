package com.mentordesk.app.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "session_prefs")

object SessionManager {
    private val BIOMETRIC_ENABLED = booleanPreferencesKey("biometric_enabled")
    private val LAST_ACTIVE_TIME = longPreferencesKey("last_active_time")
    private val ORGANIZATION_ID = stringPreferencesKey("organization_id")

    // Require re-authentication after 7 days of inactivity
    private const val SESSION_TIMEOUT_MS = 7L * 24 * 60 * 60 * 1000

    suspend fun isBiometricEnabled(context: Context): Boolean {
        return context.dataStore.data.map { it[BIOMETRIC_ENABLED] ?: false }.first()
    }

    suspend fun setBiometricEnabled(context: Context, enabled: Boolean) {
        context.dataStore.edit { it[BIOMETRIC_ENABLED] = enabled }
    }

    suspend fun updateLastActive(context: Context) {
        context.dataStore.edit { it[LAST_ACTIVE_TIME] = System.currentTimeMillis() }
    }

    suspend fun isSessionExpired(context: Context): Boolean {
        val lastActive = context.dataStore.data.map { it[LAST_ACTIVE_TIME] ?: 0L }.first()
        if (lastActive == 0L) return true
        return (System.currentTimeMillis() - lastActive) > SESSION_TIMEOUT_MS
    }

    suspend fun getOrganizationId(context: Context): String? {
        return context.dataStore.data.map { it[ORGANIZATION_ID] }.first()
    }

    suspend fun setOrganizationId(context: Context, orgId: String) {
        context.dataStore.edit { it[ORGANIZATION_ID] = orgId }
    }

    suspend fun clearSession(context: Context) {
        context.dataStore.edit {
            it.remove(BIOMETRIC_ENABLED)
            it.remove(LAST_ACTIVE_TIME)
            // Keep ORGANIZATION_ID so branding loads on next login screen
        }
    }
}
