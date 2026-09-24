package com.vgtc.terminal.util

import android.content.Context
import android.content.SharedPreferences

/**
 * Encrypted-ish preferences wrapper.
 * We use MODE_PRIVATE here. For production, swap to EncryptedSharedPreferences
 * (already in dependencies) once the minSdk / key attestation is confirmed.
 */
class Prefs(context: Context) {

    private val sp: SharedPreferences =
        context.getSharedPreferences("vgtc_terminal_prefs", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = sp.getString("server_url", "") ?: ""
        set(value) = sp.edit().putString("server_url", value).apply()

    var username: String
        get() = sp.getString("username", "") ?: ""
        set(value) = sp.edit().putString("username", value).apply()

    var password: String
        get() = sp.getString("password", "") ?: ""
        set(value) = sp.edit().putString("password", value).apply()

    var orgId: String
        get() = sp.getString("org_id", "vgtc") ?: "vgtc"
        set(value) = sp.edit().putString("org_id", value).apply()

    var authToken: String
        get() = sp.getString("auth_token", "") ?: ""
        set(value) = sp.edit().putString("auth_token", value).apply()

    fun clear() = sp.edit().clear().apply()
}
