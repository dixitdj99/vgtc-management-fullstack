package com.vgtc.terminal

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/** Legacy links must use the verified biometric flow, never manual identity selection. */
class ScanActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
        finish()
    }
}
