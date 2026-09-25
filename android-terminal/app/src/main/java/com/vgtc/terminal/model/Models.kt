package com.vgtc.terminal.model

data class Profile(
    val id: String = "",
    val name: String = "",
    val profileType: String? = "Staff",
    val vehicleNo: String? = null,
    val photo: String? = null,
    val photos: List<String>? = null,
    val role: String? = null,
    val phone: String? = null,
    val fingerprintEnrolled: Boolean = false,
    val fingerprintSlotId: Int? = null,
    val faceEmbedding: List<Float>? = null,
    val createdAt: String? = null
)

data class AttendanceRecord(
    val profileId: String,
    val profileName: String,
    val profileType: String,
    val status: String,
    val date: String,
    val vehicleNo: String? = null,
    val inTime: String? = null,
    val outTime: String? = null,
    val durationHours: Double? = null,
    val dutyDays: Double? = null,
    val dutyState: String? = null,
    val overrideReason: String? = null,
    val source: String = "terminal",
    val note: String? = null,
    val method: String = "face",
    val terminalId: String = "VGTC-TERMINAL-01"
)

data class DutyRecord(
    val profileId: String = "",
    val profileName: String = "",
    val profileType: String? = "Staff",
    val vehicleNo: String? = null,
    val inTimeMs: Long = System.currentTimeMillis(),
    val inTimeFormatted: String = "",
    val outTimeMs: Long? = null,
    val outTimeFormatted: String? = null,
    val durationHours: Double? = null,
    val dutyDays: Double = 1.0,
    val dutyState: String = "IN_DUTY", // "IN_DUTY", "COMPLETED", "EMERGENCY_LEAVE", "ABSENT"
    val status: String = "present",    // "present", "half_day", "absent", "leave"
    val overrideReason: String? = null
)

data class LoginRequest(
    val username: String,
    val password: String,
    val orgId: String = "vgtc"
)

data class LoginResponse(
    val token: String,
    val user: UserInfo
)

data class UserInfo(
    val id: String,
    val name: String,
    val username: String,
    val role: String
)
