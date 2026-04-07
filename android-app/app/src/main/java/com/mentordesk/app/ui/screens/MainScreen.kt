package com.mentordesk.app.ui.screens

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Widgets
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mentordesk.app.data.AppLogger
import com.mentordesk.app.data.SessionManager
import com.mentordesk.app.data.SupabaseClient
import com.mentordesk.app.ui.theme.*
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.coroutines.launch

@kotlinx.serialization.Serializable
data class PaymentMethod(
    val id: String = "",
    val mentee_id: String? = null,
    val card_holder: String? = null,
    val card_last4: String? = null,
    val card_brand: String? = null,
    val card_expiry: String? = null,
    val is_primary: Boolean = false,
)

enum class BottomTab(val label: String, val icon: ImageVector) {
    LESSONS("Lessons", Icons.Default.MenuBook),
    PLACEHOLDER("Explore", Icons.Default.Widgets),
    BILLING("Billing", Icons.Default.Receipt),
    PROFILE("Profile", Icons.Default.Person),
    SETTINGS("Settings", Icons.Default.Settings),
}

@Composable
fun MainScreen(onLogout: () -> Unit) {
    var selectedTab by remember { mutableStateOf(BottomTab.LESSONS) }

    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                BottomTab.values().forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label, fontSize = 10.sp) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = OrgTheme.primary,
                            selectedTextColor = OrgTheme.primary,
                            unselectedIconColor = TextSecondary,
                            unselectedTextColor = TextSecondary,
                            indicatorColor = OrgTheme.primary.copy(alpha = 0.12f)
                        )
                    )
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            when (selectedTab) {
                BottomTab.LESSONS -> DashboardScreen(onLogout = onLogout)
                BottomTab.PLACEHOLDER -> PlaceholderScreen(title = "Explore", message = "Coming soon")
                BottomTab.BILLING -> BillingScreen()
                BottomTab.PROFILE -> ProfileScreen(onLogout = onLogout)
                BottomTab.SETTINGS -> SettingsScreen(onLogout = onLogout)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceholderScreen(title: String, message: String) {
    Scaffold(containerColor = PageBg, topBar = {
        TopAppBar(title = { Text(title, fontWeight = FontWeight.SemiBold, color = TextPrimary) }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White))
    }) { padding ->
        Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            Text(message, fontSize = 15.sp, color = TextSecondary)
        }
    }
}

