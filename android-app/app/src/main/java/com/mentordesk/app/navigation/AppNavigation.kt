package com.mentordesk.app.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.mentordesk.app.data.SessionManager
import com.mentordesk.app.data.SupabaseClient
import com.mentordesk.app.ui.screens.BiometricLockScreen
import com.mentordesk.app.ui.screens.LoginScreen
import com.mentordesk.app.ui.screens.MainScreen
import com.mentordesk.app.ui.screens.OrgSetting
import com.mentordesk.app.ui.screens.canUseBiometric
import com.mentordesk.app.ui.theme.OrgTheme
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.launch

object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val BIOMETRIC_LOCK = "biometric_lock"
    const val MAIN = "main"
}

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    NavHost(navController = navController, startDestination = Routes.SPLASH) {
        composable(Routes.SPLASH) {
            LaunchedEffect(Unit) {
                // Load org branding early using cached org ID so the logo
                // appears on the login screen and biometric lock screen
                try {
                    val cachedOrgId = SessionManager.getOrganizationId(context)
                    if (cachedOrgId != null) {
                        val settings = SupabaseClient.client.postgrest
                            .from("settings")
                            .select { filter { eq("organization_id", cachedOrgId) } }
                            .decodeList<OrgSetting>()
                        OrgTheme.applyBranding(settings.associate { it.key to it.value })
                    }
                } catch (_: Exception) {}

                val hasSession = try {
                    SupabaseClient.client.auth.currentSessionOrNull() != null
                } catch (_: Exception) {
                    false
                }

                if (!hasSession || SessionManager.isSessionExpired(context)) {
                    if (hasSession) {
                        try { SupabaseClient.client.auth.signOut() } catch (_: Exception) {}
                    }
                    SessionManager.clearSession(context)
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.SPLASH) { inclusive = true }
                    }
                } else if (SessionManager.isBiometricEnabled(context) && canUseBiometric(context)) {
                    navController.navigate(Routes.BIOMETRIC_LOCK) {
                        popUpTo(Routes.SPLASH) { inclusive = true }
                    }
                } else {
                    SessionManager.updateLastActive(context)
                    navController.navigate(Routes.MAIN) {
                        popUpTo(Routes.SPLASH) { inclusive = true }
                    }
                }
            }

            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text("Loading...", style = MaterialTheme.typography.bodyLarge)
            }
        }

        composable(Routes.LOGIN) {
            LoginScreen(
                onLoginSuccess = {
                    scope.launch {
                        SessionManager.updateLastActive(context)
                    }
                    navController.navigate(Routes.MAIN) {
                        popUpTo(Routes.LOGIN) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.BIOMETRIC_LOCK) {
            BiometricLockScreen(
                onUnlocked = {
                    scope.launch { SessionManager.updateLastActive(context) }
                    navController.navigate(Routes.MAIN) {
                        popUpTo(Routes.BIOMETRIC_LOCK) { inclusive = true }
                    }
                },
                onFallbackToLogin = {
                    scope.launch {
                        try { SupabaseClient.client.auth.signOut() } catch (_: Exception) {}
                        SessionManager.clearSession(context)
                    }
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.BIOMETRIC_LOCK) { inclusive = true }
                    }
                }
            )
        }

        composable(Routes.MAIN) {
            MainScreen(
                onLogout = {
                    scope.launch {
                        SupabaseClient.client.auth.signOut()
                        SessionManager.clearSession(context)
                    }
                    navController.navigate(Routes.LOGIN) {
                        popUpTo(Routes.MAIN) { inclusive = true }
                    }
                }
            )
        }
    }
}
