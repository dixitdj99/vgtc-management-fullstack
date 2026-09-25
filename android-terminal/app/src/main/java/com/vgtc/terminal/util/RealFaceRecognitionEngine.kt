package com.vgtc.terminal.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Rect
import android.util.Log
import com.vgtc.terminal.model.Profile
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.sqrt

/**
 * Production On-Device Real Face Recognition Engine.
 *
 * Uses MobileFaceNet TFLite model:
 * - Input: 112x112 RGB Bitmap
 * - Normalization: (Pixel - 128.0) / 128.0
 * - Output: 192-dimensional L2-normalized feature embedding vector
 * - Matching: Cosine Similarity with adaptive thresholding (> 0.72)
 */
class RealFaceRecognitionEngine private constructor(context: Context) {

    companion object {
        private const val TAG = "FaceNetEngine"
        private const val MODEL_FILENAME = "mobile_face_net.tflite"

        const val INPUT_SIZE = 112
        const val EMBEDDING_SIZE = 192

        // Similarity threshold: 0.55f is the standard for MobileFaceNet on uncalibrated mobile cameras
        const val MATCH_THRESHOLD = 0.55f

        private const val IMAGE_MEAN = 128.0f
        private const val IMAGE_STD = 128.0f

        @Volatile
        private var instance: RealFaceRecognitionEngine? = null

        fun getInstance(context: Context): RealFaceRecognitionEngine {
            return instance ?: synchronized(this) {
                instance ?: RealFaceRecognitionEngine(context.applicationContext).also { instance = it }
            }
        }
    }

    data class FaceMatchResult(
        val matched: Boolean,
        val profile: Profile? = null,
        val similarity: Float = 0f,
        val distance: Float = 999f
    )

    private var tfLite: Interpreter? = null

    init {
        try {
            val modelBuffer = loadModelFile(context, MODEL_FILENAME)
            val options = Interpreter.Options().apply {
                setNumThreads(4)
            }
            tfLite = Interpreter(modelBuffer, options)
            Log.i(TAG, "MobileFaceNet TFLite initialized successfully (112x112 -> 192 embedding)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load MobileFaceNet model: ${e.message}", e)
        }
    }

    private fun loadModelFile(context: Context, filename: String): MappedByteBuffer {
        val fileDescriptor = context.assets.openFd(filename)
        val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = fileDescriptor.startOffset
        val declaredLength = fileDescriptor.declaredLength
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }

    /**
     * Extracts a 192-dimensional face embedding from a cropped face bitmap.
     */
    fun extractEmbedding(faceBitmap: Bitmap): FloatArray? {
        val interpreter = tfLite ?: return null

        try {
            val resized = if (faceBitmap.width == INPUT_SIZE && faceBitmap.height == INPUT_SIZE) {
                faceBitmap
            } else {
                Bitmap.createScaledBitmap(faceBitmap, INPUT_SIZE, INPUT_SIZE, true)
            }

            // Allocate direct byte buffer: 1 * 112 * 112 * 3 * 4 bytes (float32)
            val imgData = ByteBuffer.allocateDirect(1 * INPUT_SIZE * INPUT_SIZE * 3 * 4)
            imgData.order(ByteOrder.nativeOrder())
            imgData.rewind()

            val intValues = IntArray(INPUT_SIZE * INPUT_SIZE)
            resized.getPixels(intValues, 0, INPUT_SIZE, 0, 0, INPUT_SIZE, INPUT_SIZE)

            for (pixel in intValues) {
                val r = (((pixel shr 16) and 0xFF) - IMAGE_MEAN) / IMAGE_STD
                val g = (((pixel shr 8) and 0xFF) - IMAGE_MEAN) / IMAGE_STD
                val b = ((pixel and 0xFF) - IMAGE_MEAN) / IMAGE_STD
                imgData.putFloat(r)
                imgData.putFloat(g)
                imgData.putFloat(b)
            }

            val output = Array(1) { FloatArray(EMBEDDING_SIZE) }
            interpreter.run(imgData, output)

            // L2 Normalize embedding
            val rawEmb = output[0]
            var norm = 0.0f
            for (v in rawEmb) {
                norm += v * v
            }
            norm = sqrt(norm)
            if (norm > 0) {
                for (i in rawEmb.indices) {
                    rawEmb[i] /= norm
                }
            }

            return rawEmb
        } catch (e: Exception) {
            Log.e(TAG, "Embedding extraction failed: ${e.message}", e)
            return null
        }
    }