// ─── Billing Screen ─────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillingScreen() {
    val scope = rememberCoroutineScope()
    var invoices by remember { mutableStateOf<List<InvoiceRecord>>(emptyList()) }
    var paymentMethods by remember { mutableStateOf<List<PaymentMethod>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var entityId by remember { mutableStateOf<String?>(null) }
    var showAddCard by remember { mutableStateOf(false) }
    var settingPrimary by remember { mutableStateOf<String?>(null) }

    // Add card form state
    var cardHolder by remember { mutableStateOf("") }
    var cardNumber by remember { mutableStateOf("") }
    var cardExpiry by remember { mutableStateOf("") }
    var cardBrand by remember { mutableStateOf("") }
    var isSavingCard by remember { mutableStateOf(false) }
    var selectedInvoice by remember { mutableStateOf<InvoiceRecord?>(null) }

    LaunchedEffect(Unit) {
        try {
            val user = SupabaseClient.client.auth.currentUserOrNull() ?: return@LaunchedEffect
            try {
                val roles = SupabaseClient.client.postgrest.from("user_roles").select { filter { eq("user_id", user.id) } }.decodeList<UserRoleWithEntity>()
                entityId = roles.firstOrNull { it.role == "mentee" || it.role == "trainee" }?.entity_id
            } catch (_: Exception) {}
            if (entityId == null && !user.email.isNullOrBlank()) {
                try { entityId = SupabaseClient.client.postgrest.from("mentees").select { filter { eq("email", user.email!!) } }.decodeList<MenteeRecordWithOrg>().firstOrNull()?.id } catch (_: Exception) {}
            }
            if (entityId != null) {
                try { invoices = SupabaseClient.client.postgrest.from("invoices").select { filter { eq("mentee_id", entityId!!) } }.decodeList<InvoiceRecord>().sortedByDescending { it.due_date } } catch (_: Exception) {}
                try { paymentMethods = SupabaseClient.client.postgrest.from("mentee_payment_methods").select { filter { eq("mentee_id", entityId!!) } }.decodeList<PaymentMethod>() } catch (_: Exception) {}
            }
        } catch (_: Exception) {}
        finally { isLoading = false }
    }

    // Add Card Dialog
    if (showAddCard) {
        AlertDialog(
            onDismissRequest = { showAddCard = false },
            title = { Text("Add Payment Method") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = cardHolder, onValueChange = { cardHolder = it },
                        label = { Text("Cardholder Name") }, modifier = Modifier.fillMaxWidth(),
                        singleLine = true, shape = RoundedCornerShape(7.dp),
                        colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary)
                    )
                    OutlinedTextField(
                        value = cardNumber, onValueChange = { cardNumber = it.filter { c -> c.isDigit() }.take(16) },
                        label = { Text("Card Number") }, modifier = Modifier.fillMaxWidth(),
                        singleLine = true, shape = RoundedCornerShape(7.dp),
                        colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary)
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = cardExpiry, onValueChange = { raw ->
                                val digits = raw.filter { c -> c.isDigit() }.take(4)
                                cardExpiry = if (digits.length > 2) "${digits.substring(0, 2)}/${digits.substring(2)}" else digits
                            },
                            label = { Text("MM/YY") }, modifier = Modifier.weight(1f),
                            singleLine = true, shape = RoundedCornerShape(7.dp),
                            colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary)
                        )
                        OutlinedTextField(
                            value = cardBrand, onValueChange = { cardBrand = it },
                            label = { Text("Brand") }, modifier = Modifier.weight(1f),
                            singleLine = true, shape = RoundedCornerShape(7.dp),
                            colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary)
                        )
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (entityId == null || cardNumber.length < 4) return@Button
                        isSavingCard = true
                        scope.launch {
                            try {
                                val last4 = cardNumber.takeLast(4)
                                val isPrimary = paymentMethods.isEmpty()
                                val detectedBrand = cardBrand.ifBlank {
                                    when {
                                        cardNumber.startsWith("4") -> "Visa"
                                        cardNumber.startsWith("5") || cardNumber.startsWith("2") -> "Mastercard"
                                        cardNumber.startsWith("3") -> "Amex"
                                        cardNumber.startsWith("6") -> "Discover"
                                        else -> "Card"
                                    }
                                }
                                val saved = SupabaseClient.client.postgrest.from("mentee_payment_methods")
                                    .insert(buildMap {
                                        put("mentee_id", entityId!!)
                                        put("card_holder", cardHolder)
                                        put("card_last4", last4)
                                        put("card_brand", detectedBrand)
                                        put("card_expiry", cardExpiry)
                                        put("is_primary", isPrimary)
                                    }) { select() }.decodeSingle<PaymentMethod>()
                                paymentMethods = paymentMethods + saved
                                showAddCard = false; cardHolder = ""; cardNumber = ""; cardExpiry = ""; cardBrand = ""
                            } catch (e: Exception) { AppLogger.error("Save card fail", e) }
                            finally { isSavingCard = false }
                        }
                    },
                    enabled = !isSavingCard && cardNumber.length >= 4 && cardHolder.isNotBlank(),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrgTheme.primary)
                ) { Text(if (isSavingCard) "Saving..." else "Add Card") }
            },
            dismissButton = { TextButton(onClick = { showAddCard = false }) { Text("Cancel") } }
        )
    }

    // Invoice Detail View
    if (selectedInvoice != null) {
        InvoiceDetailScreen(invoice = selectedInvoice!!, onBack = { selectedInvoice = null })
        return
    }

    Scaffold(containerColor = PageBg, topBar = {
        TopAppBar(title = { Text("Billing", fontWeight = FontWeight.SemiBold, color = TextPrimary) }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White))
    }) { padding ->
        if (isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Loading...") }
        } else {
            Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                // Payment methods
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Payment Methods", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
                    TextButton(onClick = { showAddCard = true }) {
                        Text("+ Add Card", color = OrgTheme.primary, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    }
                }

                if (paymentMethods.isEmpty()) {
                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                        Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.CreditCard, null, tint = TextSubtle, modifier = Modifier.size(36.dp))
                            Spacer(Modifier.height(8.dp))
                            Text("No payment methods on file", fontSize = 14.sp, color = TextSecondary)
                            Spacer(Modifier.height(12.dp))
                            Button(
                                onClick = { showAddCard = true },
                                Modifier.fillMaxWidth().height(44.dp),
                                shape = RoundedCornerShape(8.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = OrgTheme.primary)
                            ) { Text("Add Payment Method", fontWeight = FontWeight.Medium) }
                        }
                    }
                } else {
                    paymentMethods.forEach { pm ->
                        Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(OrgTheme.primary.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.CreditCard, null, tint = OrgTheme.primary, modifier = Modifier.size(24.dp))
                                }
                                Spacer(Modifier.width(14.dp))
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("${pm.card_brand ?: "Card"} ending in ${pm.card_last4 ?: "****"}", fontWeight = FontWeight.Medium, fontSize = 15.sp, color = TextPrimary)
                                        if (pm.is_primary) {
                                            Spacer(Modifier.width(8.dp))
                                            Box(Modifier.clip(RoundedCornerShape(4.dp)).background(OrgTheme.primary.copy(alpha = 0.1f)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                                                Text("Primary", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = OrgTheme.primary)
                                            }
                                        }
                                    }
                                    if (!pm.card_expiry.isNullOrBlank()) {
                                        Text("Expires ${pm.card_expiry}", fontSize = 13.sp, color = TextSecondary)
                                    }
                                    if (!pm.card_holder.isNullOrBlank()) {
                                        Text(pm.card_holder!!, fontSize = 13.sp, color = TextSubtle)
                                    }
                                }
                                if (!pm.is_primary) {
                                    TextButton(
                                        onClick = {
                                            settingPrimary = pm.id
                                            scope.launch {
                                                try {
                                                    // Unset all as primary, then set this one
                                                    if (entityId != null) {
                                                        SupabaseClient.client.postgrest.from("mentee_payment_methods")
                                                            .update({ set("is_primary", false) }) { filter { eq("mentee_id", entityId!!) } }
                                                        SupabaseClient.client.postgrest.from("mentee_payment_methods")
                                                            .update({ set("is_primary", true) }) { filter { eq("id", pm.id) } }
                                                        paymentMethods = paymentMethods.map { it.copy(is_primary = it.id == pm.id) }
                                                    }
                                                } catch (e: Exception) { AppLogger.error("Set primary fail", e) }
                                                finally { settingPrimary = null }
                                            }
                                        },
                                        enabled = settingPrimary == null
                                    ) {
                                        Text(if (settingPrimary == pm.id) "..." else "Set Primary", fontSize = 12.sp, color = OrgTheme.primary, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }
                        }
                    }
                }

                // Invoices
                Text("Invoices", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
                if (invoices.isEmpty()) {
                    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
                        Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                            Text("No invoices yet", fontSize = 14.sp, color = TextSecondary)
                        }
                    }
                } else {
                    invoices.forEach { inv ->
                        val (statusBg, statusText) = when (inv.status) {
                            "paid" -> Pair(Green50, Green500)
                            "overdue" -> Pair(Red50, Red500)
                            "cancelled" -> Pair(Color(0xFFF1F5F9), TextSecondary)
                            else -> Pair(Color(0xFFFFF7ED), Amber500)
                        }
                        Card(
                            Modifier.fillMaxWidth().clickable { selectedInvoice = inv },
                            shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)
                        ) {
                            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(inv.description?.takeIf { it.isNotBlank() } ?: "Invoice", fontWeight = FontWeight.Medium, fontSize = 15.sp, color = TextPrimary)
                                    if (!inv.due_date.isNullOrBlank()) { Text("Due: ${inv.due_date}", fontSize = 12.sp, color = TextSubtle) }
                                }
                                Column(horizontalAlignment = Alignment.End) {
                                    Text("$${String.format("%.2f", inv.amount)}", fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = TextPrimary)
                                    Spacer(Modifier.height(4.dp))
                                    Box(Modifier.clip(RoundedCornerShape(4.dp)).background(statusBg).padding(horizontal = 8.dp, vertical = 2.dp)) {
                                        Text(inv.status.replaceFirstChar { it.uppercase() }, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = statusText)
                                    }
                                }
                                Spacer(Modifier.width(8.dp))
                                Icon(Icons.Default.ChevronRight, null, tint = TextSubtle)
                            }
                        }
                    }
                }
            }
        }
    }
}

