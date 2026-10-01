# Android Terminal App — UI Design

> **Scope**: Visual & interaction design only. Architecture, APIs, and release planning are separate.

---

## 1. Design Principles

| Principle | Description |
|-----------|-------------|
| **Terminal-first** | The screen is the terminal. UI chrome stays out of the way |
| **Dark by default** | Developers work at night. Light mode is an opt-in |
| **One thumb reachable** | All frequent actions reachable within the bottom 40% of screen |
| **Zero learning curve** | Looks and feels like any desktop terminal on first open |
| **Density over decoration** | No wasted space. Every pixel serves the session |

---

## 2. Color System

### 2.1 Dark Theme (Default)

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-terminal` | `#0D1117` | Terminal canvas background |
| `--bg-surface` | `#161B22` | Drawers, overlays, session cards |
| `--bg-elevated` | `#21262D` | Input bars, key rows, tab bar |
| `--border` | `#30363D` | Dividers, card outlines |
| `--text-primary` | `#C9D1D9` | Default terminal text |
| `--text-muted` | `#8B949E` | Labels, hints, placeholders |
| `--accent` | `#58A6FF` | Cursor, active tab, selection handle |
| `--accent-green` | `#3FB950` | Successful command prompt ($) |
| `--accent-red` | `#F85149` | Error output, stderr |
| `--accent-yellow` | `#E3B341` | Warnings, sudo prompt |
| `--accent-purple` | `#D2A8FF` | Directory names, special tokens |

### 2.2 Light Theme

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-terminal` | `#FFFFFF` | Terminal canvas |
| `--bg-surface` | `#F6F8FA` | Drawers, cards |
| `--bg-elevated` | `#EAEEF2` | Key row, tab bar |
| `--text-primary` | `#1F2328` | Terminal text |
| `--accent` | `#0969DA` | Cursor, active elements |

### 2.3 Theme Variants (Presets)

| Name | Background | Accent | Character |
|------|-----------|--------|-----------|
| **Dracula** | `#282A36` | `#BD93F9` | Classic hacker purple |
| **Solarized Dark** | `#002B36` | `#268BD2` | Low-fatigue blue-green |
| **Gruvbox** | `#282828` | `#FABD2F` | Retro warm |
| **One Dark** | `#21252B` | `#61AFEF` | VS Code dark |
| **Monokai** | `#272822` | `#A6E22E` | Bold saturation |
| **Pure Black** | `#000000` | `#00FF41` | AMOLED / matrix |

---

## 3. Typography

| Role | Typeface | Size | Weight |
|------|---------|------|--------|
| Terminal output | JetBrains Mono | 13-16sp (user adjustable) | Regular |
| Terminal input | JetBrains Mono | same as output | Regular |
| UI labels (drawer, tabs) | Inter | 13sp | 500 |
| Section headers | Inter | 11sp | 700 |
| Monospace fallback | Fira Code -> Cascadia Code -> system mono | - | - |

> Font size is adjustable from **10sp to 22sp** via pinch-to-zoom or Settings > Display.

---

## 4. Screen Map

`
+--------------------------------------+
|  Terminal Screen  (primary)          |
|  +------------------------------+    |
|  |  Session Tab Bar             |    |
|  |  [1 Tab 1] [2 Tab 2] [+]    |    |
|  +------------------------------+    |
|  |                              |    |
|  |   Terminal Canvas            |    |
|  |   (VT100 output area)        |    |
|  |                              |    |
|  +------------------------------+    |
|  |  Extra Key Row               |    |
|  |  [ESC][TAB][CTL][UP][DN][LT] |    |
|  +------------------------------+    |
|  |  System Keyboard             |    |
|  +------------------------------+    |
|                                      |
|  <- Swipe left: Session Manager      |
|  -> Swipe right: SSH Profile Drawer  |
+--------------------------------------+
`

---

## 5. Terminal Screen

### 5.1 Layout Anatomy

