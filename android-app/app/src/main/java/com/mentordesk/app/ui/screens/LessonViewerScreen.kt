package com.mentordesk.app.ui.screens

import android.content.Intent
import android.net.Uri
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.mentordesk.app.data.AppLogger
import com.mentordesk.app.data.SupabaseClient
import com.mentordesk.app.ui.theme.*
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.launch

@kotlinx.serialization.Serializable
data class LessonFull(
    val id: String = "", val title: String = "", val description: String? = null,
    val content: String? = null, val video_url: String? = null, val order_index: Int = 0, val course_id: String = "",
)

@kotlinx.serialization.Serializable
data class LessonQuestion(
    val id: String = "", val lesson_id: String = "", val question_text: String = "",
    val question_type: String = "response", val options: kotlinx.serialization.json.JsonElement? = null, val order_index: Int = 0,
)

@kotlinx.serialization.Serializable
data class QuestionResponse(
    val id: String = "", val question_id: String = "", val response_text: String? = null,
    val selected_option: Int? = null, val is_correct: Boolean? = null,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LessonViewerScreen(lessonId: String, menteeId: String, progressId: String?, onBack: () -> Unit) {
    var lesson by remember { mutableStateOf<LessonFull?>(null) }
    var questions by remember { mutableStateOf<List<LessonQuestion>>(emptyList()) }
    var existingResponses by remember { mutableStateOf<Map<String, QuestionResponse>>(emptyMap()) }
    var isLoading by remember { mutableStateOf(true) }
    var isCompleting by remember { mutableStateOf(false) }
    var isCompleted by remember { mutableStateOf(false) }
    var currentProgressId by remember { mutableStateOf(progressId) }

    // Draft answers – editable until submitted/completed
    var draftText by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var draftQuiz by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }

    // Quiz grading state
    var quizSubmitted by remember { mutableStateOf(false) }
    var quizResults by remember { mutableStateOf<Map<String, Boolean>>(emptyMap()) } // questionId -> isCorrect
    var isSubmittingQuiz by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()

    LaunchedEffect(lessonId) {
        try {
            lesson = SupabaseClient.client.postgrest.from("lessons").select { filter { eq("id", lessonId) } }.decodeSingle<LessonFull>()
            questions = SupabaseClient.client.postgrest.from("lesson_questions").select { filter { eq("lesson_id", lessonId) } }.decodeList<LessonQuestion>().sortedBy { it.order_index }
            val allResp = SupabaseClient.client.postgrest.from("mentee_question_responses").select { filter { eq("mentee_id", menteeId) } }.decodeList<QuestionResponse>()
            val qIds = questions.map { it.id }.toSet()
            existingResponses = allResp.filter { it.question_id in qIds }.associateBy { it.question_id }

            // Pre-fill drafts from existing responses
            val textDrafts = mutableMapOf<String, String>()
            val quizDrafts = mutableMapOf<String, Int>()
            val results = mutableMapOf<String, Boolean>()
            existingResponses.forEach { (qId, resp) ->
                resp.response_text?.let { textDrafts[qId] = it }
                resp.selected_option?.let { quizDrafts[qId] = it }
                if (resp.is_correct != null) results[qId] = resp.is_correct!!
            }
            draftText = textDrafts
            draftQuiz = quizDrafts
            // If existing quiz responses have grading, show as already submitted
            if (results.isNotEmpty()) {
                quizResults = results
                quizSubmitted = true
            }

            if (currentProgressId != null) {
                val prog = SupabaseClient.client.postgrest.from("mentee_lesson_progress").select { filter { eq("id", currentProgressId!!) } }.decodeList<LessonProgressItem>()
                isCompleted = prog.firstOrNull()?.completed_at != null
            }
        } catch (e: Exception) { AppLogger.error("Load lesson $lessonId", e) }
        finally { isLoading = false }
    }

    Scaffold(
        containerColor = PageBg,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Lesson ${(lesson?.order_index ?: 0) + 1}", fontSize = 12.sp, color = TextSecondary)
                        Text(lesson?.title ?: "Lesson", fontWeight = FontWeight.SemiBold, color = TextPrimary)
                    }
                },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Back", tint = TextPrimary) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        if (isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Loading lesson...") }
        } else if (lesson == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Lesson not found") }
        } else {
            Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState())) {
                // Description only (title is in top bar – no repetition)
                if (!lesson!!.description.isNullOrBlank()) {
                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(0.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                        Column(Modifier.padding(20.dp)) {
                            Text(lesson!!.description!!, fontSize = 14.sp, color = TextSecondary, lineHeight = 20.sp)
                        }
                    }
                }

                // Video
                if (!lesson!!.video_url.isNullOrBlank()) {
                    Spacer(Modifier.height(12.dp))
                    VideoEmbed(url = lesson!!.video_url!!)
                }

                // HTML Content
                if (!lesson!!.content.isNullOrBlank()) {
                    Spacer(Modifier.height(12.dp))
                    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                        HtmlContent(html = lesson!!.content!!)
                    }
                }

                // Questions
                val hasQuiz = questions.any { it.question_type == "quiz" }
                if (questions.isNotEmpty()) {
                    Spacer(Modifier.height(20.dp))
                    Text("Questions", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary, modifier = Modifier.padding(horizontal = 20.dp))
                    Spacer(Modifier.height(8.dp))
                    questions.forEachIndexed { i, q ->
                        if (q.question_type == "quiz") {
                            QuizQuestionCard(
                                num = i + 1,
                                question = q,
                                selectedOption = draftQuiz[q.id],
                                isLocked = isCompleted,
                                isGraded = quizSubmitted,
                                isCorrect = quizResults[q.id],
                                onSelect = { idx ->
                                    if (!quizSubmitted) draftQuiz = draftQuiz + (q.id to idx)
                                }
                            )
                        } else {
                            ResponseQuestionCard(
                                num = i + 1,
                                question = q,
                                answer = draftText[q.id] ?: "",
                                isLocked = isCompleted,
                                onAnswerChange = { text -> draftText = draftText + (q.id to text) }
                            )
                        }
                    }

                    // Submit Answers button for quiz grading
                    if (hasQuiz && !quizSubmitted && !isCompleted) {
                        val quizQuestions = questions.filter { it.question_type == "quiz" }
                        val allAnswered = quizQuestions.all { draftQuiz.containsKey(it.id) }
                        Spacer(Modifier.height(12.dp))
                        Button(
                            onClick = {
                                isSubmittingQuiz = true
                                scope.launch {
                                    try {
                                        val results = mutableMapOf<String, Boolean>()
                                        for (q in quizQuestions) {
                                            val sel = draftQuiz[q.id] ?: continue
                                            val isCorrect = try {
                                                val arr = q.options as? kotlinx.serialization.json.JsonArray ?: continue
                                                val obj = arr.getOrNull(sel) as? kotlinx.serialization.json.JsonObject
                                                (obj?.get("is_correct") as? kotlinx.serialization.json.JsonPrimitive)?.content?.toBooleanStrictOrNull() ?: false
                                            } catch (_: Exception) { false }
                                            results[q.id] = isCorrect

                                            // Save to DB
                                            val existing = existingResponses[q.id]
                                            if (existing != null) {
                                                SupabaseClient.client.postgrest.from("mentee_question_responses")
                                                    .update({
                                                        set("selected_option", sel)
                                                        set("is_correct", isCorrect)
                                                        set("submitted_at", java.time.Instant.now().toString())
                                                    }) { filter { eq("id", existing.id) } }
                                            } else {
                                                val saved = SupabaseClient.client.postgrest.from("mentee_question_responses")
                                                    .insert(buildMap {
                                                        put("mentee_id", menteeId); put("question_id", q.id)
                                                        put("selected_option", sel); put("is_correct", isCorrect)
                                                        put("submitted_at", java.time.Instant.now().toString())
                                                    }) { select() }.decodeSingle<QuestionResponse>()
                                                existingResponses = existingResponses + (q.id to saved)
                                            }
                                        }
                                        quizResults = results
                                        quizSubmitted = true
                                    } catch (e: Exception) { AppLogger.error("Submit quiz fail", e) }
                                    finally { isSubmittingQuiz = false }
                                }
                            },
                            Modifier.fillMaxWidth().padding(horizontal = 20.dp).height(44.dp),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = OrgTheme.primary),
                            enabled = !isSubmittingQuiz && allAnswered
                        ) {
                            Icon(Icons.Default.CheckCircle, null, Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(if (isSubmittingQuiz) "Grading..." else "Submit Answers", fontWeight = FontWeight.Medium)
                        }
                    }

                    // Quiz results summary
                    if (quizSubmitted && hasQuiz) {
                        val quizQuestions = questions.filter { it.question_type == "quiz" }
                        val correctCount = quizResults.count { it.value }
                        Spacer(Modifier.height(8.dp))
                        Card(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                            shape = RoundedCornerShape(8.dp),
                            colors = CardDefaults.cardColors(containerColor = if (correctCount == quizQuestions.size) Green50 else Color(0xFFFFF7ED))
                        ) {
                            Text(
                                "$correctCount of ${quizQuestions.size} correct",
                                Modifier.padding(12.dp),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (correctCount == quizQuestions.size) Color(0xFF2E7D32) else Amber500
                            )
                        }
                    }
                }

                // Complete lesson button
                Spacer(Modifier.height(24.dp))
                if (!isCompleted) {
                    Button(
                        onClick = {
                            isCompleting = true
                            scope.launch {
                                try {
                                    // Save text responses (quiz already saved via Submit Answers)
                                    for (q in questions) {
                                        if (q.question_type == "quiz") continue
                                        val text = draftText[q.id]?.takeIf { it.isNotBlank() } ?: continue
                                        val existing = existingResponses[q.id]
                                        if (existing != null) {
                                            SupabaseClient.client.postgrest.from("mentee_question_responses")
                                                .update({
                                                    set("response_text", text)
                                                    set("submitted_at", java.time.Instant.now().toString())
                                                }) { filter { eq("id", existing.id) } }
                                        } else {
                                            SupabaseClient.client.postgrest.from("mentee_question_responses")
                                                .insert(buildMap {
                                                    put("mentee_id", menteeId); put("question_id", q.id)
                                                    put("response_text", text)
                                                    put("submitted_at", java.time.Instant.now().toString())
                                                })
                                        }
                                    }

                                    // If quiz wasn't submitted yet, submit it now too
                                    if (!quizSubmitted) {
                                        for (q in questions.filter { it.question_type == "quiz" }) {
                                            val sel = draftQuiz[q.id] ?: continue
                                            val isCorrect = try {
                                                val arr = q.options as? kotlinx.serialization.json.JsonArray ?: continue
                                                val obj = arr.getOrNull(sel) as? kotlinx.serialization.json.JsonObject
                                                (obj?.get("is_correct") as? kotlinx.serialization.json.JsonPrimitive)?.content?.toBooleanStrictOrNull() ?: false
                                            } catch (_: Exception) { false }
                                            val existing = existingResponses[q.id]
                                            if (existing != null) {
                                                SupabaseClient.client.postgrest.from("mentee_question_responses")
                                                    .update({
                                                        set("selected_option", sel)
                                                        set("is_correct", isCorrect)
                                                        set("submitted_at", java.time.Instant.now().toString())
                                                    }) { filter { eq("id", existing.id) } }
                                            } else {
                                                SupabaseClient.client.postgrest.from("mentee_question_responses")
                                                    .insert(buildMap {
                                                        put("mentee_id", menteeId); put("question_id", q.id)
                                                        put("selected_option", sel); put("is_correct", isCorrect)
                                                        put("submitted_at", java.time.Instant.now().toString())
                                                    })
                                            }
                                        }
                                    }

                                    // Create progress record if needed, then mark complete
                                    var pid = currentProgressId
                                    if (pid == null) {
                                        val created = SupabaseClient.client.postgrest.from("mentee_lesson_progress")
                                            .insert(buildMap {
                                                put("mentee_id", menteeId); put("lesson_id", lessonId)
                                                put("unlocked_at", java.time.Instant.now().toString())
                                                put("completed_at", java.time.Instant.now().toString())
                                            }) { select() }.decodeSingle<LessonProgressItem>()
                                        pid = created.id
                                        currentProgressId = pid
                                    } else {
                                        SupabaseClient.client.postgrest.from("mentee_lesson_progress")
                                            .update({ set("completed_at", java.time.Instant.now().toString()) }) { filter { eq("id", pid) } }
                                    }
                                    isCompleted = true
                                } catch (e: Exception) { AppLogger.error("Complete lesson fail", e) }
                                finally { isCompleting = false }
                            }
                        },
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp).height(50.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Green500),
                        enabled = !isCompleting
                    ) {
                        Icon(Icons.Default.CheckCircle, null, Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(if (isCompleting) "Completing..." else "Complete Lesson", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                    }
                } else {
                    Card(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = Green50)
                    ) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CheckCircle, null, tint = Green500, modifier = Modifier.size(22.dp))
                            Spacer(Modifier.width(10.dp))
                            Text("Lesson completed!", fontWeight = FontWeight.SemiBold, color = Color(0xFF2E7D32))
                        }
                    }
                }
                Spacer(Modifier.height(32.dp))
            }
        }
    }
}