// ─── Invoice Detail Screen ─────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InvoiceDetailScreen(invoice: InvoiceRecord, onBack: () -> Unit) {
    val (statusBg, statusTextColor) = when (invoice.status) {
        "paid" -> Pair(Green50, Green500)
        "overdue" -> Pair(Red50, Red500)
        "cancelled" -> Pair(Color(0xFFF1F5F9), TextSecondary)
        else -> Pair(Color(0xFFFFF7ED), Amber500)
    }

    Scaffold(
        containerColor = PageBg,
        topBar = {
            TopAppBar(
                title = { Text("Invoice", fontWeight = FontWeight.SemiBold, color = TextPrimary) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, "Back", tint = TextPrimary) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Invoice header
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                Column(Modifier.padding(20.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(invoice.description?.takeIf { it.isNotBlank() } ?: "Invoice", fontWeight = FontWeight.SemiBold, fontSize = 18.sp, color = TextPrimary)
                        Box(Modifier.clip(RoundedCornerShape(6.dp)).background(statusBg).padding(horizontal = 10.dp, vertical = 4.dp)) {
                            Text(invoice.status.replaceFirstChar { it.uppercase() }, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = statusTextColor)
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Divider(color = BorderLight)
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Amount Due", fontSize = 14.sp, color = TextSecondary)
                        Text("$${String.format("%.2f", invoice.amount)}", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                    }
                    if (!invoice.due_date.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Due Date", fontSize = 14.sp, color = TextSecondary)
                            Text(invoice.due_date!!, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TextPrimary)
                        }
                    }
                    if (!invoice.paid_at.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Paid", fontSize = 14.sp, color = TextSecondary)
                            Text(invoice.paid_at!!.substringBefore("T"), fontSize = 14.sp, fontWeight = FontWeight.Medium, color = Green500)
                        }
                    }
                }
            }

            // Line items
            Text("Charges", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                Column(Modifier.padding(16.dp)) {
                    // Show description as the line item for now
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(invoice.description?.takeIf { it.isNotBlank() } ?: "Service charge", fontSize = 14.sp, color = TextPrimary, modifier = Modifier.weight(1f))
                        Text("$${String.format("%.2f", invoice.amount)}", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TextPrimary)
                    }
                    Spacer(Modifier.height(10.dp))
                    Divider(color = BorderLight)
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Total", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                        Text("$${String.format("%.2f", invoice.amount)}", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                    }
                }
            }

            // Pay button (for unpaid invoices)
            if (invoice.status != "paid" && invoice.status != "cancelled") {
                Spacer(Modifier.height(8.dp))
                Button(
                    onClick = { /* TODO: payment integration */ },
                    Modifier.fillMaxWidth().height(50.dp),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = OrgTheme.primary)
                ) {
                    Text("Pay $${String.format("%.2f", invoice.amount)}", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                }
            }
        }
    }
}

