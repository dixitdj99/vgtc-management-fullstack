package com.vgtc.terminal.model

data class Profile(
    val id: String = "",
    val name: String = "",
    val profileType: String? = "Staff",
    val photo: String? = null,
    val role: String? = null,
    val phone: String? = null,
    val createdAt: String? = null
)

data class AttendanceRecord(
    val profileId: String,
    val profileName: String,
    val profileType: String,
    val status: String,
    val date: String,
    val source: String = "terminal",
    val note: String? = null
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
