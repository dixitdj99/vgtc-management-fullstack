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
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

typealias ApiResult<T> = Result<T>

class ApiClient(context: Context) {

    private val prefs = Prefs(context)
    val terminalId: String = "ANDROID-" + android.provider.Settings.Secure.getString(context.contentResolver, android.provider.Settings.Secure.ANDROID_ID)
    private val gson = Gson()

    private val client = OkHttpClient.Builder()
        .connectTimeout(25, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(25, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

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
        val token = prefs.terminalApiKey.ifBlank { prefs.authToken.ifBlank { "VGTC-TERMINAL-TOKEN-KEY" } }
        return mapOf(
            "Authorization" to "Bearer $token",
            "X-Org-Id" to prefs.orgId.ifBlank { "vgtc" }
        )
    }

    private fun authHeaders(): Map<String, String> {
        val token = prefs.authToken.ifBlank { prefs.terminalApiKey.ifBlank { "VGTC-TERMINAL-TOKEN-KEY" } }
        return mapOf(
            "Authorization" to "Bearer $token",
            "X-Org-Id" to prefs.orgId.ifBlank { "vgtc" }
        )
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
    fun getProfiles(callback: (ApiResult<List<Profile>>) -> Unit) = fetchRoster(callback)

    private fun parseProfilesJson(body: String): List<Profile> {
        val trimmed = body.trim()
        val list: List<Profile> = if (trimmed.startsWith("[")) {
            val type = object : TypeToken<List<Profile>>() {}.type
            gson.fromJson(trimmed, type) ?: emptyList()
        } else {
            val map = gson.fromJson(trimmed, Map::class.java) ?: emptyMap<String, Any>()
            val staffList = map["staff"] as? List<*> ?: map["roster"] as? List<*> ?: emptyList<Any>()
            val driversList = map["drivers"] as? List<*> ?: emptyList<Any>()
            val combinedJson = gson.toJson(staffList + driversList)
            val type = object : TypeToken<List<Profile>>() {}.type
            gson.fromJson(combinedJson, type) ?: emptyList()
        }
        return list.distinctBy { it.id }.filter { profile ->
            val type = (profile.profileType ?: "").lowercase(Locale.US)
            val name = profile.name.trim().lowercase(Locale.US)
            !type.contains("pump") &&
            !name.contains("filling station") &&
            !name.contains("service station") &&
            !name.contains("ksk") &&
            profile.name.isNotBlank()
        }
    }

    private fun fetchRoster(callback: (ApiResult<List<Profile>>) -> Unit) {
        val request = Request.Builder()
            .url("${baseUrl()}/api/profiles")
            .apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                fallbackTerminalRoster(callback, e.message)
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string() ?: "[]"
                if (response.isSuccessful) {
                    try {
                        val parsed = parseProfilesJson(body)
                        callback(Result.success(parsed))
                    } catch (e: Exception) {
                        fallbackTerminalRoster(callback, "Parse error: ${e.message}")
                    }
                } else {
                    fallbackTerminalRoster(callback, "Profiles returned ${response.code}")
                }
            }
        })
    }

    private fun fallbackTerminalRoster(callback: (ApiResult<List<Profile>>) -> Unit, errorDetail: String?) {
        val request = Request.Builder()
            .url("${baseUrl()}/api/terminal/roster?terminalId=$terminalId")
            .apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(Result.failure(Exception(errorDetail ?: "Cannot connect to server: ${e.message}")))
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string() ?: "{}"
                if (response.isSuccessful) {
                    try {
                        val parsed = parseProfilesJson(body)
                        callback(Result.success(parsed))
                    } catch (e: Exception) {
                        callback(Result.failure(e))
                    }
                } else {
                    callback(Result.failure(Exception(errorDetail ?: "Server error (${response.code})")))
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
        sendTerminalEvent(record, callback)
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
                    response.close()
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
            "terminalId" to terminalId,
            "employeeId" to record.profileId,
            "profileId" to record.profileId,
            "personId" to record.profileId,
            "personName" to record.profileName,
            "status" to (record.status ?: if (isEmergency) "leave" else "present"),
            "action" to action,
            "dutyState" to (record.dutyState ?: if (isEmergency) "EMERGENCY_LEAVE" else if (isCheckOut) "COMPLETED" else "IN_DUTY"),
            "fingerprintSlotId" to record.fingerprintSlotId,
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
                // Seamlessly fallback to /api/attendance
                sendDailyAttendanceFallback(record, callback)
            }

            override fun onResponse(call: Call, response: Response) {
                if (response.code == 404) {
                    // /api/terminal/event not mounted; use standard /api/attendance
                    response.close()
                    sendDailyAttendanceFallback(record, callback)
                } else {
                    parseEventResponse(response, callback = callback)
                }
            }
        })
    }

    private fun parseEventResponse(response: Response, blockedOnly: Boolean = false, callback: (ApiResult<Boolean>) -> Unit) {
        response.use {
            val raw = it.body?.string().orEmpty()
            val json = runCatching { gson.fromJson(raw, com.google.gson.JsonObject::class.java) }.getOrNull()
            if (it.isSuccessful && (json?.get("status")?.asString == "SUCCESS" || (blockedOnly && json?.get("status")?.asString == "ATTENDANCE_STOPPED"))) {
                callback(Result.success(true))
            } else {
                val message = json?.get("message")?.takeUnless { value -> value.isJsonNull }?.asString
                    ?: json?.get("error")?.takeUnless { value -> value.isJsonNull }?.asString
                    ?: "Attendance not confirmed (${it.code}). Please retry."
                callback(Result.failure(Exception(message)))
            }
        }
    }

    fun reportStoppedAttempt(
        profileId: String,
        profileName: String,
        biometricMethod: String = "FACE",
        fingerprintSlotId: Int? = null,
        callback: (ApiResult<Boolean>) -> Unit = {}
    ) {
        val payload = mapOf(
            "terminalId" to terminalId,
            "employeeId" to profileId,
            "profileId" to profileId,
            "personName" to profileName,
            "action" to "BLOCKED_ATTEMPT",
            "biometricMethod" to biometricMethod.uppercase(Locale.US),
            "method" to biometricMethod.lowercase(Locale.US),
            "fingerprintSlotId" to fingerprintSlotId
        )
        val body = gson.toJson(payload)
        val request = Request.Builder()
            .url("${baseUrl()}/api/terminal/event")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }
            .build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                callback(Result.failure(e))
            }
            override fun onResponse(call: Call, response: Response) {
                parseEventResponse(response, blockedOnly = true, callback = callback)
            }
        })
    }

    /** Send credentials only to this configured portal origin, never arbitrary photo URLs. */
    fun photoModel(photo: String?): Any? {
        if (photo.isNullOrBlank()) return null
        if (photo.startsWith("data:")) return photo
        val base = baseUrl().toHttpUrlOrNull() ?: return null
        val url = base.resolve(photo) ?: return null
        return if (url.host == base.host && url.scheme == base.scheme && url.port == base.port) {
            com.bumptech.glide.load.model.GlideUrl(url.toString(), com.bumptech.glide.load.model.LazyHeaders.Builder()
                .addHeader("Authorization", "Bearer ${prefs.terminalApiKey.ifBlank { prefs.authToken }}")
                .addHeader("X-Org-Id", prefs.orgId.ifBlank { "vgtc" }).build())
        } else url.toString()
    }

    fun reportDutyContinuesScan(
        profileId: String,
        profileName: String,
        method: String = "face",
        callback: (ApiResult<Boolean>) -> Unit = {}
    ) {
        val bioMethod = if (method.equals("fingerprint", ignoreCase = true)) "FINGERPRINT" else "FACE"
        sendTerminalEventDirect(
            profileId = profileId,
            profileName = profileName,
            status = "duty_continues",
            action = "DUTY_CONTINUES",
            dutyState = "IN_DUTY",
            biometricMethod = bioMethod,
            method = method,
            notes = "Duty continues — scanned $method again",
            callback = callback
        )
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
        fingerprintSlotId: Int? = null,
        callback: (ApiResult<Boolean>) -> Unit = {}
    ) {
        val timeStr = SimpleDateFormat("hh:mm:ss a", Locale("en", "IN")).format(Date())
        val payload = mapOf(
            "terminalId" to terminalId,
            "employeeId" to profileId,
            "profileId" to profileId,
            "personId" to profileId,
            "personName" to profileName,
            "status" to status,
            "action" to action,
            "dutyState" to dutyState,
            "biometricMethod" to biometricMethod,
            "fingerprintSlotId" to fingerprintSlotId,
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
                parseEventResponse(response, blockedOnly = action == "BLOCKED_ATTEMPT", callback = callback)
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
            terminalId = terminalId,
            fingerprintSlotId = if (method == "fingerprint") profile.fingerprintSlotId else null
        )
        markAttendance(record, callback)
    }

    // ──────────────────────────────────────────────────
    // PUT /api/profiles/:id — enroll face photo
    // ──────────────────────────────────────────────────
    // PUT /api/profiles/:id — enroll face photo
    // ──────────────────────────────────────────────────
    fun uploadEnrollmentImages(profileId: String, photos: List<String>, callback: (ApiResult<List<String>>) -> Unit) {
        val body = gson.toJson(mapOf("profileId" to profileId, "photos" to photos))
        val request = Request.Builder().url("${baseUrl()}/api/terminal/enroll-images")
            .post(body.toRequestBody(JSON_MEDIA_TYPE)).apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }.build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // If endpoint unreachable, photos are base64 data URIs which can be saved directly on profile
                callback(Result.success(photos))
            }
            override fun onResponse(call: Call, response: Response) {
                val raw = response.body?.string() ?: "{}"
                if (response.isSuccessful) {
                    try {
                        val json = gson.fromJson(raw, com.google.gson.JsonObject::class.java)
                        val urls = json.getAsJsonArray("urls").map { it.asString }
                        callback(Result.success(urls))
                    } catch (e: Exception) {
                        callback(Result.success(photos))
                    }
                } else {
                    // If /api/terminal/enroll-images returns 404 or non-200, return base64 photos directly
                    callback(Result.success(photos))
                }
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

    fun deleteFaceBiometrics(profileId: String, callback: (ApiResult<Boolean>) -> Unit) {
        val payload = mapOf("id" to profileId, "biometricType" to "face")
        val body = gson.toJson(payload)
        val request = Request.Builder()
            .url("${baseUrl()}/api/terminal/enroll/delete")
            .post(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }
            .build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = callback(Result.failure(e))
            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    response.close()
                    callback(Result.success(true))
                } else {
                    response.close()
                    callback(Result.failure(Exception("Delete face failed (${response.code})")))
                }
            }
        })
    }

    // ──────────────────────────────────────────────────
    // PUT /api/profiles/:id — update profile
    // ──────────────────────────────────────────────────
    fun updateProfile(profile: Profile, callback: (ApiResult<Boolean>) -> Unit) {
        val primaryPhoto = profile.photo ?: profile.photos?.firstOrNull()
        val hasFace = !primaryPhoto.isNullOrBlank() || !profile.photos.isNullOrEmpty()
        val payload = mutableMapOf<String, Any?>(
            "id" to profile.id,
            "employeeId" to profile.id,
            "fingerprintEnrolled" to profile.fingerprintEnrolled,
            "fingerprintSlotId" to profile.fingerprintSlotId,
            "attendanceEnabled" to (profile.attendanceEnabled ?: true),
            "faceEnrolled" to hasFace
        )
        if (hasFace) {
            payload["photo"] = primaryPhoto
            payload["facePhoto"] = primaryPhoto
            payload["photoUrl"] = primaryPhoto
            if (!profile.photos.isNullOrEmpty()) {
                payload["photos"] = profile.photos
            }
            if (!profile.faceEmbedding.isNullOrEmpty()) {
                payload["faceEmbedding"] = profile.faceEmbedding
            }
        } else {
            payload["clearFace"] = true
            payload["photo"] = null
            payload["facePhoto"] = null
            payload["photoUrl"] = null
            payload["photos"] = emptyList<String>()
            payload["faceEmbedding"] = null
        }

        val body = gson.toJson(payload)
        val request = Request.Builder()
            .url("${baseUrl()}/api/profiles/${profile.id}")
            .put(body.toRequestBody(JSON_MEDIA_TYPE))
            .apply { terminalHeaders().forEach { (k, v) -> header(k, v) } }
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                enrollTerminalPerson(profile.id, payload, callback)
            }

            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    response.close()
                    callback(Result.success(true))
                } else if (response.code == 404 || response.code == 403) {
                    enrollTerminalPerson(profile.id, payload, callback)
                } else {
                    response.close()
                    callback(Result.failure(Exception("Profile sync error (${response.code})")))
                }
            }
        })
    }

    private fun enrollTerminalPerson(profileId: String, data: Map<String, Any?>, callback: (ApiResult<Boolean>) -> Unit) {
        val payload = mutableMapOf<String, Any?>(
            "id" to profileId,
            "employeeId" to profileId,
            "personId" to profileId,
            "terminalId" to terminalId,
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
                callback(Result.failure(Exception("Terminal sync error: ${e.message}")))
            }

            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    response.close()
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
    // ──────────────────────────────────────────────────
    // GET /api/auth/status  — quick connectivity check
    // ──────────────────────────────────────────────────
    fun getDuty(profileId: String, callback: (ApiResult<com.vgtc.terminal.model.DutyRecord?>) -> Unit) {
        val url = baseUrl().toHttpUrlOrNull()?.newBuilder()?.addPathSegments("api/terminal/duty")?.addPathSegment(profileId)?.build()
        if (url == null) {
            val localDuty = prefs.getTodayDutyMap()[profileId]
            callback(Result.success(localDuty))
            return
        }
        val request = Request.Builder().url(url).get().apply { terminalHeaders().forEach { (k,v) -> header(k,v) } }.build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                val localDuty = prefs.getTodayDutyMap()[profileId]
                callback(Result.success(localDuty))
            }
            override fun onResponse(call: Call, response: Response) {
                response.use {
                    if (!it.isSuccessful) {
                        val localDuty = prefs.getTodayDutyMap()[profileId]
                        callback(Result.success(localDuty))
                        return
                    }
                    try {
                        val json = gson.fromJson(it.body?.string(), com.google.gson.JsonObject::class.java)
                        val activeDuty = if (json.has("activeDuty") && !json.get("activeDuty").isJsonNull) {
                            gson.fromJson(json.get("activeDuty"), com.vgtc.terminal.model.DutyRecord::class.java)
                        } else {
                            prefs.getTodayDutyMap()[profileId]
                        }
                        callback(Result.success(activeDuty))
                    } catch (error: Exception) {
                        val localDuty = prefs.getTodayDutyMap()[profileId]
                        callback(Result.success(localDuty))
                    }
                }
            }
        })
    }

    fun checkConnection(callback: (Boolean) -> Unit) {
        getProfiles { callback(it.isSuccess) }
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
