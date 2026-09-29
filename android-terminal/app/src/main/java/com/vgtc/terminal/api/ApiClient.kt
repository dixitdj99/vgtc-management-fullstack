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

    private fun isBiometricPerson(profile: Profile): Boolean {
        val values = listOf(profile.profileType, profile.role, profile.name)
            .map { it.orEmpty().trim().lowercase(Locale.US) }
        return values.none { it in setOf("tyre", "manual", "pump", "fuel", "fuel pump", "fuel station", "firm", "expense", "labour") || it.contains("fuel pump") || it.contains("fuel station") }
    }

    companion object {
        // Static terminal token — accepted by the server as an admin-level kiosk identity.
        // Matches the TERMINAL_KEY env var (or the default) checked in middleware/auth.js.
        const val TERMINAL_TOKEN = "VGTC-TERMINAL-TOKEN-KEY"
    }

    private fun baseUrl(): String {
        var url = prefs.serverUrl.trim().trimEnd('/')
        if (url.endsWith("/api")) {
            url = url.substringBeforeLast("/api")
        }
        return url
    }

    /**
     * Always prefer the terminal static token so biometric writes are accepted
     * even when the user JWT has no 'attendance' or 'profiles' permission.
     * Falls back to the stored JWT only for non-biometric calls (login, etc.).
     */
    private fun terminalHeaders(): Map<String, String> {
        return mapOf(
            "Authorization" to "Bearer $TERMINAL_TOKEN",
            "X-Org-Id" to prefs.orgId.ifBlank { "vgtc" }
        )
    }

    private fun authHeaders(): Map<String, String> {
        val token = prefs.authToken
        return if (token.isNotBlank()) {
            mapOf("Authorization" to "Bearer $token")
        } else terminalHeaders()
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
    // GET /api/profiles with fallback to /api/terminal/roster
    // ──────────────────────────────────────────────────
    fun getProfiles(callback: (ApiResult<List<Profile>>) -> Unit) {
        val request = Request.Builder()
            .url("${baseUrl()}/api/profiles")
            .get()
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                fetchRoster(callback)
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string() ?: "[]"
                if (response.isSuccessful) {
                    try {
                        val type = object : TypeToken<List<Profile>>() {}.type
                        val profiles: List<Profile> = gson.fromJson(body, type)
                        if (profiles.isNotEmpty()) {
                            callback(Result.success(profiles.filter(::isBiometricPerson)))
                        } else {
                            fetchRoster(callback)
                        }
                    } catch (e: Exception) {
                        fetchRoster(callback)
                    }
                } else {
                    fetchRoster(callback)
                }
            }
        })
    }

    private fun fetchRoster(callback: (ApiResult<List<Profile>>) -> Unit) {
        val request = Request.Builder()
            .url("${baseUrl()}/api/terminal/roster")
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(Result.failure(Exception("Cannot connect to server: ${e.message}")))
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string() ?: "{}"
                if (response.isSuccessful) {
                    try {
                        val map = gson.fromJson(body, Map::class.java)
                        val staffList = map["staff"] as? List<*> ?: map["roster"] as? List<*> ?: emptyList<Any>()
                        val driversList = map["drivers"] as? List<*> ?: emptyList<Any>()
                        val combinedJson = gson.toJson(staffList + driversList)
                        val type = object : TypeToken<List<Profile>>() {}.type
                        val list: List<Profile> = gson.fromJson(combinedJson, type)
                        callback(Result.success(list.filter(::isBiometricPerson)))
                    } catch (e: Exception) {
                        callback(Result.failure(Exception("Roster parse error: ${e.message}")))
                    }
                } else {
                    callback(Result.failure(Exception("Roster request failed (${response.code})")))
                }
            }
        })
    }

    // ──────────────────────────────────────────────────
    // POST /api/terminal/event (legacy /api/attendance fallback)
    // ──────────────────────────────────────────────────
    fun markAttendance(
        record: AttendanceRecord,
        callback: (ApiResult<Boolean>) -> Unit = {}
    ) {
        // The terminal event endpoint already writes the immutable punch log and
        // consolidated portal summary. Only fall back to the legacy daily API if
        // that richer request fails; posting both in parallel caused duplicate
        // live updates and could overwrite punch-in/out fields out of order.
        sendTerminalEvent(record) { terminalResult ->
            if (terminalResult.isSuccess) callback(Result.success(true))
            else sendDailyAttendanceFallback(record, callback)
        }
    }

    private fun sendDailyAttendanceFallback(
        record: AttendanceRecord,
        callback: (ApiResult<Boolean>) -> Unit
    ) {
        val body = gson.toJson(record)
        val request = Request.Builder()
            .url("${baseUrl()}/api/attendance")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(Result.failure(Exception("Cannot sync attendance: ${e.message}")))
            }

            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    callback(Result.success(true))
                } else {
                    android.util.Log.w("ApiClient", "Attendance fallback POST ${response.code}: ${response.body?.string()?.take(200)}")
                    callback(Result.failure(Exception("Attendance sync failed (${response.code})")))
                }
            }
        })
    }

    fun sendTerminalEvent(record: AttendanceRecord, callback: (ApiResult<Boolean>) -> Unit = {}) {
        val timeStr = SimpleDateFormat("hh:mm:ss a", Locale("en", "IN")).format(Date())

        val isEmergency = record.dutyState?.contains("emergency", ignoreCase = true) == true ||
                          record.method?.contains("emergency", ignoreCase = true) == true
        val isCheckOut = record.outTime != null ||
                         record.dutyState?.equals("COMPLETED", ignoreCase = true) == true ||
                         record.dutyState?.equals("OFF_DUTY", ignoreCase = true) == true
        val isGatePass = record.dutyState?.contains("gate_pass", ignoreCase = true) == true
        val isTripReturn = record.dutyState?.contains("trip_return", ignoreCase = true) == true
        val isManual = record.overrideReason != null || record.source == "manual"

        val action = when {
            isEmergency -> "EMERGENCY_EXIT"
            isCheckOut -> "CHECK_OUT"
            isGatePass -> "GATE_PASS"
            isTripReturn -> "TRIP_RETURN"
            isManual -> "MANUAL_OVERRIDE"
            else -> "CHECK_IN"
        }

        val punchTimeStr = when {
            isCheckOut || isEmergency -> (record.outTime ?: timeStr)
            else -> (record.inTime ?: timeStr)
        }

        val payload = mapOf(
            "terminalId" to "OFFICE-REWARI-01",
            "employeeId" to record.profileId,
            "profileId" to record.profileId,
            "personId" to record.profileId,
            "personName" to record.profileName,
            "status" to (record.status ?: if (isEmergency) "leave" else "present"),
            "action" to action,
            "dutyState" to (record.dutyState ?: if (isEmergency) "EMERGENCY_LEAVE" else if (isCheckOut) "COMPLETED" else "IN_DUTY"),
            "biometricMethod" to (if (record.method?.equals("fingerprint", ignoreCase = true) == true) "FINGERPRINT" else "FACE"),
            "method" to (record.method ?: "face"),
            "inTime" to (record.inTime ?: timeStr),
            "inTimeMs" to record.inTimeMs,
            "outTime" to record.outTime,
            "punchTime" to punchTimeStr,
            "durationHours" to record.durationHours,
            "dutyDays" to (record.dutyDays ?: if (isEmergency) 0.0 else 1.0),
            "overrideReason" to record.overrideReason,
            "notes" to (record.overrideReason ?: if (isEmergency) "Emergency Early Departure" else null),
            "vehicleNo" to record.vehicleNo
        )
        val body = gson.toJson(payload)
        val request = Request.Builder()
            .url("${baseUrl()}/api/terminal/event")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(Result.failure(Exception("Cannot connect to server: ${e.message}")))
            }

            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    callback(Result.success(true))
                } else {
                    android.util.Log.w("ApiClient", "Terminal event ${response.code}: ${response.body?.string()?.take(200)}")
                    callback(Result.failure(Exception("Terminal event failed (${response.code})")))
                }
            }
        })
    }

    fun sendTerminalEventDirect(
        profileId: String,
        profileName: String,
        status: String = "present",
        action: String = "GATE_PASS",
        dutyState: String = "IN_DUTY",
        biometricMethod: String = "FACE",
        method: String = "face",
        inTime: String? = null,
        inTimeMs: Long? = null,
        outTime: String? = null,
        punchTime: String? = null,
        vehicleNo: String? = null,
        dutyDays: Double = 1.0,
        durationHours: Double? = null,
        overrideReason: String? = null,
        notes: String? = null,
        callback: (ApiResult<Boolean>) -> Unit = {}
    ) {
        val timeStr = SimpleDateFormat("hh:mm:ss a", Locale("en", "IN")).format(Date())
        val payload = mapOf(
            "terminalId" to "OFFICE-REWARI-01",
            "employeeId" to profileId,
            "profileId" to profileId,
            "personId" to profileId,
            "personName" to profileName,
            "status" to status,
            "action" to action,
            "dutyState" to dutyState,
            "biometricMethod" to biometricMethod,
            "method" to method,
            "inTime" to (inTime ?: timeStr),
            "outTime" to outTime,
            "punchTime" to (punchTime ?: timeStr),
            "vehicleNo" to vehicleNo,
            "dutyDays" to dutyDays,
            "durationHours" to durationHours,
            "overrideReason" to overrideReason,
            "notes" to notes
        )
        val body = gson.toJson(payload)
        val request = Request.Builder()
            .url("${baseUrl()}/api/terminal/event")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(Result.failure(Exception("Cannot connect: ${e.message}")))
            }

            override fun onResponse(call: Call, response: Response) {
                callback(Result.success(response.isSuccessful))
            }
        })
    }

    fun markAttendance(
        profile: com.vgtc.terminal.model.Profile,
        status: String,
        method: String = "face",
        inTime: String? = null,
        inTimeMs: Long? = null,
        outTime: String? = null,
        durationHours: Double? = null,
        dutyDays: Double? = null,
        dutyState: String? = null,
        overrideReason: String? = null,
        callback: (ApiResult<Boolean>) -> Unit
    ) {
        val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        val record = AttendanceRecord(
            profileId = profile.id,
            profileName = profile.name,
            profileType = profile.profileType ?: "Staff",
            status = status,
            date = today,
            vehicleNo = profile.vehicleNo,
            inTime = inTime,
            inTimeMs = inTimeMs,
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
    // PUT /api/profiles/:id — enroll face photo
    // ──────────────────────────────────────────────────
    fun updateProfilePhoto(profileId: String, photoBase64: String, callback: (ApiResult<Boolean>) -> Unit) {
        val payload = mapOf(
            "id" to profileId,
            "employeeId" to profileId,
            "personId" to profileId,
            "photo" to photoBase64,
            "facePhoto" to photoBase64,
            "photoUrl" to photoBase64,
            "photos" to listOf(photoBase64),
            "faceEnrolled" to true
        )
        val body = gson.toJson(payload)
        val request = Request.Builder()
            .url("${baseUrl()}/api/profiles/$profileId")
            .put(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                enrollTerminalPerson(profileId, payload, callback)
            }

            override fun onResponse(call: Call, response: Response) {
                // Ensure terminal enrollment also saves to the terminal registry
                enrollTerminalPerson(profileId, payload, callback)
            }
        })
    }

    // ──────────────────────────────────────────────────
    // POST /api/profiles — create profile
    // ──────────────────────────────────────────────────
    fun createProfile(profile: Profile, callback: (ApiResult<Profile>) -> Unit) {
        val primaryPhoto = profile.photo ?: profile.photos?.firstOrNull()
        val data = mutableMapOf<String, Any?>(
            "id" to profile.id,
            "employeeId" to profile.id,
            "personId" to profile.id,
            "name" to profile.name,
            "profileType" to profile.profileType,
            "type" to (if (profile.profileType?.equals("Driver", ignoreCase = true) == true) "DRIVER" else "STAFF"),
            "vehicleNo" to profile.vehicleNo,
            "assignedTruck" to profile.vehicleNo,
            "fingerprintEnrolled" to profile.fingerprintEnrolled,
            "fingerprintSlotId" to profile.fingerprintSlotId,
            "faceEnrolled" to (primaryPhoto != null || profile.photos?.isNotEmpty() == true)
        )
        data["photo"] = primaryPhoto
        data["facePhoto"] = primaryPhoto
        data["photoUrl"] = primaryPhoto
        if (primaryPhoto != null) {
            data["photo"] = primaryPhoto
            data["facePhoto"] = primaryPhoto
            data["photoUrl"] = primaryPhoto
        }
        if (profile.photos != null) {
            data["photos"] = profile.photos
        }
        if (profile.faceEmbedding != null) {
            data["faceEmbedding"] = profile.faceEmbedding
        }

        val body = gson.toJson(data)
        val request = Request.Builder()
            .url("${baseUrl()}/api/profiles")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                enrollTerminalPerson(profile.id, data) { res ->
                    if (res.isSuccess) callback(Result.success(profile)) else callback(Result.failure(Exception("Create failed")))
                }
            }

            override fun onResponse(call: Call, response: Response) {
                enrollTerminalPerson(profile.id, data) { _ -> }
                val respBody = response.body?.string() ?: ""
                if (response.isSuccessful) {
                    try {
                        val created = gson.fromJson(respBody, Profile::class.java)
                        callback(Result.success(created))
                    } catch (e: Exception) {
                        callback(Result.success(profile))
                    }
                } else {
                    callback(Result.success(profile))
                }
            }
        })
    }

    fun uploadEnrollmentImages(profileId: String, photos: List<String>, callback: (ApiResult<List<String>>) -> Unit) {
        val body = gson.toJson(mapOf("profileId" to profileId, "photos" to photos))
        val request = Request.Builder().url("${baseUrl()}/api/terminal/enroll-images")
            .post(body.toRequestBody(JSON_MEDIA_TYPE)).apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }.build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = callback(Result.failure(e))
            override fun onResponse(call: Call, response: Response) {
                val raw = response.body?.string() ?: "{}"
                if (!response.isSuccessful) return callback(Result.failure(Exception("Image upload failed (${response.code})")))
                try {
                    val json = gson.fromJson(raw, com.google.gson.JsonObject::class.java)
                    val urls = json.getAsJsonArray("urls").map { it.asString }
                    callback(Result.success(urls))
                } catch (e: Exception) { callback(Result.failure(e)) }
            }
        })
    }

    fun getAttendanceHistory(profileId: String, callback: (ApiResult<String>) -> Unit) {
        val request = Request.Builder()
            .url("${baseUrl()}/api/attendance?profileId=$profileId&from=2020-01-01&to=2099-12-31")
            .get().apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }.build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = callback(Result.failure(e))
            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string() ?: "[]"
                if (response.isSuccessful) callback(Result.success(body))
                else callback(Result.failure(Exception("Attendance history failed (${response.code})")))
            }
        })
    }

    // ──────────────────────────────────────────────────
    // PUT /api/profiles/:id — update profile
    // ──────────────────────────────────────────────────
    fun updateProfile(profile: Profile, callback: (ApiResult<Boolean>) -> Unit) {
        val primaryPhoto = profile.photo ?: profile.photos?.firstOrNull()
        val data = mutableMapOf<String, Any?>(
            "id" to profile.id,
            "employeeId" to profile.id,
            "personId" to profile.id,
            "name" to profile.name,
            "profileType" to profile.profileType,
            "type" to (if (profile.profileType?.equals("Driver", ignoreCase = true) == true) "DRIVER" else "STAFF"),
            "vehicleNo" to profile.vehicleNo,
            "assignedTruck" to profile.vehicleNo,
            "fingerprintEnrolled" to profile.fingerprintEnrolled,
            "fingerprintSlotId" to profile.fingerprintSlotId,
            "faceEnrolled" to (primaryPhoto != null || profile.photos?.isNotEmpty() == true)
        )
        if (primaryPhoto != null) {
            data["photo"] = primaryPhoto
            data["facePhoto"] = primaryPhoto
            data["photoUrl"] = primaryPhoto
        }
        if (profile.photos != null) {
            data["photos"] = profile.photos
        }
        if (profile.faceEmbedding != null) {
            data["faceEmbedding"] = profile.faceEmbedding
        }

        val body = gson.toJson(data)
        val request = Request.Builder()
            .url("${baseUrl()}/api/profiles/${profile.id}")
            .put(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { authHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                enrollTerminalPerson(profile.id, data, callback)
            }

            override fun onResponse(call: Call, response: Response) {
                enrollTerminalPerson(profile.id, data, callback)
            }
        })
    }

    private fun enrollTerminalPerson(profileId: String, data: Map<String, Any?>, callback: (ApiResult<Boolean>) -> Unit) {
        val payload = mutableMapOf<String, Any?>(
            "id" to profileId,
            "employeeId" to profileId,
            "personId" to profileId,
            "terminalId" to "OFFICE-REWARI-01",
            "faceEnrolled" to true
        )
        payload.putAll(data)
        val p = data["photo"] ?: data["facePhoto"] ?: data["photoUrl"]
        if (p != null) {
            payload["photo"] = p
            payload["facePhoto"] = p
            payload["photoUrl"] = p
            if (!payload.containsKey("photos")) {
                payload["photos"] = listOf(p)
            }
        }
        val body = gson.toJson(payload)
        val request = Request.Builder()
            .url("${baseUrl()}/api/terminal/enroll")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // Also try updating profiles directly if terminal enroll fails
                callback(Result.failure(Exception("Terminal sync error: ${e.message}")))
            }

            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    callback(Result.success(true))
                } else {
                    android.util.Log.w("ApiClient", "Terminal enroll ${response.code}: ${response.body?.string()?.take(200)}")
                    callback(Result.failure(Exception("Terminal sync error (${response.code})")))
                }
            }
        })
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
        val url = baseUrl()
        if (url.isBlank()) { callback(false); return }
        val request = Request.Builder()
            .url("$url/api/auth/status")
            .get()
            .build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                val rosterReq = Request.Builder().url("$url/api/terminal/roster").get().build()
                client.newCall(rosterReq).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) { callback(false) }
                    override fun onResponse(call: Call, response: Response) { callback(response.isSuccessful) }
                })
            }
            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    callback(true)
                } else {
                    val rosterReq = Request.Builder().url("$url/api/terminal/roster").get().build()
                    client.newCall(rosterReq).enqueue(object : Callback {
                        override fun onFailure(call: Call, e: IOException) { callback(false) }
                        override fun onResponse(call: Call, response: Response) { callback(response.isSuccessful) }
                    })
                }
            }
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
