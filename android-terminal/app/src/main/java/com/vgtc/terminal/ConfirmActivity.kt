package com.vgtc.terminal

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import com.bumptech.glide.Glide
import com.vgtc.terminal.databinding.ActivityConfirmBinding
import java.text.SimpleDateFormat
import java.util.*

class ConfirmActivity : AppCompatActivity() {

    private lateinit var binding: ActivityConfirmBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityConfirmBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val name = intent.getStringExtra("name") ?: "Unknown"
        val type = intent.getStringExtra("type") ?: "Staff"
        val status = intent.getStringExtra("status") ?: "present"
        val photo = intent.getStringExtra("photo")

        val timeFormatter = SimpleDateFormat("hh:mm a", Locale("en", "IN"))
        val now = timeFormatter.format(Date())

        binding.tvEmployeeName.text = name
        binding.tvEmployeeType.text = type
        binding.tvTime.text = now

        // Status chip
        val statusLabel = when (status) {
            "present" -> "✓ Marked Present"
            "absent" -> "✗ Marked Absent"
            "half_day" -> "◑ Half Day"
            "leave" -> "⊘ On Leave"
            else -> status.replaceFirstChar { it.uppercase() }
        }
        binding.tvStatusChip.text = statusLabel
        val statusColor = when (status) {
            "present" -> getColor(R.color.green_online)
            "absent" -> getColor(R.color.red_offline)
            "half_day" -> getColor(R.color.orange_halfday)
            else -> getColor(R.color.grey_status)
        }
        binding.statusChipContainer.setBackgroundColor(statusColor)

        // Photo
        if (!photo.isNullOrBlank()) {
            Glide.with(this).load(photo).circleCrop().into(binding.ivEmployeePhoto)
        } else {
            binding.ivEmployeePhoto.setImageResource(R.drawable.ic_person_placeholder)
        }

        // Tick animation
        binding.ivCheckmark.scaleX = 0f
        binding.ivCheckmark.scaleY = 0f
        binding.ivCheckmark.animate().scaleX(1f).scaleY(1f).setDuration(400).setStartDelay(200).start()

        // Auto-dismiss after 3.5 seconds
        Handler(Looper.getMainLooper()).postDelayed({ finish() }, 3500)

        binding.btnDone.setOnClickListener { finish() }
    }
}
