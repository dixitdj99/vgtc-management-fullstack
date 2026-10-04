package com.vgtc.terminal

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

/**
 * Modern rounded corner viewfinder reticles matching the reference UI.
 */
class FaceScanOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFF8900.toInt()
        style = Paint.Style.STROKE
        strokeWidth = resources.displayMetrics.density * 4.5f
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    private val path = Path()

    fun setDetected(detected: Boolean) {
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val density = resources.displayMetrics.density
        val inset = 18f * density
        val length = 42f * density
        val radius = 24f * density

        val left = inset
        val top = inset
        val right = width - inset
        val bottom = height - inset

        if (right <= left || bottom <= top) return

        path.reset()

        // 1. Top-Left rounded bracket: ╭
        path.moveTo(left, top + length)
        path.lineTo(left, top + radius)
        path.arcTo(RectF(left, top, left + radius * 2, top + radius * 2), 180f, 90f, false)
        path.lineTo(left + length, top)

        // 2. Top-Right rounded bracket: ╮
        path.moveTo(right - length, top)
        path.lineTo(right - radius, top)
        path.arcTo(RectF(right - radius * 2, top, right, top + radius * 2), 270f, 90f, false)
        path.lineTo(right, top + length)

        // 3. Bottom-Left rounded bracket: ╰
        path.moveTo(left, bottom - length)
        path.lineTo(left, bottom - radius)
        path.arcTo(RectF(left, bottom - radius * 2, left + radius * 2, bottom), 180f, -90f, false)
        path.lineTo(left + length, bottom)

        // 4. Bottom-Right rounded bracket: ╯
        path.moveTo(right - length, bottom)
        path.lineTo(right - radius, bottom)
        path.arcTo(RectF(right - radius * 2, bottom - radius * 2, right, bottom), 90f, -90f, false)
        path.lineTo(right, bottom - length)

        canvas.drawPath(path, paint)
    }
}