// ── Video Embed ──
// Uses direct YouTube URL loading to avoid error 152 (embedding disabled by uploader)

@Composable
private fun VideoEmbed(url: String) {
    val context = LocalContext.current
    val ytMatch = Regex("""(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]+)""").find(url)
    val vimeoMatch = Regex("""vimeo\.com/(\d+)""").find(url)

    // For YouTube: load the mobile watch page directly in WebView (avoids embed restrictions)
    // For Vimeo: use embed iframe (Vimeo rarely restricts embeds)
    val directUrl = when {
        ytMatch != null -> "https://www.youtube.com/watch?v=${ytMatch.groupValues[1]}"
        else -> null
    }

    val embedHtml = when {
        vimeoMatch != null -> """
            <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
            <style>body{margin:0;padding:0;background:#000;overflow:hidden}
            .wrap{position:relative;width:100%;height:0;padding-bottom:56.25%}
            iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:none}</style></head>
            <body><div class="wrap"><iframe src="https://player.vimeo.com/video/${vimeoMatch.groupValues[1]}?byline=0&portrait=0"
            allow="autoplay;fullscreen;picture-in-picture"
            allowfullscreen></iframe></div></body></html>
        """.trimIndent()
        else -> null
    }

    if (directUrl != null || embedHtml != null) {
        Card(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = Color.Black)
        ) {
            AndroidView(
                factory = { ctx ->
                    WebView(ctx).apply {
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                val reqUrl = request?.url?.toString() ?: return false
                                // Keep YouTube/Vimeo navigation in the WebView
                                if (reqUrl.contains("youtube.com") || reqUrl.contains("youtu.be") ||
                                    reqUrl.contains("vimeo.com") || reqUrl.contains("google.com")) {
                                    return false
                                }
                                // Open external links in browser
                                try { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(reqUrl))) } catch (_: Exception) {}
                                return true
                            }
                        }
                        webChromeClient = WebChromeClient()
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.mediaPlaybackRequiresUserGesture = false
                        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                        settings.loadWithOverviewMode = true
                        settings.useWideViewPort = true
                        settings.allowContentAccess = true
                        settings.javaScriptCanOpenWindowsAutomatically = true
                        settings.userAgentString = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                        settings.cacheMode = WebSettings.LOAD_DEFAULT
                        settings.databaseEnabled = true

                        if (directUrl != null) {
                            loadUrl(directUrl)
                        } else {
                            loadDataWithBaseURL("https://player.vimeo.com", embedHtml!!, "text/html", "UTF-8", null)
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f)
            )
        }
    }
}

