package com.mentordesk.app

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.fragment.app.FragmentActivity
import com.mentordesk.app.ui.theme.MentorDeskTheme
import com.mentordesk.app.navigation.AppNavigation

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MentorDeskTheme {
                AppNavigation()
            }
        }
    }
}
