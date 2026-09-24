package com.vgtc.terminal

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import com.vgtc.terminal.databinding.ActivitySplashBinding
import com.vgtc.terminal.util.Prefs

class SplashActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySplashBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep screen on during splash
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Full screen - hide status and nav bars
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
        }

        binding = ActivitySplashBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Animate logo and tagline in
        binding.logoImage.alpha = 0f
        binding.appName.alpha = 0f
        binding.tagline.alpha = 0f

        binding.logoImage.animate().alpha(1f).setDuration(800).start()
        binding.appName.animate().alpha(1f).setDuration(800).setStartDelay(300).start()
        binding.tagline.animate().alpha(1f).setDuration(800).setStartDelay(600).start()

        // Navigate after 2.5 seconds
        Handler(Looper.getMainLooper()).postDelayed({
            val prefs = Prefs(this)
            if (prefs.serverUrl.isBlank() || prefs.username.isBlank()) {
                startActivity(Intent(this, SetupActivity::class.java))
            } else {
                startActivity(Intent(this, MainActivity::class.java))
            }
        }, 2500)
    }
}
