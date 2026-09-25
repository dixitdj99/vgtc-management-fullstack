package com.vgtc.terminal.api

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.vgtc.terminal.model.AttendanceRecord
import com.vgtc.terminal.model.LoginRequest
import com.vgtc.terminal.model.LoginResponse
import com.vgtc.terminal.model.Profile
import com.vgtc.terminal.util.Prefs
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

typealias ApiResult<T> = Result<T>

class ApiClient(context: Context) {

    private val prefs = Prefs(context)
    private val gson = Gson()

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    private fun baseUrl(): String {
        var url = prefs.serverUrl.trim().trimEnd('/')
        if (url.endsWith("/api")) {
            url = url.substringBeforeLast("/api")
        }
        return url
    }

    private fun authHeaders(): Map<String, String> {
        val token = prefs.authToken
        return if (token.isNotBlank()) {
            mapOf("Authorization" to "Bearer $token")
        } else emptyMap()
    }

    // ──────────────────────────────────────────────────
    // POST /api/auth/login
    // ──────────────────────────────────────────────────
    fun login(username: String, password: String, callback: (ApiResult<String>) -> Unit) {
        val body = gson.toJson(LoginRequest(username, password, prefs.orgId.ifBlank { "vgtc" }))
        val request = Request.Builder()
            .url("${baseUrl()}/api/auth/login")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(Result.failure(Exception("Cannot reach server: ${e.message}")))
            }