`
+---------------------------------------------+
| =  ssh root@192.168.1.1          Menu  X    |  <- Top App Bar (auto-hides)
+---------------------------------------------+
| [Session 1 *] [Session 2] [+]               |  <- Session tab strip
+---------------------------------------------+
|                                             |
|  user@host:~$ ls -la                        |
|  total 48                                   |
|  drwxr-xr-x  8 user user 4096 Oct 02 06:31 |
|  drwxr-xr-x 21 root root 4096 Sep 14 12:00 |
|                                             |
|  user@host:~$ _                             |  <- Blinking block cursor
|                                             |
+---------------------------------------------+
| [ESC][TAB][CTL][ALT][UP][DN][LT][RT][PgU]  |  <- Extra Key Row
+---------------------------------------------+
|               System Keyboard               |
+---------------------------------------------+
`

### 5.2 Top App Bar

- **Auto-hides** when the keyboard is up; reappears on swipe-down or double-tap the top edge
- Height: **48dp**
- Items (left to right):
  - Hamburger menu: opens Session Manager drawer
  - Session title (host or  Local Shell) — truncated with ellipsis
  - Overflow menu: Copy, Paste, Find, Share log, Settings
  - Notification bell (new message from background session)
  - Close X (kills active session)

### 5.3 Session Tab Strip

- Height: **36dp** | background: `--bg-elevated`
- Active tab: bottom border 2dp in `--accent`, text `--text-primary`
- Inactive tab: text `--text-muted`
- Unread output indicator: filled dot in `--accent-green`
- + button: opens New Session bottom sheet
- Scrollable horizontally when more than 4 sessions

### 5.4 Terminal Canvas

- Fully fills the remaining height
- Renders monospaced cells using a custom Canvas / RecyclerView
- Supports bold, italic, underline, strikethrough, blink (respects Reduce Motion)
- 256-color + True Color (24-bit) ANSI support
- **Selection**: long-press triggers selection handles; Copy / Share action bar appears

### 5.5 Cursor Styles

| Style | Description |
|-------|-------------|
| Block (default) | Filled rectangle, blinks at 530ms |
| Underline | 2dp line below cell |
| Bar | 2dp vertical bar left of cell |
| No blink | Static solid cursor |

---

## 6. Extra Key Row

`
+-----+-----+-----+-----+-----+-----+-----+-----+-----+------+
| ESC | TAB | CTL | ALT |  UP |  DN |  LT |  RT | PgU |  ... |
+-----+-----+-----+-----+-----+-----+-----+-----+-----+------+
`

- Height: **40dp** | background: `--bg-elevated`
- Keys: minimum 40dp wide, horizontally scrollable
- Toggle keys (CTRL, ALT): highlighted in `--accent` when active
- ... expands to a second row: PgDn, Home, End, F1-F12, ~, |, /, \
- Fully **customizable** in Settings

---

## 7. Session Manager (Left Drawer)

`
+----------------------------------+
|  Sessions                    [+] |
+----------------------------------+
|  * LOCAL SHELL                   |
|    bash  Active  2h 14m          |
+----------------------------------+
|    SSH - prod-server             |
|    root@192.168.1.10  Idle       |
+----------------------------------+
|    SSH - dev-server              |
|    dev@10.0.0.5  Disconnected    |
|    [Reconnect]                   |
+----------------------------------+
|  Saved Profiles              [>] |
|  prod-server  dev-server  ...   |
+----------------------------------+
`

- Width: **80%** of screen

Session card states:

| State | Indicator |
|-------|-----------|
| Active | Green dot |
| Idle | Blue dot |
| Disconnected | Red dot + Reconnect button |
| Background unread | Yellow dot + unread count |

---

## 8. SSH Profile Drawer (Right)

`
+----------------------------------+
|  SSH Profiles               [+]  |
+----------------------------------+
|  prod-server                 [>] |
|  root  192.168.1.10  Port 22    |
+----------------------------------+
|  dev-server                  [>] |
|  dev  10.0.0.5  Port 2222       |
|  Key auth: ~/.ssh/id_rsa         |
+----------------------------------+
|  [+ Add New Profile]             |
+----------------------------------+
`

### Profile Form Fields

