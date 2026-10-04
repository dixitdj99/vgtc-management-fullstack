# VGTC Smart Terminal — UI/UX Design System & Screen Specifications

> **Target Platform**: Android Kiosk & Wall-Mounted Smart Terminal (10.1", 8", and 7" Tablets)  
> **Orientation**: Primary Portrait (`1200 × 1920` / `800 × 1280`) with responsive Landscape support (`1920 × 1200`)  
> **Brand**: Vikas Goods Transport Co. (VGTC)  
> **Purpose**: Production UI/UX specification document optimized for Google Stitch, design generation, and Android Jetpack Compose / XML implementation.

---

## 1. Product Vision & Operational Context

The **VGTC Smart Terminal** is a ruggedized, zero-touch biometric attendance, driver verification, and yard security terminal installed at fleet gates, dispatch counters, and godown hubs (**Jharli, Kosli, Jhajjar, Bahadurgarh**).

### Core Design Philosophy
1. **Zero-Touch Kiosk**: Yard staff and truck drivers must be able to punch attendance from 1.5 to 2.5 meters away within **400ms** without touching the screen.
2. **Dusty & Industrial Ergonomics**: For manual interactions, buttons and touch targets use a **minimum of 56 × 56dp** to cater to gloved, dusty, or greased fingers.
3. **True Bilingual First (हिन्दी / English)**: Every critical instruction, status, and voice announcement is presented in paired English and Devanagari Hindi.
4. **Resilient Dark/HUD Aesthetics**: Deep OLED dark mode prevents screen burn-in on 24/7 displays, reduces heat, and makes the live biometric HUD feel state-of-the-art.

---

## 2. Brand Identity & Visual Assets

### 2.1 VGTC Official Logo
- **Symbol**: Heavy transport trailer truck silhouette in solid white with an integrated Highway Safety Orange **"T"** monogram branding on the trailer body.
- **Logotype**: "VIKAS GOODS TRANSPORT CO." in bold, clean geometric uppercase sans-serif.
- **Resource Reference**:
  - Main White Logo (Dark backgrounds / Kiosk HUD): `@drawable/vgtc_logo_white` (or `vgtc_logo.png`)
  - Dark Navy Logo (Light cards / receipts): `@drawable/vgtc_logo_dark`
  - Compact Favicon / Monogram: `@drawable/vgtc_favicon`
- **Header Placement**: Top-left on Kiosk HUD, height `44dp`, width auto (aspect ratio preserved).
- **Screensaver Placement**: Centered hero emblem, `140 × 140dp` with soft radial ambient glow (`rgba(249, 115, 22, 0.15)`).

---

## 3. Color System & Design Tokens

```
                                  VGTC TERMINAL PALETTE
┌───────────────────────┬───────────────────────┬───────────────────────┬───────────────────────┐
│     Brand Navy        │     Fleet Orange      │    Emerald Online     │    Crimson Alert      │
│       #0A1128         │       #FF6B00         │       #10B981         │       #EF4444         │
│     (Deep Void)       │     (Accent/Mark)     │    (Success Punch)    │     (Failed/Error)    │
└───────────────────────┴───────────────────────┴───────────────────────┴───────────────────────┘
```

### 3.1 Color Tokens

| Token Name | Hex Code | Purpose & Application |
|---|---|---|
| `--color-brand-void` | `#050811` | Pure OLED background for 24/7 camera view & AOD screensaver |
| `--color-brand-navy` | `#0A1128` | Primary brand deep navy for top bars, dialogs, and drawer menus |
| `--color-brand-surface` | `#111827` | Elevated card surfaces, glass modals, settings list items |
| `--color-brand-orange` | `#FF6B00` | Signature VGTC highway orange: focus rings, tabs, active state |
| `--color-orange-glow` | `rgba(255, 107, 0, 0.25)` | Laser scanning HUD line, biometric focus reticle pulse |
| `--color-emerald-success` | `#10B981` | Successful attendance punch, online status dot, verified badge |
| `--color-emerald-surface` | `#064E3B` | Success card chip background with `#10B981` text |
| `--color-crimson-error` | `#EF4444` | Face unrecognized, duplicate punch cooldown, offline failure |
| `--color-amber-warning` | `#F59E0B` | Half-day punch, unverified profile, sync queue pending |
| `--color-cyan-sensor` | `#06B6D4` | R307 optical fingerprint scanner connected & listening |
| `--color-glass-dark` | `rgba(10, 17, 40, 0.78)` | Top header & bottom HUD pill backdrop blur (`backdrop-filter: blur(24px)`) |
| `--color-glass-border` | `rgba(255, 255, 255, 0.12)`| 1dp border stroke on glassmorphic cards and buttons |
| `--color-text-primary` | `#F8FAFC` | 100% white-slate for high-contrast sunlight readability |
| `--color-text-secondary`| `#94A3B8` | Subtitles, timestamps, vehicle numbers |
| `--color-text-muted` | `#64748B` | Inactive icons, subtle hints |

### 3.2 Elevation, Radius & Blur
- **Corner Radii**:
  - Badges & Status Pills: `999dp` (Full capsule)
  - Interactive Action Buttons: `14dp`
  - Success Slide-Up Card: `28dp` top-left & top-right
  - Dialogs & Input Cards: `20dp`
- **Glassmorphism**: Android `RenderEffect.createBlurEffect(20f, 20f, Shader.TileMode.CLAMP)` with `1dp` white/12% border outline.

---

## 4. Typography System

| Role | Font Family | Size | Weight | Tracking / Letter Spacing |
|---|---|---|---|---|
| **Giant Odometer Clock** | `Outfit` / `Inter` | `72sp` | Bold (700) | `-0.02em` |
| **Hero Title / Name** | `Inter` | `24sp` | ExtraBold (800) | `0em` |
| **Devanagari Bilingual Sub** | `Noto Sans Devanagari` | `18sp` | SemiBold (600) | `+0.01em` |
| **Card Header / Section** | `Inter` | `16sp` | SemiBold (600) | `+0.01em` |
| **HUD Status / Button** | `Inter` | `14sp` | Bold (700) | `+0.03em` |
| **Badge / Caption** | `Inter` | `12sp` | Medium (500) | `+0.02em` |
| **Micro Ticker / Serial** | `JetBrains Mono` | `11sp` | Medium (500) | `+0.04em` |

---

## 5. Screen-by-Screen Component Specifications

---

### Screen 1: Ambient Always-On Display (AOD / Screensaver)
*Activates automatically after 15 seconds of inactivity to protect the screen, save power, and welcome staff.*

```
+--------------------------------------------------------------+
| [● Online]                  100% 🔋               📶 4G LTE  |
|                                                              |
|                                                              |
|                       [ 🚛 TRUCK LOGO ]                      |
|                  VIKAS GOODS TRANSPORT CO.                   |
|                                                              |
|                         10:45 AM                             |
|              शुक्रवार, 2 अक्टूबर 2026 • 02 Oct 2026             |
|                                                              |
|           ┌────────────────────────────────────────┐         |
|           │  📍 झारली मुख्य गोदाम • Jharli Godown   │         |
|           │       38 Present  •  4 On Trip         │         |
|           └────────────────────────────────────────┘         |
|                                                              |
|                                                              |
|                    (( ◉ LOOK OR TOUCH ◉ ))                   |
|              स्क्रीन छुएं या कैमरे की तरफ देखें               |
|            Touch screen or look at camera to punch           |
+--------------------------------------------------------------+
```

#### UI Components & Specifications:
1. **Background**: Pure `#000000` with an animated subtle radial pulse around the logo.
2. **Top Telemetry Bar**: Discrete battery indicator, signal strength, and live server status pill.
3. **Hero Emblem**: `140 × 140dp` white VGTC truck logo with orange "T" emblem.
4. **Odometer Digital Clock**: `72sp` bold clock in `#FFFFFF`, smoothly ticking without seconds to minimize distraction.
5. **Bilingual Date**: Paired Hindi & English formatted date (`16sp`, `#94A3B8`).
6. **Yard Status Capsule**: Frosted dark glass container (`rgba(255,255,255,0.06)`) showing active yard name and today's headcount summary.
7. **Wake-up Radar Prompt**: Animated breathing ripple icon with bilingual prompt: *"स्क्रीन छुएं या कैमरे की तरफ देखें / Touch screen or look at camera"*.
8. **Interaction**: Any tap on the screen or detected face via CameraX background analysis instantly transitions to **Screen 2** with a 200ms crossfade.

---

### Screen 2: Kiosk Attendance Hub (Live Biometric Scanner)
*The primary operational screen. Edge-to-edge camera viewport with futuristic AR/HUD overlay.*

```
+--------------------------------------------------------------+
| [🚛 VGTC] JHARLI HUB   ● Online | 🔌 R307 Ready  [🌐 HI][✏️][🔒]|
+--------------------------------------------------------------+
|                                                              |
|                         ┌───     ───┐                        |
|                         │           │                        |
|                         │   ( O )   │ <--- Face Target Area  |
|                         │           │      Laser Scan Line   |
|                         └───     ───┘                        |
|                                                              |
|                                                              |
|            ┌──────────────────────────────────────┐          |
|            │  🔍 चेहरे को फ्रेम में रखें • Align Face │          |
|            └──────────────────────────────────────┘          |
|                                                              |
| ┌──────────────────────────────────────────────────────────┐ |
| │ Recent: रामसिंह (ड्राइवर - 10:42 AM) • कुलदीप (स्टाफ - 10:40 AM) │ |
+─┴──────────────────────────────────────────────────────────┴─+
```

#### UI Components & Specifications:
1. **Camera Canvas**: Full-screen edge-to-edge `PreviewView` utilizing the front-facing (or ultra-wide kiosk) camera, calibrated for fast low-light exposure.
2. **Top Floating Glass Bar** (`64dp` height, `16dp` margin):
   - **Left**: VGTC White Truck Logo (`76 × 44dp`) + Yard Location Badge (`#FF6B00` tag: `JHARLI GODOWN`).
   - **Center Hardware HUD**:
     - Live Cloud Status: `● Online` in `#10B981` (pulsing dot) or `▲ Offline (Queued: 3)` in `#F59E0B`.
     - Optical Sensor Pill: `🔌 R307 Optical Sensor Ready` with cyan indicator.
   - **Right Quick Actions**:
     - Language Switcher: `🌐 HI / EN` toggle capsule (`#1E293B`, stroke `1dp #475569`).
     - Manual Attendance Override Button: Circular `44 × 44dp` frosted button with edit pencil icon (`#FFFFFF`).
     - Admin Security Lock: Circular `44 × 44dp` lock icon; opens the 6-digit PIN keypad.
3. **Biometric Face Tracking Reticle**:
   - Square bounding brackets with rounded corners (`stroke 3dp #FF6B00`).
   - Horizontal neon laser scan bar traveling up and down with subtle orange glow (`#FF6B00`).
   - Dynamic states:
     - *Searching*: Soft white brackets (`#FFFFFF`).
     - *Face Locked*: Vibrant orange brackets (`#FF6B00`) with tracking box following face coordinates.
     - *Verified*: Glows bright emerald (`#10B981`) with instant success sound.
4. **Instruction HUD Pill**: Floating frosted capsule (`background: rgba(15,23,42,0.85)`):
   - *"चेहरे को फ्रेम में रखें या फिंगरप्रिंट लगाएं"*
   - *"Align face inside frame or touch fingerprint sensor"*
5. **Bottom Live Activity Ticker**: Compact scrolling bar showing the last 3 punches with employee photo thumbnails, names, and timestamps.

---

### Screen 3: Attendance Marked Slide-Up Bottom Sheet (Success Verification)
*Slides up smoothly from the bottom upon biometric verification. Stays visible for 3.5 seconds, then dismisses.*

```
+--------------------------------------------------------------+
|                                                              |
|                      [CAMERA PREVIEW BLUR]                   |
|                                                              |
|    +----------------------------------------------------+    |
|    |                      ════                          |    |
|    |              ┌──────────────────┐                  |    |
|    |              │  (✓) VERIFIED    │                  |    |
|    |              └──────────────────┘                  |    |
|    |                     [PHOTO]                        |    |
|    |                   RAMESH KUMAR                     |    |
|    |                 रमेश कुमार (स्टाफ)                  |    |
|    |                                                    |    |
|    |         ┌────────────────────────────────┐         |    |
|    |         │  ✓ IN PUNCH  •  10:45:12 AM     │         |    |
|    |         └────────────────────────────────┘         |    |
|    |                                                    |    |
|    |           Shift Duration: 8h 30m • Present         |    |
|    |             Method: Face Recognition (98%)         |    |
|    |                                                    |    |
|    |             🔊 "नमस्ते रमेश जी, हाजिरी लग गई"         |    |
|    |                                                    |    |
|    |           [████████████████░░░] 3s Auto Close      |    |
|    +----------------------------------------------------+    |
+--------------------------------------------------------------+
```

#### UI Components & Specifications:
1. **Container**: Floating card (`28dp` top corner radius), background: `#FFFFFF` (Light mode) or `#0F172A` (Glass Dark mode), `elevation: 24dp`.
2. **Success Header**:
   - Vibrant animated circular checkmark (`#10B981` with ripple).
   - Headline: *"Attendance Marked! • उपस्थिति दर्ज हो गई!"* (`22sp`, bold).
3. **Employee Identity Card**:
   - High-resolution circular photo avatar (`80 × 80dp`) with dual ring border (`2dp #10B981`).
   - English Name: `"RAMESH KUMAR"` (`20sp`, bold).
   - Hindi Name & Role Tag: `"रमेश कुमार • Office Staff (कार्यालय स्टाफ)"` (`14sp`, `#64748B`).
   - *For Drivers*: Prominent truck tag badge: `🚛 HR55AB1234 • Vikas Goods Transport`.
4. **Punch Status Capsule**:
   - In-Punch: Emerald green badge (`#E8F5E9` bg, `#10B981` text) `✓ IN PUNCH • 10:45 AM`.
   - Out-Punch: Blue/Violet badge (`#EFF6FF` bg, `#2563EB` text) `⏱ OUT PUNCH • 06:15 PM`.
5. **Shift & Payroll Metric**:
   - Calculated shift duration badge: `"Shift Duration: 8h 30m • Full Day (1.0 Payable Day)"`.
6. **Voice Announcement Pill**: Speaker icon with animated audio wave bars:
   - Text caption: *"नमस्ते रमेश जी, आपकी उपस्थिति दर्ज कर ली गई है।"*
7. **Emergency Early Checkout Action**: Outlined red button (`#EF4444`) visible only when an admin key is held, for emergency shifts.
8. **Auto-Dismiss Progress Bar**: Slim animated horizontal timer bar running down from 100% to 0% over 3.5 seconds.

---

### Screen 4: Biometric Enrollment Studio (Face & Fingerprint Registration)
*Used by terminal supervisors to register new staff and drivers with 5-pose face recognition and optical fingerprint.*

```
+--------------------------------------------------------------+
| [< Back]        Biometric Enrollment Studio       [Sync Roster]|
|                 बायोमेट्रिक नामांकन केंद्र                    |
+--------------------------------------------------------------+
|                                                              |
|  [ 🔍 Search Employee by Name, Phone, or Truck No...       ] |
|                                                              |
|  SELECTED: SUNDER SINGH (Driver) • 🚛 HR55X9988              |
|                                                              |
|  STEP 1: 5-POSE 3D FACE CAPTURE                              |
|                                                              |
|                ┌───────── ( 5 / 5 ) ─────────┐               |
|                │                             │               |
|                │      [ LIVE CAMERA VIEW ]   │               |
|                │                             │               |
|                └─────────────────────────────┘               |
|                 [✓ Front] [✓ Left] [✓ Right]                 |
|                 [✓ Tilt Up] [ Smile ]                        |
|                                                              |
|  STEP 2: R307 OPTICAL FINGERPRINT SCANNER                    |
|                                                              |
|       ┌───────────┐   Status: Sensor Connected (Ready)       |
|       │  [ FINGER │   Tap 1: ✓ Completed                     |
|       │    SCAN ] │   Tap 2: ✓ Completed                     |
|       │           │   Tap 3: Place thumb again to verify     |
|       └───────────┘   Match Quality Score: 96% (High)        |
|                                                              |
|  [ SAVE & SYNC BIOMETRIC PROFILE • प्रोफाइल सुरक्षित करें ]   |
+--------------------------------------------------------------+
```

#### UI Components & Specifications:
1. **Top Bar**: Back navigation button, screen title with Hindi subtitle, and direct Cloud Roster refresh button.
2. **Employee Picker Bar**: Instant searchable combobox with photo thumbnail, phone number, and vehicle allocation.
3. **5-Pose Guided Face Capture View**:
   - Circular camera viewport with 5 peripheral segmented progress arcs.
   - Real-time AI pose direction guide:
     1. `Frontal (सीधा देखें)`
     2. `Turn Left 30° (बाएं देखें)`
     3. `Turn Right 30° (दाएं देखें)`
     4. `Chin Up 15° (हल्का ऊपर देखें)`
     5. `Natural Expression (सामान्य भाव)`
   - Each completed pose locks with a green tick and auto-advances to the next angle.
4. **Optical Fingerprint Registration Block**:
   - Visual fingerprint schematic representing the physical R307 USB/OTG optical scanner.
   - 3-Tap Enrollment Stepper (Scan 1 -> Lift -> Scan 2 -> Merge & Verify).
   - Live Quality Meter (`0 - 100%`) rejecting wet or smudged scans below 75%.
5. **Primary CTA**: Full-width glowing button: `SAVE BIOMETRICS (बायोमेट्रिक्स सेव करें)` with Cloud Sync indicator.

---

### Screen 5: Manual Attendance Override & Yard Roll-Call Dialog
*Used when a driver's hands are greased, camera is blinded by glare, or an emergency manual punch is required.*

```
+--------------------------------------------------------------+
| [X]       Manual Attendance Override • मैन्युअल उपस्थिति     |
+--------------------------------------------------------------+
|                                                              |
|  [ 🔍 Search Name / Mobile / Truck No...                   ] |
|                                                              |
|  FILTERS:  [ All ]  [ Drivers (24) ]  [ Staff (12) ]  [ Labour ] |
|                                                              |
|  ┌────────────────────────────────────────────────────────┐  |
|  │ [Photo]  RAMESH SHARMA           Status: NOT MARKED    │  |
|  │          Office Staff • Jharli   Last: Yesterday 6 PM  │  |
|  │          [ MARK IN (09:00 AM) ]  [ MARK OUT (06:00 PM) ]│  |
|  └────────────────────────────────────────────────────────┘  |
|  ┌────────────────────────────────────────────────────────┐  |
|  │ [Photo]  VIKRAM SINGH (Driver)   Status: ON TRIP       │  |
|  │          🚛 HR55T4567 • Kosli    Trip: #V-89412        │  |
|  │          [ MARK PRESENT ]        [ MARK HALF-DAY ]     │  |
|  └────────────────────────────────────────────────────────┘  |
|                                                              |
|  REASON FOR MANUAL OVERRIDE:                                 |
|  [ ▼ Camera Flare / Unrecognized ]                           |
|                                                              |
|  SUPERVISOR PIN: [ ● ● ● ● ]                                 |
|                                                              |
|  [ CONFIRM MANUAL PUNCH • उपस्थिति दर्ज करें ]               |
+--------------------------------------------------------------+
```

#### UI Components & Specifications:
1. **Search & Category Pills**: Real-time filtering by role (`Drivers`, `Office Staff`, `Labour Crew`, `Munshi`).
2. **Employee Roster Card**:
   - Large photo thumbnail (`56 × 56dp`).
   - Profile name, branch location, assigned truck.
   - One-tap quick action buttons: `MARK IN`, `MARK OUT`, `HALF-DAY`, `LEAVE`.
3. **Audit Compliance Section**:
   - Mandatory Reason Dropdown: *Camera Glare / Face Unrecognized*, *Fingerprint Sensor Worn*, *Remote Yard Duty*, *Medical Emergency*.
   - 4-digit Supervisor Authorization PIN to prevent unauthorized marks.
4. **Audit Log Record**: Saves with `source: "manual_terminal_override"`, recording supervisor ID and exact override reason.

---

### Screen 6: Terminal Admin Settings & Hardware Diagnostics
*Protected by a 6-digit Admin PIN. Full control over kiosk hardware, server endpoints, and roster sync.*

```
+--------------------------------------------------------------+
| [< Back]             Terminal Admin Settings                 |
|                      टर्मिनल एडमिन सेटिंग्स                  |
+--------------------------------------------------------------+
|                                                              |
|  SERVER & CLOUD CONFIGURATION                                |
|  API Base URL:                                               |
|  [ https://vgtc-management-fullstack-1.hosted.app         ]  |
|  [ TEST CONNECTION (200 OK • 124ms) ]                        |
|                                                              |
|  TERMINAL IDENTITY                                           |
|  Yard / Branch:      [ JHARLI MAIN GODOWN        ▼ ]         |
|  Terminal ID:        VGTC-TERM-JH-01                         |
|  Hardware UUID:      8f49-b31c-9022-7aa1                     |
|                                                              |
|  HARDWARE & PERIPHERALS                                      |
|  Camera Device:      [ Front Camera (Wide-Angle) ▼ ]         |
|  R307 Optical Port:  [ /dev/ttyUSB0 (57600 Baud)  ▼ ]         |
|  [ TEST FINGERPRINT SENSOR ]  [ TEST VOICE ANNOUNCEMENT ]    |
|                                                              |
|  KIOSK LOCKDOWN & SECURITY                                   |
|  [X] Enable Android Kiosk Lock Mode (Pin Screen)             |
|  [X] Suppress System Navigation & Notification Bar           |
|  [X] Automatic Screensaver (After 15s idle)                  |
|                                                              |
|  OFFLINE QUEUE & ROSTER                                      |
|  Cached Profiles: 75 Profiles  •  Pending Punches: 0         |
|  [ FORCE RE-SYNC ROSTER ]   [ EXPORT DIAGNOSTIC LOGS ]       |
+--------------------------------------------------------------+
```

#### UI Components & Specifications:
1. **Server Endpoint Configuration**: Input box with pre-configured production Firebase App Hosting URL and instant ping latency tester (`124ms`).
2. **Yard Assignment**: Dropdown selecting the exact location (**Jharli, Kosli, Jhajjar, Bahadurgarh**) so all attendance records automatically map to that branch.
3. **Hardware Test Suite**:
   - Live Camera stream resolution and orientation toggle.
   - R307 Optical Sensor handshake test (blinks sensor red/blue LED).
   - Audio Voice Test: Plays Hindi & English greeting.
4. **Kiosk Security Switches**: Material 3 switches toggling Android LockTask mode, disabling power button and status bar swipe-down.
5. **Sync & Cache Hub**: Profile cache counter with one-tap Cloud Roster refresh.

---

### Screen 7: Out-of-the-Box Setup Wizard
*Displayed upon first app installation or terminal factory reset.*

```
+--------------------------------------------------------------+
|                                                              |
|                      [ 🚛 VGTC LOGO ]                        |
|                  VIKAS GOODS TRANSPORT CO.                   |
|                  Smart Terminal Setup Wizard                 |
|                                                              |
|            [ 1. Server ] -> [ 2. Branch ] -> [ 3. Sync ]     |
|                                                              |
|  STEP 2: SELECT TERMINAL LOCATION                            |
|                                                              |
|  Where is this terminal being installed?                     |
|                                                              |
|  ┌────────────────────────────────────────────────────────┐  |
|  │ (●) JHARLI MAIN GODOWN & WORKSHOP (झारली हेड ऑफिस)      │  |
|  └────────────────────────────────────────────────────────┘  |
|  ┌────────────────────────────────────────────────────────┐  |
|  │ ( ) KOSLI GODOWN (कोसली डिपो)                          │  |
|  └────────────────────────────────────────────────────────┘  |
|  ┌────────────────────────────────────────────────────────┐  |
|  │ ( ) JHAJJAR YARD (झज्जर यार्ड)                          │  |
|  └────────────────────────────────────────────────────────┘  |
|  ┌────────────────────────────────────────────────────────┐  |
|  │ ( ) BAHADURGARH GODOWN (बहादुरगढ़ गोदाम)               │  |
|  └────────────────────────────────────────────────────────┘  |
|                                                              |
|  [ GRANT CAMERA & USB PERMISSIONS ]                          |
|                                                              |
|  [ INITIALIZE TERMINAL • सेटअप पूरा करें ]                    |
+--------------------------------------------------------------+
```

---

## 6. Micro-Interactions, Audio Feedback & Haptics

### 6.1 Audio Announcements (Hindi Text-To-Speech)
Every punch plays a pleasant, crystal-clear Hindi voice announcement via Android TTS:
- **Morning In-Punch**:
  > *"नमस्ते [नाम] जी, विकास गुड्स ट्रांसपोर्ट में आपका स्वागत है। आपकी उपस्थिति दर्ज हो गई है।"*
- **Evening Out-Punch**:
  > *"धन्यवाद [नाम] जी, आपका आज का कार्य समय [8 घंटे 30 मिनट] रहा। शुभ यात्रा।"*
- **Duplicate Punch Alert**:
  > *"आपकी उपस्थिति पहले ही [10:45 AM] पर दर्ज हो चुकी है।"*
- **Unrecognized Face**:
  > *"कृपया कैमरे के सामने सीधे आएं या फिंगरप्रिंट का उपयोग करें।"*

### 6.2 Visual Haptics
- **Success Punch**: Soft screen-edge green radial glow + 50ms vibration motor pulse.
- **Error / Cooldown**: Gentle double vibration + subtle amber shake animation on the card.

---

## 7. Stitch Generation Prompts

Copy and paste these exact prompts into **Google Stitch** to generate the screens:

### Stitch Prompt 1: Main Kiosk Biometric Attendance Screen
> *"Generate a modern industrial Android Kiosk Attendance Terminal screen for a transport logistics company called 'VGTC' (Vikas Goods Transport Co.). Dark OLED aesthetic (#050811). The background is a full-screen camera preview. Overlaid at the top is a frosted glass navigation bar with a white truck logo with an orange 'T' badge, location pill 'JHARLI GODOWN', live server status '● Online' in green, an R307 optical fingerprint sensor status badge, and icons for language (HI/EN), manual edit, and admin lock. In the center is a futuristic glowing orange rounded biometric face detection box with corner brackets and a subtle scanning line. At the bottom is a frosted glass pill saying 'Align face inside frame or touch fingerprint sensor' with Devanagari Hindi translation, and a small live ticker showing recent punches with employee photo avatars."*

### Stitch Prompt 2: Attendance Verification Success Sheet
> *"Generate an Android Material 3 slide-up bottom sheet modal for attendance punch confirmation. Pure white or dark glass elevated card with 28dp rounded top corners. At the top is an animated green glowing checkmark circle, headline 'Attendance Marked! / उपस्थिति दर्ज हो गई!'. In the center is a circular employee profile picture with an emerald border, employee name 'RAMESH KUMAR (Office Staff)', and a truck badge '🚛 HR55AB1234'. Below is a large green pill '✓ IN PUNCH • 10:45 AM', shift duration stat '8h 30m • Present (1.0 Day)', and a voice speaker icon with audio caption in Hindi. At the bottom is a smooth auto-dismiss progress bar labeled 'Auto-closing in 3s'."*

### Stitch Prompt 3: Ambient Always-On Display (AOD Screensaver)
> *"Design a minimalist, ultra-premium Always-On Display (AOD) screensaver for an Android 10-inch kiosk tablet. Pure black #000000 background. In the upper center is a clean, bold white commercial truck emblem with a bright orange 'T' logo. Below is a giant 72sp digital clock '10:45 AM' in crisp modern typography, with the date below in Hindi and English ('शुक्रवार, 2 अक्टूबर 2026 • 02 Oct 2026'). Below the date is a subtle glass capsule card showing '📍 झारली मुख्य गोदाम • Jharli Godown | 38 Present'. At the bottom is a pulsing radar icon with the caption 'Touch screen or look at camera to punch / स्क्रीन छुएं या कैमरे की तरफ देखें'."*

### Stitch Prompt 4: Biometric Enrollment Studio
> *"Design a modern Android tablet UI for Biometric Enrollment in an industrial fleet depot. Clean dark theme (#0A1128 and #111827). Header has a back button, title 'Biometric Enrollment Studio', and a search bar to select an employee. The upper half features a circular guided camera viewport with 5 segmented progress arcs for 5 face angles: Frontal, Left 30°, Right 30°, Tilt Up, and Smile. The lower half features a dedicated R307 Optical Fingerprint scanner card with a fingerprint graphic, 3-step tap verification tracker, and a 96% match quality progress gauge. At the bottom is a full-width glowing orange button 'SAVE & SYNC BIOMETRIC PROFILE'."*

---

## 8. Android Technical Implementation Checklist

- [x] CameraX `PreviewView` configured with `ANALYSIS` use-case for real-time face detection.
- [x] USB Host OTG permission handling for R307 optical fingerprint reader (`/dev/ttyUSB*`).
- [x] Android TTS Engine initialized with `Locale("hi", "IN")` and `Locale("en", "IN")`.
- [x] Offline SQLite Room database for buffering punches when Internet drops.
- [x] Kiosk `DevicePolicyManager.setLockTaskPackages()` enabled for full screen pinning.
- [x] Assets bundled: `@drawable/vgtc_logo_white`, `@drawable/vgtc_logo`, `@drawable/ic_vgtc_logo`.