            override fun onResponse(call: Call, response: Response) {
                val responseBody = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    try {
                        val loginResp = gson.fromJson(responseBody, LoginResponse::class.java)
                        callback(Result.success(loginResp.token))
                    } catch (e: Exception) {
                        callback(Result.failure(Exception("Invalid server response")))
                    }
                } else {
                    val error = try {
                        gson.fromJson(responseBody, Map::class.java)["error"] as? String
                            ?: "Login failed (${response.code})"
                    } catch (_: Exception) { "Login failed (${response.code})" }
                    callback(Result.failure(Exception(error)))
                }
            }
        })
    }

    // ──────────────────────────────────────────────────
    // GET /api/profiles
    // ──────────────────────────────────────────────────
    fun getProfiles(callback: (ApiResult<List<Profile>>) -> Unit) {
        ensureToken { tokenOk ->
            if (!tokenOk) {
                callback(Result.failure(Exception("Not authenticated")))
                return@ensureToken
            }
            val request = Request.Builder()
                .url("${baseUrl()}/api/profiles")
                .get()
                .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    callback(Result.failure(Exception("Network error: ${e.message}")))
                }

                override fun onResponse(call: Call, response: Response) {
                    val body = response.body?.string() ?: "[]"
                    if (response.isSuccessful) {
                        try {
                            val type = object : TypeToken<List<Profile>>() {}.type
                            val profiles: List<Profile> = gson.fromJson(body, type)
                            callback(Result.success(profiles))
                        } catch (e: Exception) {
                            callback(Result.failure(Exception("Parse error: ${e.message}")))
                        }
                    } else {
                        callback(Result.failure(Exception("Failed to load profiles: ${response.code}")))
                    }
                }
            })
        }
    }

    // ──────────────────────────────────────────────────
    // POST /api/attendance — mark single person
    // ──────────────────────────────────────────────────
    fun markAttendance(
        record: AttendanceRecord,
        callback: (ApiResult<Boolean>) -> Unit
    ) {
        ensureToken { tokenOk ->
            if (!tokenOk) {
                callback(Result.failure(Exception("Not authenticated")))
                return@ensureToken
            }

            val body = gson.toJson(record)
            val request = Request.Builder()
                .url("${baseUrl()}/api/attendance")
                .post(body.toRequestBody(JSON_MEDIA_TYPE))
                .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    callback(Result.failure(Exception("Network error: ${e.message}")))
                }

                override fun onResponse(call: Call, response: Response) {
                    if (response.isSuccessful) {
                        callback(Result.success(true))
                    } else {
                        val errBody = response.body?.string() ?: ""
                        val error = try {
                            gson.fromJson(errBody, Map::class.java)["error"] as? String
                                ?: "Attendance failed (${response.code})"
                        } catch (_: Exception) { "Attendance failed (${response.code})" }
                        callback(Result.failure(Exception(error)))
                    }
                }
            })
        }
    }

    fun markAttendance(
        profile: com.vgtc.terminal.model.Profile,
        status: String,
        method: String = "face",
        inTime: String? = null,
        outTime: String? = null,
        durationHours: Double? = null,
        dutyDays: Double? = null,
        dutyState: String? = null,
        overrideReason: String? = null,
        callback: (ApiResult<Boolean>) -> Unit
    ) {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale("en", "IN")).format(Date())
        val record = AttendanceRecord(
            profileId = profile.id,
            profileName = profile.name,
            profileType = profile.profileType ?: "Staff",
            status = status,
            date = today,
            vehicleNo = profile.vehicleNo,
            inTime = inTime,
            outTime = outTime,
            durationHours = durationHours,
            dutyDays = dutyDays,
            dutyState = dutyState,
            overrideReason = overrideReason,
            source = if (overrideReason != null) "manual" else "terminal",
            method = method,
            terminalId = "VGTC-TERMINAL-01"
        )
        markAttendance(record, callback)
    }

    // ──────────────────────────────────────────────────
    // PUT /api/profiles/:id — enroll face photo
    // ──────────────────────────────────────────────────
    fun updateProfilePhoto(profileId: String, photoBase64: String, callback: (ApiResult<Boolean>) -> Unit) {
        ensureToken { tokenOk ->
            if (!tokenOk) {
                callback(Result.failure(Exception("Not authenticated")))
                return@ensureToken
            }
            val payload = mapOf("photo" to photoBase64)
            val body = gson.toJson(payload)
            val request = Request.Builder()
                .url("${baseUrl()}/api/profiles/$profileId")
                .put(body.toRequestBody(JSON_MEDIA_TYPE))
                .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    callback(Result.failure(Exception("Network error: ${e.message}")))
                }

                override fun onResponse(call: Call, response: Response) {
                    if (response.isSuccessful) {
                        callback(Result.success(true))
                    } else {
                        val errBody = response.body?.string() ?: ""
                        val error = try {
                            gson.fromJson(errBody, Map::class.java)["error"] as? String
                                ?: "Photo update failed (${response.code})"
                        } catch (_: Exception) { "Photo update failed (${response.code})" }
                        callback(Result.failure(Exception(error)))
                    }
                }
            })
        }
    }

    // ──────────────────────────────────────────────────
    // POST /api/profiles — create profile
    // ──────────────────────────────────────────────────
    fun createProfile(profile: Profile, callback: (ApiResult<Profile>) -> Unit) {
        ensureToken { tokenOk ->
            if (!tokenOk) {
                callback(Result.failure(Exception("Not authenticated")))
                return@ensureToken
            }
            val body = gson.toJson(profile)
            val request = Request.Builder()
                .url("${baseUrl()}/api/profiles")
                .post(body.toRequestBody(JSON_MEDIA_TYPE))
                .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    callback(Result.failure(Exception("Network error: ${e.message}")))
                }

                override fun onResponse(call: Call, response: Response) {
                    val respBody = response.body?.string() ?: ""
                    if (response.isSuccessful) {
                        try {
                            val created = gson.fromJson(respBody, Profile::class.java)
                            callback(Result.success(created))
                        } catch (e: Exception) {
                            callback(Result.success(profile))
                        }
                    } else {
                        callback(Result.failure(Exception("Create failed (${response.code})")))
                    }
                }
            })
        }
    }

    // ──────────────────────────────────────────────────
    // PUT /api/profiles/:id — update profile
    // ──────────────────────────────────────────────────
    fun updateProfile(profile: Profile, callback: (ApiResult<Boolean>) -> Unit) {
        ensureToken { tokenOk ->
            if (!tokenOk) {
                callback(Result.failure(Exception("Not authenticated")))
                return@ensureToken
            }
            val body = gson.toJson(profile)
            val request = Request.Builder()
                .url("${baseUrl()}/api/profiles/${profile.id}")
                .put(body.toRequestBody(JSON_MEDIA_TYPE))
                .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    callback(Result.failure(Exception("Network error: ${e.message}")))
                }

                override fun onResponse(call: Call, response: Response) {
                    if (response.isSuccessful) {
                        callback(Result.success(true))
                    } else {
                        callback(Result.failure(Exception("Update failed (${response.code})")))
                    }
                }
            })
        }
    }

    // ──────────────────────────────────────────────────
    // DELETE /api/profiles/:id — delete profile
    // ──────────────────────────────────────────────────
    fun deleteProfile(profileId: String, callback: (ApiResult<Boolean>) -> Unit) {
        ensureToken { tokenOk ->
            if (!tokenOk) {
                callback(Result.failure(Exception("Not authenticated")))
                return@ensureToken
            }
            val request = Request.Builder()
                .url("${baseUrl()}/api/profiles/$profileId")
                .delete()
                .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
                .build()

            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    callback(Result.failure(Exception("Network error: ${e.message}")))
                }

                override fun onResponse(call: Call, response: Response) {
                    if (response.isSuccessful) {
                        callback(Result.success(true))
                    } else {
                        callback(Result.failure(Exception("Delete failed (${response.code})")))
                    }
                }
            })
        }
    }

    // ──────────────────────────────────────────────────
    // GET /api/auth/status  — quick connectivity check
    // ──────────────────────────────────────────────────
    fun checkConnection(callback: (Boolean) -> Unit) {
        if (baseUrl().isBlank()) { callback(false); return }
        val request = Request.Builder()
            .url("${baseUrl()}/api/auth/status")
            .get()
            .build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) { callback(false) }
            override fun onResponse(call: Call, response: Response) { callback(response.isSuccessful) }
        })
    }

    // ──────────────────────────────────────────────────
    // Auto re-login if token is missing or expired
    // ──────────────────────────────────────────────────
    private fun ensureToken(callback: (Boolean) -> Unit) {
        if (prefs.authToken.isNotBlank()) {
            callback(true)
            return
        }
        val username = prefs.username
        val password = prefs.password
        if (username.isBlank() || password.isBlank()) {
            callback(false)
            return
        }
        login(username, password) { result ->
            result.onSuccess { token ->
                prefs.authToken = token
                callback(true)
            }.onFailure {
                callback(false)
            }
        }
    }
}
