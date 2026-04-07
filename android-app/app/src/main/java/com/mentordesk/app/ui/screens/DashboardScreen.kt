package com.mentordesk.app.ui.screens

import android.util.Log
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import com.mentordesk.app.data.AppLogger
import com.mentordesk.app.data.SessionManager
import com.mentordesk.app.data.SupabaseClient
import com.mentordesk.app.ui.theme.*
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.launch

private const val TAG = "Dashboard"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(onLogout: () -> Unit) {
    var firstName by remember { mutableStateOf("") }
    var fullName by remember { mutableStateOf("") }
    var orgName by remember { mutableStateOf("MentorDesk") }
    var userRole by remember { mutableStateOf("") }
    var menteeId by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var accessDenied by remember { mutableStateOf(false) }
    var enrolledCourses by remember { mutableStateOf<List<EnrolledCourse>>(emptyList()) }
    var lessonProgress by remember { mutableStateOf<List<LessonProgressItem>>(emptyList()) }
    var showNotifications by remember { mutableStateOf(false) }
    var debugInfo by remember { mutableStateOf("") }

    // Navigation states
    var openLessonId by remember { mutableStateOf<String?>(null) }
    var openProgressId by remember { mutableStateOf<String?>(null) }
    var expandedCourseId by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        val debugLog = StringBuilder()
        try {
            val user = SupabaseClient.client.auth.currentUserOrNull()
            debugLog.appendLine("User: ${user?.id} / ${user?.email}")

            if (user != null) {
                var role = ""
                var entityId: String? = null
                var organizationId: String? = null

                try {
                    val roles = SupabaseClient.client.postgrest
                        .from("user_roles")
                        .select { filter { eq("user_id", user.id) } }
                        .decodeList<UserRoleWithEntity>()
                    debugLog.appendLine("user_roles: ${roles.size} found")
                    val menteeRole = roles.firstOrNull { it.role == "mentee" || it.role == "trainee" }
                    if (menteeRole != null) {
                        role = menteeRole.role; entityId = menteeRole.entity_id; organizationId = menteeRole.organization_id
                    } else if (roles.isNotEmpty()) {
                        role = roles.first().role; organizationId = roles.first().organization_id
                    }
                } catch (e: Exception) { debugLog.appendLine("user_roles ERROR: ${e.message}") }

                if (role.isBlank()) {
                    try {
                        val profile = SupabaseClient.client.postgrest
                            .from("profiles")
                            .select { filter { eq("id", user.id) } }
                            .decodeSingle<UserProfileWithMenteeId>()
                        if (!profile.role.isNullOrBlank()) {
                            role = profile.role; entityId = profile.mentee_id; organizationId = profile.organization_id
                        }
                    } catch (e: Exception) { debugLog.appendLine("profiles ERROR: ${e.message}") }
                }

                if ((role.isBlank() || entityId == null) && !user.email.isNullOrBlank()) {
                    try {
                        val mentees = SupabaseClient.client.postgrest
                            .from("mentees")
                            .select { filter { eq("email", user.email!!) } }
                            .decodeList<MenteeRecordWithOrg>()
                        val mentee = mentees.firstOrNull()
                        if (mentee != null) {
                            if (role.isBlank()) role = "mentee"
                            entityId = mentee.id
                            if (organizationId == null) organizationId = mentee.organization_id
                            firstName = mentee.first_name
                            fullName = "${mentee.first_name} ${mentee.last_name}".trim()
                        }
                    } catch (e: Exception) { debugLog.appendLine("mentees ERROR: ${e.message}") }
                }

                if (role.isBlank()) role = "mentee"
                userRole = role; menteeId = entityId

                if (role != "mentee" && role != "trainee") {
                    accessDenied = true; isLoading = false; debugInfo = debugLog.toString(); return@LaunchedEffect
                }

                // Fetch org settings (name + colors + logo) and cache org ID
                if (organizationId != null) {
                    try {
                        SessionManager.setOrganizationId(context, organizationId)
                        val allSettings = SupabaseClient.client.postgrest
                            .from("settings")
                            .select { filter { eq("organization_id", organizationId) } }
                            .decodeList<OrgSetting>()
                        val m = allSettings.associate { it.key to it.value }
                        m["company_name"]?.takeIf { it.isNotBlank() }?.let { orgName = it }
                        OrgTheme.applyBranding(m)
                        debugLog.appendLine("orgName: $orgName, branding loaded (logo: ${OrgTheme.logoUrl != null})")
                    } catch (e: Exception) { debugLog.appendLine("settings ERROR: ${e.message}") }
                }

                // Fetch mentee name
                if (firstName.isBlank() && entityId != null) {
                    try {
                        val mentee = SupabaseClient.client.postgrest
                            .from("mentees")
                            .select { filter { eq("id", entityId) } }
                            .decodeSingle<MenteeRecord>()
                        firstName = mentee.first_name; fullName = "${mentee.first_name} ${mentee.last_name}".trim()
                        debugLog.appendLine("name: $fullName")
                    } catch (e: Exception) {
                        firstName = user.email?.substringBefore("@") ?: "Student"; fullName = firstName
                        debugLog.appendLine("mentee name ERROR: ${e.message}")
                    }
                } else if (firstName.isBlank()) {
                    firstName = user.email?.substringBefore("@") ?: "Student"; fullName = firstName
                }

                // Fetch enrolled courses
                if (entityId != null) {
                    try {
                        val offerings = SupabaseClient.client.postgrest
                            .from("mentee_offerings")
                            .select { filter { eq("mentee_id", entityId) } }
                            .decodeList<MenteeOffering>()
                        debugLog.appendLine("mentee_offerings: ${offerings.size}")

                        val courseList = mutableListOf<EnrolledCourse>()
                        for (offering in offerings) {
                            try {
                                val od = SupabaseClient.client.postgrest
                                    .from("offerings").select { filter { eq("id", offering.offering_id) } }.decodeSingle<OfferingRecord>()
                                if (od.offering_type == "arrangement") continue

                                val courses = SupabaseClient.client.postgrest
                                    .from("courses").select { filter { eq("offering_id", offering.offering_id) } }.decodeList<CourseRecord>()
                                val course = courses.firstOrNull()

                                if (course != null) {
                                    val lessons = SupabaseClient.client.postgrest
                                        .from("lessons").select { filter { eq("course_id", course.id) } }.decodeList<LessonRecord>()
                                    debugLog.appendLine("  ${od.name}: ${lessons.size} lessons")
                                    courseList.add(EnrolledCourse(od.name, course.id, lessons.size, lessons.sortedBy { it.order_index }))
                                } else {
                                    courseList.add(EnrolledCourse(od.name, "", 0, emptyList()))
                                }
                            } catch (e: Exception) { debugLog.appendLine("  offering ERROR: ${e.message}") }
                        }
                        enrolledCourses = courseList

                        try {
                            lessonProgress = SupabaseClient.client.postgrest
                                .from("mentee_lesson_progress").select { filter { eq("mentee_id", entityId) } }
                                .decodeList<LessonProgressItem>()
                            debugLog.appendLine("progress: ${lessonProgress.size}")
                        } catch (e: Exception) { debugLog.appendLine("progress ERROR: ${e.message}") }
                    } catch (e: Exception) { debugLog.appendLine("offerings ERROR: ${e.message}") }
                }
            }
        } catch (e: Exception) {
            debugLog.appendLine("OUTER ERROR: ${e.message}"); firstName = "Student"; fullName = "Student"
        } finally {
            isLoading = false; debugInfo = debugLog.toString(); Log.d(TAG, debugLog.toString())
            AppLogger.debug(debugLog.toString())
        }
    }

    // ── Lesson Viewer ──
    if (openLessonId != null && menteeId != null) {
        LessonViewerScreen(
            lessonId = openLessonId!!,
            menteeId = menteeId!!,
            progressId = openProgressId,
            onBack = {
                openLessonId = null; openProgressId = null
                // Refresh progress after returning from lesson
                scope.launch {
                    try {
                        if (menteeId != null) {
                            lessonProgress = SupabaseClient.client.postgrest
                                .from("mentee_lesson_progress").select { filter { eq("mentee_id", menteeId!!) } }
                                .decodeList<LessonProgressItem>()
                        }
                    } catch (_: Exception) {}
                }
            }
        )
        return
    }

    // ── Expanded Course (Lesson List) ──
    val expandedCourse = enrolledCourses.firstOrNull { it.courseId == expandedCourseId }
    if (expandedCourse != null) {
        LessonListScreen(
            course = expandedCourse,
            lessonProgress = lessonProgress,
            onOpenLesson = { lessonId ->
                val progressItem = lessonProgress.firstOrNull { it.lesson_id == lessonId }
                openLessonId = lessonId
                openProgressId = progressItem?.id
            },
            onBack = { expandedCourseId = null }
        )
        return
    }

    // ── Notifications Dialog ──
    if (showNotifications) {
        AlertDialog(
            onDismissRequest = { showNotifications = false },
            title = { Text("Notifications") },
            text = { Text("All caught up!") },
            confirmButton = { TextButton(onClick = { showNotifications = false }) { Text("OK") } }
        )
    }

    // ── Access Denied ──
    if (accessDenied) {
        Scaffold(topBar = { TopAppBar(title = { Text(orgName) }) }) { padding ->
            Column(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                Text("This app is for mentee accounts only.", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(horizontal = 32.dp))
                Spacer(Modifier.height(8.dp))
                Text("Your account role: ${userRole.replaceFirstChar { it.uppercase() }}", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
                Spacer(Modifier.height(24.dp))
                Button(onClick = { scope.launch { SupabaseClient.client.auth.signOut(); onLogout() } }) { Text("Sign out") }
            }
        }
        return
    }

    // ── Main Dashboard ──
    Scaffold(
        containerColor = PageBg,
        topBar = {
            TopAppBar(
                title = { Text(if (firstName.isNotBlank()) "Hi, $firstName" else orgName, fontWeight = FontWeight.SemiBold, color = TextPrimary) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
                actions = {
                    IconButton(onClick = { showNotifications = true }) {
                        Icon(Icons.Default.Notifications, contentDescription = "Notifications", tint = TextSecondary)
                    }
                }
            )
        }
    ) { padding ->
        if (isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Loading...") }
        } else {
            Column(
                Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // ── Continue Learning Card ──
                val inProgressCourse = enrolledCourses.firstOrNull { course ->
                    val doneIds = lessonProgress.filter { it.completed_at != null }.map { it.lesson_id }.toSet()
                    val done = course.lessons.count { it.id in doneIds }
                    done in 1 until course.totalLessons
                }
                val nextLesson = inProgressCourse?.let { course ->
                    val doneIds = lessonProgress.filter { it.completed_at != null }.map { it.lesson_id }.toSet()
                    val unlockedIds = lessonProgress.map { it.lesson_id }.toSet()
                    course.lessons.firstOrNull { it.id !in doneIds && it.id in unlockedIds }
                        ?: course.lessons.firstOrNull { it.id !in doneIds }
                }

                if (inProgressCourse != null && nextLesson != null) {
                    val doneCount = inProgressCourse.lessons.count { l -> lessonProgress.any { it.lesson_id == l.id && it.completed_at != null } }
                    Card(
                        Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Column(Modifier.padding(20.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    Modifier.size(40.dp).clip(RoundedCornerShape(10.dp))
                                        .background(Brush.linearGradient(listOf(OrgTheme.primary, OrgTheme.secondary))),
                                    contentAlignment = Alignment.Center
                                ) { Icon(Icons.Default.PlayArrow, null, tint = Color.White, modifier = Modifier.size(22.dp)) }
                                Spacer(Modifier.width(12.dp))
                                Column {
                                    Text("Continue Learning", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
                                    Text(inProgressCourse.offeringName, fontSize = 13.sp, color = TextSecondary)
                                }
                            }
                            Spacer(Modifier.height(16.dp))
                            LinearProgressIndicator(
                                progress = doneCount.toFloat() / inProgressCourse.totalLessons,
                                Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                                color = OrgTheme.primary, trackColor = BorderLight
                            )
                            Spacer(Modifier.height(6.dp))
                            Text("$doneCount of ${inProgressCourse.totalLessons} lessons", fontSize = 12.sp, color = TextSubtle)
                            Spacer(Modifier.height(14.dp))
                            Button(
                                onClick = {
                                    val p = lessonProgress.firstOrNull { it.lesson_id == nextLesson.id }
                                    openLessonId = nextLesson.id; openProgressId = p?.id
                                },
                                Modifier.fillMaxWidth().height(44.dp),
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = OrgTheme.primary)
                            ) {
                                Text("Continue: ${nextLesson.title}", fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                } else if (enrolledCourses.isNotEmpty()) {
                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                        Column(Modifier.padding(20.dp)) {
                            Text("Welcome back, $firstName!", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
                        }
                    }
                } else {
                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                        Column(Modifier.padding(20.dp)) {
                            Text("Welcome, $firstName!", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
                            Spacer(Modifier.height(4.dp))
                            Text("You're not enrolled in any courses yet.", fontSize = 14.sp, color = TextSecondary)
                        }
                    }
                }

                // ── My Courses ──
                if (enrolledCourses.isNotEmpty()) {
                    Text("My Courses", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
                    enrolledCourses.forEach { course ->
                        val doneIds = lessonProgress.filter { it.completed_at != null }.map { it.lesson_id }.toSet()
                        val doneCount = course.lessons.count { it.id in doneIds }
                        val allDone = doneCount == course.totalLessons && course.totalLessons > 0

                        Card(
                            Modifier.fillMaxWidth().clickable { expandedCourseId = course.courseId },
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(1.dp)
                        ) {
                            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(course.offeringName, fontWeight = FontWeight.Medium, fontSize = 15.sp, color = TextPrimary)
                                        if (allDone) {
                                            Spacer(Modifier.width(8.dp))
                                            Icon(Icons.Default.CheckCircle, null, tint = Green500, modifier = Modifier.size(18.dp))
                                        }
                                    }
                                    Spacer(Modifier.height(8.dp))
                                    LinearProgressIndicator(
                                        progress = if (course.totalLessons > 0) doneCount.toFloat() / course.totalLessons else 0f,
                                        Modifier.fillMaxWidth().height(4.dp).clip(RoundedCornerShape(2.dp)),
                                        color = OrgTheme.primary, trackColor = BorderLight
                                    )
                                    Spacer(Modifier.height(4.dp))
                                    Text("$doneCount / ${course.totalLessons} lessons", fontSize = 12.sp, color = TextSubtle)
                                }
                                Spacer(Modifier.width(8.dp))
                                Icon(Icons.Default.ChevronRight, null, tint = TextSubtle)
                            }
                        }
                    }
                }

                // ── Recent Activity ──
                val recent = lessonProgress.filter { it.completed_at != null }.sortedByDescending { it.completed_at }.take(5)
                if (recent.isNotEmpty()) {
                    Text("Recent Activity", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
                    recent.forEach { p ->
                        val lesson = enrolledCourses.flatMap { it.lessons }.firstOrNull { it.id == p.lesson_id }
                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(10.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.CheckCircle, null, tint = Green500, modifier = Modifier.size(20.dp))
                                Spacer(Modifier.width(10.dp))
                                Text(lesson?.title ?: "Lesson", fontSize = 14.sp, color = TextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                Text("Done", fontSize = 12.sp, color = Green500, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ── Lesson List Screen ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LessonListScreen(
    course: EnrolledCourse,
    lessonProgress: List<LessonProgressItem>,
    onOpenLesson: (String) -> Unit,
    onBack: () -> Unit
) {
    val doneIds = lessonProgress.filter { it.completed_at != null }.map { it.lesson_id }.toSet()
    val unlockedIds = lessonProgress.map { it.lesson_id }.toSet()
    val doneCount = course.lessons.count { it.id in doneIds }

    Scaffold(
        containerColor = PageBg,
        topBar = {
            TopAppBar(
                title = { Text(course.offeringName, fontWeight = FontWeight.SemiBold, color = TextPrimary) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Back", tint = TextPrimary) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Progress header
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("$doneCount of ${course.totalLessons} lessons completed", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TextPrimary)
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(
                        progress = if (course.totalLessons > 0) doneCount.toFloat() / course.totalLessons else 0f,
                        Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                        color = OrgTheme.primary, trackColor = BorderLight
                    )
                }
            }

            // Lesson list
            course.lessons.forEachIndexed { index, lesson ->
                val isCompleted = lesson.id in doneIds
                val isUnlocked = lesson.id in unlockedIds || index == 0 || (index > 0 && course.lessons[index - 1].id in doneIds)

                Card(
                    Modifier.fillMaxWidth().then(if (isUnlocked) Modifier.clickable { onOpenLesson(lesson.id) } else Modifier),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = if (isUnlocked) Color.White else Color(0xFFF9FAFB)),
                    elevation = CardDefaults.cardElevation(if (isUnlocked) 1.dp else 0.dp)
                ) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        // Lesson number badge
                        Box(
                            Modifier.size(36.dp).clip(RoundedCornerShape(8.dp)).background(
                                when {
                                    isCompleted -> Green500
                                    isUnlocked -> OrgTheme.primary
                                    else -> BorderColor
                                }
                            ),
                            contentAlignment = Alignment.Center
                        ) {
                            if (isCompleted) {
                                Icon(Icons.Default.CheckCircle, null, tint = Color.White, modifier = Modifier.size(20.dp))
                            } else {
                                Text("${index + 1}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            }
                        }
                        Spacer(Modifier.width(14.dp))
                        Column(Modifier.weight(1f)) {
                            Text(
                                lesson.title.ifBlank { "Lesson ${index + 1}" },
                                fontWeight = FontWeight.Medium, fontSize = 15.sp,
                                color = if (isUnlocked) TextPrimary else TextSubtle,
                                maxLines = 2, overflow = TextOverflow.Ellipsis
                            )
                            if (isCompleted) {
                                Text("Completed", fontSize = 12.sp, color = Green500, fontWeight = FontWeight.Medium)
                            } else if (!isUnlocked) {
                                Text("Locked", fontSize = 12.sp, color = TextSubtle)
                            }
                        }
                        if (!isUnlocked) {
                            Icon(Icons.Default.Lock, null, tint = TextSubtle, modifier = Modifier.size(18.dp))
                        } else {
                            Icon(Icons.Default.ChevronRight, null, tint = TextSubtle)
                        }
                    }
                }
            }
        }
    }
}

// ── Data Classes ──

@kotlinx.serialization.Serializable
data class UserRole(val role: String = "")

@kotlinx.serialization.Serializable
data class UserRoleWithEntity(val role: String = "", val entity_id: String? = null, val organization_id: String? = null)

@kotlinx.serialization.Serializable
data class UserProfile(val role: String = "")

@kotlinx.serialization.Serializable
data class UserProfileWithMenteeId(val role: String? = null, val mentee_id: String? = null, val organization_id: String? = null)

@kotlinx.serialization.Serializable
data class OrgSetting(val key: String = "", val value: String = "")

@kotlinx.serialization.Serializable
data class MenteeRecord(val first_name: String = "", val last_name: String = "")

@kotlinx.serialization.Serializable
data class MenteeRecordWithOrg(val id: String = "", val first_name: String = "", val last_name: String = "", val organization_id: String? = null)

@kotlinx.serialization.Serializable
data class MenteeOffering(val id: String = "", val mentee_id: String = "", val offering_id: String = "")

@kotlinx.serialization.Serializable
data class OfferingRecord(val id: String = "", val name: String = "", val offering_type: String? = null)

@kotlinx.serialization.Serializable
data class CourseRecord(val id: String = "", val offering_id: String = "", val delivery_mode: String? = null)

@kotlinx.serialization.Serializable
data class LessonRecord(val id: String = "", val course_id: String = "", val title: String = "", val order_index: Int = 0)

@kotlinx.serialization.Serializable
data class LessonProgressItem(val id: String = "", val lesson_id: String = "", val unlocked_at: String? = null, val completed_at: String? = null)

data class EnrolledCourse(val offeringName: String, val courseId: String, val totalLessons: Int, val lessons: List<LessonRecord>)

@kotlinx.serialization.Serializable
data class MenteeFullProfile(
    val id: String = "", val first_name: String = "", val last_name: String = "", val email: String? = null, val phone: String? = null,
    val avatar_url: String? = null,
    val address_street1: String? = null, val address_street2: String? = null, val address_city: String? = null,
    val address_state: String? = null, val address_zip: String? = null, val address_country: String? = null,
    val billing_same_as_mailing: Boolean? = null,
    val billing_street1: String? = null, val billing_street2: String? = null, val billing_city: String? = null,
    val billing_state: String? = null, val billing_zip: String? = null, val billing_country: String? = null,
    val uses_text: Boolean? = null, val uses_whatsapp: Boolean? = null, val uses_telegram: Boolean? = null, val uses_signal: Boolean? = null,
)

@kotlinx.serialization.Serializable
data class InvoiceRecord(val id: String = "", val amount: Double = 0.0, val due_date: String? = null, val description: String? = null, val status: String = "pending", val paid_at: String? = null)
