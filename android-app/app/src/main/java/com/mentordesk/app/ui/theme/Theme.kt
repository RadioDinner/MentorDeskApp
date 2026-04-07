package com.mentordesk.app.ui.theme

import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color

// Web app default colors
val Indigo500 = Color(0xFF6366f1)
val Indigo400 = Color(0xFF818cf8)
val Indigo300 = Color(0xFFa5b4fc)
val Indigo100 = Color(0xFFe0e7ff)
val Indigo50 = Color(0xFFeef2ff)
val Purple500 = Color(0xFF8b5cf6)
val Amber500 = Color(0xFFf59e0b)
val Amber100 = Color(0xFFfef3c7)
val Green500 = Color(0xFF10b981)
val Green50 = Color(0xFFf0fdf4)
val Red500 = Color(0xFFef4444)
val Red50 = Color(0xFFfef2f2)

// Backgrounds & surfaces
val PageBg = Color(0xFFf0f2f7)
val CardBg = Color(0xFFFFFFFF)
val BorderColor = Color(0xFFe5e7eb)
val BorderLight = Color(0xFFf3f4f6)

// Text colors
val TextPrimary = Color(0xFF111827)
val TextSecondary = Color(0xFF6b7280)
val TextSubtle = Color(0xFF9ca3af)

// Sidebar
val SidebarBg = Color(0xFF0d1117)

// Org color state — updated dynamically from Supabase settings
object OrgTheme {
    var primary by mutableStateOf(Indigo500)
    var secondary by mutableStateOf(Purple500)
    var highlight by mutableStateOf(Amber500)
    var logoUrl by mutableStateOf<String?>(null)
    var companyName by mutableStateOf<String?>(null)

    fun applyColors(primaryHex: String?, secondaryHex: String?, highlightHex: String?) {
        primaryHex?.let { primary = parseColor(it) }
        secondaryHex?.let { secondary = parseColor(it) }
        highlightHex?.let { highlight = parseColor(it) }
    }

    fun applyBranding(settings: Map<String, String>) {
        settings["primary_color"]?.let { primary = parseColor(it) }
        settings["secondary_color"]?.let { secondary = parseColor(it) }
        settings["highlight_color"]?.let { highlight = parseColor(it) }
        settings["company_logo"]?.takeIf { it.isNotBlank() }?.let { logoUrl = it }
        settings["company_name"]?.takeIf { it.isNotBlank() }?.let { companyName = it }
    }

    private fun parseColor(hex: String): Color {
        return try {
            val cleaned = hex.trimStart('#')
            Color(android.graphics.Color.parseColor("#$cleaned"))
        } catch (_: Exception) {
            Indigo500
        }
    }
}

private val MentorDeskLightScheme = lightColorScheme(
    primary = Indigo500,
    onPrimary = Color.White,
    primaryContainer = Indigo50,
    onPrimaryContainer = TextPrimary,
    secondary = Purple500,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFf5f3ff),
    onSecondaryContainer = TextPrimary,
    tertiary = Amber500,
    onTertiary = Color.White,
    tertiaryContainer = Amber100,
    onTertiaryContainer = TextPrimary,
    error = Red500,
    onError = Color.White,
    errorContainer = Red50,
    onErrorContainer = Color(0xFFdc2626),
    background = PageBg,
    onBackground = TextPrimary,
    surface = CardBg,
    onSurface = TextPrimary,
    surfaceVariant = Color(0xFFf9fafb),
    onSurfaceVariant = TextSecondary,
    outline = BorderColor,
    outlineVariant = BorderLight,
)

@Composable
fun MentorDeskTheme(
    content: @Composable () -> Unit
) {
    // Build color scheme from org colors
    val colorScheme = MentorDeskLightScheme.copy(
        primary = OrgTheme.primary,
        primaryContainer = OrgTheme.primary.copy(alpha = 0.08f),
        onPrimaryContainer = TextPrimary,
        secondary = OrgTheme.secondary,
        tertiary = OrgTheme.highlight,
    )

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