// ── HTML Content ──

@Composable
private fun HtmlContent(html: String) {
    val styledHtml = """
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>
            body{font-family:-apple-system,sans-serif;font-size:15px;line-height:1.65;color:#111827;padding:16px;margin:0}
            img{max-width:100%;height:auto;border-radius:8px}
            h1,h2,h3{margin-top:1em;color:#111827}
            p{margin:0.5em 0}
            ul,ol{padding-left:1.5em}
            a{color:#6366f1}
            blockquote{border-left:3px solid #e5e7eb;padding-left:12px;margin-left:0;color:#6b7280}
        </style></head><body>$html</body></html>
    """.trimIndent()

    AndroidView(
        factory = { ctx ->
            WebView(ctx).apply {
                webViewClient = WebViewClient()
                settings.javaScriptEnabled = false
                loadDataWithBaseURL(null, styledHtml, "text/html", "UTF-8", null)
            }
        },
        modifier = Modifier.fillMaxWidth().heightIn(min = 80.dp, max = 2000.dp)
    )
}

// ── Quiz Question Card with grading feedback ──

@Composable
private fun QuizQuestionCard(
    num: Int, question: LessonQuestion, selectedOption: Int?,
    isLocked: Boolean, isGraded: Boolean, isCorrect: Boolean?,
    onSelect: (Int) -> Unit
) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Question $num", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = OrgTheme.primary, modifier = Modifier.weight(1f))
                if (isGraded && isCorrect != null) {
                    Text(
                        if (isCorrect) "Correct" else "Incorrect",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (isCorrect) Green500 else Red500
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(question.question_text, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = TextPrimary, lineHeight = 22.sp)
            Spacer(Modifier.height(12.dp))

            val opts = remember(question.options) {
                try {
                    val arr = question.options as? kotlinx.serialization.json.JsonArray ?: return@remember emptyList()
                    arr.mapIndexed { i, el ->
                        val obj = el as? kotlinx.serialization.json.JsonObject ?: return@mapIndexed Pair("Option ${i + 1}", false)
                        val text = (obj["text"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: "Option ${i + 1}"
                        val correct = (obj["is_correct"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toBooleanStrictOrNull() ?: false
                        Pair(text, correct)
                    }
                } catch (_: Exception) { emptyList() }
            }

            val letters = listOf("A", "B", "C", "D", "E", "F")

            opts.forEachIndexed { i, (text, optIsCorrect) ->
                val isSel = selectedOption == i
                val bgColor = when {
                    isGraded && optIsCorrect -> Color(0xFFE8F5E9) // green for correct answer
                    isGraded && isSel && !optIsCorrect -> Color(0xFFFFEBEE) // red for wrong selection
                    isSel -> OrgTheme.primary.copy(alpha = 0.08f)
                    else -> Color(0xFFF9FAFB)
                }
                val borderColor = when {
                    isGraded && optIsCorrect -> Green500
                    isGraded && isSel && !optIsCorrect -> Red500
                    isSel -> OrgTheme.primary
                    else -> BorderColor
                }

                Card(
                    Modifier.fillMaxWidth().padding(vertical = 3.dp)
                        .clickable(enabled = !isLocked && !isGraded) { onSelect(i) },
                    shape = RoundedCornerShape(8.dp),
                    colors = CardDefaults.cardColors(containerColor = bgColor),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, borderColor)
                ) {
                    Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(30.dp).clip(CircleShape).background(
                                when {
                                    isGraded && optIsCorrect -> Green500
                                    isGraded && isSel && !optIsCorrect -> Red500
                                    isSel -> OrgTheme.primary
                                    else -> Color(0xFFE5E7EB)
                                }
                            ),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(letters.getOrElse(i) { "${i + 1}" }, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                                color = if (isSel || (isGraded && (optIsCorrect || (isSel && !optIsCorrect)))) Color.White else TextSecondary)
                        }
                        Spacer(Modifier.width(10.dp))
                        Text(text, fontSize = 14.sp, color = TextPrimary, modifier = Modifier.weight(1f))
                        if (isGraded && optIsCorrect) {
                            Icon(Icons.Default.CheckCircle, null, tint = Green500, modifier = Modifier.size(18.dp))
                        }
                    }
                }
            }
        }
    }
}

// ── Response Question Card ──

@Composable
private fun ResponseQuestionCard(num: Int, question: LessonQuestion, answer: String, isLocked: Boolean, onAnswerChange: (String) -> Unit) {
    Card(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(1.dp)
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("Question $num", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = OrgTheme.primary)
            Spacer(Modifier.height(4.dp))
            Text(question.question_text, fontSize = 15.sp, fontWeight = FontWeight.Medium, color = TextPrimary, lineHeight = 22.sp)
            Spacer(Modifier.height(12.dp))

            if (isLocked) {
                Card(colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FAFB)), shape = RoundedCornerShape(8.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Your response", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TextSubtle)
                        Spacer(Modifier.height(4.dp))
                        Text(answer, fontSize = 14.sp, color = TextPrimary, lineHeight = 20.sp)
                    }
                }
            } else {
                OutlinedTextField(
                    value = answer, onValueChange = onAnswerChange,
                    label = { Text("Your answer") },
                    modifier = Modifier.fillMaxWidth(), minLines = 3, maxLines = 6,
                    shape = RoundedCornerShape(8.dp),
                    colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary)
                )
            }
        }
    }
}
