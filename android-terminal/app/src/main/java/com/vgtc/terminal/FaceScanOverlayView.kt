package com.vgtc.terminal

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat

/**
 * Simple oval face guide overlay for the camera scan screen.
 * Draws a transparent oval in the center of the view.
 * When a face is detected, the oval border changes color to green.
 */
class FaceScanOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private var isDetected = false

    private val backgroundPaint = Paint().apply {
        color = 0xCC000000.toInt()
        style = Paint.Style.FILL
    }

    private val ovalBorderPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 6f
        isAntiAlias = true
    }

    private val cornerPaint = Paint().apply {
        style = Paint.Style.STROKE
        strokeWidth = 8f
        strokeCap = Paint.Cap.ROUND
        isAntiAlias = true
    }

    private val ovalRect = RectF()

    init {
        setWillNotDraw(false)
    }

    fun setDetected(detected: Boolean) {
        isDetected = detected
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()

        // Oval dimensions — center of screen, slightly taller than wide
        val ovalW = w * 0.65f
        val ovalH = ovalW * 1.35f
        val left = (w - ovalW) / 2f
        val top = (h - ovalH) / 2f

        ovalRect.set(left, top, left + ovalW, top + ovalH)

        // Darken everything outside the oval
        val overlayPath = android.graphics.Path()
        overlayPath.addRect(0f, 0f, w, h, android.graphics.Path.Direction.CW)
        overlayPath.addOval(ovalRect, android.graphics.Path.Direction.CCW)
        canvas.drawPath(overlayPath, backgroundPaint)

        // Oval border
        val borderColor = if (isDetected) {
            ContextCompat.getColor(context, R.color.green_online)
        } else {
            0xFFFFFFFF.toInt()
        }
        ovalBorderPaint.color = borderColor
        canvas.drawOval(ovalRect, ovalBorderPaint)

        // Corner accent marks (top-left, top-right, bottom-left, bottom-right)
        cornerPaint.color = borderColor
        val cornerLen = ovalW * 0.12f
        val cx = ovalRect.centerX()
        val cy = ovalRect.centerY()

        // Top
        canvas.drawLine(cx - cornerLen, ovalRect.top, cx + cornerLen, ovalRect.top, cornerPaint)
        // Bottom
        canvas.drawLine(cx - cornerLen, ovalRect.bottom, cx + cornerLen, ovalRect.bottom, cornerPaint)
        // Left
        canvas.drawLine(ovalRect.left, cy - cornerLen, ovalRect.left, cy + cornerLen, cornerPaint)
        // Right
        canvas.drawLine(ovalRect.right, cy - cornerLen, ovalRect.right, cy + cornerLen, cornerPaint)
    }
}
