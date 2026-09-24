package com.vgtc.terminal

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

class TerminalAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        // Device Admin enabled - we can now use lock task mode
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
    }
}