| Field | Type | Notes |
|-------|------|-------|
| Nickname | Text | Used as tab label |
| Host | Text | IP or FQDN |
| Port | Number | Default 22 |
| Username | Text | |
| Auth method | Toggle | Password / Key / Key+Passphrase |
| Private key | File picker | PEM / OpenSSH format |
| Passphrase | Secure text | Stored in Android Keystore |

---

## 9. New Session Bottom Sheet

`
+--------------------------------------+
|  -  (drag handle)                    |
|  Start New Session                   |
|                                      |
|  +----------------------------------+|
|  |  [shell]  Local Shell            ||
|  |  bash / zsh on device            ||
|  +----------------------------------+|
|                                      |
|  +----------------------------------+|
|  |  [lock]   SSH Connection         ||
|  |  Connect to a remote server      ||
|  +----------------------------------+|
|                                      |
|  Recent: prod-server  dev-server ... |
+--------------------------------------+
`

---

## 10. Find-in-Terminal Overlay

`
+----------------------------------------+
|  [search]  Search terminal output... X |
|      ^ 3 of 14 v          [Aa]  [.*]  |
+----------------------------------------+
`

- Slides down from top of canvas (does not push content)
- Matches highlighted in `--accent-yellow`
- Options: Case-sensitive [Aa], Regex [.*]

---

## 11. Settings Screen

`
Display
  Font size          [14sp  + -]
  Font family        [JetBrains Mono v]
  Color theme        [Dracula v]
  Cursor style       [Block v]
  Cursor blink       [ON ]

Keyboard
  Extra key row      [ON ]
  Customize keys     [Edit >]
  Haptic feedback    [ON ]
  Pop-up key preview [OFF]

Sessions
  Bell action        [Vibrate v]
  Scrollback lines   [10 000  + -]
  Keep screen on     [While connected v]
  Background sessions[Keep alive v]

Security
  App lock           [None v]
  Hide recent screen [OFF]

About
  Version, Licenses, Feedback
`

---

## 12. Micro-animations

| Trigger | Animation | Duration |
|---------|-----------|----------|
| Drawer open | Slide in from edge + scrim fade | 250ms |
| Bottom sheet appear | Slide up + backdrop fade | 280ms |
| Tab switch | Cross-fade canvas | 120ms |
| Background tab new output | Dot pulsates once | 400ms |
| Connection established | Brief green flash on canvas border | 600ms |
| Connection lost | Red flash + banner slides in | 400ms |
| Find result highlight | Highlight pulses once | 300ms |

> All animations respect the system **Reduce Motion** accessibility setting.

---

## 13. Gestures

| Gesture | Action |
|---------|--------|
| Two-finger pinch | Zoom font size |
| Two-finger swipe left/right | Switch session tabs |
| Swipe right from left edge | Open Session Manager |
| Swipe left from right edge | Open SSH Profile drawer |
| Long-press terminal text | Begin text selection |
| Double-tap top edge | Show / hide top bar |
| Swipe up on key row | Expand to second key row |

---

## 14. Empty and Error States

### No Sessions

`
        [screen icon]
   No active sessions

   Start a local shell or connect
   to a server via SSH.

   [Start Local Shell]   [Connect SSH]
`

### Connection Lost Banner

`
+----------------------------------+
|  ! Connection to prod-server     |
|    was lost.                     |
|                                  |
|  [Reconnect]   [Close Session]   |
+----------------------------------+
`

---

## 15. Responsive Behavior

| Screen class | Adaptation |
|-------------|-----------|
| Phone portrait (< 600dp) | Default layout as documented above |
| Phone landscape | Extra key row hidden by default; floating keyboard |
| Tablet (600dp+) | Split: session list 240dp + terminal pane |
| Tablet landscape | Optional two-pane terminal (tmux-style) |
| Foldable inner screen | Full tablet layout |
| Foldable outer screen | Compact phone layout |

---

## 16. Accessibility

| Requirement | Implementation |
|-------------|---------------|
| Touch targets | Minimum 48x48dp for all interactive elements |
| TalkBack | Canvas announced as Terminal output region |
| Key row labels | Each key has a content description |
| High contrast | Bundled high-contrast theme (white on black, 3dp borders) |
| Font scale | UI respects system font scale 85%-200% |
| Reduce motion | Disables all non-essential animations |