// ─── Profile Screen ─────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(onLogout: () -> Unit) {
    val scope = rememberCoroutineScope()
    var profile by remember { mutableStateOf<MenteeFullProfile?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isSaving by remember { mutableStateOf(false) }
    var saveMessage by remember { mutableStateOf<String?>(null) }
    var menteeId by remember { mutableStateOf<String?>(null) }
    var avatarUrl by remember { mutableStateOf<String?>(null) }
    var isEditing by remember { mutableStateOf(false) }

    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var street1 by remember { mutableStateOf("") }
    var street2 by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var state by remember { mutableStateOf("") }
    var zip by remember { mutableStateOf("") }
    var country by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var billingSameAsMailing by remember { mutableStateOf(true) }
    var billingStreet1 by remember { mutableStateOf("") }
    var billingStreet2 by remember { mutableStateOf("") }
    var billingCity by remember { mutableStateOf("") }
    var billingState by remember { mutableStateOf("") }
    var billingZip by remember { mutableStateOf("") }
    var billingCountry by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            val user = SupabaseClient.client.auth.currentUserOrNull() ?: return@LaunchedEffect
            var entityId: String? = null
            try {
                val roles = SupabaseClient.client.postgrest.from("user_roles").select { filter { eq("user_id", user.id) } }.decodeList<UserRoleWithEntity>()
                entityId = roles.firstOrNull { it.role == "mentee" || it.role == "trainee" }?.entity_id
            } catch (_: Exception) {}
            if (entityId == null && !user.email.isNullOrBlank()) {
                try { entityId = SupabaseClient.client.postgrest.from("mentees").select { filter { eq("email", user.email!!) } }.decodeList<MenteeRecordWithOrg>().firstOrNull()?.id } catch (_: Exception) {}
            }
            if (entityId != null) {
                menteeId = entityId
                try {
                    val p = SupabaseClient.client.postgrest.from("mentees").select { filter { eq("id", entityId) } }.decodeSingle<MenteeFullProfile>()
                    profile = p; avatarUrl = p.avatar_url
                    firstName = p.first_name; lastName = p.last_name; email = p.email ?: user.email ?: ""
                    phone = p.phone ?: ""; street1 = p.address_street1 ?: ""; street2 = p.address_street2 ?: ""
                    city = p.address_city ?: ""; state = p.address_state ?: ""; zip = p.address_zip ?: ""; country = p.address_country ?: ""
                    billingSameAsMailing = p.billing_same_as_mailing ?: true
                    billingStreet1 = p.billing_street1 ?: ""; billingStreet2 = p.billing_street2 ?: ""
                    billingCity = p.billing_city ?: ""; billingState = p.billing_state ?: ""
                    billingZip = p.billing_zip ?: ""; billingCountry = p.billing_country ?: ""
                } catch (_: Exception) {}
            }
        } catch (_: Exception) {}
        finally { isLoading = false }
    }

    Scaffold(containerColor = PageBg, topBar = {
        TopAppBar(
            title = { Text("Profile", fontWeight = FontWeight.SemiBold, color = TextPrimary) },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White),
            actions = {
                TextButton(onClick = { if (isEditing) {
                    // Save
                    if (menteeId == null) return@TextButton
                    isSaving = true; saveMessage = null
                    scope.launch {
                        try {
                            SupabaseClient.client.postgrest.from("mentees").update({
                                set("first_name", firstName); set("last_name", lastName); set("phone", phone)
                                set("address_street1", street1); set("address_street2", street2)
                                set("address_city", city); set("address_state", state); set("address_zip", zip); set("address_country", country)
                                set("billing_same_as_mailing", billingSameAsMailing)
                                set("billing_street1", billingStreet1); set("billing_street2", billingStreet2)
                                set("billing_city", billingCity); set("billing_state", billingState)
                                set("billing_zip", billingZip); set("billing_country", billingCountry)
                            }) { filter { eq("id", menteeId!!) } }
                            saveMessage = "Saved"; isEditing = false
                        } catch (e: Exception) { saveMessage = "Error saving" }
                        finally { isSaving = false }
                    }
                } else { isEditing = true } }) {
                    Text(if (isSaving) "Saving..." else if (isEditing) "Save" else "Edit", color = OrgTheme.primary, fontWeight = FontWeight.SemiBold)
                }
            }
        )
    }) { padding ->
        if (isLoading) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text("Loading...") }
        } else {
            Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // Profile header with avatar
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                    Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                        // Avatar circle
                        val initials = "${firstName.firstOrNull() ?: ""}${lastName.firstOrNull() ?: ""}".uppercase()
                        Box(
                            Modifier.size(64.dp).clip(CircleShape).background(OrgTheme.primary),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(initials, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                        }
                        Spacer(Modifier.width(16.dp))
                        Column {
                            Text("$firstName $lastName", fontWeight = FontWeight.SemiBold, fontSize = 18.sp, color = TextPrimary)
                            Text(email, fontSize = 13.sp, color = TextSecondary)
                            if (phone.isNotBlank()) { Text(phone, fontSize = 13.sp, color = TextSubtle) }
                        }
                    }
                }

                if (saveMessage != null) {
                    Text(saveMessage!!, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = if (saveMessage == "Saved") Green500 else Red500)
                }

                // Personal info
                Text("Personal Information", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = TextSecondary)
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(if (isEditing) 10.dp else 0.dp)) {
                        if (isEditing) {
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                OutlinedTextField(value = firstName, onValueChange = { firstName = it }, label = { Text("First") }, modifier = Modifier.weight(1f), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                                OutlinedTextField(value = lastName, onValueChange = { lastName = it }, label = { Text("Last") }, modifier = Modifier.weight(1f), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                            }
                            OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                        } else {
                            ProfileRow("Name", "$firstName $lastName")
                            Divider(color = BorderLight)
                            ProfileRow("Email", email)
                            Divider(color = BorderLight)
                            ProfileRow("Phone", phone.ifBlank { "Not set" })
                        }
                    }
                }

                // Mailing Address
                Text("Mailing Address", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = TextSecondary)
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(if (isEditing) 10.dp else 0.dp)) {
                        if (isEditing) {
                            OutlinedTextField(value = street1, onValueChange = { street1 = it }, label = { Text("Street") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                            OutlinedTextField(value = street2, onValueChange = { street2 = it }, label = { Text("Street 2") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                            OutlinedTextField(value = city, onValueChange = { city = it }, label = { Text("City") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                OutlinedTextField(value = state, onValueChange = { state = it }, label = { Text("State") }, modifier = Modifier.weight(1f), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                                OutlinedTextField(value = zip, onValueChange = { zip = it }, label = { Text("ZIP") }, modifier = Modifier.weight(1f), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                            }
                            OutlinedTextField(value = country, onValueChange = { country = it }, label = { Text("Country") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                        } else {
                            val addr = listOf(street1, street2, "$city${if (state.isNotBlank()) ", $state" else ""} $zip", country).filter { it.isNotBlank() }
                            if (addr.isEmpty() || (addr.size == 1 && addr[0].isBlank())) {
                                Text("No address on file", fontSize = 14.sp, color = TextSubtle, modifier = Modifier.padding(vertical = 8.dp))
                            } else {
                                addr.forEach { line -> Text(line, fontSize = 14.sp, color = TextPrimary, modifier = Modifier.padding(vertical = 2.dp)) }
                            }
                        }
                    }
                }

                // Billing Address
                Text("Billing Address", fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = TextSecondary)
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(if (isEditing && !billingSameAsMailing) 10.dp else 0.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text("Same as mailing address", fontSize = 14.sp, color = TextPrimary)
                            Switch(
                                checked = billingSameAsMailing,
                                onCheckedChange = { billingSameAsMailing = it },
                                enabled = isEditing,
                                colors = SwitchDefaults.colors(checkedTrackColor = OrgTheme.primary)
                            )
                        }
                        if (!billingSameAsMailing) {
                            Spacer(Modifier.height(8.dp))
                            if (isEditing) {
                                OutlinedTextField(value = billingStreet1, onValueChange = { billingStreet1 = it }, label = { Text("Street") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                                OutlinedTextField(value = billingStreet2, onValueChange = { billingStreet2 = it }, label = { Text("Street 2") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                                OutlinedTextField(value = billingCity, onValueChange = { billingCity = it }, label = { Text("City") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    OutlinedTextField(value = billingState, onValueChange = { billingState = it }, label = { Text("State") }, modifier = Modifier.weight(1f), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                                    OutlinedTextField(value = billingZip, onValueChange = { billingZip = it }, label = { Text("ZIP") }, modifier = Modifier.weight(1f), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                                }
                                OutlinedTextField(value = billingCountry, onValueChange = { billingCountry = it }, label = { Text("Country") }, modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(7.dp), colors = OutlinedTextFieldDefaults.colors(unfocusedBorderColor = BorderColor, focusedBorderColor = OrgTheme.primary))
                            } else {
                                val bAddr = listOf(billingStreet1, billingStreet2, "$billingCity${if (billingState.isNotBlank()) ", $billingState" else ""} $billingZip", billingCountry).filter { it.isNotBlank() }
                                if (bAddr.isEmpty() || (bAddr.size == 1 && bAddr[0].isBlank())) {
                                    Text("No billing address on file", fontSize = 14.sp, color = TextSubtle, modifier = Modifier.padding(vertical = 8.dp))
                                } else {
                                    bAddr.forEach { line -> Text(line, fontSize = 14.sp, color = TextPrimary, modifier = Modifier.padding(vertical = 2.dp)) }
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun ProfileRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontSize = 14.sp, color = TextSecondary)
        Text(value, fontSize = 14.sp, fontWeight = FontWeight.Medium, color = TextPrimary)
    }
}

// ─── Settings Screen ────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onLogout: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var isSending by remember { mutableStateOf(false) }
    var sentMessage by remember { mutableStateOf<String?>(null) }
    var biometricEnabled by remember { mutableStateOf(false) }
    val biometricAvailable = remember { canUseBiometric(context) }

    LaunchedEffect(Unit) {
        biometricEnabled = SessionManager.isBiometricEnabled(context)
    }

    Scaffold(containerColor = PageBg, topBar = {
        TopAppBar(title = { Text("Settings", fontWeight = FontWeight.SemiBold, color = TextPrimary) }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White))
    }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            // Security
            if (biometricAvailable) {
                Text("Security", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
                Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Biometric Lock", fontWeight = FontWeight.Medium, fontSize = 15.sp, color = TextPrimary)
                            Text("Require fingerprint or face unlock when resuming the app", fontSize = 13.sp, color = TextSecondary)
                        }
                        Switch(
                            checked = biometricEnabled,
                            onCheckedChange = { enabled ->
                                biometricEnabled = enabled
                                scope.launch { SessionManager.setBiometricEnabled(context, enabled) }
                            },
                            colors = SwitchDefaults.colors(checkedTrackColor = OrgTheme.primary)
                        )
                    }
                }
            }

            Text("Support", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = TextPrimary)
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp), colors = CardDefaults.cardColors(containerColor = Color.White), elevation = CardDefaults.cardElevation(1.dp)) {
                Column(Modifier.padding(16.dp)) {
                    Text("Send Debug Info", fontWeight = FontWeight.Medium, fontSize = 15.sp, color = TextPrimary)
                    Spacer(Modifier.height(4.dp))
                    Text("Send diagnostic information to help troubleshoot issues.", fontSize = 13.sp, color = TextSecondary)
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            isSending = true; sentMessage = null
                            scope.launch {
                                try {
                                    val user = SupabaseClient.client.auth.currentUserOrNull()
                                    var orgId: String? = null; var supportEmail: String? = null
                                    if (user != null) { try { orgId = SupabaseClient.client.postgrest.from("user_roles").select { filter { eq("user_id", user.id) } }.decodeList<UserRoleWithEntity>().firstOrNull()?.organization_id } catch (_: Exception) {} }
                                    if (orgId != null) { try { supportEmail = SupabaseClient.client.postgrest.from("settings").select { filter { eq("organization_id", orgId); eq("key", "bug_report_email_override") } }.decodeList<OrgSetting>().firstOrNull()?.value?.takeIf { it.isNotBlank() } } catch (_: Exception) {} }
                                    val info = "=== MentorDesk Debug ===\nUser: ${user?.email}\nDevice: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}\nAndroid: ${android.os.Build.VERSION.RELEASE}\nTime: ${java.time.Instant.now()}"
                                    AppLogger.log(info, source = "android-debug-report", severity = "info")
                                    if (supportEmail != null) {
                                        val intent = Intent(Intent.ACTION_SEND).apply { type = "message/rfc822"; putExtra(Intent.EXTRA_EMAIL, arrayOf(supportEmail)); putExtra(Intent.EXTRA_SUBJECT, "MentorDesk - Debug Report"); putExtra(Intent.EXTRA_TEXT, info) }
                                        try { context.startActivity(Intent.createChooser(intent, "Send debug info")); sentMessage = "Opening email..." } catch (_: Exception) { sentMessage = "Debug info saved to database." }
                                    } else { sentMessage = "Debug info saved." }
                                } catch (_: Exception) { sentMessage = "Error sending" }
                                finally { isSending = false }
                            }
                        },
                        Modifier.fillMaxWidth().height(44.dp), shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = OrgTheme.primary), enabled = !isSending
                    ) { Text(if (isSending) "Sending..." else "Send Debug Info", fontWeight = FontWeight.Medium) }
                    if (sentMessage != null) { Spacer(Modifier.height(8.dp)); Text(sentMessage!!, fontSize = 13.sp, color = OrgTheme.primary) }
                }
            }

            Spacer(Modifier.height(8.dp))
            Divider(color = BorderLight)
            Spacer(Modifier.height(4.dp))

            Button(
                onClick = { scope.launch { SupabaseClient.client.auth.signOut(); onLogout() } },
                Modifier.fillMaxWidth().height(44.dp), shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Red500)
            ) { Text("Sign out", fontWeight = FontWeight.Medium) }
        }
    }
}