    /**
     * Crop face from whole frame according to ML Kit bounding box.
     * Expands to a square with 20% margin to prevent distortion when scaled to 112x112.
     */
    fun cropFace(sourceBitmap: Bitmap, boundingBox: Rect): Bitmap? {
        return try {
            val width = boundingBox.width()
            val height = boundingBox.height()
            val cx = boundingBox.centerX()
            val cy = boundingBox.centerY()

            val maxSide = (Math.max(width, height) * 1.25f).toInt()
            val half = maxSide / 2

            var left = cx - half
            var top = cy - half
            var right = cx + half
            var bottom = cy + half

            if (left < 0) { right -= left; left = 0 }
            if (top < 0) { bottom -= top; top = 0 }
            if (right > sourceBitmap.width) { left -= (right - sourceBitmap.width); right = sourceBitmap.width }
            if (bottom > sourceBitmap.height) { top -= (bottom - sourceBitmap.height); bottom = sourceBitmap.height }

            val cropLeft = left.coerceAtLeast(0)
            val cropTop = top.coerceAtLeast(0)
            val cropWidth = (right - cropLeft).coerceAtMost(sourceBitmap.width - cropLeft)
            val cropHeight = (bottom - cropTop).coerceAtMost(sourceBitmap.height - cropTop)

            if (cropWidth <= 20 || cropHeight <= 20) return null
            Bitmap.createBitmap(sourceBitmap, cropLeft, cropTop, cropWidth, cropHeight)
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Extract embedding from an existing Base64 Data URI photo.
     */
    fun extractEmbeddingFromBase64(base64Data: String): List<Float>? {
        return try {
            val clean = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
            val bytes = android.util.Base64.decode(clean, android.util.Base64.DEFAULT)
            val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
            val emb = extractEmbedding(bitmap)
            emb?.toList()
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Compute Cosine Similarity between two 192-dim normalized vectors.
     * Returns 1.0 for identical faces, 0 for orthogonal, negative for opposite.
     */
    fun computeCosineSimilarity(emb1: FloatArray, emb2: FloatArray): Float {
        if (emb1.size != emb2.size) return 0f
        var dot = 0f
        for (i in emb1.indices) {
            dot += emb1[i] * emb2[i]
        }
        return dot
    }

    /**
     * Compare live embedding against all enrolled profiles in the database.
     */
    fun matchFace(
        liveEmbedding: FloatArray,
        enrolledProfiles: List<Profile>,
        threshold: Float = MATCH_THRESHOLD
    ): FaceMatchResult {
        var bestProfile: Profile? = null
        var maxSimilarity = -1f

        for (profile in enrolledProfiles) {
            val enrolledEmb = profile.faceEmbedding
            if (enrolledEmb != null && enrolledEmb.size == EMBEDDING_SIZE) {
                val sim = computeCosineSimilarity(liveEmbedding, enrolledEmb.toFloatArray())
                if (sim > maxSimilarity) {
                    maxSimilarity = sim
                    bestProfile = profile
                }
            }
        }

        // For a single profile terminal, threshold is slightly more lenient (0.50)
        val effectiveThreshold = if (enrolledProfiles.size == 1) 0.50f else threshold
        val isMatched = maxSimilarity >= effectiveThreshold && bestProfile != null

        return FaceMatchResult(
            matched = isMatched,
            profile = if (isMatched) bestProfile else null,
            similarity = maxSimilarity.coerceAtLeast(0f)
        )
    }
}
